import fs from 'fs';
import path from 'path';
import { loadDiscoveryResults, loadURLMappings } from './discovery.js';
import type { CaptureOptions, ScreenshotMapping } from '../capture-screenshots.js';

export type CaptureType = 'source' | 'target';

interface FeatureScreenshotConfig {
  featureId: string;
  pageId: string;
  selector?: string;
  sfraUrl: string;
  targetUrl: string;
  viewport: { width: number; height: number };
  sourceConfig?: {
    dismiss_consent?: boolean;
    consent_button_selector?: string;
  };
}

export interface ScreenshotCommandEntry {
  featureId: string;
  pageId: string;
  selector?: string;
  sourceCommand: string;
  targetCommand: string;
  sourceScript: string;
  targetScript: string;
  sourceOutput: string;
  targetOutput: string;
}

export interface ScreenshotCommandManifest {
  generatedAt: string;
  features: Record<string, ScreenshotCommandEntry>;
}

export interface GeneratedScreenshotArtifacts {
  manifest: ScreenshotCommandManifest;
  manifestPath: string;
  generatedDir: string;
  wrapperCount: number;
}

const DEFAULT_WORKSPACE_ROOT = process.env.WORKSPACE_ROOT || process.cwd();
const MIGRATION_PLANS_DIR = 'migration-plans';
const URL_MAPPINGS_FILE = 'url-mappings.json';
const GENERATED_DIR = path.join('scripts', 'generated');
const MANIFEST_FILE = path.join('analysis', 'screenshot-commands.json');

function toPosixRelativePath(...segments: string[]): string {
  return path.posix.join(...segments);
}

function loadFeatureScreenshotConfigs(workspaceRoot: string): FeatureScreenshotConfig[] {
  const discoveryResults = loadDiscoveryResults(path.join(workspaceRoot, MIGRATION_PLANS_DIR));
  const mappings = loadURLMappings(path.join(workspaceRoot, URL_MAPPINGS_FILE));
  const configs: FeatureScreenshotConfig[] = [];

  for (const result of discoveryResults) {
    const page = mappings.pages.find((entry) => entry.page_id === result.page_id);
    if (!page) {
      throw new Error(`No page config found for page_id "${result.page_id}" in url-mappings.json`);
    }

    for (const feature of result.features) {
      if (!page.sfra_url || !page.target_url) {
        throw new Error(`Page "${result.page_id}" is missing sfra_url or target_url`);
      }

      configs.push({
        featureId: feature.feature_id,
        pageId: result.page_id,
        selector: feature.selector?.trim() || undefined,
        sfraUrl: page.sfra_url,
        targetUrl: page.target_url,
        viewport: page.viewport || { width: 1920, height: 1080 },
        sourceConfig: page.source_config,
      });
    }
  }

  configs.sort((a, b) => a.featureId.localeCompare(b.featureId));
  return configs;
}

function buildScreenshotMapping(config: FeatureScreenshotConfig, captureType: CaptureType): ScreenshotMapping {
  const mapping: ScreenshotMapping = {
    viewport: config.viewport,
  };

  if (captureType === 'source' && config.sourceConfig?.dismiss_consent) {
    mapping.dismiss_consent = true;
    if (config.sourceConfig.consent_button_selector) {
      mapping.consent_button_selector = config.sourceConfig.consent_button_selector;
    }
  }

  if (config.selector) {
    mapping.element_selector = config.selector;
  }

  return mapping;
}

function buildManifestEntry(config: FeatureScreenshotConfig): ScreenshotCommandEntry {
  const sourceScript = toPosixRelativePath(GENERATED_DIR, `capture-${config.featureId}-source.ts`);
  const targetScript = toPosixRelativePath(GENERATED_DIR, `capture-${config.featureId}-target.ts`);
  const sourceOutput = toPosixRelativePath('screenshots', `${config.featureId}-source.png`);
  const targetOutput = toPosixRelativePath('screenshots', `${config.featureId}-target.png`);

  return {
    featureId: config.featureId,
    pageId: config.pageId,
    selector: config.selector,
    sourceCommand: `tsx ${sourceScript}`,
    targetCommand: `tsx ${targetScript}`,
    sourceScript,
    targetScript,
    sourceOutput,
    targetOutput,
  };
}

function buildWrapperScript(featureId: string, captureType: CaptureType): string {
  const label = `${featureId} ${captureType}`;
  return `#!/usr/bin/env tsx
/**
 * Generated file. Do not edit manually.
 * Regenerate with: tsx scripts/generate-screenshot-wrappers.ts
 */

import { captureScreenshot } from '../capture-screenshots.js';
import { resolveFeatureCaptureOptions } from '../lib/screenshot-manifest.js';

async function main(): Promise<void> {
  const options = resolveFeatureCaptureOptions(${JSON.stringify(featureId)}, ${JSON.stringify(captureType)});
  await captureScreenshot(options);
}

main().catch((error) => {
  console.error(${JSON.stringify(`[Screenshot Wrapper] Failed to capture ${label}:`)}, error);
  process.exit(1);
});
`;
}

function removeStaleWrappers(generatedDir: string): void {
  if (!fs.existsSync(generatedDir)) {
    return;
  }

  for (const entry of fs.readdirSync(generatedDir, { withFileTypes: true })) {
    if (!entry.isFile()) {
      continue;
    }

    if (/^capture-.*-(source|target)\.ts$/.test(entry.name)) {
      fs.unlinkSync(path.join(generatedDir, entry.name));
    }
  }
}

export function resolveFeatureCaptureOptions(
  featureId: string,
  captureType: CaptureType,
  workspaceRoot = DEFAULT_WORKSPACE_ROOT,
): CaptureOptions {
  const config = loadFeatureScreenshotConfigs(workspaceRoot).find((entry) => entry.featureId === featureId);
  if (!config) {
    throw new Error(`No discovered feature found for screenshot wrapper "${featureId}"`);
  }

  const entry = buildManifestEntry(config);
  const outputPath = captureType === 'source'
    ? path.join(workspaceRoot, entry.sourceOutput)
    : path.join(workspaceRoot, entry.targetOutput);

  return {
    url: captureType === 'source' ? config.sfraUrl : config.targetUrl,
    outputPath,
    mapping: buildScreenshotMapping(config, captureType),
  };
}

export function writeScreenshotWrappers(workspaceRoot = DEFAULT_WORKSPACE_ROOT): GeneratedScreenshotArtifacts {
  const configs = loadFeatureScreenshotConfigs(workspaceRoot);
  const generatedDir = path.join(workspaceRoot, GENERATED_DIR);
  const manifestPath = path.join(workspaceRoot, MANIFEST_FILE);
  const manifest: ScreenshotCommandManifest = {
    generatedAt: new Date().toISOString(),
    features: {},
  };

  fs.mkdirSync(generatedDir, { recursive: true });
  fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
  removeStaleWrappers(generatedDir);

  for (const config of configs) {
    const entry = buildManifestEntry(config);
    manifest.features[config.featureId] = entry;

    fs.writeFileSync(
      path.join(workspaceRoot, entry.sourceScript),
      buildWrapperScript(config.featureId, 'source'),
    );
    fs.writeFileSync(
      path.join(workspaceRoot, entry.targetScript),
      buildWrapperScript(config.featureId, 'target'),
    );
  }

  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  return {
    manifest,
    manifestPath,
    generatedDir,
    wrapperCount: configs.length * 2,
  };
}
