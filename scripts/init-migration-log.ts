#!/usr/bin/env tsx
/**
 * Migration Log Initializer
 *
 * Creates a dashboard-compatible migration-log.md with the required format.
 * Dashboard expects: **Status:** and **Completed Micro-Plans:** X / Y patterns.
 *
 * Usage:
 *   npx tsx scripts/init-migration-log.ts
 */

import fs from 'fs';
import path from 'path';

// ============================================================================
// Types
// ============================================================================

interface FeatureConfig {
  feature_id: string;
  name: string;
}

interface URLMappings {
  source_base_url: string;
  target_base_url: string;
  mappings: FeatureConfig[];
}

// ============================================================================
// Constants
// ============================================================================

const WORKSPACE_ROOT = process.env.WORKSPACE_ROOT || process.cwd();
const URL_MAPPINGS_FILE = path.join(WORKSPACE_ROOT, 'url-mappings.json');
const SUBPLANS_DIR = path.join(WORKSPACE_ROOT, 'sub-plans');
const LOG_FILE = path.join(WORKSPACE_ROOT, 'migration-log.md');

// ============================================================================
// Utilities
// ============================================================================

function log(msg: string): void {
  console.error(`\x1b[34m[InitLog]\x1b[0m ${msg}`);
}

function success(msg: string): void {
  console.error(`\x1b[32m[InitLog]\x1b[0m ${msg}`);
}

function loadMappings(): URLMappings | null {
  if (fs.existsSync(URL_MAPPINGS_FILE)) {
    return JSON.parse(fs.readFileSync(URL_MAPPINGS_FILE, 'utf-8'));
  }
  return null;
}

function countSubPlans(): { total: number; byFeature: Record<string, number> } {
  const byFeature: Record<string, number> = {};
  let total = 0;

  if (fs.existsSync(SUBPLANS_DIR)) {
    const features = fs.readdirSync(SUBPLANS_DIR, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name);

    for (const feature of features) {
      const featureDir = path.join(SUBPLANS_DIR, feature);
      const plans = fs.readdirSync(featureDir)
        .filter(f => f.match(/^subplan-\d+-\d+\.md$/));
      byFeature[feature] = plans.length;
      total += plans.length;
    }
  }

  return { total, byFeature };
}

// ============================================================================
// Main
// ============================================================================

async function main(): Promise<void> {
  const mappings = loadMappings();
  const { total: totalSubplans, byFeature } = countSubPlans();

  if (!mappings) {
    log('Warning: No url-mappings.json found. Run discovery first.');
  }

  const timestamp = new Date().toISOString();
  const sourceUrl = mappings?.source_base_url || 'Not configured';
  const targetUrl = mappings?.target_base_url || 'Not configured';
  const allFeatures = mappings?.mappings.map(m => m.feature_id) || [];

  // Build feature table
  const featureRows = allFeatures.map(featureId => {
    const feature = mappings?.mappings.find(m => m.feature_id === featureId);
    const planCount = byFeature[featureId] || 0;
    return `| ${featureId} | ${feature?.name || featureId} | ${planCount} | Pending |`;
  });

  const content = `# Migration Log

**Status:** Setup Complete - Ready to Migrate
**Completed Micro-Plans:** 0 / ${totalSubplans}

---

## Configuration

| Setting | Value |
|---------|-------|
| Source | ${sourceUrl} |
| Target | ${targetUrl} |
| Initialized | ${timestamp} |
| Total Sub-Plans | ${totalSubplans} |

## Features to Migrate

| Feature ID | Name | Sub-Plans | Status |
|------------|------|-----------|--------|
${featureRows.join('\n')}

---

## Migration Progress

*Entries will be added by Claude during migration.*

---

## Session Log

### ${timestamp.split('T')[0]}

- **${timestamp}** - Migration log initialized
- Setup completed with ${allFeatures.length} features
- Generated ${totalSubplans} sub-plans

---

*Dashboard: http://localhost:3030*
*Log format compatible with dashboard API*
`;

  // Backup existing log if present
  if (fs.existsSync(LOG_FILE)) {
    const backupPath = LOG_FILE.replace('.md', `-backup-${Date.now()}.md`);
    fs.copyFileSync(LOG_FILE, backupPath);
    log(`Backed up existing log to: ${path.basename(backupPath)}`);
  }

  fs.writeFileSync(LOG_FILE, content);
  success(`Created: ${LOG_FILE}`);
  console.error('');
  console.error('Dashboard-compatible patterns:');
  console.error('  - **Status:** Setup Complete - Ready to Migrate');
  console.error(`  - **Completed Micro-Plans:** 0 / ${totalSubplans}`);
  console.error('');
  success('Migration log initialized. Ready to start migration!');
}

main().catch((err) => {
  console.error(`[InitLog] Error: ${err.message}`);
  process.exit(1);
});
