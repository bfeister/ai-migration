#!/usr/bin/env tsx
/**
 * Sub-Plan Generator
 *
 * Generates migration sub-plans from analysis output using Handlebars templates.
 * Outputs dashboard-compatible files to sub-plans/{feature_id}/subplan-XX-YY.md.
 *
 * Usage:
 *   npx tsx scripts/generate-plans.ts [--features id1,id2]
 */

import fs from 'fs';
import path from 'path';
import Handlebars from 'handlebars';

// ============================================================================
// Types
// ============================================================================

interface FeatureConfig {
  feature_id: string;
  name?: string;
  feature_name?: string;
  sfra_url: string;
  selector?: string;
}

interface URLMappings {
  mappings: FeatureConfig[];
}

interface AnalysisSummary {
  totalElements: number;
  links: { href: string; text?: string }[];
  images: { src: string; alt?: string }[];
  headings: { level: number; text: string }[];
  fonts: string[];
  textColors: string[];
  backgroundColors: string[];
}

interface SubPlanContext {
  featureId: string;
  featureName: string;
  subplanNumber: string;
  totalSubplans: number;
  title: string;
  goal: string;
  dependencies: string[];
  steps: string[];
  verification: string[];
}

// ============================================================================
// Constants
// ============================================================================

const WORKSPACE_ROOT = process.env.WORKSPACE_ROOT || process.cwd();
const URL_MAPPINGS_FILE = path.join(WORKSPACE_ROOT, 'url-mappings.json');
const ANALYSIS_DIR = path.join(WORKSPACE_ROOT, 'analysis');
const SUBPLANS_DIR = path.join(WORKSPACE_ROOT, 'sub-plans');

// ============================================================================
// Template
// ============================================================================

const SUBPLAN_TEMPLATE = `# Sub-Plan {{subplanNumber}}: {{title}}

---
id: subplan-{{subplanNumber}}
feature: {{featureId}}
status: pending
dependencies: [{{#each dependencies}}"{{this}}"{{#unless @last}}, {{/unless}}{{/each}}]
---

## Goal
{{goal}}

{{#if dependencies.length}}
## Prerequisites
{{#each dependencies}}
- Requires: {{this}}
{{/each}}
{{/if}}

## Implementation Steps

{{#each steps}}
### Step {{@index}}: {{this}}

{{/each}}

## Verification Checklist
{{#each verification}}
- [ ] {{this}}
{{/each}}

## Files to Create/Modify
- \`src/components/{{featureId}}/\` - Component files
- \`src/app/\` - Route integration (if applicable)

---
*Generated: {{timestamp}}*
`;

// ============================================================================
// Utilities
// ============================================================================

function log(msg: string): void {
  console.error(`\x1b[34m[Plans]\x1b[0m ${msg}`);
}

function success(msg: string): void {
  console.error(`\x1b[32m[Plans]\x1b[0m ${msg}`);
}

function error(msg: string): void {
  console.error(`\x1b[31m[Plans]\x1b[0m ${msg}`);
}

function loadMappings(): URLMappings {
  if (!fs.existsSync(URL_MAPPINGS_FILE)) {
    throw new Error(`url-mappings.json not found. Run setup first.`);
  }
  return JSON.parse(fs.readFileSync(URL_MAPPINGS_FILE, 'utf-8'));
}

function loadAnalysis(featureId: string): AnalysisSummary | null {
  const summaryFile = path.join(ANALYSIS_DIR, featureId, 'summary.json');
  if (fs.existsSync(summaryFile)) {
    return JSON.parse(fs.readFileSync(summaryFile, 'utf-8'));
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

// Register Handlebars helpers
Handlebars.registerHelper('timestamp', () => new Date().toISOString());

// ============================================================================
// Sub-Plan Generation Logic
// ============================================================================

interface GeneratedSubPlan {
  number: string;
  title: string;
  goal: string;
  dependencies: string[];
  steps: string[];
  verification: string[];
}

function generateSubPlansForFeature(
  feature: FeatureConfig,
  analysis: AnalysisSummary | null
): GeneratedSubPlan[] {
  const plans: GeneratedSubPlan[] = [];
  const featureNum = feature.feature_id.split('-')[0];
  const featureName = feature.name || feature.feature_name || feature.feature_id;

  // Plan 1: Setup and Scaffolding
  plans.push({
    number: `${featureNum}-01`,
    title: `Setup ${featureName} Component Structure`,
    goal: `Create the base component structure and TypeScript types for ${featureName}.`,
    dependencies: [],
    steps: [
      `Create directory structure at src/components/${feature.feature_id}/`,
      'Define TypeScript interfaces for props and data',
      'Create index.ts with named exports',
      'Set up base component file with placeholder content',
    ],
    verification: [
      'TypeScript compiles without errors',
      'Component directory structure follows conventions',
      'Named exports work correctly',
    ],
  });

  // Plan 2: Layout and Structure
  plans.push({
    number: `${featureNum}-02`,
    title: `Implement ${featureName} Layout`,
    goal: `Recreate the visual layout structure using Tailwind CSS.`,
    dependencies: [`subplan-${featureNum}-01`],
    steps: [
      'Analyze source DOM structure from analysis/summary.json',
      'Map HTML structure to React JSX',
      'Convert Bootstrap classes to Tailwind equivalents',
      'Implement responsive layout breakpoints',
    ],
    verification: [
      'Layout matches source visual structure',
      'No Bootstrap classes remain',
      'Responsive behavior works correctly',
    ],
  });

  // Plan 3: Content and Data (if has headings/text)
  if (analysis && (analysis.headings.length > 0 || analysis.totalElements > 10)) {
    plans.push({
      number: `${featureNum}-03`,
      title: `Add ${featureName} Content`,
      goal: `Populate the component with text content and headings.`,
      dependencies: [`subplan-${featureNum}-02`],
      steps: [
        'Extract text content from analysis',
        'Create content props interface',
        'Implement text rendering with proper semantic HTML',
        'Add heading hierarchy (h1-h6)',
      ],
      verification: [
        'Text content matches source',
        'Semantic HTML is used appropriately',
        'Heading hierarchy is correct',
      ],
    });
  }

  // Plan 4: Images and Media (if has images)
  if (analysis && analysis.images.length > 0) {
    plans.push({
      number: `${featureNum}-04`,
      title: `Handle ${featureName} Images`,
      goal: `Implement image handling with proper optimization.`,
      dependencies: [`subplan-${featureNum}-02`],
      steps: [
        `Identify ${analysis.images.length} images from analysis`,
        'Create Image component wrapper or use next/image',
        'Implement srcset/responsive images if present',
        'Add proper alt text for accessibility',
      ],
      verification: [
        'Images load correctly',
        'Alt text is present and meaningful',
        'Images are optimized for performance',
      ],
    });
  }

  // Plan 5: Links and Navigation (if has links)
  if (analysis && analysis.links.length > 0) {
    plans.push({
      number: `${featureNum}-05`,
      title: `Wire ${featureName} Links`,
      goal: `Connect internal and external links using proper routing.`,
      dependencies: [`subplan-${featureNum}-02`],
      steps: [
        `Map ${analysis.links.length} links from analysis`,
        'Use Link component for internal navigation',
        'Handle external links with proper attributes',
        'Implement click tracking if needed',
      ],
      verification: [
        'Internal links use router navigation',
        'External links open correctly',
        'No broken links',
      ],
    });
  }

  // Plan 6: Styling Polish
  plans.push({
    number: `${featureNum}-06`,
    title: `Polish ${featureName} Styling`,
    goal: `Fine-tune visual styling to match source design.`,
    dependencies: plans.slice(-1).map((p) => `subplan-${p.number}`),
    steps: [
      'Compare screenshots of source and target',
      'Adjust spacing, colors, and typography',
      'Implement hover/focus states',
      'Add any animations or transitions',
    ],
    verification: [
      'Visual appearance matches source',
      'Interactive states work correctly',
      'No console errors',
    ],
  });

  // Plan 7: Route Integration
  plans.push({
    number: `${featureNum}-07`,
    title: `Integrate ${featureName} into Routes`,
    goal: `Add the component to the application routes.`,
    dependencies: [`subplan-${featureNum}-06`],
    steps: [
      'Determine route location for component',
      'Import and render component in appropriate page',
      'Pass required props from route loader/data',
      'Test end-to-end rendering',
    ],
    verification: [
      'Component renders in correct route',
      'Data flows correctly from route to component',
      'No hydration mismatches',
    ],
  });

  return plans;
}

// ============================================================================
// Main
// ============================================================================

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const mappings = loadMappings();

  // Compile template
  const template = Handlebars.compile(SUBPLAN_TEMPLATE);

  // Determine which features to process
  let featureIds = args.features;
  if (!featureIds) {
    featureIds = mappings.mappings.map((m) => m.feature_id);
  }

  const features = mappings.mappings.filter((m) => featureIds!.includes(m.feature_id));

  if (features.length === 0) {
    error('No features found. Check url-mappings.json or --features argument.');
    process.exit(1);
  }

  log(`Generating sub-plans for ${features.length} feature(s)...`);
  fs.mkdirSync(SUBPLANS_DIR, { recursive: true });

  let totalPlans = 0;

  for (const feature of features) {
    log(`Processing: ${feature.feature_id}`);

    const featureDir = path.join(SUBPLANS_DIR, feature.feature_id);
    fs.mkdirSync(featureDir, { recursive: true });

    // Load analysis if available
    const analysis = loadAnalysis(feature.feature_id);
    if (!analysis) {
      log(`  Warning: No analysis found for ${feature.feature_id}, using defaults`);
    }

    // Generate sub-plans
    const subplans = generateSubPlansForFeature(feature, analysis);

    for (const plan of subplans) {
      const context: SubPlanContext = {
        featureId: feature.feature_id,
        featureName: feature.name || feature.feature_name || feature.feature_id,
        subplanNumber: plan.number,
        totalSubplans: subplans.length,
        title: plan.title,
        goal: plan.goal,
        dependencies: plan.dependencies,
        steps: plan.steps,
        verification: plan.verification,
      };

      const content = template({ ...context, timestamp: new Date().toISOString() });
      const filename = `subplan-${plan.number}.md`;
      fs.writeFileSync(path.join(featureDir, filename), content);
      totalPlans++;
    }

    success(`  Created ${subplans.length} sub-plans in ${featureDir}/`);
  }

  console.error('');
  success(`Generated ${totalPlans} sub-plans across ${features.length} features`);
  console.error(`\nNext: npx tsx scripts/init-migration-log.ts`);
}

main().catch((err) => {
  error(`Fatal error: ${err.message}`);
  process.exit(1);
});
