/**
 * Shared utility functions for MCP migration tools
 */

import * as path from 'path';
import * as fs from 'fs';

/**
 * Get workspace root path from environment or fallback to current directory
 * Supports both Docker/CI (WORKSPACE_ROOT env) and local development (cwd)
 */
export function getWorkspaceRoot(): string {
  return process.env.WORKSPACE_ROOT || process.cwd();
}

/**
 * Resolve a path relative to workspace root
 */
export function resolveWorkspacePath(...segments: string[]): string {
  return path.join(getWorkspaceRoot(), ...segments);
}

/**
 * Normalize subplan ID to standard format
 * Examples:
 *   "01-02" -> "subplan-01-02"
 *   "subplan-01-02" -> "subplan-01-02"
 *   "subplan_01_02" -> "subplan-01-02"
 */
export function normalizeSubplanId(subplanId: string): string {
  // Remove any existing "subplan" prefix
  let normalized = subplanId.replace(/^subplan[-_]*/i, '');

  // Replace underscores with hyphens
  normalized = normalized.replace(/_/g, '-');

  // Add "subplan-" prefix
  return `subplan-${normalized}`;
}

/**
 * Format duration in seconds to human-readable string
 * Examples:
 *   65 -> "1m 5s"
 *   3661 -> "1h 1m 1s"
 */
export function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  const parts: string[] = [];
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (secs > 0 || parts.length === 0) parts.push(`${secs}s`);

  return parts.join(' ');
}

/**
 * Parse duration string to seconds
 * Examples:
 *   "1m 5s" -> 65
 *   "1h 1m 1s" -> 3661
 */
export function parseDuration(duration: string): number {
  const hours = duration.match(/(\d+)h/);
  const minutes = duration.match(/(\d+)m/);
  const seconds = duration.match(/(\d+)s/);

  return (
    (hours ? parseInt(hours[1]) * 3600 : 0) +
    (minutes ? parseInt(minutes[1]) * 60 : 0) +
    (seconds ? parseInt(seconds[1]) : 0)
  );
}

/**
 * Ensure directory exists, create if not
 */
export function ensureDirectoryExists(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

/**
 * Read file safely with error handling
 */
export function readFileSafe(filePath: string): string | null {
  try {
    return fs.readFileSync(filePath, 'utf-8');
  } catch (error) {
    return null;
  }
}

/**
 * Write file safely with error handling
 */
export function writeFileSafe(filePath: string, content: string): boolean {
  try {
    fs.writeFileSync(filePath, content, 'utf-8');
    return true;
  } catch (error) {
    console.error(`[MCP] Error writing file ${filePath}:`, error);
    return false;
  }
}

/**
 * Get ISO 8601 timestamp
 */
export function getTimestamp(): string {
  return new Date().toISOString();
}

/**
 * Get formatted timestamp for filenames (YYYYMMDD-HHMMSS)
 */
export function getFileTimestamp(): string {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  const day = String(now.getUTCDate()).padStart(2, '0');
  const hours = String(now.getUTCHours()).padStart(2, '0');
  const minutes = String(now.getUTCMinutes()).padStart(2, '0');
  const seconds = String(now.getUTCSeconds()).padStart(2, '0');

  return `${year}${month}${day}-${hours}${minutes}${seconds}`;
}

/**
 * Parse migration log header from markdown content
 */
export function parseMigrationLogHeader(content: string): {
  started: string;
  status: string;
  completed: number;
  total: number;
  current_feature: string;
} | null {
  try {
    const startedMatch = content.match(/\*\*Started:\*\*\s*(.+)/);
    const statusMatch = content.match(/\*\*Status:\*\*\s*(.+)/);
    const completedMatch = content.match(/\*\*Completed Micro-Plans:\*\*\s*(\d+)\s*\/\s*(\d+)/);
    const featureMatch = content.match(/\*\*Current Feature:\*\*\s*(.+)/);

    if (!completedMatch) return null;

    return {
      started: startedMatch ? startedMatch[1].trim() : '',
      status: statusMatch ? statusMatch[1].trim() : '',
      completed: parseInt(completedMatch[1]),
      total: parseInt(completedMatch[2]),
      current_feature: featureMatch ? featureMatch[1].trim() : '',
    };
  } catch (error) {
    return null;
  }
}

/**
 * Generate migration log header markdown
 */
export function generateMigrationLogHeader(
  started: string,
  status: string,
  completed: number,
  total: number,
  current_feature: string
): string {
  return `# Migration Progress Log

**Started:** ${started}
**Status:** ${status}
**Completed Micro-Plans:** ${completed} / ${total}
**Current Feature:** ${current_feature}

---
`;
}
