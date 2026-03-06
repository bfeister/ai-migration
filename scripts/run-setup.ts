#!/usr/bin/env tsx
/**
 * Migration Setup Orchestrator
 *
 * Interactive top-level script that walks through the entire setup workflow:
 * 1. Configuration (setup-migration.ts)
 * 2. Screenshot wrapper generation (generate-screenshot-wrappers.ts)
 * 3. Baseline screenshots (capture-baselines.ts)
 * 4. DOM analysis (analyze-features.ts)
 * 5. Plan generation (generate-plans.ts)
 * 6. Migration log initialization (init-migration-log.ts)
 *
 * Usage:
 *   npx tsx scripts/run-setup.ts
 *   npx tsx scripts/run-setup.ts --skip-baselines
 *   npx tsx scripts/run-setup.ts --resume
 */

import prompts from 'prompts';
import { spawn, SpawnOptions } from 'child_process';
import fs from 'fs';
import path from 'path';

// ============================================================================
// Constants
// ============================================================================

const WORKSPACE_ROOT = process.env.WORKSPACE_ROOT || process.cwd();
const STATE_DIR = path.join(WORKSPACE_ROOT, '.migration-state');
const ANALYSIS_DIR = path.join(WORKSPACE_ROOT, 'analysis');
const SUBPLANS_DIR = path.join(WORKSPACE_ROOT, 'sub-plans');
const SCREENSHOTS_DIR = path.join(WORKSPACE_ROOT, 'screenshots');
const MIGRATION_LOG = path.join(WORKSPACE_ROOT, 'migration-log.md');

// ============================================================================
// Types
// ============================================================================

interface Phase {
  id: string;
  name: string;
  description: string;
  script: string;
  args?: string[];
  optional?: boolean;
  completionCheck: () => boolean;
}

// ============================================================================
// Utilities
// ============================================================================

const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  red: '\x1b[31m',
};

function log(msg: string): void {
  console.log(`${colors.blue}[Setup]${colors.reset} ${msg}`);
}

function success(msg: string): void {
  console.log(`${colors.green}[Setup]${colors.reset} ${msg}`);
}

function warn(msg: string): void {
  console.log(`${colors.yellow}[Setup]${colors.reset} ${msg}`);
}

function error(msg: string): void {
  console.log(`${colors.red}[Setup]${colors.reset} ${msg}`);
}

function header(text: string): void {
  const line = '═'.repeat(60);
  console.log('');
  console.log(`${colors.cyan}╔${line}╗${colors.reset}`);
  console.log(`${colors.cyan}║${colors.reset} ${colors.bold}${text.padEnd(58)}${colors.reset} ${colors.cyan}║${colors.reset}`);
  console.log(`${colors.cyan}╚${line}╝${colors.reset}`);
  console.log('');
}

function subheader(text: string): void {
  console.log(`\n${colors.magenta}▶${colors.reset} ${colors.bold}${text}${colors.reset}\n`);
}

function countFiles(dir: string, pattern: RegExp): number {
  if (!fs.existsSync(dir)) return 0;

  let count = 0;
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.isDirectory()) {
      count += countFiles(path.join(dir, entry.name), pattern);
    } else if (pattern.test(entry.name)) {
      count++;
    }
  }

  return count;
}

/**
 * Run a script and stream output
 */
function runScript(script: string, args: string[] = []): Promise<number> {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(WORKSPACE_ROOT, 'scripts', script);
    const spawnArgs = ['tsx', scriptPath, ...args];

    const options: SpawnOptions = {
      cwd: WORKSPACE_ROOT,
      stdio: 'inherit',
      shell: true,
    };

    const child = spawn('npx', spawnArgs, options);

    child.on('error', (err) => {
      reject(err);
    });

    child.on('close', (code) => {
      resolve(code || 0);
    });
  });
}

/**
 * Display current state summary
 */
function showStatus(): void {
  const discoveryCount = hasFeatureDiscovery() ? fs.readdirSync(MIGRATION_PLANS_DIR).filter(f => f.endsWith('-features.json')).length : 0;
  const analysisCount = countFiles(ANALYSIS_DIR, /\.json$/);
  const subplanCount = countFiles(SUBPLANS_DIR, /\.md$/);
  const screenshotCount = countFiles(SCREENSHOTS_DIR, /\.png$/);
  const hasLog = fs.existsSync(MIGRATION_LOG);

  console.log('');
  console.log(`${colors.dim}┌─────────────────────────────────────────────┐${colors.reset}`);
  console.log(`${colors.dim}│${colors.reset} ${colors.bold}Current Status${colors.reset}                              ${colors.dim}│${colors.reset}`);
  console.log(`${colors.dim}├─────────────────────────────────────────────┤${colors.reset}`);
  console.log(`${colors.dim}│${colors.reset} Discovery:   ${discoveryCount > 0 ? colors.green + '✓' : colors.yellow + '○'} ${discoveryCount > 0 ? `${discoveryCount} page(s) discovered` : 'Not discovered'}${colors.reset}`.padEnd(60) + `${colors.dim}│${colors.reset}`);
  console.log(`${colors.dim}│${colors.reset} Screenshots: ${screenshotCount > 0 ? colors.green + '✓' : colors.yellow + '○'} ${screenshotCount} captured${colors.reset}`.padEnd(60) + `${colors.dim}│${colors.reset}`);
  console.log(`${colors.dim}│${colors.reset} Analysis:    ${analysisCount > 0 ? colors.green + '✓' : colors.yellow + '○'} ${analysisCount} files${colors.reset}`.padEnd(60) + `${colors.dim}│${colors.reset}`);
  console.log(`${colors.dim}│${colors.reset} Sub-plans:   ${subplanCount > 0 ? colors.green + '✓' : colors.yellow + '○'} ${subplanCount} generated${colors.reset}`.padEnd(60) + `${colors.dim}│${colors.reset}`);
  console.log(`${colors.dim}│${colors.reset} Log:         ${hasLog ? colors.green + '✓' : colors.yellow + '○'} ${hasLog ? 'Initialized' : 'Not created'}${colors.reset}`.padEnd(60) + `${colors.dim}│${colors.reset}`);
  console.log(`${colors.dim}└─────────────────────────────────────────────┘${colors.reset}`);
  console.log('');
}

// ============================================================================
// Phase Definitions
// ============================================================================

const MIGRATION_PLANS_DIR = path.join(WORKSPACE_ROOT, 'migration-plans');

/**
 * Check if feature discovery has been completed for at least one page
 */
function hasFeatureDiscovery(): boolean {
  if (!fs.existsSync(MIGRATION_PLANS_DIR)) return false;
  const files = fs.readdirSync(MIGRATION_PLANS_DIR);
  return files.some(f => f.endsWith('-features.json'));
}

const phases: Phase[] = [
  {
    id: 'discovery',
    name: 'Feature Discovery (Claude)',
    description: 'Analyze ISML templates to dynamically discover migratable features',
    script: 'discover-features-claude.ts',
    completionCheck: () => hasFeatureDiscovery(),
  },
  {
    id: 'screenshotWrappers',
    name: 'Screenshot Wrapper Manifest',
    description: 'Generate safe screenshot wrapper scripts and manifest for feature execution',
    script: 'generate-screenshot-wrappers.ts',
    completionCheck: () => fs.existsSync(path.join(WORKSPACE_ROOT, 'analysis', 'screenshot-commands.json')),
  },
  {
    id: 'baselines',
    name: 'Baseline Screenshots',
    description: 'Capture SFRA screenshots before migration (for visual comparison)',
    script: 'capture-baselines.ts',
    optional: true,
    completionCheck: () => countFiles(SCREENSHOTS_DIR, /baseline.*\.png$/) > 0,
  },
  {
    id: 'claudePlans',
    name: 'Sub-Plan Generation (Claude)',
    description: 'Generate atomic migration sub-plans for each discovered feature',
    script: 'generate-subplan-claude.ts',
    completionCheck: () => countFiles(SUBPLANS_DIR, /subplan-.*\.md$/) > 0,
  },
  {
    id: 'log',
    name: 'Migration Log',
    description: 'Initialize dashboard-compatible migration log',
    script: 'init-migration-log.ts',
    completionCheck: () => fs.existsSync(MIGRATION_LOG),
  },
];

// ============================================================================
// Main Flow
// ============================================================================

async function runPhase(phase: Phase, skipPrompt = false): Promise<boolean> {
  subheader(`Phase: ${phase.name}`);
  console.log(`${colors.dim}${phase.description}${colors.reset}\n`);

  // Check if already complete
  if (phase.completionCheck()) {
    log(`${phase.name} appears complete`);
    if (!skipPrompt) {
      const { action } = await prompts({
        type: 'select',
        name: 'action',
        message: 'What would you like to do?',
        choices: [
          { title: 'Skip (already done)', value: 'skip' },
          { title: 'Re-run anyway', value: 'rerun' },
          { title: 'Abort setup', value: 'abort' },
        ],
      });

      if (!action || action === 'abort') return false;
      if (action === 'skip') return true;
    } else {
      return true;
    }
  }

  // For optional phases, ask if user wants to run
  if (phase.optional && !skipPrompt) {
    const { run } = await prompts({
      type: 'confirm',
      name: 'run',
      message: `Run ${phase.name}? (optional)`,
      initial: true,
    });

    if (!run) {
      log(`Skipping ${phase.name}`);
      return true;
    }
  }

  // Run the script
  log(`Running ${phase.script}...`);
  console.log('');

  try {
    const exitCode = await runScript(phase.script, phase.args || []);

    if (exitCode !== 0) {
      error(`${phase.name} failed with exit code ${exitCode}`);

      const { action } = await prompts({
        type: 'select',
        name: 'action',
        message: 'How would you like to proceed?',
        choices: [
          { title: 'Retry', value: 'retry' },
          { title: 'Skip this phase', value: 'skip' },
          { title: 'Abort setup', value: 'abort' },
        ],
      });

      if (!action || action === 'abort') return false;
      if (action === 'retry') return runPhase(phase, true);
      return true; // skip
    }

    success(`${phase.name} complete!`);
    return true;
  } catch (err: any) {
    error(`Error running ${phase.name}: ${err.message}`);
    return false;
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const skipBaselines = args.includes('--skip-baselines');
  const resume = args.includes('--resume');

  header('Migration Setup Orchestrator');

  showStatus();

  // Check for existing setup
  let shouldReset = false;

  if (resume) {
    log('Resuming from previous state...');
  } else if (hasFeatureDiscovery()) {
    const { action } = await prompts({
      type: 'select',
      name: 'action',
      message: 'Existing discovery results found. What would you like to do?',
      choices: [
        { title: 'Continue from where I left off', value: 'continue' },
        { title: 'Start fresh (reset all)', value: 'reset' },
        { title: 'Exit', value: 'exit' },
      ],
    });

    if (!action || action === 'exit') {
      log('Exiting');
      process.exit(0);
    }

    if (action === 'reset') {
      shouldReset = true;
    }
  }

  // Run phases
  for (const phase of phases) {
    // Skip baselines if requested
    if (phase.id === 'baselines' && skipBaselines) {
      log('Skipping baseline screenshots (--skip-baselines)');
      continue;
    }

    // Pass --reset flag to config phase if user selected reset
    const phaseArgs = phase.id === 'config' && shouldReset
      ? [...(phase.args || []), '--reset']
      : phase.args;

    const shouldContinue = await runPhase({ ...phase, args: phaseArgs });
    if (!shouldContinue) {
      error('Setup aborted');
      process.exit(1);
    }

    // Show updated status after each phase
    showStatus();
  }

  // Final summary
  header('Setup Complete!');

  const subplanCount = countFiles(SUBPLANS_DIR, /subplan-.*\.md$/);
  const screenshotCount = countFiles(SCREENSHOTS_DIR, /\.png$/);
  const discoveredPages = hasFeatureDiscovery()
    ? fs.readdirSync(MIGRATION_PLANS_DIR).filter(f => f.endsWith('-features.json')).length
    : 0;

  console.log(`${colors.green}✓${colors.reset} ${discoveredPages} page(s) discovered`);
  console.log(`${colors.green}✓${colors.reset} ${screenshotCount} screenshots captured`);
  console.log(`${colors.green}✓${colors.reset} ${subplanCount} sub-plans generated`);
  console.log(`${colors.green}✓${colors.reset} Migration log initialized`);

  console.log('');
  console.log(`${colors.bold}Next steps:${colors.reset}`);
  console.log(`  1. Start the dashboard:            ${colors.cyan}cd dashboard && node server.js${colors.reset}`);
  console.log(`  2. Open dashboard:                 ${colors.cyan}http://localhost:3030${colors.reset}`);
  console.log(`  3. Start target production server: ${colors.cyan}tsx scripts/prod-server.ts start${colors.reset}`);
  console.log(`  4. Begin migration with Claude`);
  console.log('');
}

main().catch((err) => {
  error(`Fatal error: ${err.message}`);
  process.exit(1);
});
