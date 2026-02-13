/**
 * ISML Migration Template Compiler
 *
 * Utility functions for compiling Handlebars templates for ISML + Bootstrap + jQuery
 * to React 19 migrations.
 *
 * Usage:
 *   import { compileAnalysisPrompt, compileSubplanPrompt } from './template-compiler';
 *
 *   const analysisPrompt = compileAnalysisPrompt({ sourceDir: '/path/to/sfra' });
 *   const subplanPrompt = compileSubplanPrompt({ feature, targetDir });
 */

import Handlebars from 'handlebars';
import fs from 'fs';
import path from 'path';

// ============================================================================
// Types
// ============================================================================

export interface ISMLTemplate {
  path: string;
  type: 'layout' | 'page' | 'component' | 'decorator';
  includes: string[];
  pdictVars: string[];
  bootstrapClasses: string[];
  bootstrapComponents: string[];
}

export interface ISMLScript {
  path: string;
  jqueryPatterns: string[];
  exports: string[];
  dependencies: string[];
}

export interface ISMLController {
  path: string;
  endpoints: Array<{
    name: string;
    method: 'GET' | 'POST';
    pdictVars: string[];
  }>;
}

export interface ISMLFeature {
  id: string;
  name: string;
  type: 'page' | 'component' | 'utility';
  priority: number;
  templates: ISMLTemplate[];
  scripts: ISMLScript[];
  controllers: ISMLController[];
  functionalities: string[];
  migrationComplexity: 'low' | 'medium' | 'high';
  dependencies: string[];
  notes?: string;
}

export interface SubPlan {
  id: string;
  feature: string;
  title: string;
  status: 'pending' | 'in_progress' | 'completed';
  dependencies: string[];
  content: string;
}

export interface AnalysisContext {
  sourceDir: string;
}

export interface SubplanGenerationContext {
  feature: ISMLFeature;
  targetDir: string;
  subplanCount?: number;
}

export interface SubplanInstructionContext {
  subplan: SubPlan;
  sourceDir: string;
  targetDir: string;
}

export interface VisualComparisonContext {
  feature: ISMLFeature;
  subplan: SubPlan;
  sourceUrl: string;
  targetUrl: string;
}

/**
 * Context for iterative sub-plan generation via Claude CLI
 */
export interface IterativeSubplanContext {
  /** Feature configuration from url-mappings.json */
  feature: {
    feature_id: string;
    name: string;
    sfra_url: string;
    target_url?: string;
    selector?: string;
  };
  /** DOM extraction data from analysis/{feature_id}/dom-extraction.json */
  domExtraction: {
    summary: {
      totalElements: number;
      links: Array<{ href: string; text?: string }>;
      images: Array<{ src: string; alt?: string }>;
      headings: Array<{ level: number; text: string }>;
      backgroundImages: string[];
      textColors: string[];
      backgroundColors: string[];
      fonts: string[];
    };
    rootNode: {
      tag: string;
      classes: string[];
      styles: Record<string, string>;
      boundingBox: { x: number; y: number; width: number; height: number };
      children?: unknown[];
    };
  };
  /** Full ISML template content */
  ismlContent: string;
  /** Path to ISML template file */
  ismlTemplatePath: string;
  /** Screenshot paths for visual comparison */
  screenshots: {
    source?: string;
    target?: string;
    analysis?: string;
  };
  /** Slot configurations extracted from slots.xml (optional) */
  slots?: Array<{
    slotId: string;
    configurationId: string;
    template: string;
    contentType: 'content-assets' | 'products' | 'categories' | 'html';
    contentAssets?: string[];
    description?: string;
    xml: string;
  }>;
  /** Previously generated sub-plans for context */
  previousSubPlans: Array<{
    id: string;
    title: string;
    status: string;
    dependencies: string[];
    summary: string;
  }>;
  /** Current sub-plan number being generated */
  subPlanNumber: number;
  /** Feature prefix for sub-plan IDs (e.g., "01" from "01-homepage-hero") */
  featurePrefix: string;
  /** Padded sub-plan number (e.g., "03") */
  paddedNumber: string;
  /** Previous sub-plan's padded number for dependency reference */
  previousPaddedNumber?: string;
}

// ============================================================================
// Template Paths
// ============================================================================

const TEMPLATE_DIR = path.dirname(new URL(import.meta.url).pathname);

const TEMPLATES = {
  analysis: path.join(TEMPLATE_DIR, 'isml-analysis.hbs'),
  subplanGeneration: path.join(TEMPLATE_DIR, 'subplan-generation.hbs'),
  subplanInstruction: path.join(TEMPLATE_DIR, 'subplan-instruction.hbs'),
  visualComparison: path.join(TEMPLATE_DIR, 'visual-comparison.hbs'),
  iterativeSubplan: path.join(TEMPLATE_DIR, 'iterative-subplan.hbs'),
  cookbook: path.join(TEMPLATE_DIR, 'isml-cookbook.md'),
  ismlReference: path.join(TEMPLATE_DIR, 'isml-reference.md'),
} as const;

// ============================================================================
// Template Cache
// ============================================================================

const templateCache = new Map<string, Handlebars.TemplateDelegate>();

function getTemplate(templatePath: string): Handlebars.TemplateDelegate {
  if (!templateCache.has(templatePath)) {
    const templateContent = fs.readFileSync(templatePath, 'utf8');
    templateCache.set(templatePath, Handlebars.compile(templateContent));
  }
  return templateCache.get(templatePath)!;
}

// ============================================================================
// Handlebars Helpers
// ============================================================================

// Register custom helpers
Handlebars.registerHelper('json', function (context) {
  return JSON.stringify(context, null, 2);
});

// JSON with only specific keys (for compact output)
Handlebars.registerHelper('jsonSubset', function (context, keysStr: string) {
  if (!context || typeof context !== 'object') return '{}';
  const keys = keysStr.split(',').map((k) => k.trim());
  const subset: Record<string, unknown> = {};
  for (const key of keys) {
    if (key in context) {
      subset[key] = context[key];
    }
  }
  return JSON.stringify(subset, null, 2);
});

Handlebars.registerHelper('kebabCase', function (str: string) {
  return str
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .replace(/[\s_]+/g, '-')
    .toLowerCase();
});

Handlebars.registerHelper('pascalCase', function (str: string) {
  return str
    .replace(/[-_\s]+(.)?/g, (_, c) => (c ? c.toUpperCase() : ''))
    .replace(/^(.)/, (c) => c.toUpperCase());
});

Handlebars.registerHelper('eq', function (a, b) {
  return a === b;
});

Handlebars.registerHelper('gt', function (a, b) {
  return a > b;
});

Handlebars.registerHelper('add', function (a: number, b: number) {
  return a + b;
});

Handlebars.registerHelper('padStart', function (num: number, len: number, char: string) {
  return String(num).padStart(len, char || '0');
});

Handlebars.registerHelper('includes', function (arr: unknown[], value: unknown) {
  return Array.isArray(arr) && arr.includes(value);
});

// ============================================================================
// Template Compilation Functions
// ============================================================================

/**
 * Compile the ISML analysis prompt for discovering migratable features
 */
export function compileAnalysisPrompt(context: AnalysisContext): string {
  const template = getTemplate(TEMPLATES.analysis);
  return template({ context });
}

/**
 * Compile the sub-plan generation prompt for a specific feature
 */
export function compileSubplanGenerationPrompt(
  context: SubplanGenerationContext
): string {
  const template = getTemplate(TEMPLATES.subplanGeneration);
  return template({
    context: {
      ...context,
      subplanCount: context.subplanCount ?? estimateSubplanCount(context.feature),
    },
  });
}

/**
 * Compile the sub-plan instruction prompt for executing a single sub-plan
 */
export function compileSubplanInstructionPrompt(
  context: SubplanInstructionContext
): string {
  const template = getTemplate(TEMPLATES.subplanInstruction);
  const cookbook = fs.readFileSync(TEMPLATES.cookbook, 'utf8');
  return template({
    context: {
      ...context,
      cookbook,
    },
  });
}

/**
 * Compile the visual comparison prompt for screenshot analysis
 */
export function compileVisualComparisonPrompt(
  context: VisualComparisonContext
): string {
  const template = getTemplate(TEMPLATES.visualComparison);
  return template({ context });
}

/**
 * Compile the iterative sub-plan generation prompt for Claude CLI
 *
 * This is used by `generate-subplan-claude.ts` to create prompts that are
 * fed to Claude CLI (`claude -p`) for iterative sub-plan generation.
 */
export function compileIterativeSubplanPrompt(
  context: IterativeSubplanContext
): string {
  const template = getTemplate(TEMPLATES.iterativeSubplan);
  return template(context);
}

/**
 * Build context for iterative sub-plan generation from file system data
 */
export function buildIterativeSubplanContext(
  workspaceRoot: string,
  featureId: string,
  subPlanNumber: number,
  options: {
    ismlTemplatePath?: string;
    slotsXmlPath?: string;
  } = {}
): IterativeSubplanContext | null {
  const urlMappingsPath = path.join(workspaceRoot, 'url-mappings.json');
  const analysisDir = path.join(workspaceRoot, 'analysis', featureId);
  const subPlansDir = path.join(workspaceRoot, 'sub-plans', featureId);
  const screenshotsDir = path.join(workspaceRoot, 'screenshots');

  // Load feature config
  if (!fs.existsSync(urlMappingsPath)) {
    console.error(`url-mappings.json not found at ${urlMappingsPath}`);
    return null;
  }

  const urlMappings = JSON.parse(fs.readFileSync(urlMappingsPath, 'utf8'));
  const feature = urlMappings.mappings?.find(
    (m: { feature_id: string }) => m.feature_id === featureId
  );

  if (!feature) {
    console.error(`Feature ${featureId} not found in url-mappings.json`);
    return null;
  }

  // Load DOM extraction
  const domExtractionPath = path.join(analysisDir, 'dom-extraction.json');
  if (!fs.existsSync(domExtractionPath)) {
    console.error(`DOM extraction not found at ${domExtractionPath}`);
    return null;
  }
  const domExtraction = JSON.parse(fs.readFileSync(domExtractionPath, 'utf8'));

  // Load ISML content
  const ismlTemplatePath =
    options.ismlTemplatePath || feature.isml_template_path;
  let ismlContent = '';
  if (ismlTemplatePath && fs.existsSync(ismlTemplatePath)) {
    ismlContent = fs.readFileSync(ismlTemplatePath, 'utf8');
  } else {
    console.warn(`ISML template not found: ${ismlTemplatePath}`);
    ismlContent = '<!-- ISML template not available -->';
  }

  // Find screenshots
  const screenshots: IterativeSubplanContext['screenshots'] = {};
  if (fs.existsSync(screenshotsDir)) {
    const screenshotFiles = fs.readdirSync(screenshotsDir);
    const featureNum = featureId.split('-')[0];

    // Look for baseline source screenshot
    const sourceScreenshot = screenshotFiles.find(
      (f) => f.includes(featureNum) && f.includes('source') && f.endsWith('.png')
    );
    if (sourceScreenshot) {
      screenshots.source = path.join(screenshotsDir, sourceScreenshot);
    }

    // Look for target screenshot
    const targetScreenshot = screenshotFiles.find(
      (f) => f.includes(featureNum) && f.includes('target') && f.endsWith('.png')
    );
    if (targetScreenshot) {
      screenshots.target = path.join(screenshotsDir, targetScreenshot);
    }

    // Look for analysis screenshot (from DOM extraction)
    if (domExtraction.screenshotPath && fs.existsSync(domExtraction.screenshotPath)) {
      screenshots.analysis = domExtraction.screenshotPath;
    }
  }

  // Load previous sub-plans
  const previousSubPlans: IterativeSubplanContext['previousSubPlans'] = [];
  if (fs.existsSync(subPlansDir)) {
    const subPlanFiles = fs
      .readdirSync(subPlansDir)
      .filter((f) => f.startsWith('subplan-') && f.endsWith('.md'))
      .sort();

    for (const file of subPlanFiles) {
      const content = fs.readFileSync(path.join(subPlansDir, file), 'utf8');
      const metadata = parseSubplanMetadata(content);

      // Extract summary from content (first paragraph after ## Goal or ## Summary)
      const summaryMatch = content.match(/##\s*(Goal|Summary)\s*\n+([^\n#]+)/);
      const summary = summaryMatch?.[2]?.trim() || '';

      previousSubPlans.push({
        id: metadata.id || file.replace('.md', ''),
        title: metadata.title || 'Untitled',
        status: metadata.status || 'pending',
        dependencies: metadata.dependencies || [],
        summary,
      });
    }
  }

  // Parse slots from ISML and slots.xml if available
  let slots: IterativeSubplanContext['slots'] = [];
  if (ismlContent && options.slotsXmlPath && fs.existsSync(options.slotsXmlPath)) {
    slots = parseRelevantSlots(ismlContent, options.slotsXmlPath);
  }

  // Calculate padded numbers
  const featurePrefix = featureId.split('-')[0];
  const paddedNumber = String(subPlanNumber).padStart(2, '0');
  const previousPaddedNumber =
    subPlanNumber > 1 ? String(subPlanNumber - 1).padStart(2, '0') : undefined;

  return {
    feature: {
      feature_id: feature.feature_id,
      name: feature.name || feature.feature_name || featureId,
      sfra_url: feature.sfra_url,
      target_url: feature.target_url,
      selector: feature.selector,
    },
    domExtraction: {
      summary: domExtraction.summary || {},
      rootNode: domExtraction.rootNode || { tag: 'div', classes: [], styles: {} },
    },
    ismlContent,
    ismlTemplatePath: ismlTemplatePath || '',
    screenshots,
    slots,
    previousSubPlans,
    subPlanNumber,
    featurePrefix,
    paddedNumber,
    previousPaddedNumber,
  };
}

/**
 * Parse slot IDs from ISML content and extract their configurations from slots.xml
 */
function parseRelevantSlots(
  ismlContent: string,
  slotsXmlPath: string
): IterativeSubplanContext['slots'] {
  const slots: IterativeSubplanContext['slots'] = [];

  // Find all <isslot id="..."> in ISML
  const slotMatches = ismlContent.matchAll(/<isslot\s+id="([^"]+)"/g);
  const slotIds = [...slotMatches].map((m) => m[1]);

  if (slotIds.length === 0) return slots;

  // Read slots.xml
  const slotsXml = fs.readFileSync(slotsXmlPath, 'utf8');

  for (const slotId of slotIds) {
    // Find slot configuration in XML
    const slotRegex = new RegExp(
      `<slot-configuration\\s+slot-id="${slotId}"[^>]*>([\\s\\S]*?)</slot-configuration>`,
      'g'
    );
    const match = slotRegex.exec(slotsXml);

    if (match) {
      const slotXml = match[0];
      const slotContent = match[1];

      // Extract template path
      const templateMatch = slotContent.match(/<template>([^<]+)<\/template>/);
      const template = templateMatch?.[1] || '';

      // Extract configuration-id
      const configIdMatch = slotXml.match(/configuration-id="([^"]+)"/);
      const configurationId = configIdMatch?.[1] || '';

      // Extract description
      const descMatch = slotContent.match(/<description>([^<]+)<\/description>/);
      const description = descMatch?.[1] || '';

      // Determine content type
      let contentType: 'content-assets' | 'products' | 'categories' | 'html' =
        'html';
      let contentAssets: string[] | undefined;

      if (slotContent.includes('<content-assets>')) {
        contentType = 'content-assets';
        const assetMatches = slotContent.matchAll(
          /content-id="([^"]+)"/g
        );
        contentAssets = [...assetMatches].map((m) => m[1]);
      } else if (slotContent.includes('<products')) {
        contentType = 'products';
      } else if (slotContent.includes('<categories')) {
        contentType = 'categories';
      }

      slots.push({
        slotId,
        configurationId,
        template,
        contentType,
        contentAssets,
        description,
        xml: slotXml,
      });
    }
  }

  return slots;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Estimate the number of sub-plans needed based on feature complexity
 */
function estimateSubplanCount(feature: ISMLFeature): number {
  const baseCount = feature.templates.length + feature.scripts.length;

  const complexityMultiplier =
    feature.migrationComplexity === 'high'
      ? 2
      : feature.migrationComplexity === 'medium'
        ? 1.5
        : 1;

  // Add sub-plans for:
  // - Each major component (estimated from template count)
  // - Shared utilities/hooks
  // - Tests
  // - Route integration
  const estimated = Math.ceil(baseCount * complexityMultiplier) + 3;

  // Clamp between 3 and 15 sub-plans
  return Math.max(3, Math.min(15, estimated));
}

/**
 * Parse sub-plan metadata from markdown content
 */
export function parseSubplanMetadata(markdown: string): Partial<SubPlan> {
  const frontmatterMatch = markdown.match(/^---\n([\s\S]*?)\n---/);
  if (!frontmatterMatch) {
    return {};
  }

  const frontmatter = frontmatterMatch[1];
  const metadata: Partial<SubPlan> = {};

  const idMatch = frontmatter.match(/^id:\s*(.+)$/m);
  if (idMatch) metadata.id = idMatch[1].trim();

  const featureMatch = frontmatter.match(/^feature:\s*(.+)$/m);
  if (featureMatch) metadata.feature = featureMatch[1].trim();

  const titleMatch = frontmatter.match(/^title:\s*(.+)$/m);
  if (titleMatch) metadata.title = titleMatch[1].trim();

  const statusMatch = frontmatter.match(/^status:\s*(.+)$/m);
  if (statusMatch) {
    metadata.status = statusMatch[1].trim() as SubPlan['status'];
  }

  const depsMatch = frontmatter.match(/^dependencies:\s*\[([^\]]*)\]/m);
  if (depsMatch) {
    metadata.dependencies = depsMatch[1]
      .split(',')
      .map((s) => s.trim().replace(/['"]/g, ''))
      .filter(Boolean);
  }

  return metadata;
}

/**
 * Generate a sub-plan file path from feature and index
 */
export function getSubplanPath(
  outputDir: string,
  featureId: string,
  index: number
): string {
  const paddedIndex = String(index).padStart(2, '0');
  return path.join(
    outputDir,
    'migration-plans',
    featureId,
    `subplan-${paddedIndex}.md`
  );
}

/**
 * Load all sub-plans for a feature
 */
export function loadFeatureSubplans(
  outputDir: string,
  featureId: string
): SubPlan[] {
  const featureDir = path.join(outputDir, 'migration-plans', featureId);

  if (!fs.existsSync(featureDir)) {
    return [];
  }

  const files = fs.readdirSync(featureDir).filter((f) => f.startsWith('subplan-'));

  return files.map((file) => {
    const content = fs.readFileSync(path.join(featureDir, file), 'utf8');
    const metadata = parseSubplanMetadata(content);

    return {
      id: metadata.id ?? file.replace('.md', ''),
      feature: featureId,
      title: metadata.title ?? 'Untitled',
      status: metadata.status ?? 'pending',
      dependencies: metadata.dependencies ?? [],
      content,
    };
  });
}

/**
 * Find the next pending sub-plan that has no unresolved dependencies
 */
export function getNextSubplan(subplans: SubPlan[]): SubPlan | null {
  const completedIds = new Set(
    subplans.filter((sp) => sp.status === 'completed').map((sp) => sp.id)
  );

  return (
    subplans.find(
      (sp) =>
        sp.status === 'pending' &&
        sp.dependencies.every((dep) => completedIds.has(dep))
    ) ?? null
  );
}

// ============================================================================
// Export
// ============================================================================

export default {
  compileAnalysisPrompt,
  compileSubplanGenerationPrompt,
  compileSubplanInstructionPrompt,
  compileVisualComparisonPrompt,
  compileIterativeSubplanPrompt,
  buildIterativeSubplanContext,
  parseSubplanMetadata,
  getSubplanPath,
  loadFeatureSubplans,
  getNextSubplan,
};
