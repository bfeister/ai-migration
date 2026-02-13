#!/usr/bin/env tsx
/**
 * Feature Analysis Script
 *
 * Runs DOM extraction on selected features from url-mappings.json.
 * Saves structured output to analysis/{feature_id}/ directory.
 *
 * Usage:
 *   npx tsx scripts/analyze-features.ts [--features id1,id2]
 */

import fs from 'fs';
import path from 'path';
import { extractDomStructure, ExtractionResult } from './extract-dom-structure.js';

// ============================================================================
// Types
// ============================================================================

interface DiscoveredData {
  analyzed_at: string;
  matched_selector: string;
  element_count: number;
  headings: string[];
  image_count: number;
  link_count: number;
  fonts: string[];
  colors: {
    text: string[];
    background: string[];
  };
}

interface FeatureConfig {
  feature_id: string;
  name?: string;
  feature_name?: string;
  sfra_url: string;
  target_url: string;
  selector?: string;
  viewport?: { width: number; height: number };
  source_config?: {
    dismiss_consent?: boolean;
    wait_for_selector?: string;
  };
  discovered?: DiscoveredData;
}

interface URLMappings {
  version: string;
  source_base_url: string;
  target_base_url: string;
  mappings: FeatureConfig[];
}

interface SetupConfig {
  selectedFeatures: string[];
}

// ============================================================================
// Constants
// ============================================================================

const WORKSPACE_ROOT = process.env.WORKSPACE_ROOT || process.cwd();
const URL_MAPPINGS_FILE = path.join(WORKSPACE_ROOT, 'url-mappings.json');
const SETUP_CONFIG_FILE = path.join(WORKSPACE_ROOT, '.migration-state', 'setup-config.json');
const ANALYSIS_DIR = path.join(WORKSPACE_ROOT, 'analysis');
const SCREENSHOTS_DIR = path.join(WORKSPACE_ROOT, 'screenshots');

// ============================================================================
// Utilities
// ============================================================================

function log(msg: string): void {
  console.error(`\x1b[34m[Analyze]\x1b[0m ${msg}`);
}

function success(msg: string): void {
  console.error(`\x1b[32m[Analyze]\x1b[0m ${msg}`);
}

function error(msg: string): void {
  console.error(`\x1b[31m[Analyze]\x1b[0m ${msg}`);
}

function loadMappings(): URLMappings {
  if (!fs.existsSync(URL_MAPPINGS_FILE)) {
    throw new Error(`url-mappings.json not found. Run setup first: npx tsx scripts/setup-migration.ts`);
  }
  return JSON.parse(fs.readFileSync(URL_MAPPINGS_FILE, 'utf-8'));
}

function saveMappings(mappings: URLMappings): void {
  fs.writeFileSync(URL_MAPPINGS_FILE, JSON.stringify(mappings, null, 2));
}

/**
 * Extract discovered data from analysis result to feed back into url-mappings.json
 */
function buildDiscoveredData(result: ExtractionResult): DiscoveredData {
  return {
    analyzed_at: result.extractedAt,
    matched_selector: result.selector,
    element_count: result.summary.totalElements,
    headings: result.summary.headings.map((h) => h.text),
    image_count: result.summary.images.length,
    link_count: result.summary.links.length,
    fonts: result.summary.fonts,
    colors: {
      text: result.summary.textColors,
      background: result.summary.backgroundColors,
    },
  };
}

function loadSetupConfig(): SetupConfig | null {
  if (fs.existsSync(SETUP_CONFIG_FILE)) {
    return JSON.parse(fs.readFileSync(SETUP_CONFIG_FILE, 'utf-8'));
  }
  return null;
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
 * Generate dashboard-compatible screenshot filename
 * Format: YYYYMMDD-HHMMSS-{featureNum}-00-analysis-source.png
 */
function generateScreenshotPath(featureId: string): string {
  const now = new Date();
  const date = now.toISOString().slice(0, 10).replace(/-/g, ''); // YYYYMMDD
  const time = now.toISOString().slice(11, 19).replace(/:/g, ''); // HHMMSS

  // Extract feature number from feature_id (e.g., "01" from "01-homepage-hero")
  const featureNum = featureId.split('-')[0] || '00';

  // Format: YYYYMMDD-HHMMSS-{featureNum}-00-analysis-source.png
  const filename = `${date}-${time}-${featureNum}-00-analysis-source.png`;

  return path.join(SCREENSHOTS_DIR, filename);
}

function buildSummaryMarkdown(result: ExtractionResult, feature: FeatureConfig): string {
  const { summary } = result;
  const name = feature.name || feature.feature_name || feature.feature_id;
  const lines: string[] = [
    `# Analysis: ${name}`,
    '',
    `**Feature ID:** ${feature.feature_id}`,
    `**Source URL:** ${result.url}`,
    `**Selector:** ${result.selector}`,
    `**Extracted:** ${result.extractedAt}`,
    `**Viewport:** ${result.viewport.width}x${result.viewport.height}`,
    '',
    '## Summary',
    '',
    `- **Total Elements:** ${summary.totalElements}`,
    `- **Links:** ${summary.links.length}`,
    `- **Images:** ${summary.images.length}`,
    `- **Headings:** ${summary.headings.length}`,
    '',
  ];

  if (summary.headings.length > 0) {
    lines.push('## Headings', '');
    for (const h of summary.headings) {
      lines.push(`- **H${h.level}:** ${h.text}`);
    }
    lines.push('');
  }

  if (summary.links.length > 0) {
    lines.push('## Links', '');
    for (const link of summary.links.slice(0, 20)) {
      lines.push(`- [${link.text || 'link'}](${link.href})`);
    }
    if (summary.links.length > 20) {
      lines.push(`- ... and ${summary.links.length - 20} more`);
    }
    lines.push('');
  }

  if (summary.images.length > 0) {
    lines.push('## Images', '');
    for (const img of summary.images.slice(0, 10)) {
      lines.push(`- \`${img.src}\` (alt: "${img.alt || ''}")`);
    }
    if (summary.images.length > 10) {
      lines.push(`- ... and ${summary.images.length - 10} more`);
    }
    lines.push('');
  }

  if (summary.fonts.length > 0) {
    lines.push('## Fonts', '');
    for (const font of summary.fonts) {
      lines.push(`- ${font}`);
    }
    lines.push('');
  }

  if (summary.textColors.length > 0 || summary.backgroundColors.length > 0) {
    lines.push('## Colors', '');
    if (summary.textColors.length > 0) {
      lines.push(`**Text:** ${summary.textColors.slice(0, 5).join(', ')}`);
    }
    if (summary.backgroundColors.length > 0) {
      lines.push(`**Background:** ${summary.backgroundColors.slice(0, 5).join(', ')}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

// ============================================================================
// Main
// ============================================================================

// Default selectors for common feature types (always include body as ultimate fallback)
const DEFAULT_SELECTORS: Record<string, string> = {
  'hero': '.hero, .home-main-categories, main, body',
  'featured': '.home-main-categories, .featured-products, .product-listing, main, body',
  'tile': '.product-tile, .product-grid, .search-results, main, body',
  'nav': 'header, nav, body',
  'footer': 'footer, body',
  'default': 'main, body',
};

function inferSelector(featureId: string): string {
  const id = featureId.toLowerCase();
  // Order matters - more specific checks first
  if (id.includes('tile')) return DEFAULT_SELECTORS['tile'];
  if (id.includes('hero')) return DEFAULT_SELECTORS['hero'];
  if (id.includes('featured') || id.includes('category')) return DEFAULT_SELECTORS['featured'];
  if (id.includes('nav') || id.includes('header')) return DEFAULT_SELECTORS['nav'];
  if (id.includes('footer')) return DEFAULT_SELECTORS['footer'];
  if (id.includes('product') || id.includes('search')) return DEFAULT_SELECTORS['tile'];
  return DEFAULT_SELECTORS['default'];
}

async function analyzeFeature(feature: FeatureConfig, screenshotPath: string): Promise<ExtractionResult> {
  const name = feature.name || feature.feature_name || feature.feature_id;
  const selector = feature.selector || inferSelector(feature.feature_id);
  const viewport = feature.viewport || { width: 1920, height: 1080 };

  log(`Analyzing: ${feature.feature_id} (${name})`);
  log(`  URL: ${feature.sfra_url}`);
  log(`  Selector: ${selector}`);
  log(`  Screenshot: ${path.basename(screenshotPath)}`);

  const result = await extractDomStructure({
    url: feature.sfra_url,
    selector: selector,
    maxDepth: 10,
    viewport: viewport,
    dismissConsent: feature.source_config?.dismiss_consent ?? false,
    includeHidden: false,
    format: 'json',
    screenshotPath: screenshotPath,
  });

  return result;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const mappings = loadMappings();
  const setupConfig = loadSetupConfig();

  // Determine which features to analyze
  let featureIds = args.features;
  if (!featureIds) {
    featureIds = setupConfig?.selectedFeatures || mappings.mappings.map((m) => m.feature_id);
  }

  const features = mappings.mappings.filter((m) => featureIds!.includes(m.feature_id));

  if (features.length === 0) {
    error('No features to analyze. Check url-mappings.json or --features argument.');
    process.exit(1);
  }

  log(`Analyzing ${features.length} feature(s)...`);
  fs.mkdirSync(ANALYSIS_DIR, { recursive: true });
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });

  const results: { feature: string; status: 'success' | 'error'; error?: string }[] = [];
  let mappingsUpdated = false;

  for (const feature of features) {
    const featureDir = path.join(ANALYSIS_DIR, feature.feature_id);
    fs.mkdirSync(featureDir, { recursive: true });

    // Generate dashboard-compatible screenshot path
    const screenshotPath = generateScreenshotPath(feature.feature_id);

    try {
      const result = await analyzeFeature(feature, screenshotPath);

      // Save full extraction
      fs.writeFileSync(
        path.join(featureDir, 'dom-extraction.json'),
        JSON.stringify(result, null, 2)
      );

      // Save summary JSON
      fs.writeFileSync(
        path.join(featureDir, 'summary.json'),
        JSON.stringify(result.summary, null, 2)
      );

      // Save summary markdown
      fs.writeFileSync(
        path.join(featureDir, 'summary.md'),
        buildSummaryMarkdown(result, feature)
      );

      // Feed discovered data back into url-mappings.json
      const mappingIndex = mappings.mappings.findIndex((m) => m.feature_id === feature.feature_id);
      if (mappingIndex !== -1) {
        mappings.mappings[mappingIndex].discovered = buildDiscoveredData(result);
        mappingsUpdated = true;
      }

      success(`  Saved to: ${featureDir}/`);
      results.push({ feature: feature.feature_id, status: 'success' });
    } catch (err: any) {
      error(`  Failed: ${err.message}`);
      results.push({ feature: feature.feature_id, status: 'error', error: err.message });
    }
  }

  // Save updated mappings with discovered data
  if (mappingsUpdated) {
    saveMappings(mappings);
    log(`Updated url-mappings.json with discovered data`);
  }

  // Summary
  console.error('');
  const successCount = results.filter((r) => r.status === 'success').length;
  const errorCount = results.filter((r) => r.status === 'error').length;

  if (errorCount > 0) {
    error(`Completed: ${successCount} succeeded, ${errorCount} failed`);
    process.exit(1);
  } else {
    success(`All ${successCount} features analyzed successfully`);
    console.error(`\nNext: npx tsx scripts/generate-plans.ts`);
  }
}

main().catch((err) => {
  error(`Fatal error: ${err.message}`);
  process.exit(1);
});
