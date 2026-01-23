/**
 * LogMigrationProgress Tool
 *
 * Provides atomic iteration logging for migration progress.
 * Auto-initializes migration-log.md on first use.
 */

import { Tool } from '@modelcontextprotocol/sdk/types.js';
import * as fs from 'fs';
import {
  resolveWorkspacePath,
  normalizeSubplanId,
  formatDuration,
  readFileSafe,
  writeFileSafe,
  getTimestamp,
  parseMigrationLogHeader,
  generateMigrationLogHeader,
} from './utils.js';
import type { LogMigrationProgressArgs, LogMigrationProgressResult } from './types.js';

/**
 * Tool definition for LogMigrationProgress
 */
export const LOG_MIGRATION_PROGRESS_TOOL: Tool = {
  name: 'LogMigrationProgress',
  description:
    'Append structured entries to migration-log.md with atomic iteration logging. ' +
    'Auto-initializes log file on first use. ' +
    'Normalizes subplan IDs (e.g., "01-02" → "subplan-01-02"). ' +
    'Updates header counts automatically. ' +
    'Generates dashboard-optimized format with timestamps, screenshots, and commit hashes.',
  inputSchema: {
    type: 'object',
    properties: {
      subplan_id: {
        type: 'string',
        description: 'Subplan ID (e.g., "subplan-01-02" or "01-02", will be normalized)',
      },
      status: {
        type: 'string',
        enum: ['success', 'failed'],
        description: 'Status of the iteration (only log on completion)',
      },
      summary: {
        type: 'string',
        description: 'Summary of what was done (e.g., "Implemented hero layout")',
      },
      source_screenshot_url: {
        type: 'string',
        description: 'SFRA baseline screenshot URL',
      },
      target_screenshot_url: {
        type: 'string',
        description: 'Storefront Next result screenshot URL',
      },
      commit_sha: {
        type: 'string',
        description: 'Git commit hash (proof of work)',
      },
      duration_seconds: {
        type: 'number',
        description: 'Duration in seconds (optional, auto-calculated if not provided)',
      },
      error_message: {
        type: 'string',
        description: 'Error message if status is "failed" (optional)',
      },
    },
    required: ['subplan_id', 'status', 'summary', 'source_screenshot_url', 'target_screenshot_url', 'commit_sha'],
  },
};

/**
 * Initialize migration log with default header
 */
function initializeMigrationLog(logPath: string): boolean {
  const defaultHeader = generateMigrationLogHeader(
    getTimestamp(),
    '🔄 In Progress',
    0,
    0,
    'Unknown'
  );

  return writeFileSafe(logPath, defaultHeader);
}

/**
 * Parse subplan title from subplan ID
 * Looks up the actual title from the subplan markdown file
 */
function getSubplanTitle(subplanId: string): string {
  try {
    // Extract feature directory and subplan number from ID
    // e.g., "subplan-01-02" -> feature "01-*", subplan file "subplan-01-02.md"
    const match = subplanId.match(/subplan-(\d+)-(\d+)/);
    if (!match) return 'Unknown';

    const featureNum = match[1];

    // Find the feature directory
    const subPlansDir = resolveWorkspacePath('sub-plans');
    if (!fs.existsSync(subPlansDir)) return 'Unknown';

    const featureDirs = fs.readdirSync(subPlansDir).filter(dir => dir.startsWith(`${featureNum}-`));
    if (featureDirs.length === 0) return 'Unknown';

    const featureDir = featureDirs[0];
    const subplanFile = resolveWorkspacePath('sub-plans', featureDir, `${subplanId}.md`);

    if (!fs.existsSync(subplanFile)) return 'Unknown';

    // Read the file and extract the title (first # heading)
    const content = fs.readFileSync(subplanFile, 'utf-8');
    const titleMatch = content.match(/^#\s+(.+)$/m);

    return titleMatch ? titleMatch[1].trim() : 'Unknown';
  } catch (error) {
    console.error(`[MCP] Error getting subplan title: ${error}`);
    return 'Unknown';
  }
}

/**
 * Generate formatted log entry
 */
function generateLogEntry(
  args: LogMigrationProgressArgs,
  normalizedId: string,
  title: string
): string {
  const timestamp = getTimestamp();
  const statusEmoji = args.status === 'success' ? '✅ Success' : '❌ Failed';
  const duration = args.duration_seconds
    ? formatDuration(args.duration_seconds)
    : 'N/A';

  let entry = `## [${timestamp}] ${normalizedId}: ${title}\n\n`;
  entry += `**Status:** ${statusEmoji}\n`;
  entry += `**Duration:** ${duration}\n`;
  entry += `**Summary:** ${args.summary}\n\n`;

  if (args.status === 'success') {
    entry += `**Screenshots:**\n`;
    entry += `- 📸 Source: ${args.source_screenshot_url}\n`;
    entry += `- 🎯 Target: ${args.target_screenshot_url}\n\n`;
    entry += `**Commit:** [\`${args.commit_sha}\`](../storefront-next/commit/${args.commit_sha})\n\n`;
  } else if (args.error_message) {
    entry += `**Error:**\n\`\`\`\n${args.error_message}\n\`\`\`\n\n`;
  }

  entry += `---\n`;

  return entry;
}

/**
 * Handle LogMigrationProgress tool call
 */
export async function handleLogMigrationProgress(
  args: LogMigrationProgressArgs
): Promise<LogMigrationProgressResult> {
  try {
    // Normalize subplan ID
    const normalizedId = normalizeSubplanId(args.subplan_id);
    console.error(`[MCP] Logging progress for ${normalizedId} (status: ${args.status})`);

    // Get log file path
    const logPath = resolveWorkspacePath('migration-log.md');

    // Read existing log or initialize
    let logContent = readFileSafe(logPath);
    if (!logContent) {
      console.error(`[MCP] Migration log not found, initializing...`);
      if (!initializeMigrationLog(logPath)) {
        return {
          success: false,
          log_path: logPath,
          error: 'Failed to initialize migration log',
        };
      }
      logContent = readFileSafe(logPath);
      if (!logContent) {
        return {
          success: false,
          log_path: logPath,
          error: 'Failed to read migration log after initialization',
        };
      }
    }

    // Parse header
    const header = parseMigrationLogHeader(logContent);
    if (!header) {
      return {
        success: false,
        log_path: logPath,
        error: 'Failed to parse migration log header',
      };
    }

    // Update counts if successful
    const newCompleted = args.status === 'success' ? header.completed + 1 : header.completed;
    const newStatus = newCompleted === header.total ? '✅ Complete' : '🔄 In Progress';

    // Get subplan title
    const title = getSubplanTitle(normalizedId);

    // Generate new header
    const newHeader = generateMigrationLogHeader(
      header.started,
      newStatus,
      newCompleted,
      header.total,
      header.current_feature
    );

    // Generate log entry
    const logEntry = generateLogEntry(args, normalizedId, title);

    // Replace header and append entry
    const headerEndIndex = logContent.indexOf('---\n') + 4;
    const entriesContent = logContent.substring(headerEndIndex);
    const newContent = newHeader + '\n' + logEntry + '\n' + entriesContent;

    // Write updated log
    if (!writeFileSafe(logPath, newContent)) {
      return {
        success: false,
        log_path: logPath,
        error: 'Failed to write updated migration log',
      };
    }

    console.error(`[MCP] ✅ Successfully logged progress for ${normalizedId}`);

    return {
      success: true,
      log_path: logPath,
      message: `Logged ${args.status} for ${normalizedId}`,
    };
  } catch (error: any) {
    console.error(`[MCP] Error logging migration progress:`, error);
    return {
      success: false,
      log_path: resolveWorkspacePath('migration-log.md'),
      error: error.message || 'Unknown error',
    };
  }
}
