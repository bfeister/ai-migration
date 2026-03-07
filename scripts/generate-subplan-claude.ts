#!/usr/bin/env tsx
/**
 * Claude-Powered Sub-Plan Generation
 *
 * Orchestrates Claude CLI invocation to generate migration sub-plans iteratively.
 * For each feature:
 * 1. Read DOM extraction and ISML template content
 * 2. Compile Handlebars prompt with context
 * 3. Invoke Claude CLI to generate next sub-plan
 * 4. Parse and save sub-plan to file
 * 5. Repeat until Claude marks "COMPLETE"
 *
 * Usage:
 *   npx tsx scripts/generate-subplan-claude.ts
 *   npx tsx scripts/generate-subplan-claude.ts --features 01-homepage-hero
 *   npx tsx scripts/generate-subplan-claude.ts --max-plans 10
 */

import Handlebars from 'handlebars';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { compareFeatureIds, getFeatureSequence } from './lib/feature-id.js';

// ============================================================================
// Types
// ============================================================================

// Legacy feature config (from url-mappings.json v1)
interface LegacyFeatureConfig {
    feature_id: string;
    name: string;
    source_path: string;
    target_path: string;
    sfra_url: string;
    target_url: string;
    selector: string;
    viewport: { width: number; height: number };
    isml_template_path?: string;
}

// New feature config (from discovery output)
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
}

interface PageConfig {
    page_id: string;
    name: string;
    sfra_url: string;
    target_url: string;
    isml_template: string;
    viewport?: { width: number; height: number };
}

interface URLMappingsV2 {
    version: string;
    sfra_templates_base: string;
    slots_xml_path: string;
    pages: PageConfig[];
}

// Unified feature config for processing
interface FeatureConfig {
    feature_id: string;
    name: string;
    sfra_url: string;
    target_url: string;
    selector: string;
    viewport: { width: number; height: number };
    isml_template_path: string;
    isml_source?: DiscoveredFeature['isml_source'];
}

interface URLMappings {
    version: string;
    source_base_url: string;
    target_base_url: string;
    mappings: LegacyFeatureConfig[];
}

// DOMExtraction interface removed - Claude reads files on-demand via agentic tooling

interface SubPlan {
    id: string;
    title: string;
    status: string;
    dependencies: string[];
    summary: string;
    content: string;
}

interface PromptContext {
    feature: FeatureConfig;
    ismlTemplatePath: string;
    slotsXmlPath: string;
    slotIds: string[];
    /** Screenshot paths for visual comparison */
    screenshots: {
        source?: string;
        target?: string;
        analysis?: string;
    };
    previousSubPlans: SubPlan[];
    subPlanNumber: number;
    featurePrefix: string;
    paddedNumber: string;
    previousPaddedNumber: string;
}

// ============================================================================
// Constants
// ============================================================================

const WORKSPACE_ROOT = process.env.WORKSPACE_ROOT || process.cwd();
const URL_MAPPINGS_FILE = path.join(WORKSPACE_ROOT, 'url-mappings.json');
const SUBPLANS_DIR = path.join(WORKSPACE_ROOT, 'sub-plans');
const PLANS_DIR = path.join(WORKSPACE_ROOT, 'plans');
const SCREENSHOTS_DIR = path.join(WORKSPACE_ROOT, 'screenshots');
const TEMPLATE_PATH = path.join(WORKSPACE_ROOT, 'prompts/isml-migration/iterative-subplan.hbs');
const MIGRATION_LOG = path.join(WORKSPACE_ROOT, 'migration-log.md');

const MAX_SUBPLANS_DEFAULT = 15;
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
    console.log(`${colors.blue}[Claude Plans]${colors.reset} ${msg}`);
}

function success(msg: string): void {
    console.log(`${colors.green}[Claude Plans]${colors.reset} ${msg}`);
}

function warn(msg: string): void {
    console.log(`${colors.yellow}[Claude Plans]${colors.reset} ${msg}`);
}

function error(msg: string): void {
    console.log(`${colors.red}[Claude Plans]${colors.reset} ${msg}`);
}

// ============================================================================
// Handlebars Setup
// ============================================================================

// Register custom helpers
Handlebars.registerHelper('json', function (context) {
    return JSON.stringify(context, null, 2);
});

// JSON with only specific keys (for compact output in prompts)
Handlebars.registerHelper('jsonSubset', function (context, keysStr: string) {
    if (!context || typeof context !== 'object') return '{}';
    const keys = keysStr.split(',').map((k: string) => k.trim());
    const subset: Record<string, unknown> = {};
    for (const key of keys) {
        if (key in context) {
            subset[key] = context[key as keyof typeof context];
        }
    }
    return JSON.stringify(subset, null, 2);
});

Handlebars.registerHelper('eq', function (a: unknown, b: unknown) {
    return a === b;
});

Handlebars.registerHelper('add', function (a: number, b: number) {
    return a + b;
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

const MIGRATION_PLANS_DIR = path.join(WORKSPACE_ROOT, 'migration-plans');

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

function loadURLMappingsV2(): URLMappingsV2 | null {
    if (fs.existsSync(URL_MAPPINGS_FILE)) {
        try {
            const content = JSON.parse(fs.readFileSync(URL_MAPPINGS_FILE, 'utf-8'));
            if (content.version === '2.0' && content.pages) {
                return content;
            }
        } catch {
            return null;
        }
    }
    return null;
}

function loadDiscoveredFeatures(): { features: FeatureConfig[]; pageConfig: PageConfig | null } {
    const mappingsV2 = loadURLMappingsV2();
    if (!mappingsV2) {
        return { features: [], pageConfig: null };
    }

    const features: FeatureConfig[] = [];

    // Look for discovery output files
    if (!fs.existsSync(MIGRATION_PLANS_DIR)) {
        return { features: [], pageConfig: null };
    }

    const discoveryFiles = fs.readdirSync(MIGRATION_PLANS_DIR)
        .filter(f => f.endsWith('-features.json'));

    for (const file of discoveryFiles) {
        try {
            const discovery: FeatureDiscoveryResult = JSON.parse(
                fs.readFileSync(path.join(MIGRATION_PLANS_DIR, file), 'utf-8')
            );

            // Find corresponding page config
            const pageConfig = mappingsV2.pages.find(p => p.page_id === discovery.page_id);
            if (!pageConfig) continue;

            // Build full ISML path
            const ismlTemplatePath = path.join(
                WORKSPACE_ROOT,
                pageConfig.isml_template
            );

            // Convert discovered features to FeatureConfig format
            for (const df of discovery.features) {
                features.push({
                    feature_id: df.feature_id,
                    name: df.name,
                    sfra_url: pageConfig.sfra_url,
                    target_url: pageConfig.target_url,
                    selector: df.selector,
                    viewport: pageConfig.viewport || { width: 1920, height: 1080 },
                    isml_template_path: ismlTemplatePath,
                    isml_source: df.isml_source,
                });
            }
        } catch (e) {
            warn(`Failed to load discovery file ${file}: ${e}`);
        }
    }

    // Sort by route first, then by feature order within that route.
    features.sort((a, b) => compareFeatureIds(a.feature_id, b.feature_id));

    return {
        features,
        pageConfig: mappingsV2.pages[0] || null,
    };
}

// loadDOMExtraction removed - Claude reads files on-demand via agentic tooling

/**
 * Extract slot IDs from ISML content without loading full content into prompt.
 * Returns just the IDs - Claude will read the slots.xml file itself.
 */
function extractSlotIdsFromISML(templatePath: string): string[] {
    if (!templatePath || !fs.existsSync(templatePath)) {
        return [];
    }
    const ismlContent = fs.readFileSync(templatePath, 'utf-8');
    const slotMatches = ismlContent.matchAll(/<isslot\s+id="([^"]+)"/g);
    return [...slotMatches].map(m => m[1]);
}

interface ScreenshotPaths {
    source?: string;
    target?: string;
    analysis?: string;
}

function findScreenshots(featureId: string): ScreenshotPaths {
    const result: ScreenshotPaths = {};
    const featureNum = getFeatureSequence(featureId);

    if (fs.existsSync(SCREENSHOTS_DIR)) {
        const files = fs.readdirSync(SCREENSHOTS_DIR);

        // Find source (SFRA) baseline screenshot
        const sourcePattern = new RegExp(`.*-${featureNum}-.*-baseline-source\\.png$`);
        const sourceMatch = files.find(f => sourcePattern.test(f));
        if (sourceMatch) {
            result.source = path.join(SCREENSHOTS_DIR, sourceMatch);
        }

        // Find target (Storefront Next) screenshot
        const targetPattern = new RegExp(`.*-${featureNum}-.*-target\\.png$`);
        const targetMatch = files.find(f => targetPattern.test(f));
        if (targetMatch) {
            result.target = path.join(SCREENSHOTS_DIR, targetMatch);
        }

        // Find analysis screenshot
        const analysisPattern = new RegExp(`.*-${featureNum}-.*-analysis-source\\.png$`);
        const analysisMatch = files.find(f => analysisPattern.test(f));
        if (analysisMatch) {
            result.analysis = path.join(SCREENSHOTS_DIR, analysisMatch);
        }
    }

    return result;
}

function loadExistingSubPlans(featureId: string): SubPlan[] {
    const featureDir = path.join(SUBPLANS_DIR, featureId);
    if (!fs.existsSync(featureDir)) {
        return [];
    }

    const files = fs.readdirSync(featureDir)
        .filter(f => f.startsWith('subplan-') && f.endsWith('.md'))
        .sort();

    return files.map(file => {
        const content = fs.readFileSync(path.join(featureDir, file), 'utf-8');
        return parseSubPlanContent(content);
    });
}

// ============================================================================
// Slot Path Configuration
// ============================================================================

const SLOTS_XML_PATH = process.env.SLOTS_XML_PATH || path.join(WORKSPACE_ROOT, 'slots', 'slots.xml');

function parseSubPlanContent(content: string): SubPlan {
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
    const metadata: Partial<SubPlan> = {
        id: '',
        title: 'Untitled',
        status: 'pending',
        dependencies: [],
        summary: '',
        content,
    };

    if (frontmatterMatch) {
        const frontmatter = frontmatterMatch[1];

        const idMatch = frontmatter.match(/^id:\s*(.+)$/m);
        if (idMatch) metadata.id = idMatch[1].trim();

        const titleMatch = frontmatter.match(/^title:\s*(.+)$/m);
        if (titleMatch) metadata.title = titleMatch[1].trim();

        const statusMatch = frontmatter.match(/^status:\s*(.+)$/m);
        if (statusMatch) metadata.status = statusMatch[1].trim();

        const depsMatch = frontmatter.match(/^dependencies:\s*\[([^\]]*)\]/m);
        if (depsMatch) {
            metadata.dependencies = depsMatch[1]
                .split(',')
                .map(s => s.trim().replace(/['"]/g, ''))
                .filter(Boolean);
        }
    }

    // Extract summary from content
    const summaryMatch = content.match(/## Summary\n\n([\s\S]*?)(?=\n##|$)/);
    if (summaryMatch) {
        metadata.summary = summaryMatch[1].trim().substring(0, 200);
    }

    return metadata as SubPlan;
}

// ============================================================================
// Claude CLI Invocation
// ============================================================================

async function invokeClaudeCLI(prompt: string, featureId: string, subPlanNum: number): Promise<string> {
    return new Promise((resolve, reject) => {
        // Ensure plans directory exists
        fs.mkdirSync(PLANS_DIR, { recursive: true });

        // Write prompt to file for traceability
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const promptFile = path.join(PLANS_DIR, `${featureId}-subplan-${String(subPlanNum).padStart(2, '0')}-prompt-${timestamp}.md`);
        fs.writeFileSync(promptFile, prompt);
        log(`Prompt saved to: ${promptFile}`);
        logToMigrationLog('INFO', `Sub-plan prompt saved: ${promptFile}`);

        log('Invoking Claude CLI...');

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
            logToMigrationLog('ERROR', `Claude CLI error for ${featureId}: ${err.message}`);
            reject(new Error(`Claude CLI error: ${err.message}`));
        });

        child.on('close', (code) => {
            if (code !== 0) {
                logToMigrationLog('ERROR', `Claude CLI exited with code ${code} for ${featureId}`);
                reject(new Error(`Claude CLI exited with code ${code}: ${stderr}`));
                return;
            }

            // Save response for traceability
            const responseFile = path.join(PLANS_DIR, `${featureId}-subplan-${String(subPlanNum).padStart(2, '0')}-response-${timestamp}.md`);
            fs.writeFileSync(responseFile, stdout);
            log(`Response saved to: ${responseFile}`);
            logToMigrationLog('SUCCESS', `Sub-plan response saved: ${responseFile}`);

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

interface ParsedResponse {
    subPlanContent: string;
    isComplete: boolean;
}

function parseClaudeResponse(response: string): ParsedResponse {
    // Check for completion status
    const isComplete = response.includes('STATUS: COMPLETE');

    // Extract the markdown sub-plan content
    let subPlanContent = '';

    // Find the start of ```markdown block
    const markdownStart = response.indexOf('```markdown\n');
    if (markdownStart !== -1) {
        // Find the END of the markdown block by counting nested code blocks
        const contentStart = markdownStart + '```markdown\n'.length;
        let depth = 1;
        let pos = contentStart;

        while (pos < response.length && depth > 0) {
            // Look for ``` at current position
            if (response.substring(pos, pos + 3) === '```') {
                // Check if this opens or closes a code block
                // If followed by a newline or word chars, it opens; if at line start after content, it closes
                const beforeBackticks = pos > 0 ? response[pos - 1] : '\n';
                const afterBackticks = response.substring(pos + 3, pos + 4);

                if (beforeBackticks === '\n' && (afterBackticks === '\n' || afterBackticks === '' || pos + 3 >= response.length)) {
                    // Closing backticks
                    depth--;
                } else if (beforeBackticks === '\n') {
                    // Opening backticks (followed by language identifier or content)
                    depth++;
                }
                pos += 3;
            } else {
                pos++;
            }
        }

        // Extract content up to closing backticks (pos - 3 because we moved past them)
        const contentEnd = depth === 0 ? pos - 3 : response.length;
        subPlanContent = response.substring(contentStart, contentEnd).trim();
    } else {
        // Try to find frontmatter directly
        const frontmatterMatch = response.match(/(---\n[\s\S]*?\n---[\s\S]*?)(?=STATUS:|$)/);
        if (frontmatterMatch) {
            subPlanContent = frontmatterMatch[1].trim();
        }
    }

    // Clean up any STATUS markers from the content
    subPlanContent = subPlanContent
        .replace(/<!--\s*STATUS:\s*(COMPLETE|CONTINUE)\s*-->/g, '')
        .replace(/\nSTATUS:\s*(COMPLETE|CONTINUE)\s*$/gm, '')
        .trim();

    return {
        subPlanContent,
        isComplete,
    };
}

// ============================================================================
// Sub-Plan Generation
// ============================================================================

async function generateSubPlansForFeature(
    feature: FeatureConfig,
    maxPlans: number
): Promise<number> {
    log(`Processing feature: ${feature.feature_id} - ${feature.name}`);

    // Check if ISML template is mapped
    if (!feature.isml_template_path) {
        warn(`No ISML template mapped for ${feature.feature_id}. Skipping.`);
        return 0;
    }

    log(`  ISML template path: ${feature.isml_template_path}`);

    // Extract slot IDs (lightweight - just the IDs, not full content)
    const slotIds = extractSlotIdsFromISML(feature.isml_template_path);
    log(`  Found ${slotIds.length} slot ID(s): ${slotIds.join(', ') || 'none'}`);

    // Find screenshots for visual comparison
    const screenshots = findScreenshots(feature.feature_id);
    log(`  Screenshots found: source=${!!screenshots.source}, target=${!!screenshots.target}, analysis=${!!screenshots.analysis}`);

    // Create output directory
    const featureDir = path.join(SUBPLANS_DIR, feature.feature_id);
    fs.mkdirSync(featureDir, { recursive: true });

    // Load existing sub-plans
    let previousSubPlans = loadExistingSubPlans(feature.feature_id);
    let subPlanNumber = previousSubPlans.length + 1;
    let generatedCount = 0;

    // Keep sub-plan numbering keyed to the per-route feature sequence.
    const featurePrefix = getFeatureSequence(feature.feature_id);

    // Get template
    const template = getTemplate();

    // Generate sub-plans iteratively
    while (subPlanNumber <= maxPlans) {
        const paddedNumber = String(subPlanNumber).padStart(2, '0');
        const previousPaddedNumber = String(subPlanNumber - 1).padStart(2, '0');

        log(`Generating sub-plan #${subPlanNumber}...`);

        // Compile lightweight prompt (paths only, no content)
        const context: PromptContext = {
            feature,
            ismlTemplatePath: feature.isml_template_path,
            slotsXmlPath: SLOTS_XML_PATH,
            slotIds,
            screenshots,
            previousSubPlans,
            subPlanNumber,
            featurePrefix,
            paddedNumber,
            previousPaddedNumber,
        };

        const prompt = template(context);

        log(`  Prompt size: ${(prompt.length / 1024).toFixed(1)} KB (lightweight - paths only)`);
        logToMigrationLog('INFO', `Generating sub-plan #${subPlanNumber} for ${feature.feature_id}`);

        // Invoke Claude CLI
        try {
            const response = await invokeClaudeCLI(prompt, feature.feature_id, subPlanNumber);
            const { subPlanContent, isComplete } = parseClaudeResponse(response);

            if (!subPlanContent) {
                error('Claude returned empty sub-plan content');
                logToMigrationLog('ERROR', `Empty sub-plan content for ${feature.feature_id} #${subPlanNumber}`);
                break;
            }

            // Save sub-plan to file
            const subPlanPath = path.join(featureDir, `subplan-${featurePrefix}-${paddedNumber}.md`);
            fs.writeFileSync(subPlanPath, subPlanContent);
            success(`Generated: ${subPlanPath}`);
            logToMigrationLog('SUCCESS', `Sub-plan generated: ${subPlanPath}`);

            generatedCount++;

            // Add to previous sub-plans for context
            previousSubPlans.push(parseSubPlanContent(subPlanContent));

            // Check if complete
            if (isComplete) {
                success(`Feature ${feature.feature_id} migration plan complete!`);
                logToMigrationLog('SUCCESS', `Feature ${feature.feature_id} migration planning complete`);
                break;
            }

            subPlanNumber++;
        } catch (err: any) {
            error(`Failed to generate sub-plan: ${err.message}`);
            logToMigrationLog('ERROR', `Failed to generate sub-plan for ${feature.feature_id}: ${err.message}`);
            break;
        }
    }

    if (subPlanNumber > maxPlans) {
        warn(`Reached maximum sub-plan limit (${maxPlans}) for ${feature.feature_id}`);
    }

    return generatedCount;
}

// ============================================================================
// CLI Arguments
// ============================================================================

function parseArgs(): { features?: string[]; maxPlans: number } {
    const args = process.argv.slice(2);
    let features: string[] | undefined;
    let maxPlans = MAX_SUBPLANS_DEFAULT;

    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--features' && args[i + 1]) {
            features = args[i + 1].split(',').map(f => f.trim());
            i++;
        } else if (args[i] === '--max-plans' && args[i + 1]) {
            maxPlans = parseInt(args[i + 1], 10);
            i++;
        }
    }

    return { features, maxPlans };
}

// ============================================================================
// Main Flow
// ============================================================================

async function main(): Promise<void> {
    const cliArgs = parseArgs();

    console.log('');
    console.log(`${colors.bold}═══════════════════════════════════════════════════════════════${colors.reset}`);
    console.log(`${colors.bold}           Claude-Powered Sub-Plan Generation (Phase 2)${colors.reset}`);
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

    // Try to load from discovery output first (v2 schema)
    let featuresToProcess: FeatureConfig[] = [];
    const { features: discoveredFeatures } = loadDiscoveredFeatures();

    if (discoveredFeatures.length > 0) {
        log('Using discovered features from Phase 1');
        featuresToProcess = discoveredFeatures;
    } else {
        // Fallback to legacy v1 URL mappings
        const mappings = loadURLMappings();
        if (!mappings) {
            error('No discovered features found. Run: npx tsx scripts/discover-features-claude.ts');
            process.exit(1);
        }

        warn('Using legacy url-mappings.json format (v1)');
        log('Consider running feature discovery: npx tsx scripts/discover-features-claude.ts');

        // Convert legacy mappings to FeatureConfig
        featuresToProcess = mappings.mappings
            .filter(f => f.isml_template_path)
            .map(f => ({
                feature_id: f.feature_id,
                name: f.name,
                sfra_url: f.sfra_url,
                target_url: f.target_url,
                selector: f.selector,
                viewport: f.viewport,
                isml_template_path: f.isml_template_path!,
            }));
    }

    // Filter features if specified via CLI
    if (cliArgs.features) {
        featuresToProcess = featuresToProcess.filter(f =>
            cliArgs.features!.includes(f.feature_id)
        );
    }

    if (featuresToProcess.length === 0) {
        error('No features to process.');
        if (cliArgs.features) {
            log(`Requested features: ${cliArgs.features.join(', ')}`);
        }
        process.exit(1);
    }

    log(`Processing ${featuresToProcess.length} feature(s)`);
    log(`Max sub-plans per feature: ${cliArgs.maxPlans}`);

    // Sort by route first, then by feature order within that route.
    featuresToProcess.sort((a, b) => compareFeatureIds(a.feature_id, b.feature_id));

    // Process each feature
    let totalGenerated = 0;
    for (const feature of featuresToProcess) {
        console.log('');
        console.log(`${colors.cyan}────────────────────────────────────────────────────────────${colors.reset}`);
        const generated = await generateSubPlansForFeature(feature, cliArgs.maxPlans);
        totalGenerated += generated;
    }

    // Summary
    console.log('');
    console.log(`${colors.bold}═══════════════════════════════════════════════════════════════${colors.reset}`);
    console.log(`${colors.bold}                    Generation Complete${colors.reset}`);
    console.log(`${colors.bold}═══════════════════════════════════════════════════════════════${colors.reset}`);
    console.log('');
    success(`Generated ${totalGenerated} sub-plan(s) total`);

    // List generated sub-plans
    for (const feature of featuresToProcess) {
        const featureDir = path.join(SUBPLANS_DIR, feature.feature_id);
        if (fs.existsSync(featureDir)) {
            const files = fs.readdirSync(featureDir).filter(f => f.endsWith('.md'));
            console.log(`  ${feature.feature_id}: ${files.length} sub-plan(s)`);
        }
    }

    console.log('');
    console.log(`${colors.bold}Next steps:${colors.reset}`);
    console.log(`  1. Review generated sub-plans in: ${colors.cyan}${SUBPLANS_DIR}/${colors.reset}`);
    console.log(`  2. Run: ${colors.cyan}npx tsx scripts/init-migration-log.ts${colors.reset}`);
    console.log('');
}

main().catch((err) => {
    error(`Fatal error: ${err.message}`);
    process.exit(1);
});
