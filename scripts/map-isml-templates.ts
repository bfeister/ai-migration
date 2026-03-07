#!/usr/bin/env tsx
/**
 * ISML Template Mapping Script
 *
 * Interactive script that runs after analysis phase to map ISML template files
 * to analyzed features. Displays discovered data (headings, colors, fonts) and
 * prompts user to specify the ISML template path for each feature.
 *
 * Usage:
 *   npx tsx scripts/map-isml-templates.ts
 *   npx tsx scripts/map-isml-templates.ts --features 01-homepage-hero,02-homepage-featured
 */

import prompts from 'prompts';
import fs from 'fs';
import path from 'path';
import { compareFeatureIds } from './lib/feature-id.js';

// ============================================================================
// Types
// ============================================================================

interface FeatureConfig {
    feature_id: string;
    name: string;
    source_path: string;
    target_path: string;
    sfra_url: string;
    target_url: string;
    selector: string;
    viewport: { width: number; height: number };
    source_config?: {
        dismiss_consent?: boolean;
        consent_button_selector?: string;
    };
    discovered?: {
        analyzed_at?: string;
        headings?: string[];
        fonts?: string[];
        colors?: {
            text?: string[];
            background?: string[];
        };
        element_count?: number;
    };
    isml_template_path?: string;
}

interface URLMappings {
    version: string;
    source_base_url: string;
    target_base_url: string;
    mappings: FeatureConfig[];
}

interface DOMExtraction {
    url: string;
    selector: string;
    extractedAt: string;
    summary: {
        totalElements: number;
        headings: Array<{ level: number; text: string }>;
        fonts: string[];
        textColors: string[];
        backgroundColors: string[];
        backgroundImages: string[];
    };
}

// ============================================================================
// Constants
// ============================================================================

const WORKSPACE_ROOT = process.env.WORKSPACE_ROOT || process.cwd();
const URL_MAPPINGS_FILE = path.join(WORKSPACE_ROOT, 'url-mappings.json');
const ANALYSIS_DIR = path.join(WORKSPACE_ROOT, 'analysis');

// SFRA source configuration from environment
const SFRA_SOURCE = process.env.SFRA_SOURCE || '';
const SFRA_TEMPLATE_BASE = process.env.SFRA_TEMPLATE_BASE ||
    'cartridges/app_storefront_base/cartridge/templates/default';

// Default ISML template suggestions based on feature ID patterns
const ISML_SUGGESTIONS: Record<string, string> = {
    '01-homepage-hero': 'home/homePage.isml',
    '02-homepage-featured': 'home/homePage.isml',
    '03-header-nav': 'common/layout/page.isml',
    '04-footer': 'common/layout/page.isml',
    '05-pdp': 'product/productDetails.isml',
    '06-cart': 'cart/cart.isml',
    '07-checkout': 'checkout/checkout.isml',
};

// ============================================================================
// Utilities
// ============================================================================

const colors = {
    reset: '\x1b[0m',
    bold: '\x1b[1m',
    dim: '\x1b[2m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
    red: '\x1b[31m',
};

function log(msg: string): void {
    console.log(`${colors.blue}[ISML Map]${colors.reset} ${msg}`);
}

function success(msg: string): void {
    console.log(`${colors.green}[ISML Map]${colors.reset} ${msg}`);
}

function warn(msg: string): void {
    console.log(`${colors.yellow}[ISML Map]${colors.reset} ${msg}`);
}

function error(msg: string): void {
    console.log(`${colors.red}[ISML Map]${colors.reset} ${msg}`);
}

function loadURLMappings(): URLMappings | null {
    if (fs.existsSync(URL_MAPPINGS_FILE)) {
        try {
            return JSON.parse(fs.readFileSync(URL_MAPPINGS_FILE, 'utf-8'));
        } catch {
            return null;
        }
    }
    return null;
}

function saveURLMappings(mappings: URLMappings): void {
    fs.writeFileSync(URL_MAPPINGS_FILE, JSON.stringify(mappings, null, 2));
}

function loadDOMExtraction(featureId: string): DOMExtraction | null {
    const extractionPath = path.join(ANALYSIS_DIR, featureId, 'dom-extraction.json');
    if (fs.existsSync(extractionPath)) {
        try {
            return JSON.parse(fs.readFileSync(extractionPath, 'utf-8'));
        } catch {
            return null;
        }
    }
    return null;
}

/**
 * Suggest an ISML template path based on feature ID
 */
function suggestISMLPath(featureId: string): string {
    // First check known mappings
    const suggestion = ISML_SUGGESTIONS[featureId];
    if (!suggestion) return '';

    // If SFRA_SOURCE is set, return full path
    if (SFRA_SOURCE) {
        return path.join(SFRA_SOURCE, SFRA_TEMPLATE_BASE, suggestion);
    }

    // Otherwise return relative suggestion
    return suggestion;
}

/**
 * Validate ISML template path exists
 */
function validateISMLPath(templatePath: string): { valid: boolean; message?: string } {
    if (!templatePath) {
        return { valid: false, message: 'Path is empty' };
    }

    // Handle relative paths
    let fullPath = templatePath;
    if (!path.isAbsolute(templatePath) && SFRA_SOURCE) {
        fullPath = path.join(SFRA_SOURCE, SFRA_TEMPLATE_BASE, templatePath);
    }

    if (!fs.existsSync(fullPath)) {
        return { valid: false, message: `File not found: ${fullPath}` };
    }

    if (!fullPath.endsWith('.isml')) {
        return { valid: false, message: 'File must have .isml extension' };
    }

    return { valid: true };
}

/**
 * Display feature discovery data in a formatted way
 */
function displayFeatureDiscovery(feature: FeatureConfig, domExtraction: DOMExtraction | null): void {
    console.log('');
    console.log(`${colors.cyan}┌─────────────────────────────────────────────────────────────┐${colors.reset}`);
    console.log(`${colors.cyan}│${colors.reset} ${colors.bold}${feature.feature_id}: ${feature.name}${colors.reset}`.padEnd(73) + `${colors.cyan}│${colors.reset}`);
    console.log(`${colors.cyan}├─────────────────────────────────────────────────────────────┤${colors.reset}`);

    if (domExtraction) {
        const summary = domExtraction.summary;

        // Elements count
        console.log(`${colors.cyan}│${colors.reset} Elements: ${colors.bold}${summary.totalElements}${colors.reset}`.padEnd(73) + `${colors.cyan}│${colors.reset}`);

        // Headings
        if (summary.headings && summary.headings.length > 0) {
            const headingTexts = summary.headings.map(h => `H${h.level}: "${h.text}"`).join(', ');
            const truncated = headingTexts.length > 50 ? headingTexts.substring(0, 47) + '...' : headingTexts;
            console.log(`${colors.cyan}│${colors.reset} Headings: ${colors.magenta}${truncated}${colors.reset}`.padEnd(73) + `${colors.cyan}│${colors.reset}`);
        }

        // Fonts
        if (summary.fonts && summary.fonts.length > 0) {
            const fonts = summary.fonts.slice(0, 3).join(', ');
            console.log(`${colors.cyan}│${colors.reset} Fonts: ${fonts}`.padEnd(62) + `${colors.cyan}│${colors.reset}`);
        }

        // Colors
        if (summary.textColors && summary.textColors.length > 0) {
            console.log(`${colors.cyan}│${colors.reset} Text colors: ${summary.textColors.slice(0, 2).join(', ')}`.padEnd(62) + `${colors.cyan}│${colors.reset}`);
        }
        if (summary.backgroundColors && summary.backgroundColors.length > 0) {
            console.log(`${colors.cyan}│${colors.reset} BG colors: ${summary.backgroundColors.slice(0, 2).join(', ')}`.padEnd(62) + `${colors.cyan}│${colors.reset}`);
        }

        // Background images
        if (summary.backgroundImages && summary.backgroundImages.length > 0) {
            console.log(`${colors.cyan}│${colors.reset} Background images: ${colors.dim}${summary.backgroundImages.length} found${colors.reset}`.padEnd(73) + `${colors.cyan}│${colors.reset}`);
        }
    } else {
        console.log(`${colors.cyan}│${colors.reset} ${colors.yellow}No analysis data available${colors.reset}`.padEnd(73) + `${colors.cyan}│${colors.reset}`);
    }

    // Current ISML path if set
    if (feature.isml_template_path) {
        console.log(`${colors.cyan}│${colors.reset} Current ISML: ${colors.green}${feature.isml_template_path}${colors.reset}`.padEnd(73) + `${colors.cyan}│${colors.reset}`);
    }

    console.log(`${colors.cyan}└─────────────────────────────────────────────────────────────┘${colors.reset}`);
    console.log('');
}

// ============================================================================
// CLI Arguments
// ============================================================================

function parseArgs(): { features?: string[] } {
    const args = process.argv.slice(2);
    let features: string[] | undefined;

    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--features' && args[i + 1]) {
            features = args[i + 1].split(',').map(f => f.trim());
            i++;
        }
    }

    return { features };
}

// ============================================================================
// Main Flow
// ============================================================================

async function main(): Promise<void> {
    const cliArgs = parseArgs();

    console.log('');
    console.log(`${colors.bold}═══════════════════════════════════════════════════════════════${colors.reset}`);
    console.log(`${colors.bold}           ISML Template Mapping${colors.reset}`);
    console.log(`${colors.bold}═══════════════════════════════════════════════════════════════${colors.reset}`);
    console.log('');

    // Check SFRA_SOURCE
    if (SFRA_SOURCE) {
        success(`SFRA_SOURCE: ${SFRA_SOURCE}`);
        log(`Template base: ${SFRA_TEMPLATE_BASE}`);
    } else {
        warn('SFRA_SOURCE not set - you will need to provide absolute paths');
        log('Set SFRA_SOURCE in your .env file for auto-suggestions');
    }

    // Load URL mappings
    const mappings = loadURLMappings();
    if (!mappings) {
        error('url-mappings.json not found. Run setup-migration.ts first.');
        process.exit(1);
    }

    // Filter features if specified
    let featuresToMap = mappings.mappings;
    if (cliArgs.features) {
        featuresToMap = featuresToMap.filter(f =>
            cliArgs.features!.includes(f.feature_id)
        );
    }

    // Sort by route first, then by feature order within that route.
    featuresToMap.sort((a, b) => compareFeatureIds(a.feature_id, b.feature_id));

    log(`Found ${featuresToMap.length} feature(s) to map`);

    // Process each feature
    let updatedCount = 0;
    for (const feature of featuresToMap) {
        const domExtraction = loadDOMExtraction(feature.feature_id);

        // Display feature info
        displayFeatureDiscovery(feature, domExtraction);

        // Get suggested path
        const suggestedPath = suggestISMLPath(feature.feature_id);

        // Check if already mapped
        if (feature.isml_template_path) {
            const validation = validateISMLPath(feature.isml_template_path);
            if (validation.valid) {
                const { action } = await prompts({
                    type: 'select',
                    name: 'action',
                    message: 'ISML path already set. What would you like to do?',
                    choices: [
                        { title: 'Keep current path', value: 'keep' },
                        { title: 'Update path', value: 'update' },
                        { title: 'Skip this feature', value: 'skip' },
                    ],
                });

                if (!action || action === 'skip') continue;
                if (action === 'keep') continue;
            } else {
                warn(`Current path invalid: ${validation.message}`);
            }
        }

        // Prompt for ISML path
        const { ismlPath } = await prompts({
            type: 'text',
            name: 'ismlPath',
            message: 'Enter ISML template path:',
            initial: suggestedPath || feature.isml_template_path || '',
            validate: (value) => {
                if (!value) return 'Path is required';
                const validation = validateISMLPath(value);
                return validation.valid || validation.message || 'Invalid path';
            },
        });

        if (!ismlPath) {
            warn('Skipping feature (no path provided)');
            continue;
        }

        // Resolve to absolute path
        let absolutePath = ismlPath;
        if (!path.isAbsolute(ismlPath) && SFRA_SOURCE) {
            absolutePath = path.join(SFRA_SOURCE, SFRA_TEMPLATE_BASE, ismlPath);
        }

        // Update feature config
        const featureIndex = mappings.mappings.findIndex(
            f => f.feature_id === feature.feature_id
        );
        if (featureIndex !== -1) {
            mappings.mappings[featureIndex].isml_template_path = absolutePath;
            updatedCount++;
            success(`Mapped: ${feature.feature_id} -> ${absolutePath}`);
        }
    }

    // Save updated mappings
    if (updatedCount > 0) {
        saveURLMappings(mappings);
        console.log('');
        success(`Updated ${updatedCount} feature(s) in url-mappings.json`);
    } else {
        log('No changes made');
    }

    // Summary
    console.log('');
    console.log(`${colors.bold}Summary:${colors.reset}`);
    const mappedFeatures = mappings.mappings.filter(f => f.isml_template_path);
    const unmappedFeatures = mappings.mappings.filter(f => !f.isml_template_path);

    console.log(`  ${colors.green}Mapped:${colors.reset} ${mappedFeatures.length} feature(s)`);
    if (unmappedFeatures.length > 0) {
        console.log(`  ${colors.yellow}Unmapped:${colors.reset} ${unmappedFeatures.length} feature(s)`);
        unmappedFeatures.forEach(f => {
            console.log(`    - ${f.feature_id}: ${f.name}`);
        });
    }

    console.log('');
    console.log(`${colors.bold}Next steps:${colors.reset}`);
    console.log(`  Run: ${colors.cyan}npx tsx scripts/generate-subplan-claude.ts${colors.reset}`);
    console.log('');
}

main().catch((err) => {
    error(`Fatal error: ${err.message}`);
    process.exit(1);
});
