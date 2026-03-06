#!/usr/bin/env tsx

import path from 'path';
import { writeScreenshotWrappers } from './lib/screenshot-manifest.js';

const WORKSPACE_ROOT = process.env.WORKSPACE_ROOT || process.cwd();

function log(message: string): void {
  console.log(`\x1b[34m[Wrappers]\x1b[0m ${message}`);
}

function success(message: string): void {
  console.log(`\x1b[32m[Wrappers]\x1b[0m ${message}`);
}

function error(message: string): void {
  console.error(`\x1b[31m[Wrappers]\x1b[0m ${message}`);
}

async function main(): Promise<void> {
  const { manifest, manifestPath, generatedDir, wrapperCount } = writeScreenshotWrappers(WORKSPACE_ROOT);
  const featureCount = Object.keys(manifest.features).length;

  log(`Generated ${wrapperCount} wrapper scripts for ${featureCount} feature(s)`);
  success(`Manifest: ${path.relative(WORKSPACE_ROOT, manifestPath)}`);
  success(`Wrappers: ${path.relative(WORKSPACE_ROOT, generatedDir)}`);
}

main().catch((err: Error) => {
  error(err.message);
  process.exit(1);
});
