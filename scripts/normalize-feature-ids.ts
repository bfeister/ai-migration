#!/usr/bin/env tsx

import fs from 'fs';
import path from 'path';
import { loadDiscoveryResults, loadURLMappings } from './lib/discovery.js';
import { buildPageOrderMap, normalizeDiscoveryResultFeatureIds } from './lib/feature-id.js';

const WORKSPACE_ROOT = process.env.WORKSPACE_ROOT || process.cwd();
const MIGRATION_PLANS_DIR = path.join(WORKSPACE_ROOT, 'migration-plans');
const SUBPLANS_DIR = path.join(WORKSPACE_ROOT, 'sub-plans');
const ANALYSIS_DIR = path.join(WORKSPACE_ROOT, 'analysis');
const STATE_DIR = path.join(WORKSPACE_ROOT, '.migration-state');
const LOG_FILE = path.join(WORKSPACE_ROOT, 'migration-log.md');

const TEXT_FILE_EXTENSIONS = new Set([
  '.json',
  '.md',
  '.txt',
  '.js',
  '.jsx',
  '.ts',
  '.tsx',
  '.mjs',
  '.cjs',
  '.yaml',
  '.yml',
]);

function log(message: string): void {
  console.log(`\x1b[34m[NormalizeIds]\x1b[0m ${message}`);
}

function success(message: string): void {
  console.log(`\x1b[32m[NormalizeIds]\x1b[0m ${message}`);
}

function walkFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];

  const files: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkFiles(fullPath));
    } else {
      files.push(fullPath);
    }
  }

  return files;
}

function replaceAllInFile(filePath: string, replacements: Map<string, string>): boolean {
  const ext = path.extname(filePath);
  if (!TEXT_FILE_EXTENSIONS.has(ext)) {
    return false;
  }

  const original = fs.readFileSync(filePath, 'utf-8');
  let updated = original;

  for (const [from, to] of replacements) {
    updated = updated.split(from).join(to);
  }

  if (updated === original) {
    return false;
  }

  fs.writeFileSync(filePath, updated);
  return true;
}

function replaceAllInDirectory(dir: string, replacements: Map<string, string>): number {
  let changed = 0;
  for (const filePath of walkFiles(dir)) {
    if (replaceAllInFile(filePath, replacements)) {
      changed++;
    }
  }
  return changed;
}

function renameFeatureDirectory(baseDir: string, oldId: string, newId: string): void {
  if (oldId === newId) return;

  const oldPath = path.join(baseDir, oldId);
  const newPath = path.join(baseDir, newId);

  if (!fs.existsSync(oldPath) || fs.existsSync(newPath)) {
    return;
  }

  fs.renameSync(oldPath, newPath);
  log(`Renamed ${path.relative(WORKSPACE_ROOT, oldPath)} -> ${path.relative(WORKSPACE_ROOT, newPath)}`);
}

function renameStateMarker(oldId: string, newId: string): void {
  if (oldId === newId || !fs.existsSync(STATE_DIR)) return;

  const oldPath = path.join(STATE_DIR, `feature-${oldId}-complete`);
  const newPath = path.join(STATE_DIR, `feature-${newId}-complete`);

  if (!fs.existsSync(oldPath) || fs.existsSync(newPath)) {
    return;
  }

  fs.renameSync(oldPath, newPath);
  log(`Renamed state marker for ${oldId}`);
}

async function main(): Promise<void> {
  const mappings = loadURLMappings(path.join(WORKSPACE_ROOT, 'url-mappings.json'));
  const discoveryResults = loadDiscoveryResults(MIGRATION_PLANS_DIR);

  if (discoveryResults.length === 0) {
    log('No discovery files found. Nothing to normalize.');
    return;
  }

  const discoveredPageIds = new Set(discoveryResults.map((result) => result.page_id));
  const pageOrderMap = buildPageOrderMap(mappings.pages, discoveredPageIds);

  const replacements = new Map<string, string>();

  for (const result of discoveryResults) {
    const originalIds = result.features.map((feature) => feature.feature_id);
    const pageOrder = pageOrderMap.get(result.page_id) ?? 0;

    normalizeDiscoveryResultFeatureIds(result, pageOrder);

    result.features.forEach((feature, index) => {
      const oldId = originalIds[index];
      const newId = feature.feature_id;
      if (oldId !== newId) {
        replacements.set(oldId, newId);
      }
    });

    const outputPath = path.join(MIGRATION_PLANS_DIR, `${result.page_id}-features.json`);
    fs.writeFileSync(outputPath, JSON.stringify(result, null, 2) + '\n');
    log(`Updated ${path.relative(WORKSPACE_ROOT, outputPath)}`);
  }

  if (replacements.size === 0) {
    success('Feature IDs are already normalized.');
    return;
  }

  for (const [oldId, newId] of replacements) {
    renameFeatureDirectory(SUBPLANS_DIR, oldId, newId);
    renameFeatureDirectory(ANALYSIS_DIR, oldId, newId);
    renameStateMarker(oldId, newId);
  }

  let changedFiles = 0;
  changedFiles += replaceAllInDirectory(MIGRATION_PLANS_DIR, replacements);
  changedFiles += replaceAllInDirectory(SUBPLANS_DIR, replacements);
  changedFiles += replaceAllInDirectory(ANALYSIS_DIR, replacements);

  if (fs.existsSync(LOG_FILE) && replaceAllInFile(LOG_FILE, replacements)) {
    changedFiles++;
  }

  success(`Normalized ${replacements.size} feature ID(s) and updated ${changedFiles} text file(s).`);
}

main().catch((error) => {
  console.error(`\x1b[31m[NormalizeIds]\x1b[0m ${error.message}`);
  process.exit(1);
});
