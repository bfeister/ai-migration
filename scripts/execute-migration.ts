#!/usr/bin/env tsx
/**
 * Interactive Migration Execution Loop
 *
 * Presents a multi-select of discovered features, then loops over each
 * selected feature spawning a fresh Claude CLI session per feature to
 * execute its sub-plans.
 *
 * Usage:
 *   npx tsx scripts/execute-migration.ts
 *   npx tsx scripts/execute-migration.ts --features 01-home-hero,02-home-categories
 *   npx tsx scripts/execute-migration.ts --resume
 *   npx tsx scripts/execute-migration.ts --auto
 */

import Handlebars from 'handlebars';
import prompts from 'prompts';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { loadDiscoveryResults, findPage, loadURLMappings } from './lib/discovery.js';
import type { DiscoveredFeature, FeatureDiscoveryResult, PageConfig } from './lib/discovery.js';

// ============================================================================
// Constants
// ============================================================================

const WORKSPACE_ROOT = process.env.WORKSPACE_ROOT || process.cwd();
const MIGRATION_PLANS_DIR = path.join(WORKSPACE_ROOT, 'migration-plans');
const SUBPLANS_DIR = path.join(WORKSPACE_ROOT, 'sub-plans');
const STATE_DIR = path.join(WORKSPACE_ROOT, '.migration-state');
const URL_MAPPINGS_FILE = path.join(WORKSPACE_ROOT, 'url-mappings.json');
const TEMPLATE_PATH = path.join(WORKSPACE_ROOT, 'prompts/isml-migration/feature-execution.hbs');
const MIGRATION_MAIN_PLAN = path.join(WORKSPACE_ROOT, 'migration-main-plan.md');
const IN_CONTAINER = process.env.DOCKER_CONTAINER === 'true' || fs.existsSync('/.dockerenv');

// ============================================================================
// Types
// ============================================================================

interface FeatureConfig {
  feature_id: string;
  name: string;
  description?: string;
  selector: string;
  sfra_url: string;
  target_url: string;
  viewport: { width: number; height: number };
  source_config?: {
    dismiss_consent?: boolean;
    consent_button_selector?: string;
  };
  migration_priority: number;
  estimated_complexity: string;
  subPlanCount: number;
  subPlanFiles: string[];
  isComplete: boolean;
}

type FeatureResult = {
  feature_id: string;
  name: string;
  status: 'success' | 'skipped' | 'error' | 'intervention';
  exitCode: number;
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
  console.log(`${colors.blue}[Execute]${colors.reset} ${msg}`);
}

function success(msg: string): void {
  console.log(`${colors.green}[Execute]${colors.reset} ${msg}`);
}

function warn(msg: string): void {
  console.log(`${colors.yellow}[Execute]${colors.reset} ${msg}`);
}

function error(msg: string): void {
  console.log(`${colors.red}[Execute]${colors.reset} ${msg}`);
}

function header(text: string): void {
  const line = '='.repeat(60);
  console.log('');
  console.log(`${colors.cyan}${line}${colors.reset}`);
  console.log(`${colors.cyan} ${colors.bold}${text}${colors.reset}`);
  console.log(`${colors.cyan}${line}${colors.reset}`);
  console.log('');
}

// ============================================================================
// Handlebars Setup
// ============================================================================

Handlebars.registerHelper('add', (a: number, b: number) => a + b);

let templateCache: Handlebars.TemplateDelegate | null = null;

function getTemplate(): Handlebars.TemplateDelegate {
  if (!templateCache) {
    if (!fs.existsSync(TEMPLATE_PATH)) {
      throw new Error(`Template not found: ${TEMPLATE_PATH}`);
    }
    const content = fs.readFileSync(TEMPLATE_PATH, 'utf-8');
    templateCache = Handlebars.compile(content);
  }
  return templateCache;
}

// ============================================================================
// State Tracking
// ============================================================================

function isFeatureComplete(featureId: string): boolean {
  return fs.existsSync(path.join(STATE_DIR, `feature-${featureId}-complete`));
}

function markFeatureComplete(featureId: string): void {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  fs.writeFileSync(
    path.join(STATE_DIR, `feature-${featureId}-complete`),
    new Date().toISOString(),
  );
}

// ============================================================================
// Feature Loading
// ============================================================================

function getSubPlanFiles(featureId: string): string[] {
  const featureDir = path.join(SUBPLANS_DIR, featureId);
  if (!fs.existsSync(featureDir)) return [];

  return fs.readdirSync(featureDir)
    .filter(f => f.startsWith('subplan-') && f.endsWith('.md'))
    .sort()
    .map(f => path.join(featureDir, f));
}

function loadFeatureConfigs(): FeatureConfig[] {
  const discoveryResults = loadDiscoveryResults(MIGRATION_PLANS_DIR);
  if (discoveryResults.length === 0) {
    error('No discovery results found in migration-plans/');
    return [];
  }

  let mappings;
  try {
    mappings = loadURLMappings(URL_MAPPINGS_FILE);
  } catch {
    error('url-mappings.json not found. Run setup first.');
    return [];
  }

  const configs: FeatureConfig[] = [];

  for (const result of discoveryResults) {
    const page = findPage(mappings, result.page_id);
    if (!page) {
      warn(`No page config found for page_id "${result.page_id}", skipping`);
      continue;
    }

    for (const feature of result.features) {
      const subPlanFiles = getSubPlanFiles(feature.feature_id);
      configs.push({
        feature_id: feature.feature_id,
        name: feature.name,
        description: feature.description,
        selector: feature.selector,
        sfra_url: page.sfra_url,
        target_url: page.target_url,
        viewport: page.viewport || { width: 1920, height: 1080 },
        source_config: page.source_config,
        migration_priority: feature.migration_priority ?? 99,
        estimated_complexity: feature.estimated_complexity ?? 'unknown',
        subPlanCount: subPlanFiles.length,
        subPlanFiles,
        isComplete: isFeatureComplete(feature.feature_id),
      });
    }
  }

  // Sort by migration_priority
  configs.sort((a, b) => a.migration_priority - b.migration_priority);
  return configs;
}

// ============================================================================
// Feature Selection
// ============================================================================

async function presentFeatureSelection(configs: FeatureConfig[]): Promise<FeatureConfig[]> {
  const choices = configs.map(c => {
    const complexityBadge =
      c.estimated_complexity === 'high' ? `${colors.red}[HIGH]${colors.reset}` :
      c.estimated_complexity === 'medium' ? `${colors.yellow}[MED]${colors.reset}` :
      c.estimated_complexity === 'low' ? `${colors.green}[LOW]${colors.reset}` :
      `${colors.dim}[???]${colors.reset}`;

    const statusBadge = c.isComplete
      ? `${colors.green}DONE${colors.reset}`
      : `${c.subPlanCount} sub-plans`;

    return {
      title: `${c.feature_id}: ${c.name} ${complexityBadge} (${statusBadge})`,
      value: c.feature_id,
      selected: !c.isComplete,
    };
  });

  const { selected } = await prompts({
    type: 'multiselect',
    name: 'selected',
    message: 'Select features to execute:',
    choices,
    hint: '- Space to toggle, Return to submit',
  });

  if (!selected || selected.length === 0) {
    return [];
  }

  const selectedSet = new Set(selected as string[]);
  return configs.filter(c => selectedSet.has(c.feature_id));
}

// ============================================================================
// Prompt Compilation
// ============================================================================

function compileFeaturePrompt(config: FeatureConfig): string {
  const template = getTemplate();

  // Build screenshot mapping JSON for the capture-screenshots.ts CLI.
  // Source mapping includes consent dismissal config from url-mappings.json.
  const sourceMapping: Record<string, unknown> = {
    viewport: config.viewport,
  };
  if (config.source_config?.dismiss_consent) {
    sourceMapping.dismiss_consent = true;
    if (config.source_config.consent_button_selector) {
      sourceMapping.consent_button_selector = config.source_config.consent_button_selector;
    }
  }
  const targetMapping: Record<string, unknown> = {
    viewport: config.viewport,
  };

  // Scope screenshots to the feature's DOM region when a selector is available.
  // Uses element.screenshot() in capture-screenshots.ts for precise capture.
  if (config.selector) {
    sourceMapping.element_selector = config.selector;
    targetMapping.element_selector = config.selector;
  }

  // 00-* features are scaffolding (route setup) — no visual UI to screenshot.
  const isScaffoldingFeature = config.feature_id.startsWith('00-');

  return template({
    feature: config,
    subPlanFiles: config.subPlanFiles,
    migrationMainPlanContent: fs.readFileSync(MIGRATION_MAIN_PLAN, 'utf-8').replaceAll('{{WORKSPACE_ROOT}}', WORKSPACE_ROOT),
    sourceMapping: JSON.stringify(sourceMapping),
    targetMapping: JSON.stringify(targetMapping),
    skipScreenshots: isScaffoldingFeature,
  });
}

// ============================================================================
// Claude CLI Execution
// ============================================================================

function generateUUID(): string {
  // Simple UUID v4 generation
  const hex = '0123456789abcdef';
  let uuid = '';
  for (let i = 0; i < 36; i++) {
    if (i === 8 || i === 13 || i === 18 || i === 23) {
      uuid += '-';
    } else if (i === 14) {
      uuid += '4';
    } else if (i === 19) {
      uuid += hex[Math.floor(Math.random() * 4) + 8];
    } else {
      uuid += hex[Math.floor(Math.random() * 16)];
    }
  }
  return uuid;
}

const OUTPUT_LOG = path.join(WORKSPACE_ROOT, 'claude-output.jsonl');

function executeFeature(config: FeatureConfig, prompt: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const sessionId = generateUUID();

    log(`Starting Claude session ${sessionId} for ${config.feature_id}`);

    const claudeArgs = IN_CONTAINER
      ? ['-p', '--verbose', '--session-id', sessionId, '--dangerously-skip-permissions', '--output-format', 'stream-json']
      : ['-p', '--verbose', '--session-id', sessionId, '--permission-mode', 'acceptEdits', '--add-dir', WORKSPACE_ROOT, '--output-format', 'stream-json'];

    // Append allowed tools from entrypoint.sh (defined once, shared via env).
    // The env var is newline-delimited to preserve tools containing spaces
    // (e.g. "Bash(git add:*)").
    const allowedToolsStr = process.env.CLAUDE_ALLOWED_TOOLS_STR;
    if (allowedToolsStr) {
      const tools = allowedToolsStr.split('\n').filter(Boolean);
      claudeArgs.push('--allowedTools', ...tools);
    }

    // Persistent log file — append per session so history survives across features
    const logStream = fs.createWriteStream(OUTPUT_LOG, { flags: 'a' });
    const banner = `\n${'='.repeat(60)}\nSession: ${sessionId} | Feature: ${config.feature_id}\nStarted: ${new Date().toISOString()}\n${'='.repeat(60)}\n`;
    logStream.write(banner);

    const child = spawn('claude', claudeArgs, {
      cwd: WORKSPACE_ROOT,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    // Stream stdout to console AND log file
    child.stdout.on('data', (data: Buffer) => {
      process.stdout.write(data);
      logStream.write(data);
    });

    // Stream stderr to console AND log file
    child.stderr.on('data', (data: Buffer) => {
      process.stderr.write(data);
      logStream.write(data);
    });

    child.on('error', (err) => {
      logStream.end();
      reject(new Error(`Failed to spawn Claude CLI: ${err.message}`));
    });

    child.on('close', (code) => {
      logStream.write(`\nExited with code: ${code}\n`);
      logStream.end();
      resolve(code ?? 1);
    });

    // Send prompt via stdin then close it. The -p flag requires EOF to signal
    // "prompt complete, start processing". Wait for the 'spawn' event before
    // writing to avoid a race where stdin writes arrive before the child
    // process is ready to read (which caused silent empty-output sessions).
    child.on('spawn', () => {
      child.stdin.write(prompt);
      child.stdin.end();
    });
  });
}

// ============================================================================
// CLI Arguments
// ============================================================================

interface CLIArgs {
  features?: string[];
  resume: boolean;
  auto: boolean;
}

function parseArgs(): CLIArgs {
  const args = process.argv.slice(2);
  const result: CLIArgs = { resume: false, auto: false };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--features' && args[i + 1]) {
      result.features = args[i + 1].split(',').map(f => f.trim());
      i++;
    } else if (args[i] === '--resume') {
      result.resume = true;
    } else if (args[i] === '--auto') {
      result.auto = true;
    }
  }

  return result;
}

// ============================================================================
// Summary Display
// ============================================================================

function showFinalSummary(results: FeatureResult[]): void {
  header('Execution Summary');

  const colWidths = { id: 24, name: 30, status: 14, exit: 6 };
  const divider = '-'.repeat(colWidths.id + colWidths.name + colWidths.status + colWidths.exit + 9);

  console.log(
    `${'Feature ID'.padEnd(colWidths.id)} | ` +
    `${'Name'.padEnd(colWidths.name)} | ` +
    `${'Status'.padEnd(colWidths.status)} | ` +
    `${'Exit'.padEnd(colWidths.exit)}`
  );
  console.log(divider);

  for (const r of results) {
    const statusColor =
      r.status === 'success' ? colors.green :
      r.status === 'skipped' ? colors.dim :
      r.status === 'intervention' ? colors.yellow :
      colors.red;

    console.log(
      `${r.feature_id.padEnd(colWidths.id)} | ` +
      `${r.name.substring(0, colWidths.name).padEnd(colWidths.name)} | ` +
      `${statusColor}${r.status.padEnd(colWidths.status)}${colors.reset} | ` +
      `${String(r.exitCode).padEnd(colWidths.exit)}`
    );
  }

  console.log(divider);

  const succeeded = results.filter(r => r.status === 'success').length;
  const failed = results.filter(r => r.status === 'error').length;
  const skipped = results.filter(r => r.status === 'skipped').length;
  const interventions = results.filter(r => r.status === 'intervention').length;

  console.log('');
  console.log(`${colors.green}Succeeded:${colors.reset} ${succeeded}  ${colors.red}Failed:${colors.reset} ${failed}  ${colors.yellow}Intervention:${colors.reset} ${interventions}  ${colors.dim}Skipped:${colors.reset} ${skipped}`);
  console.log('');
}

// ============================================================================
// Main
// ============================================================================

async function main(): Promise<void> {
  const cliArgs = parseArgs();

  header('Migration Execution Loop');

  // Check prerequisites
  if (!fs.existsSync(TEMPLATE_PATH)) {
    error(`Prompt template not found: ${TEMPLATE_PATH}`);
    process.exit(1);
  }

  if (!fs.existsSync(MIGRATION_MAIN_PLAN)) {
    error(`Migration main plan not found: ${MIGRATION_MAIN_PLAN}`);
    process.exit(1);
  }

  // Load feature configs
  let configs = loadFeatureConfigs();
  if (configs.length === 0) {
    error('No features found. Run discovery and plan generation first.');
    process.exit(1);
  }

  log(`Found ${configs.length} feature(s) across ${new Set(configs.map(() => 'home')).size} page(s)`);

  // Apply --features filter
  if (cliArgs.features) {
    const filterSet = new Set(cliArgs.features);
    configs = configs.filter(c => filterSet.has(c.feature_id));
    if (configs.length === 0) {
      error(`No features matched filter: ${cliArgs.features.join(', ')}`);
      process.exit(1);
    }
    log(`Filtered to ${configs.length} feature(s): ${configs.map(c => c.feature_id).join(', ')}`);
  }

  // Apply --resume filter
  if (cliArgs.resume) {
    const before = configs.length;
    configs = configs.filter(c => !c.isComplete);
    const skipped = before - configs.length;
    if (skipped > 0) {
      log(`Skipping ${skipped} already-completed feature(s) (--resume)`);
    }
    if (configs.length === 0) {
      success('All features are already complete!');
      process.exit(0);
    }
  }

  // Select features
  let selectedConfigs: FeatureConfig[];

  if (cliArgs.auto) {
    // Auto mode: run all incomplete features
    selectedConfigs = configs.filter(c => !c.isComplete);
    log(`Auto mode: running ${selectedConfigs.length} incomplete feature(s)`);
  } else {
    // Interactive multi-select
    selectedConfigs = await presentFeatureSelection(configs);
    if (selectedConfigs.length === 0) {
      log('No features selected. Exiting.');
      process.exit(0);
    }
  }

  log(`Will execute ${selectedConfigs.length} feature(s):`);
  for (const c of selectedConfigs) {
    console.log(`  ${colors.cyan}${c.feature_id}${colors.reset}: ${c.name} (${c.subPlanCount} sub-plans)`);
  }
  console.log('');

  // Execute features
  const results: FeatureResult[] = [];

  for (let i = 0; i < selectedConfigs.length; i++) {
    const config = selectedConfigs[i];

    console.log('');
    console.log(`${colors.magenta}${'─'.repeat(60)}${colors.reset}`);
    console.log(`${colors.bold}Feature ${i + 1}/${selectedConfigs.length}: ${config.feature_id} - ${config.name}${colors.reset}`);
    console.log(`${colors.magenta}${'─'.repeat(60)}${colors.reset}`);
    console.log('');

    if (config.subPlanCount === 0) {
      warn(`No sub-plans found for ${config.feature_id}. Skipping.`);
      results.push({
        feature_id: config.feature_id,
        name: config.name,
        status: 'skipped',
        exitCode: 0,
      });
      continue;
    }

    // Compile prompt
    const prompt = compileFeaturePrompt(config);
    log(`Prompt compiled (${(prompt.length / 1024).toFixed(1)} KB)`);

    // Execute
    try {
      const exitCode = await executeFeature(config, prompt);

      if (exitCode === 0) {
        success(`Feature ${config.feature_id} completed successfully`);
        markFeatureComplete(config.feature_id);
        results.push({
          feature_id: config.feature_id,
          name: config.name,
          status: 'success',
          exitCode,
        });
      } else if (exitCode === 42) {
        // Intervention needed
        warn(`Feature ${config.feature_id} paused for intervention (exit 42)`);
        results.push({
          feature_id: config.feature_id,
          name: config.name,
          status: 'intervention',
          exitCode,
        });

        if (!cliArgs.auto) {
          const { action } = await prompts({
            type: 'select',
            name: 'action',
            message: 'Feature needs intervention. How to proceed?',
            choices: [
              { title: 'Continue to next feature', value: 'continue' },
              { title: 'Stop execution', value: 'stop' },
            ],
          });

          if (!action || action === 'stop') break;
        } else {
          log('Auto mode: continuing to next feature');
        }
      } else {
        // Error
        error(`Feature ${config.feature_id} failed with exit code ${exitCode}`);
        results.push({
          feature_id: config.feature_id,
          name: config.name,
          status: 'error',
          exitCode,
        });

        if (!cliArgs.auto) {
          const { action } = await prompts({
            type: 'select',
            name: 'action',
            message: 'Feature execution failed. How to proceed?',
            choices: [
              { title: 'Retry this feature', value: 'retry' },
              { title: 'Skip and continue', value: 'skip' },
              { title: 'Stop execution', value: 'stop' },
            ],
          });

          if (!action || action === 'stop') break;
          if (action === 'retry') {
            // Rewind the index to retry
            i--;
            results.pop();
            continue;
          }
        }
      }
    } catch (err: any) {
      error(`Error executing ${config.feature_id}: ${err.message}`);
      results.push({
        feature_id: config.feature_id,
        name: config.name,
        status: 'error',
        exitCode: 1,
      });

      if (!cliArgs.auto) {
        const { action } = await prompts({
          type: 'select',
          name: 'action',
          message: 'Execution error. How to proceed?',
          choices: [
            { title: 'Retry this feature', value: 'retry' },
            { title: 'Skip and continue', value: 'skip' },
            { title: 'Stop execution', value: 'stop' },
          ],
        });

        if (!action || action === 'stop') break;
        if (action === 'retry') {
          i--;
          results.pop();
          continue;
        }
      }
    }
  }

  // Final summary
  showFinalSummary(results);

  // Set exit code based on results
  const hasErrors = results.some(r => r.status === 'error');
  const hasInterventions = results.some(r => r.status === 'intervention');

  if (hasErrors) {
    process.exit(1);
  } else if (hasInterventions) {
    process.exit(42);
  } else {
    process.exit(0);
  }
}

main().catch((err) => {
  error(`Fatal error: ${err.message}`);
  process.exit(1);
});
