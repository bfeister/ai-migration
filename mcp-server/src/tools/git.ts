/**
 * CommitMigrationProgress Tool (Phase 4 - Not Yet Implemented)
 *
 * TODO: Implement git commit logic
 */

import { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { CommitMigrationProgressArgs, CommitMigrationProgressResult } from './types.js';

export const COMMIT_MIGRATION_PROGRESS_TOOL: Tool = {
  name: 'CommitMigrationProgress',
  description: 'Create git commit with standardized message format (Phase 4 - Coming Soon)',
  inputSchema: {
    type: 'object',
    properties: {
      subplan_id: {
        type: 'string',
        description: 'Subplan ID (e.g., "subplan-01-02")',
      },
      title: {
        type: 'string',
        description: 'Commit title (e.g., "Document existing homepage implementation")',
      },
      files_changed: {
        type: 'array',
        items: { type: 'string' },
        description: 'Files to commit (optional, auto-detected if not provided)',
      },
      include_screenshots: {
        type: 'boolean',
        description: 'Include screenshots in commit (default: false)',
      },
    },
    required: ['subplan_id', 'title'],
  },
};

export async function handleCommitMigrationProgress(
  args: CommitMigrationProgressArgs
): Promise<CommitMigrationProgressResult> {
  throw new Error('CommitMigrationProgress not yet implemented (Phase 4)');
}
