#!/usr/bin/env tsx
/**
 * Baseline Screenshot Capture
 *
 * Captures SFRA baseline screenshots for selected features before migration.
 * Uses dashboard-compatible filename format.
 *
 * Usage:
 *   npx tsx scripts/capture-baselines.ts [--features id1,id2]
 */

import fs from 'fs';
import path from 'path';
import { captureScreenshot, ScreenshotMapping } from './capture-screenshots.js';
import { getFeatureSequence } from './lib/feature-id.js';

// ============================================================================
// Types
// ============================================================================

interface FeatureConfig {
  feature_id: string;
  name?: string;
  feature_name?: string;
  sfra_url: string;
  viewport?: { width: number; height: number };
  source_config?: {
    dismiss_consent?: boolean;
    wait_for_selector?: string;
    consent_button_selector?: string;
    scroll_to?: 'bottom' | 'top';
    scroll_to_selector?: string;
    crop?: { x?: number; y?: number; width?: number; height?: number };
  };
}

interface URLMappings {
  mappings: FeatureConfig[];
}

// ============================================================================
// Constants
// ============================================================================

const WORKSPACE_ROOT = process.env.WORKSPACE_ROOT || process.cwd();
const URL_MAPPINGS_FILE = path.join(WORKSPACE_ROOT, 'url-mappings.json');
const SCREENSHOTS_DIR = path.join(WORKSPACE_ROOT, 'screenshots');

// ============================================================================
// Utilities
// ============================================================================

function log(msg: string): void {
  console.error(`\x1b[34m[Baselines]\x1b[0m ${msg}`);
}

function success(msg: string): void {
  console.error(`\x1b[32m[Baselines]\x1b[0m ${msg}`);
}

function error(msg: string): void {
  console.error(`\x1b[31m[Baselines]\x1b[0m ${msg}`);
}

function loadMappings(): URLMappings {
  if (!fs.existsSync(URL_MAPPINGS_FILE)) {
    throw new Error(`url-mappings.json not found. Run setup first.`);
  }
  return JSON.parse(fs.readFileSync(URL_MAPPINGS_FILE, 'utf-8'));
}

function parseArgs(args: string[]): { features?: string[] } {
  const result: { features?: string[] } = {};

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--features' && args[i + 1]) {
      result.features = args[++i].split(',').map((s) => s.trim());
    }
  }

  return result;
}

/**
 * Generate dashboard-compatible baseline screenshot filename
 * Format: YYYYMMDD-HHMMSS-{featureNum}-00-baseline-source.png
 */
function generateBaselineFilename(featureId: string): string {
  const now = new Date();
  const date = now.toISOString().slice(0, 10).replace(/-/g, ''); // YYYYMMDD
  const time = now.toISOString().slice(11, 19).replace(/:/g, ''); // HHMMSS

  // Preserve stable screenshot numbering even when feature IDs are route-prefixed.
  const featureNum = getFeatureSequence(featureId);

  return `${date}-${time}-${featureNum}-00-baseline-source.png`;
}

// ============================================================================
// Main
// ============================================================================

async function captureBaseline(feature: FeatureConfig): Promise<string> {
  const name = feature.name || feature.feature_name || feature.feature_id;
  const filename = generateBaselineFilename(feature.feature_id);
  const outputPath = path.join(SCREENSHOTS_DIR, filename);

  log(`Capturing: ${feature.feature_id} (${name})`);
  log(`  URL: ${feature.sfra_url}`);
  log(`  Output: ${filename}`);

  // Build screenshot mapping from feature config
  const mapping: ScreenshotMapping = {
    viewport: feature.viewport || { width: 1920, height: 1080 },
    dismiss_consent: feature.source_config?.dismiss_consent,
    consent_button_selector: feature.source_config?.consent_button_selector,
    wait_for_selector: feature.source_config?.wait_for_selector,
    scroll_to: feature.source_config?.scroll_to,
    scroll_to_selector: feature.source_config?.scroll_to_selector,
    crop: feature.source_config?.crop,
  };

  await captureScreenshot({
    url: feature.sfra_url,
    outputPath,
    mapping,
  });

  return outputPath;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const mappings = loadMappings();

  // Determine which features to capture
  let featureIds = args.features;
  if (!featureIds) {
    featureIds = mappings.mappings.map((m) => m.feature_id);
  }

  const features = mappings.mappings.filter((m) => featureIds!.includes(m.feature_id));

  if (features.length === 0) {
    error('No features found. Check url-mappings.json or --features argument.');
    process.exit(1);
  }

  log(`Capturing ${features.length} baseline screenshot(s)...`);
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });

  const results: { feature: string; status: 'success' | 'error'; path?: string; error?: string }[] = [];

  for (const feature of features) {
    try {
      const outputPath = await captureBaseline(feature);
      success(`  Saved: ${path.basename(outputPath)}`);
      results.push({ feature: feature.feature_id, status: 'success', path: outputPath });
    } catch (err: any) {
      error(`  Failed: ${err.message}`);
      results.push({ feature: feature.feature_id, status: 'error', error: err.message });
    }
  }

  // Summary
  console.error('');
  const successCount = results.filter((r) => r.status === 'success').length;
  const errorCount = results.filter((r) => r.status === 'error').length;

  if (errorCount > 0) {
    error(`Completed: ${successCount} succeeded, ${errorCount} failed`);
    process.exit(1);
  } else {
    success(`All ${successCount} baseline screenshots captured`);
  }
}

main().catch((err) => {
  error(`Fatal error: ${err.message}`);
  process.exit(1);
});
