#!/usr/bin/env node
/**
 * CLI wrapper for LogMigrationProgress
 * Usage: npx tsx log-progress-cli.ts <subplan_id> <status> <summary> <source_url> <target_url> <commit_sha>
 */

import { handleLogMigrationProgress } from '../mcp-server/src/tools/logging.js';

const args = process.argv.slice(2);
if (args.length < 6) {
  console.error('Usage: npx tsx log-progress-cli.ts <subplan_id> <status> <summary> <source_url> <target_url> <commit_sha>');
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
    console.log(`✅ Logged progress: ${result.message}`);
  } else {
    console.error(`❌ Failed to log progress: ${result.error}`);
    process.exit(1);
  }
})();
