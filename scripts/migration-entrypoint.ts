#!/usr/bin/env tsx

import { runMigrationEntrypoint } from './lib/migration-entrypoint/core.js';

interface CLIArgs {
  dryRun: boolean;
  nonInteractive: boolean;
}

function parseArgs(): CLIArgs {
  const args = new Set(process.argv.slice(2));
  return {
    dryRun: args.has('--dry-run'),
    nonInteractive: args.has('--non-interactive'),
  };
}

async function main(): Promise<void> {
  const cliArgs = parseArgs();
  const exitCode = await runMigrationEntrypoint({
    dryRun: cliArgs.dryRun,
    interactive: !cliArgs.nonInteractive && Boolean(process.stdin.isTTY),
  });
  process.exit(exitCode);
}

main().catch((error) => {
  console.error('[entrypoint] Fatal:', error instanceof Error ? error.message : error);
  process.exit(1);
});
