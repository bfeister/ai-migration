#!/usr/bin/env node
/**
 * CLI wrapper for logging migration progress to migration-log.md
 * Usage: npx tsx log-progress-cli.ts <subplan_id> <status> <summary> <source_url> <target_url> <commit_sha>
 *
 * Self-contained — no external dependencies beyond Node.js built-ins.
 */

import * as fs from 'fs';
import * as path from 'path';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface LogArgs {
  subplan_id: string;
  status: 'success' | 'failed';
  summary: string;
  source_screenshot_url: string;
  target_screenshot_url: string;
  commit_sha: string;
}

interface LogResult {
  success: boolean;
  message?: string;
  error?: string;
}

// ---------------------------------------------------------------------------
// Helpers (inlined from former mcp-server utils)
// ---------------------------------------------------------------------------

function getWorkspaceRoot(): string {
  return process.env.WORKSPACE_ROOT || process.cwd();
}

function resolveWorkspacePath(...segments: string[]): string {
  return path.join(getWorkspaceRoot(), ...segments);
}

/** Normalize subplan ID: "01-02" -> "subplan-01-02", keeps "subplan-01-02" as-is. */
function normalizeSubplanId(subplanId: string): string {
  let normalized = subplanId.replace(/^subplan[-_]*/i, '');
  normalized = normalized.replace(/_/g, '-');
  return `subplan-${normalized}`;
}

function readFileSafe(filePath: string): string | null {
  try {
    return fs.readFileSync(filePath, 'utf-8');
  } catch {
    return null;
  }
}

function writeFileSafe(filePath: string, content: string): boolean {
  try {
    fs.writeFileSync(filePath, content, 'utf-8');
    return true;
  } catch (err) {
    console.error(`Error writing file ${filePath}:`, err);
    return false;
  }
}

function getTimestamp(): string {
  return new Date().toISOString();
}

// ---------------------------------------------------------------------------
// Migration-log header parsing / generation
// ---------------------------------------------------------------------------

function parseMigrationLogHeader(content: string): {
  started: string;
  status: string;
  completed: number;
  total: number;
  current_feature: string;
} | null {
  try {
    const startedMatch = content.match(/\*\*Started:\*\*\s*(.+)/);
    const statusMatch = content.match(/\*\*Status:\*\*\s*(.+)/);
    const completedMatch = content.match(
      /\*\*Completed Micro-Plans:\*\*\s*(\d+)\s*\/\s*(\d+)/,
    );
    const featureMatch = content.match(/\*\*Current Feature:\*\*\s*(.+)/);

    if (!completedMatch) return null;

    return {
      started: startedMatch ? startedMatch[1].trim() : '',
      status: statusMatch ? statusMatch[1].trim() : '',
      completed: parseInt(completedMatch[1]),
      total: parseInt(completedMatch[2]),
      current_feature: featureMatch ? featureMatch[1].trim() : '',
    };
  } catch {
    return null;
  }
}

function generateMigrationLogHeader(
  started: string,
  status: string,
  completed: number,
  total: number,
  current_feature: string,
): string {
  return `# Migration Progress Log

**Started:** ${started}
**Status:** ${status}
**Completed Micro-Plans:** ${completed} / ${total}
**Current Feature:** ${current_feature}

---
`;
}

// ---------------------------------------------------------------------------
// Subplan title look-up
// ---------------------------------------------------------------------------

function getSubplanTitle(subplanId: string): string {
  try {
    const match = subplanId.match(/subplan-(\d+)-(\d+)/);
    if (!match) return 'Unknown';

    const featureNum = match[1];
    const subPlansDir = resolveWorkspacePath('sub-plans');
    if (!fs.existsSync(subPlansDir)) return 'Unknown';

    const featureDirs = fs
      .readdirSync(subPlansDir)
      .filter((dir) => dir.startsWith(`${featureNum}-`));
    if (featureDirs.length === 0) return 'Unknown';

    const featureDir = featureDirs[0];
    const subplanFile = resolveWorkspacePath(
      'sub-plans',
      featureDir,
      `${subplanId}.md`,
    );

    if (!fs.existsSync(subplanFile)) return 'Unknown';

    const content = fs.readFileSync(subplanFile, 'utf-8');
    const titleMatch = content.match(/^#\s+(.+)$/m);
    return titleMatch ? titleMatch[1].trim() : 'Unknown';
  } catch {
    return 'Unknown';
  }
}

// ---------------------------------------------------------------------------
// Log entry generation
// ---------------------------------------------------------------------------

function generateLogEntry(
  args: LogArgs,
  normalizedId: string,
  title: string,
): string {
  const timestamp = getTimestamp();
  const statusEmoji = args.status === 'success' ? '✅ Success' : '❌ Failed';

  let entry = `## [${timestamp}] ${normalizedId}: ${title}\n\n`;
  entry += `**Status:** ${statusEmoji}\n`;
  entry += `**Duration:** N/A\n`;
  entry += `**Summary:** ${args.summary}\n\n`;

  if (args.status === 'success') {
    entry += `**Screenshots:**\n`;
    entry += `- 📸 Source: ${args.source_screenshot_url}\n`;
    entry += `- 🎯 Target: ${args.target_screenshot_url}\n\n`;
    entry += `**Commit:** [\`${args.commit_sha}\`](../storefront-next/commit/${args.commit_sha})\n\n`;
  }

  entry += `---\n`;
  return entry;
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

async function handleLogMigrationProgress(
  args: LogArgs,
): Promise<LogResult> {
  try {
    const normalizedId = normalizeSubplanId(args.subplan_id);
    const logPath = resolveWorkspacePath('migration-log.md');

    // Read existing log or initialize
    let logContent = readFileSafe(logPath);
    if (!logContent) {
      const defaultHeader = generateMigrationLogHeader(
        getTimestamp(),
        '🔄 In Progress',
        0,
        0,
        'Unknown',
      );
      if (!writeFileSafe(logPath, defaultHeader)) {
        return { success: false, error: 'Failed to initialize migration log' };
      }
      logContent = readFileSafe(logPath);
      if (!logContent) {
        return {
          success: false,
          error: 'Failed to read migration log after initialization',
        };
      }
    }

    // Parse header
    const header = parseMigrationLogHeader(logContent);
    if (!header) {
      return { success: false, error: 'Failed to parse migration log header' };
    }

    // Update counts
    const newCompleted =
      args.status === 'success' ? header.completed + 1 : header.completed;
    const newStatus =
      newCompleted === header.total ? '✅ Complete' : '🔄 In Progress';

    // Get subplan title
    const title = getSubplanTitle(normalizedId);

    // Generate new header
    const newHeader = generateMigrationLogHeader(
      header.started,
      newStatus,
      newCompleted,
      header.total,
      header.current_feature,
    );

    // Generate log entry
    const logEntry = generateLogEntry(args, normalizedId, title);

    // Replace header and prepend entry (newest first)
    const headerEndIndex = logContent.indexOf('---\n') + 4;
    const entriesContent = logContent.substring(headerEndIndex);
    const newContent = newHeader + '\n' + logEntry + '\n' + entriesContent;

    if (!writeFileSafe(logPath, newContent)) {
      return { success: false, error: 'Failed to write updated migration log' };
    }

    return {
      success: true,
      message: `Logged ${args.status} for ${normalizedId}`,
    };
  } catch (err: any) {
    return {
      success: false,
      error: err.message || 'Unknown error',
    };
  }
}

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
if (args.length < 6) {
  console.error(
    'Usage: npx tsx log-progress-cli.ts <subplan_id> <status> <summary> <source_url> <target_url> <commit_sha>',
  );
  process.exit(1);
}

const [subplan_id, status, summary, source_screenshot_url, target_screenshot_url, commit_sha] = args;

(async () => {
  const result = await handleLogMigrationProgress({
    subplan_id,
    status: status as 'success' | 'failed',
    summary,
    source_screenshot_url,
    target_screenshot_url,
    commit_sha,
  });

  if (result.success) {
    console.log(`Logged progress: ${result.message}`);
  } else {
    console.error(`Failed to log progress: ${result.error}`);
    process.exit(1);
  }
})();
