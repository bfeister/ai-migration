/**
 * Shared discovery-file loading logic.
 *
 * Reads migration-plans/*-features.json discovery output and url-mappings.json
 * page config. Each consuming script maps these into its own local FeatureConfig.
 */

import fs from 'fs';
import path from 'path';

// ============================================================================
// Types — discovery files (*-features.json)
// ============================================================================

export interface DiscoveredFeature {
  feature_id: string;
  name: string;
  selector: string;
  description?: string;
  migration_priority?: number;
  estimated_complexity?: 'low' | 'medium' | 'high';
  dependencies?: string[];
  notes?: string;
  isml_source?: Record<string, unknown>;
  /** Populated later by analyze-features */
  discovered?: Record<string, unknown>;
}

export interface FeatureDiscoveryResult {
  page_id: string;
  features: DiscoveredFeature[];
}

// ============================================================================
// Types — url-mappings.json v2
// ============================================================================

export interface PageConfig {
  page_id: string;
  name: string;
  selected?: boolean;
  sfra_url: string;
  target_url: string;
  /** React Router route file name relative to src/routes/ (e.g., "_app._index.tsx") */
  route_file?: string;
  isml_template?: string;
  viewport?: { width: number; height: number };
  source_config?: {
    dismiss_consent?: boolean;
    consent_button_selector?: string;
  };
}

export interface URLMappingsV2 {
  version: string;
  source_base_url: string;
  target_base_url: string;
  pages: PageConfig[];
}

// ============================================================================
// Loaders
// ============================================================================

/**
 * Read and parse all *-features.json discovery files from a directory.
 * Returns raw results so each script can map to its own shape.
 */
export function loadDiscoveryResults(migrationPlansDir: string): FeatureDiscoveryResult[] {
  if (!fs.existsSync(migrationPlansDir)) return [];

  return fs.readdirSync(migrationPlansDir)
    .filter(f => f.endsWith('-features.json'))
    .map(f => JSON.parse(fs.readFileSync(path.join(migrationPlansDir, f), 'utf-8')) as FeatureDiscoveryResult);
}

/**
 * Load and parse url-mappings.json. Throws if the file doesn't exist.
 */
export function loadURLMappings(filePath: string): URLMappingsV2 {
  if (!fs.existsSync(filePath)) {
    throw new Error(`url-mappings.json not found at ${filePath}. Run setup first.`);
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

/**
 * Find the PageConfig matching a given page_id, or undefined.
 */
export function findPage(mappings: URLMappingsV2, pageId: string): PageConfig | undefined {
  return mappings.pages.find(p => p.page_id === pageId);
}
