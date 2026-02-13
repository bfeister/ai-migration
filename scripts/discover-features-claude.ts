#!/usr/bin/env tsx
/**
 * Claude-Powered Feature Discovery (Phase 1)
 *
 * Analyzes an ISML template to dynamically discover migratable features.
 * This replaces hardcoded feature definitions with AI-driven discovery.
 *
 * Process:
 * 1. Read page configuration from url-mappings.json
 * 2. Load ISML template content
 * 3. Parse relevant slots from slots.xml
 * 4. Load screenshot/DOM if available
 * 5. Compile discovery prompt with all context
 * 6. Invoke Claude CLI for feature analysis
 * 7. Parse response and save feature discovery JSON
 *
 * Usage:
 *   npx tsx scripts/discover-features-claude.ts
 *   npx tsx scripts/discover-features-claude.ts --page home
 *   npx tsx scripts/discover-features-claude.ts --page home --force
 */

import Handlebars from 'handlebars';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

// ============================================================================
// Types
// ============================================================================

interface PageConfig {
    page_id: string;
    name: string;
    description?: string;
    sfra_url: string;
    target_url: string;
    isml_template: string;
    viewport?: { width: number; height: number };
    source_config?: {
        dismiss_consent?: boolean;
        consent_button_selector?: string;
    };
}

interface URLMappingsV2 {
    version: string;
    description?: string;
    source_base_url: string;
    target_base_url: string;
    sfra_templates_base: string;
    slots_xml_path: string;
    pages: PageConfig[];
}

// SlotConfig removed - we now pass paths, not content

interface DiscoveredFeature {
    feature_id: string;
    name: string;
    description: string;
    selector: string;
    isml_source: {
        lines: string;
        slot_id?: string;
        slot_template?: string;
        content_type: string;
        content_assets?: string[];
    };
    migration_priority: number;
    estimated_complexity: 'low' | 'medium' | 'high';
    dependencies: string[];
    notes?: string;
}

interface FeatureDiscoveryResult {
    page_id: string;
    page_name: string;
    discovered_at: string;
    isml_template: string;
    total_features: number;
    features: DiscoveredFeature[];
    migration_order: string[];
    shared_components?: Array<{
        name: string;
        used_by: string[];
        description: string;
    }>;
}

interface PromptContext {
    page: PageConfig;
    ismlTemplatePath: string;
    slotsXmlPath: string;
    slotIds: string[];
    screenshotPath?: string;
}

// ============================================================================
// Constants
// ============================================================================

const WORKSPACE_ROOT = process.env.WORKSPACE_ROOT || process.cwd();
const URL_MAPPINGS_FILE = path.join(WORKSPACE_ROOT, 'url-mappings.json');
const TEMPLATE_PATH = path.join(WORKSPACE_ROOT, 'prompts/isml-migration/feature-discovery.hbs');
const MIGRATION_PLANS_DIR = path.join(WORKSPACE_ROOT, 'migration-plans');
const PLANS_DIR = path.join(WORKSPACE_ROOT, 'plans');
const SCREENSHOTS_DIR = path.join(WORKSPACE_ROOT, 'screenshots');
const MIGRATION_LOG = path.join(WORKSPACE_ROOT, 'migration-log.md');

const CLAUDE_TIMEOUT_MS = 300000; // 5 minutes

// ============================================================================
// Migration Log
// ============================================================================

function logToMigrationLog(level: 'INFO' | 'SUCCESS' | 'WARNING' | 'ERROR', message: string): void {
    const timestamp = new Date().toISOString();
    const colors: Record<string, string> = {
        INFO: '\x1b[0;34m',
        SUCCESS: '\x1b[0;32m',
        WARNING: '\x1b[1;33m',
        ERROR: '\x1b[0;31m',
    };
    const reset = '\x1b[0m';
    const line = `${colors[level]}[${level}]${reset} ${timestamp} - ${message}\n`;

    fs.appendFileSync(MIGRATION_LOG, line);
}

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
    console.log(`${colors.blue}[Discovery]${colors.reset} ${msg}`);
}

function success(msg: string): void {
    console.log(`${colors.green}[Discovery]${colors.reset} ${msg}`);
}

function warn(msg: string): void {
    console.log(`${colors.yellow}[Discovery]${colors.reset} ${msg}`);
}

function error(msg: string): void {
    console.log(`${colors.red}[Discovery]${colors.reset} ${msg}`);
}

// ============================================================================
// Handlebars Setup
// ============================================================================

Handlebars.registerHelper('json', function (context) {
    return JSON.stringify(context, null, 2);
});

let templateCache: Handlebars.TemplateDelegate | null = null;

function getTemplate(): Handlebars.TemplateDelegate {
    if (!templateCache) {
        if (!fs.existsSync(TEMPLATE_PATH)) {
            throw new Error(`Template not found: ${TEMPLATE_PATH}`);
        }
        const templateContent = fs.readFileSync(TEMPLATE_PATH, 'utf-8');
        templateCache = Handlebars.compile(templateContent);
    }
    return templateCache;
}

// ============================================================================
// Data Loading
// ============================================================================

function loadURLMappings(): URLMappingsV2 | null {
    if (fs.existsSync(URL_MAPPINGS_FILE)) {
        try {
            const content = JSON.parse(fs.readFileSync(URL_MAPPINGS_FILE, 'utf-8'));
            // Check for v2 schema
            if (content.version === '2.0' && content.pages) {
                return content;
            }
            warn('url-mappings.json is not version 2.0. Please update to new schema.');
            return null;
        } catch (e) {
            error(`Failed to parse url-mappings.json: ${e}`);
            return null;
        }
    }
    return null;
}

/**
 * Extract slot IDs from ISML content without loading full content into prompt.
 * Returns just the IDs - Claude will read the slots.xml file itself.
 */
function extractSlotIdsFromISML(mappings: URLMappingsV2, page: PageConfig): string[] {
    const templatePath = path.join(
        WORKSPACE_ROOT,
        mappings.sfra_templates_base,
        page.isml_template
    );

    if (!fs.existsSync(templatePath)) {
        warn(`ISML template not found: ${templatePath}`);
        return [];
    }

    const ismlContent = fs.readFileSync(templatePath, 'utf-8');

    // Find all <isslot id="..."> in ISML - extract just the IDs
    const slotMatches = ismlContent.matchAll(/<isslot\s+id="([^"]+)"/g);
    return [...slotMatches].map(m => m[1]);
}

function findScreenshot(pageId: string): string | undefined {
    if (!fs.existsSync(SCREENSHOTS_DIR)) return undefined;

    const files = fs.readdirSync(SCREENSHOTS_DIR);
    // Look for baseline source screenshot
    const pattern = new RegExp(`.*-${pageId}.*-baseline-source\\.png$`, 'i');
    const match = files.find(f => pattern.test(f));

    if (match) {
        return path.join(SCREENSHOTS_DIR, match);
    }

    // Fallback: look for any screenshot with page ID
    const fallbackPattern = new RegExp(`.*${pageId}.*\\.png$`, 'i');
    const fallbackMatch = files.find(f => fallbackPattern.test(f));

    return fallbackMatch ? path.join(SCREENSHOTS_DIR, fallbackMatch) : undefined;
}

// DOM summary loading removed - Claude will discover via agentic tooling if needed

// ============================================================================
// Claude CLI Invocation
// ============================================================================

async function invokeClaudeCLI(prompt: string, pageId: string): Promise<string> {
    return new Promise((resolve, reject) => {
        // Ensure plans directory exists
        fs.mkdirSync(PLANS_DIR, { recursive: true });

        // Write prompt to file for traceability
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const promptFile = path.join(PLANS_DIR, `${pageId}-discovery-prompt-${timestamp}.md`);
        fs.writeFileSync(promptFile, prompt);
        log(`Prompt saved to: ${promptFile}`);
        logToMigrationLog('INFO', `Discovery prompt saved: ${promptFile}`);

        log('Invoking Claude CLI for feature discovery...');

        const child = spawn('claude', ['-p', '--output-format', 'text'], {
            cwd: WORKSPACE_ROOT,
            stdio: ['pipe', 'pipe', 'pipe'],
            timeout: CLAUDE_TIMEOUT_MS,
        });

        let stdout = '';
        let stderr = '';

        child.stdout.on('data', (data) => {
            stdout += data.toString();
        });

        child.stderr.on('data', (data) => {
            stderr += data.toString();
        });

        child.on('error', (err) => {
            logToMigrationLog('ERROR', `Claude CLI error: ${err.message}`);
            reject(new Error(`Claude CLI error: ${err.message}`));
        });

        child.on('close', (code) => {
            if (code !== 0) {
                logToMigrationLog('ERROR', `Claude CLI exited with code ${code}`);
                reject(new Error(`Claude CLI exited with code ${code}: ${stderr}`));
                return;
            }

            // Save response for traceability
            const responseFile = path.join(PLANS_DIR, `${pageId}-discovery-response-${timestamp}.md`);
            fs.writeFileSync(responseFile, stdout);
            log(`Response saved to: ${responseFile}`);
            logToMigrationLog('SUCCESS', `Discovery response saved: ${responseFile}`);

            resolve(stdout);
        });

        // Send prompt via stdin
        child.stdin.write(prompt);
        child.stdin.end();
    });
}

// ============================================================================
// Response Parsing
// ============================================================================

function parseDiscoveryResponse(response: string): FeatureDiscoveryResult | null {
    // Look for JSON block in response
    const jsonMatch = response.match(/```json\n([\s\S]*?)\n```/);

    if (jsonMatch) {
        try {
            return JSON.parse(jsonMatch[1]);
        } catch (e) {
            error(`Failed to parse JSON from response: ${e}`);
        }
    }

    // Try to find raw JSON object
    const rawJsonMatch = response.match(/\{[\s\S]*"features"[\s\S]*\}/);
    if (rawJsonMatch) {
        try {
            return JSON.parse(rawJsonMatch[0]);
        } catch (e) {
            error(`Failed to parse raw JSON from response: ${e}`);
        }
    }

    return null;
}

// ============================================================================
// Output Generation
// ============================================================================

function saveFeatureDiscovery(result: FeatureDiscoveryResult): string {
    // Create migration-plans directory if needed
    fs.mkdirSync(MIGRATION_PLANS_DIR, { recursive: true });

    // Save JSON result
    const jsonPath = path.join(MIGRATION_PLANS_DIR, `${result.page_id}-features.json`);
    fs.writeFileSync(jsonPath, JSON.stringify(result, null, 2));

    // Generate markdown summary
    const mdPath = path.join(MIGRATION_PLANS_DIR, `${result.page_id}-plan.md`);
    const mdContent = generatePlanMarkdown(result);
    fs.writeFileSync(mdPath, mdContent);

    return jsonPath;
}

function generatePlanMarkdown(result: FeatureDiscoveryResult): string {
    const lines: string[] = [
        `# Migration Plan: ${result.page_name}`,
        '',
        `**Page ID:** \`${result.page_id}\``,
        `**Discovered:** ${result.discovered_at}`,
        `**ISML Template:** \`${result.isml_template}\``,
        `**Total Features:** ${result.total_features}`,
        '',
        '---',
        '',
        '## Migration Order',
        '',
        'Features should be migrated in this order:',
        '',
    ];

    result.migration_order.forEach((featureId, index) => {
        const feature = result.features.find(f => f.feature_id === featureId);
        if (feature) {
            lines.push(`${index + 1}. **${feature.name}** (\`${featureId}\`) - ${feature.estimated_complexity} complexity`);
        }
    });

    lines.push('', '---', '', '## Feature Details', '');

    for (const feature of result.features) {
        lines.push(
            `### ${feature.feature_id}: ${feature.name}`,
            '',
            feature.description,
            '',
            `**Selector:** \`${feature.selector}\``,
            `**Complexity:** ${feature.estimated_complexity}`,
            `**Priority:** ${feature.migration_priority}`,
            ''
        );

        if (feature.isml_source.slot_id) {
            lines.push(
                '**ISML Source:**',
                `- Lines: ${feature.isml_source.lines}`,
                `- Slot ID: \`${feature.isml_source.slot_id}\``,
                `- Template: \`${feature.isml_source.slot_template || 'N/A'}\``,
                `- Content Type: ${feature.isml_source.content_type}`,
                ''
            );
        } else {
            lines.push(
                '**ISML Source:**',
                `- Lines: ${feature.isml_source.lines}`,
                `- Content Type: ${feature.isml_source.content_type}`,
                ''
            );
        }

        if (feature.dependencies.length > 0) {
            lines.push(`**Dependencies:** ${feature.dependencies.join(', ')}`, '');
        }

        if (feature.notes) {
            lines.push(`> ${feature.notes}`, '');
        }

        lines.push('---', '');
    }

    if (result.shared_components && result.shared_components.length > 0) {
        lines.push('## Shared Components', '');
        for (const comp of result.shared_components) {
            lines.push(
                `### ${comp.name}`,
                '',
                comp.description,
                '',
                `Used by: ${comp.used_by.join(', ')}`,
                '',
            );
        }
    }

    return lines.join('\n');
}

// ============================================================================
// CLI Arguments
// ============================================================================

interface CLIArgs {
    pageId?: string;
    force: boolean;
}

function parseArgs(): CLIArgs {
    const args = process.argv.slice(2);
    const result: CLIArgs = { force: false };

    for (let i = 0; i < args.length; i++) {
        if ((args[i] === '--page' || args[i] === '-p') && args[i + 1]) {
            result.pageId = args[i + 1];
            i++;
        } else if (args[i] === '--force' || args[i] === '-f') {
            result.force = true;
        }
    }

    return result;
}

// ============================================================================
// Main Flow
// ============================================================================

async function discoverFeaturesForPage(
    mappings: URLMappingsV2,
    page: PageConfig,
    force: boolean
): Promise<FeatureDiscoveryResult | null> {
    log(`Discovering features for page: ${page.page_id} - ${page.name}`);

    // Check if discovery already exists
    const existingPath = path.join(MIGRATION_PLANS_DIR, `${page.page_id}-features.json`);
    if (fs.existsSync(existingPath) && !force) {
        warn(`Feature discovery already exists: ${existingPath}`);
        log('Use --force to re-discover features');
        return JSON.parse(fs.readFileSync(existingPath, 'utf-8'));
    }

    // Build full ISML path (absolute for Claude to read)
    const fullIsmlPath = path.join(
        WORKSPACE_ROOT,
        mappings.sfra_templates_base,
        page.isml_template
    );
    log(`  ISML template path: ${fullIsmlPath}`);

    // Extract slot IDs (lightweight - just the IDs, not full content)
    const slotIds = extractSlotIdsFromISML(mappings, page);
    log(`  Found ${slotIds.length} slot ID(s): ${slotIds.join(', ') || 'none'}`);

    // Build slots.xml path (absolute for Claude to read)
    const slotsXmlPath = path.join(WORKSPACE_ROOT, mappings.slots_xml_path);
    log(`  Slots XML path: ${slotsXmlPath}`);

    // Find screenshot
    const screenshotPath = findScreenshot(page.page_id);
    if (screenshotPath) {
        log(`  Found screenshot: ${path.basename(screenshotPath)}`);
    }

    // Compile lightweight prompt (paths only, no content)
    const context: PromptContext = {
        page,
        ismlTemplatePath: fullIsmlPath,
        slotsXmlPath,
        slotIds,
        screenshotPath,
    };

    const template = getTemplate();
    const prompt = template(context);

    log(`  Prompt size: ${(prompt.length / 1024).toFixed(1)} KB (lightweight - paths only)`);
    logToMigrationLog('INFO', `Starting feature discovery for page: ${page.page_id}`);

    // Invoke Claude CLI
    try {
        const response = await invokeClaudeCLI(prompt, page.page_id);
        const result = parseDiscoveryResponse(response);

        if (!result) {
            error('Failed to parse feature discovery response');
            logToMigrationLog('ERROR', `Failed to parse discovery response for ${page.page_id}`);
            // Save raw response for debugging
            const debugPath = path.join(MIGRATION_PLANS_DIR, `${page.page_id}-debug.txt`);
            fs.mkdirSync(MIGRATION_PLANS_DIR, { recursive: true });
            fs.writeFileSync(debugPath, response);
            warn(`Raw response saved to: ${debugPath}`);
            return null;
        }

        // Add timestamp if not present
        if (!result.discovered_at) {
            result.discovered_at = new Date().toISOString();
        }

        // Save results
        const savedPath = saveFeatureDiscovery(result);
        success(`Feature discovery saved: ${savedPath}`);
        logToMigrationLog('SUCCESS', `Feature discovery complete: ${result.total_features} features found for ${page.page_id}`);

        return result;
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        error(`Failed to discover features: ${message}`);
        return null;
    }
}

async function main(): Promise<void> {
    const cliArgs = parseArgs();

    console.log('');
    console.log(`${colors.bold}═══════════════════════════════════════════════════════════════${colors.reset}`);
    console.log(`${colors.bold}           Claude-Powered Feature Discovery (Phase 1)${colors.reset}`);
    console.log(`${colors.bold}═══════════════════════════════════════════════════════════════${colors.reset}`);
    console.log('');

    // Check if Claude CLI is available
    try {
        const { execSync } = await import('child_process');
        execSync('which claude', { stdio: 'ignore' });
        success('Claude CLI found');
    } catch {
        error('Claude CLI not found. Please install claude-code CLI.');
        process.exit(1);
    }

    // Check if template exists
    if (!fs.existsSync(TEMPLATE_PATH)) {
        error(`Template not found: ${TEMPLATE_PATH}`);
        process.exit(1);
    }

    // Load URL mappings
    const mappings = loadURLMappings();
    if (!mappings) {
        error('url-mappings.json not found or invalid. Please create v2.0 schema.');
        process.exit(1);
    }

    // Determine which pages to process
    let pagesToProcess = mappings.pages;
    if (cliArgs.pageId) {
        pagesToProcess = mappings.pages.filter(p => p.page_id === cliArgs.pageId);
        if (pagesToProcess.length === 0) {
            error(`Page not found: ${cliArgs.pageId}`);
            log(`Available pages: ${mappings.pages.map(p => p.page_id).join(', ')}`);
            process.exit(1);
        }
    }

    log(`Processing ${pagesToProcess.length} page(s)`);
    if (cliArgs.force) {
        log('Force mode: will re-discover even if results exist');
    }

    // Process each page
    const results: FeatureDiscoveryResult[] = [];
    for (const page of pagesToProcess) {
        console.log('');
        console.log(`${colors.cyan}────────────────────────────────────────────────────────────${colors.reset}`);
        const result = await discoverFeaturesForPage(mappings, page, cliArgs.force);
        if (result) {
            results.push(result);
        }
    }

    // Summary
    console.log('');
    console.log(`${colors.bold}═══════════════════════════════════════════════════════════════${colors.reset}`);
    console.log(`${colors.bold}                    Discovery Complete${colors.reset}`);
    console.log(`${colors.bold}═══════════════════════════════════════════════════════════════${colors.reset}`);
    console.log('');

    for (const result of results) {
        console.log(`${colors.green}✓${colors.reset} ${result.page_name}: ${result.total_features} features discovered`);
        console.log(`  Features: ${result.features.map(f => f.feature_id).join(', ')}`);
    }

    console.log('');
    console.log(`${colors.bold}Output files:${colors.reset}`);
    console.log(`  ${colors.cyan}${MIGRATION_PLANS_DIR}/${colors.reset}`);

    console.log('');
    console.log(`${colors.bold}Next steps:${colors.reset}`);
    console.log(`  1. Review discovered features in: ${colors.cyan}migration-plans/<page>-plan.md${colors.reset}`);
    console.log(`  2. Run analysis:  ${colors.cyan}npx tsx scripts/analyze-features.ts${colors.reset}`);
    console.log(`  3. Generate sub-plans: ${colors.cyan}npx tsx scripts/generate-subplan-claude.ts${colors.reset}`);
    console.log('');
}

main().catch((err) => {
    error(`Fatal error: ${err.message}`);
    process.exit(1);
});
