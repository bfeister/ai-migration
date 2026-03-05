#!/usr/bin/env tsx
/**
 * Production Server Lifecycle Manager
 *
 * Replaces brittle bash build/start/health-check workflow with a single
 * Node.js script that handles process management, port resolution, and
 * log scanning.
 *
 * Usage:
 *   tsx scripts/prod-server.ts start   # Kill stale -> build -> start -> health check
 *   tsx scripts/prod-server.ts stop    # Kill server by PID file
 *   tsx scripts/prod-server.ts health  # Just check health (HTTP + log scan)
 */

import { spawn, spawnSync, execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { resolveServerPort } from './lib/server-port.js';

// ============================================================================
// Constants
// ============================================================================

const WORKSPACE_ROOT = process.env.WORKSPACE_ROOT || process.cwd();
const LOG_FILE = '/tmp/prod-server.log';
const PID_FILE = '/tmp/prod-server.pid';
const HEALTH_TIMEOUT_MS = 60_000;
const HEALTH_POLL_INTERVAL_MS = 1_000;

const ERROR_PATTERN = /ERROR|Failed to|Cannot find|Module not found|error TS/i;

// ============================================================================
// Utilities
// ============================================================================

const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
};

function info(msg: string): void {
  console.log(`${colors.cyan}[prod-server]${colors.reset} ${msg}`);
}

function ok(msg: string): void {
  console.log(`${colors.green}[prod-server]${colors.reset} ${msg}`);
}

function fail(msg: string): void {
  console.error(`${colors.red}[prod-server]${colors.reset} ${msg}`);
}

function resolveProjectDir(): string {
  return process.env.STANDALONE_BUILD || path.join(WORKSPACE_ROOT, 'storefront-next');
}

// ============================================================================
// Process Management
// ============================================================================

function readPid(): number | null {
  if (!fs.existsSync(PID_FILE)) return null;
  const raw = fs.readFileSync(PID_FILE, 'utf-8').trim();
  const pid = parseInt(raw, 10);
  return Number.isFinite(pid) ? pid : null;
}

function writePid(pid: number): void {
  fs.writeFileSync(PID_FILE, String(pid));
}

function cleanPidFile(): void {
  if (fs.existsSync(PID_FILE)) {
    fs.unlinkSync(PID_FILE);
  }
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function killByPid(pid: number): boolean {
  try {
    process.kill(pid, 'SIGTERM');
    return true;
  } catch {
    return false;
  }
}

function killByPort(port: number): void {
  try {
    const output = execSync(`lsof -ti :${port}`, { encoding: 'utf-8' }).trim();
    if (output) {
      for (const pidStr of output.split('\n')) {
        const pid = parseInt(pidStr, 10);
        if (Number.isFinite(pid)) {
          try {
            process.kill(pid, 'SIGTERM');
            info(`Killed stale process ${pid} on port ${port}`);
          } catch {
            // already dead
          }
        }
      }
    }
  } catch {
    // lsof exits non-zero when no process found — that's fine
  }
}

function killExisting(port: number): void {
  // Try PID file first
  const pid = readPid();
  if (pid && isProcessAlive(pid)) {
    info(`Killing existing server (PID ${pid})`);
    killByPid(pid);
    cleanPidFile();
    return;
  }

  // Fall back to port scan
  killByPort(port);
  cleanPidFile();
}

// ============================================================================
// Health Check
// ============================================================================

async function pollHttp(port: number): Promise<boolean> {
  const url = `http://localhost:${port}`;
  const deadline = Date.now() + HEALTH_TIMEOUT_MS;

  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok || res.status === 304) {
        return true;
      }
    } catch {
      // server not ready yet
    }
    await new Promise((r) => setTimeout(r, HEALTH_POLL_INTERVAL_MS));
  }

  return false;
}

function scanLogErrors(): string[] {
  if (!fs.existsSync(LOG_FILE)) return [];

  const content = fs.readFileSync(LOG_FILE, 'utf-8');
  return content
    .split('\n')
    .filter((line) => ERROR_PATTERN.test(line))
    .slice(0, 20); // cap output
}

async function checkHealth(port: number): Promise<boolean> {
  const httpOk = await pollHttp(port);
  const errors = scanLogErrors();

  if (!httpOk) {
    fail(`Server did not respond on port ${port} within ${HEALTH_TIMEOUT_MS / 1000}s`);
    if (errors.length > 0) {
      fail(`Build errors detected in ${LOG_FILE}:`);
      for (const line of errors) {
        console.error(`  ${line}`);
      }
    }
    return false;
  }

  if (errors.length > 0) {
    fail(`Server responds on port ${port} but build errors detected in ${LOG_FILE}:`);
    for (const line of errors) {
      console.error(`  ${line}`);
    }
    return false;
  }

  ok(`Server healthy on port ${port}`);
  return true;
}

// ============================================================================
// Subcommands
// ============================================================================

async function cmdStart(): Promise<void> {
  const projectDir = resolveProjectDir();
  const port = resolveServerPort(projectDir);

  info(`Project dir: ${projectDir}`);
  info(`Resolved port: ${port}`);

  // 1. Kill any existing server
  killExisting(port);

  // 2. Build
  info('Running pnpm build...');
  const build = spawnSync('pnpm', ['build'], {
    cwd: projectDir,
    stdio: 'inherit',
    shell: true,
  });

  if (build.status !== 0) {
    fail(`Build failed with exit code ${build.status}`);
    process.exit(1);
  }

  ok('Build succeeded');

  // 3. Start server in background
  info('Starting production server...');
  const logStream = fs.openSync(LOG_FILE, 'w');

  const server = spawn('pnpm', ['start'], {
    cwd: projectDir,
    stdio: ['ignore', logStream, logStream],
    detached: true,
    shell: true,
  });

  server.unref();
  fs.closeSync(logStream);

  if (!server.pid) {
    fail('Failed to spawn server process');
    process.exit(1);
  }

  writePid(server.pid);
  info(`Server PID: ${server.pid}, log: ${LOG_FILE}`);

  // 4. Health check
  const healthy = await checkHealth(port);
  process.exit(healthy ? 0 : 1);
}

async function cmdStop(): Promise<void> {
  const projectDir = resolveProjectDir();
  const port = resolveServerPort(projectDir);
  const pid = readPid();

  if (pid && isProcessAlive(pid)) {
    info(`Stopping server (PID ${pid})`);
    killByPid(pid);
    cleanPidFile();
    ok('Server stopped');
  } else {
    // Try port-based kill as fallback
    killByPort(port);
    cleanPidFile();
    ok('Cleaned up');
  }
}

async function cmdHealth(): Promise<void> {
  const projectDir = resolveProjectDir();
  const port = resolveServerPort(projectDir);
  const healthy = await checkHealth(port);
  process.exit(healthy ? 0 : 1);
}

// ============================================================================
// Main
// ============================================================================

const subcommand = process.argv[2];

switch (subcommand) {
  case 'start':
    cmdStart().catch((err) => {
      fail(`Fatal: ${err.message}`);
      process.exit(1);
    });
    break;
  case 'stop':
    cmdStop().catch((err) => {
      fail(`Fatal: ${err.message}`);
      process.exit(1);
    });
    break;
  case 'health':
    cmdHealth().catch((err) => {
      fail(`Fatal: ${err.message}`);
      process.exit(1);
    });
    break;
  default:
    console.error(`Usage: tsx scripts/prod-server.ts <start|stop|health>`);
    process.exit(1);
}
