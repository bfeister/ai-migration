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
import { loadDiscoveryResults, loadURLMappings, findPage, type URLMappingsV2 } from './lib/discovery.js';
import { getFeatureSequence } from './lib/feature-id.js';

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
    consent_button_selector?: string;
  };
  discovered?: DiscoveredData;
}

// ============================================================================
// Constants
// ============================================================================

const WORKSPACE_ROOT = process.env.WORKSPACE_ROOT || process.cwd();
const URL_MAPPINGS_FILE = path.join(WORKSPACE_ROOT, 'url-mappings.json');
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

const MIGRATION_PLANS_DIR = path.join(WORKSPACE_ROOT, 'migration-plans');

function loadFeatures(pageConfig: URLMappingsV2): FeatureConfig[] {
  const results = loadDiscoveryResults(MIGRATION_PLANS_DIR);
  const features: FeatureConfig[] = [];

  for (const discovery of results) {
    const page = findPage(pageConfig, discovery.page_id);

    for (const feat of discovery.features) {
      features.push({
        feature_id: feat.feature_id,
        name: feat.name,
        sfra_url: page?.sfra_url || pageConfig.source_base_url,
        target_url: page?.target_url || pageConfig.target_base_url,
        selector: feat.selector,
        viewport: page?.viewport,
        source_config: page?.source_config ? {
          dismiss_consent: page.source_config.dismiss_consent,
          consent_button_selector: page.source_config.consent_button_selector,
        } : undefined,
      });
    }
  }

  return features;
}

/**
 * Extract discovered data from analysis result to persist into discovery files.
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

  // Preserve stable screenshot numbering even when feature IDs are route-prefixed.
  const featureNum = getFeatureSequence(featureId);

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
    consentButtonSelector: feature.source_config?.consent_button_selector,
    includeHidden: false,
    format: 'json',
    screenshotPath: screenshotPath,
  });

  return result;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const pageConfig = loadURLMappings(URL_MAPPINGS_FILE);
  const allFeatures = loadFeatures(pageConfig);

  if (allFeatures.length === 0) {
    error('No discovered features found. Run discovery first: npx tsx scripts/discover-features-claude.ts');
    process.exit(1);
  }

  // Determine which features to analyze
  let featureIds = args.features;
  if (!featureIds) {
    featureIds = allFeatures.map((m) => m.feature_id);
  }

  const features = allFeatures.filter((m) => featureIds!.includes(m.feature_id));

  if (features.length === 0) {
    error('No matching features found. Check --features argument.');
    process.exit(1);
  }

  log(`Analyzing ${features.length} feature(s)...`);
  fs.mkdirSync(ANALYSIS_DIR, { recursive: true });
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });

  const results: { feature: string; status: 'success' | 'error' | 'waf_blocked' | 'selector_missing'; error?: string }[] = [];
  let wafBlockDetected = false;
  // Track which discovery files need updating with analysis data
  const discoveryUpdates = new Map<string, { filePath: string; data: any }>();

  for (const feature of features) {
    const featureDir = path.join(ANALYSIS_DIR, feature.feature_id);
    fs.mkdirSync(featureDir, { recursive: true });

    // Generate dashboard-compatible screenshot path
    const screenshotPath = generateScreenshotPath(feature.feature_id);

    try {
      const result = await analyzeFeature(feature, screenshotPath);

      if (result.selectorMissing) {
        log(`  Selector not found on page — feature may be conditionally rendered. Skipping analysis.`);
        results.push({ feature: feature.feature_id, status: 'selector_missing' });
        continue;
      }

      if (result.wafBlocked) {
        if (!wafBlockDetected) {
          wafBlockDetected = true;
          error('');
          error('╔══════════════════════════════════════════════════════════════╗');
          error('║  WAF / CDN BLOCK DETECTED — extraction hit an error page   ║');
          error('║  The target site is blocking headless browser requests.     ║');
          error('║  All analysis results from this URL are INVALID.           ║');
          error('╚══════════════════════════════════════════════════════════════╝');
          error(`  URL: ${feature.sfra_url}`);
          error(`  Page title: "${result.wafBlocked.pageTitle}"`);
          for (const sig of result.wafBlocked.signals) {
            error(`  → ${sig}`);
          }
          error('');
        }
        results.push({ feature: feature.feature_id, status: 'waf_blocked', error: `WAF blocked: ${result.wafBlocked.pageTitle}` });
        continue;
      }

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

      // Enrich discovery files with analysis data
      if (fs.existsSync(MIGRATION_PLANS_DIR)) {
        const discoveryFiles = fs.readdirSync(MIGRATION_PLANS_DIR)
          .filter(f => f.endsWith('-features.json'));

        for (const file of discoveryFiles) {
          const filePath = path.join(MIGRATION_PLANS_DIR, file);
          if (!discoveryUpdates.has(filePath)) {
            discoveryUpdates.set(filePath, {
              filePath,
              data: JSON.parse(fs.readFileSync(filePath, 'utf-8')),
            });
          }

          const entry = discoveryUpdates.get(filePath)!;
          const feat = entry.data.features?.find(
            (f: any) => f.feature_id === feature.feature_id
          );
          if (feat) {
            feat.discovered = buildDiscoveredData(result);
          }
        }
      }

      success(`  Saved to: ${featureDir}/`);
      results.push({ feature: feature.feature_id, status: 'success' });
    } catch (err: any) {
      error(`  Failed: ${err.message}`);
      results.push({ feature: feature.feature_id, status: 'error', error: err.message });
    }
  }

  // Persist analysis data back into discovery files
  for (const [, entry] of discoveryUpdates) {
    fs.writeFileSync(entry.filePath, JSON.stringify(entry.data, null, 2));
    log(`Updated ${path.basename(entry.filePath)} with analysis data`);
  }

  // Summary
  console.error('');
  const successCount = results.filter((r) => r.status === 'success').length;
  const errorCount = results.filter((r) => r.status === 'error').length;
  const wafCount = results.filter((r) => r.status === 'waf_blocked').length;
  const selectorMissingCount = results.filter((r) => r.status === 'selector_missing').length;

  if (selectorMissingCount > 0) {
    log(`${selectorMissingCount} feature(s) had no matching selector on page (conditionally rendered) — skipped analysis`);
  }

  if (wafCount > 0) {
    error(`Completed: ${wafCount} blocked by WAF/CDN, ${errorCount} failed, ${successCount} succeeded`);
    error('The target site is blocking automated requests. Possible remedies:');
    error('  • Use a staging/sandbox URL instead of production');
    error('  • Set a custom User-Agent via PLAYWRIGHT_USER_AGENT env var');
    error('  • Run from an allowlisted network/VPN');
    error('  • Add the site to a CDN bypass list');
    process.exit(1);
  } else if (errorCount > 0) {
    error(`Completed: ${successCount} succeeded, ${errorCount} failed, ${selectorMissingCount} skipped (no selector)`);
    process.exit(1);
  } else {
    success(`All ${successCount} features analyzed successfully${selectorMissingCount > 0 ? ` (${selectorMissingCount} skipped — selector not on page)` : ''}`);
    console.error(`\nNext: npx tsx scripts/generate-plans.ts`);
  }
}

main().catch((err) => {
  error(`Fatal error: ${err.message}`);
  process.exit(1);
});
