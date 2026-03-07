#!/usr/bin/env tsx
/**
 * Sub-Plan Generator
 *
 * Generates migration sub-plans from analysis output using Handlebars templates.
 * Outputs dashboard-compatible files to sub-plans/{feature_id}/subplan-XX-YY.md.
 *
 * Generates two bookend plans per route, each in its own dedicated directory
 * so they execute as independent Claude sessions:
 * - Plan Zero ({pageOrder}-00-{page}-route-setup): Archives the existing route and creates a blank canvas
 * - Final Plan ({pageOrder}-99-{page}-data-wiring): Wires up data-access patterns from the archived original
 *
 * Usage:
 *   npx tsx scripts/generate-plans.ts [--features id1,id2]
 */

import fs from 'fs';
import path from 'path';
import Handlebars from 'handlebars';
import { loadDiscoveryResults, loadURLMappings, findPage } from './lib/discovery.js';
import type { PageConfig } from './lib/discovery.js';
import { compareFeatureIds, getFeatureRouteSequence, getFeatureSequence } from './lib/feature-id.js';

// ============================================================================
// Types
// ============================================================================

interface FeatureConfig {
  feature_id: string;
  name?: string;
  feature_name?: string;
  sfra_url: string;
  selector?: string;
  page_id: string;
  page_order: number;
  route_file?: string;
  isml_template?: string;
  isFirstForRoute: boolean;
  isLastForRoute: boolean;
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
const STANDALONE_PROJECT = process.env.STANDALONE_PROJECT || path.join(WORKSPACE_ROOT, 'storefront-next');

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

const MIGRATION_PLANS_DIR = path.join(WORKSPACE_ROOT, 'migration-plans');

function formatBookendFeatureId(pageOrder: number, phaseOrder: '00' | '99', pageId: string, suffix: string): string {
  return `${String(pageOrder).padStart(2, '0')}-${phaseOrder}-${pageId}-${suffix}`;
}

function isGeneratedBookendFeatureId(featureId: string): boolean {
  return featureId.endsWith('-route-setup') || featureId.endsWith('-data-wiring');
}

function loadFeatures(): FeatureConfig[] {
  const pageConfig = loadURLMappings(URL_MAPPINGS_FILE);
  const results = loadDiscoveryResults(MIGRATION_PLANS_DIR);

  // Group features by page_id to determine first/last per route
  const pageFeatures = new Map<string, { page: PageConfig | undefined; featureIds: string[] }>();

  for (const discovery of results) {
    const page = findPage(pageConfig, discovery.page_id);
    const ids = discovery.features
      .filter((feature) => !isGeneratedBookendFeatureId(feature.feature_id))
      .map((feature) => feature.feature_id)
      .sort(compareFeatureIds);
    pageFeatures.set(discovery.page_id, { page, featureIds: ids });
  }

  const features: FeatureConfig[] = [];

  for (const discovery of results) {
    const page = findPage(pageConfig, discovery.page_id);
    const group = pageFeatures.get(discovery.page_id)!;
    const coreFeatures = discovery.features
      .filter((entry) => !isGeneratedBookendFeatureId(entry.feature_id))
      .sort((a, b) => compareFeatureIds(a.feature_id, b.feature_id));
    const pageOrder = group.featureIds.length > 0
      ? parseInt(getFeatureRouteSequence(group.featureIds[0]), 10)
      : 0;

    for (let i = 0; i < coreFeatures.length; i++) {
      const feat = coreFeatures[i];
      features.push({
        feature_id: feat.feature_id,
        name: feat.name,
        sfra_url: page?.sfra_url || pageConfig.source_base_url,
        selector: feat.selector,
        page_id: discovery.page_id,
        page_order: pageOrder,
        route_file: page?.route_file,
        isml_template: page?.isml_template,
        isFirstForRoute: feat.feature_id === group.featureIds[0],
        isLastForRoute: feat.feature_id === group.featureIds[group.featureIds.length - 1],
      });
    }
  }

  return features;
}

function removeGeneratedBookendDirectories(): void {
  if (!fs.existsSync(SUBPLANS_DIR)) {
    return;
  }

  for (const entry of fs.readdirSync(SUBPLANS_DIR, { withFileTypes: true })) {
    if (entry.isDirectory() && isGeneratedBookendFeatureId(entry.name)) {
      fs.rmSync(path.join(SUBPLANS_DIR, entry.name), { recursive: true, force: true });
    }
  }
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
// ISML Slot Extraction
// ============================================================================

interface ISMLSlot {
  id: string;
  description: string;
  context: string;
}

function extractSlotsFromISML(ismlTemplate: string | undefined): ISMLSlot[] {
  if (!ismlTemplate) return [];

  const fullPath = path.join(WORKSPACE_ROOT, 'storefront-reference-architecture/cartridges/app_storefront_base/cartridge/templates/default', ismlTemplate);
  if (!fs.existsSync(fullPath)) return [];

  const content = fs.readFileSync(fullPath, 'utf-8');
  const slots: ISMLSlot[] = [];
  const regex = /<isslot\s+id="([^"]+)"\s+description="([^"]*)"(?:\s+context="([^"]*)")?/g;
  let match;

  while ((match = regex.exec(content)) !== null) {
    slots.push({
      id: match[1],
      description: match[2],
      context: match[3] || 'global',
    });
  }

  return slots;
}

// ============================================================================
// Plan Zero Generator (Route Preparation)
// ============================================================================

function generatePlanZeroContent(feature: FeatureConfig, slots: ISMLSlot[]): string {
  const routeFile = feature.route_file || '_app._index.tsx';
  const routePath = `src/routes/${routeFile}`;
  const archivedPath = `src/routes/archived/${routeFile}`;
  const ismlTemplate = feature.isml_template || 'unknown';
  const featureNum = getFeatureSequence(feature.feature_id);
  const timestamp = new Date().toISOString();

  const slotRegions = slots.map(s =>
    `      {/* ISML Slot: <isslot id="${s.id}"> — ${s.description} */}\n      {/* TODO: Implement ${s.id} region */}\n      <div data-region="${s.id}" />`
  ).join('\n\n');

  return `# Sub-Plan ${featureNum}-00: Archive Route and Create ISML Canvas

---
id: subplan-${featureNum}-00
feature: ${feature.feature_id}
status: pending
dependencies: []
---

## Goal
Archive the existing Storefront Next route file and create a blank canvas route that mirrors the ISML template structure from \`${ismlTemplate}\`. This establishes the skeleton that subsequent sub-plans will fill in region by region.

## Implementation Steps

### Step 0: Create the archive directory
Create \`${STANDALONE_PROJECT}/${path.dirname(archivedPath)}/\` if it does not exist:
\`\`\`bash
mkdir -p ${STANDALONE_PROJECT}/${path.dirname(archivedPath)}
\`\`\`

### Step 1: Move the existing route to the archive
Move the current route file so we have a reference for its data-access patterns later:
\`\`\`bash
mv ${STANDALONE_PROJECT}/${routePath} ${STANDALONE_PROJECT}/${archivedPath}
\`\`\`
> If the route file does not exist, skip this step.

### Step 2: Read the ISML template
Read the source ISML template to understand the page structure:
- **Path:** \`storefront-reference-architecture/cartridges/app_storefront_base/cartridge/templates/default/${ismlTemplate}\`

Identify every \`<isslot>\`, \`<isinclude>\`, and structural \`<div>\` in the template.

### Step 3: Read slots.xml for slot configurations
For each \`<isslot id="...">\` found, look up its configuration in \`slots/slots.xml\`:
- Find the \`<slot-configuration>\` matching each slot-id
- Note the \`<template>\` (ISML renderer) and \`<content>\` (data source type)

**Slots in this ISML template:**
${slots.length > 0 ? slots.map(s => `- \`${s.id}\` — ${s.description}`).join('\n') : '- *No slots detected (static template)*'}

### Step 4: Create the blank canvas route
Create a new \`${STANDALONE_PROJECT}/${routePath}\` with:
1. A minimal React Router 7 route structure (\`loader\` + default export component)
2. Commented regions matching each ISML slot / structural section
3. Empty \`<div data-region="...">\` placeholders for each slot
4. TypeScript types for the loader return shape

**Canvas structure example:**
\`\`\`tsx
import { type LoaderFunctionArgs } from 'react-router';

export function loader(args: LoaderFunctionArgs) {
  return {};
}

export default function Page() {
  return (
    <div>
${slotRegions || '      {/* Canvas: add ISML regions here */}'}
    </div>
  );
}
\`\`\`

### Step 5: Verify the canvas route compiles
Run \`pnpm typecheck\` from the storefront-next directory to ensure the canvas route has no TypeScript errors.

## Verification Checklist
- [ ] Original route is archived at \`${archivedPath}\`
- [ ] New canvas route exists at \`${routePath}\`
- [ ] Canvas route has commented regions for each ISML slot
- [ ] Canvas route compiles without TypeScript errors
- [ ] Dev server renders the canvas route without errors

## Files to Create/Modify
| File | Action | Description |
|------|--------|-------------|
| \`${archivedPath}\` | Create (move) | Archived original route for data-access reference |
| \`${routePath}\` | Create | Blank canvas route with ISML region placeholders |

---
*Generated: ${timestamp}*
`;
}

// ============================================================================
// Final Plan Generator (Data Wiring)
// ============================================================================

function generateFinalPlanContent(feature: FeatureConfig, lastPlanNumber: string): string {
  const routeFile = feature.route_file || '_app._index.tsx';
  const routePath = `src/routes/${routeFile}`;
  const archivedPath = `src/routes/archived/${routeFile}`;
  const featureNum = getFeatureSequence(feature.feature_id);
  const lastNumPart = lastPlanNumber.split('-')[1] || lastPlanNumber;
  const finalNum = String(parseInt(lastNumPart, 10) + 1).padStart(2, '0');
  const timestamp = new Date().toISOString();

  return `# Sub-Plan ${featureNum}-${finalNum}: Wire Up Data Access from Archived Route

---
id: subplan-${featureNum}-${finalNum}
feature: ${feature.feature_id}
status: pending
dependencies: ["subplan-${lastPlanNumber}"]
---

## Goal
Complete the migration by integrating data-access patterns from the archived original Storefront Next route into the newly migrated SFRA-based React route. This final step ensures the migrated route has proper loader data fetching, API integration, and dynamic data wiring.

## Implementation Steps

### Step 0: Read the archived original route
Read the archived route to understand its data-access patterns:
- **Path:** \`${STANDALONE_PROJECT}/${archivedPath}\`

Extract and catalog:
1. **Loader function** — What APIs does it call? What data shape does it return?
2. **Imports** — Which API utilities, types, and helpers does it use?
3. **Context usage** — How does it access currency, locale, auth context?
4. **Page Designer integration** — Does it use \`fetchPageFromLoader\`, \`collectComponentDataPromises\`, \`Region\`?
5. **Component data flow** — How does loader data flow to components via props?

### Step 1: Read the current migrated route
Read the current migrated route:
- **Path:** \`${STANDALONE_PROJECT}/${routePath}\`

Identify what data is currently hardcoded or missing that the archived route fetches dynamically.

### Step 2: Integrate loader data fetching
Update the migrated route's \`loader\` function to:
1. Import the same API utilities as the archived route (\`fetchSearchProducts\`, \`fetchCategories\`, etc.)
2. Add the same data fetching calls (returning promises for streaming SSR)
3. Match the return type shape so components receive the data they need
4. Preserve any currency/locale context access patterns

### Step 3: Wire dynamic data to components
Replace hardcoded data in components with loader data:
1. Update the component's \`loaderData\` type to match the new loader return
2. Replace static content with dynamic data from the loader (product data, category data, CMS content)
3. Add \`<Suspense>\` + \`<Await>\` boundaries for streamed promises where the archived route used them
4. Ensure progressive loading works correctly

### Step 4: Restore Page Designer integration (if applicable)
If the archived route used Page Designer (\`Region\` component, \`@PageType\`, \`@RegionDefinition\`):
1. Import the Page Designer decorators and \`Region\` component
2. Add the page metadata class with region definitions
3. Wire \`fetchPageFromLoader\` into the loader
4. Place \`<Region>\` components at appropriate positions in the JSX

### Step 5: Restore i18n integration
If the archived route used \`useTranslation\`:
1. Import \`useTranslation\` from \`react-i18next\`
2. Replace any hardcoded strings with translation keys
3. Verify translation keys exist in locale files

### Step 6: Verify full integration
1. Run \`pnpm typecheck\` — no TypeScript errors
2. Run \`pnpm dev\` — page renders without console errors
3. Verify dynamic data loads (products, categories, CMS content)
4. Compare with SFRA source — visual layout should match
5. Compare with archived original — data richness should be equivalent or better

## Verification Checklist
- [ ] Loader fetches all required data (matches archived route's API calls)
- [ ] Components receive dynamic data instead of hardcoded values
- [ ] \`<Suspense>\` boundaries provide progressive loading
- [ ] Page Designer \`Region\` components work (if applicable)
- [ ] i18n strings are translated (if applicable)
- [ ] TypeScript compiles without errors
- [ ] No console errors during page render
- [ ] Visual layout matches SFRA source
- [ ] Data richness matches or exceeds the archived original

## Files to Create/Modify
| File | Action | Description |
|------|--------|-------------|
| \`${routePath}\` | Modify | Add loader data fetching and dynamic data wiring |
| \`${archivedPath}\` | Read-only | Reference for data-access patterns |

## Reference
The archived original route at \`${archivedPath}\` serves as the authoritative reference for:
- API endpoints and data shapes
- Authentication and context patterns
- Page Designer configuration
- Component data flow architecture

---
*Generated: ${timestamp}*
`;
}

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
  const featureNum = getFeatureSequence(feature.feature_id);
  const featureName = feature.name || feature.feature_name || feature.feature_id;

  // Plan 1: Setup and Scaffolding
  plans.push({
    number: `${featureNum}-01`,
    title: `Setup ${featureName} Component Structure`,
    goal: `Create the base component structure and TypeScript types for ${featureName}.`,
    dependencies: feature.isFirstForRoute ? [`subplan-00-00`] : [],
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
    goal: `Fine-tune visual styling to match source design. If the implementation already matches, skip with no code changes.`,
    dependencies: plans.slice(-1).map((p) => `subplan-${p.number}`),
    steps: [
      'Run `pnpm build` and visually review the rendered component against the SFRA source URL',
      'Adjust spacing, colors, and typography if they differ from source',
      'Implement hover/focus states if they differ from source',
      'Add any animations or transitions if they differ from source',
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
  const allFeatures = loadFeatures();

  if (allFeatures.length === 0) {
    error('No discovered features found. Run discovery first: npx tsx scripts/discover-features-claude.ts');
    process.exit(1);
  }

  // Compile template
  const template = Handlebars.compile(SUBPLAN_TEMPLATE);

  // Determine which features to process
  let featureIds = args.features;
  if (!featureIds) {
    featureIds = allFeatures.map((m) => m.feature_id);
  }

  const features = allFeatures.filter((m) => featureIds!.includes(m.feature_id));

  if (features.length === 0) {
    error('No features found. Check url-mappings.json or --features argument.');
    process.exit(1);
  }

  log(`Generating sub-plans for ${features.length} feature(s)...`);
  fs.mkdirSync(SUBPLANS_DIR, { recursive: true });
  removeGeneratedBookendDirectories();

  let totalPlans = 0;

  // Extract ISML slots once per unique route (for Plan Zero)
  const slotsCache = new Map<string, ISMLSlot[]>();

  // Track bookend features to inject into discovery files
  interface BookendEntry {
    feature_id: string;
    name: string;
    description: string;
    priority: number;
  }
  const bookendFeatures = new Map<string, { planZero?: BookendEntry; finalPlan?: BookendEntry }>();

  for (const feature of features) {
    log(`Processing: ${feature.feature_id}`);

    const featureDir = path.join(SUBPLANS_DIR, feature.feature_id);
    fs.mkdirSync(featureDir, { recursive: true });

    // --- Plan Zero: generate in its own dedicated directory ---
    if (feature.isFirstForRoute && feature.route_file) {
      const cacheKey = feature.isml_template || feature.route_file;
      if (!slotsCache.has(cacheKey)) {
        slotsCache.set(cacheKey, extractSlotsFromISML(feature.isml_template));
      }
      const slots = slotsCache.get(cacheKey)!;

      const planZeroId = formatBookendFeatureId(feature.page_order, '00', feature.page_id, 'route-setup');
      const planZeroDir = path.join(SUBPLANS_DIR, planZeroId);
      fs.mkdirSync(planZeroDir, { recursive: true });

      const planZeroContent = generatePlanZeroContent(feature, slots);
      const planZeroFile = 'subplan-00-00.md';
      fs.writeFileSync(path.join(planZeroDir, planZeroFile), planZeroContent);
      totalPlans++;
      log(`  Generated Plan Zero: ${planZeroId}/${planZeroFile} (archives route, creates canvas)`);

      if (!bookendFeatures.has(feature.page_id)) bookendFeatures.set(feature.page_id, {});
      bookendFeatures.get(feature.page_id)!.planZero = {
        feature_id: planZeroId,
        name: 'Route Setup (Archive & Canvas)',
        description: `Archive the existing ${feature.route_file} route and create an ISML-based canvas with slot placeholders.`,
        priority: 0,
      };
    }

    // --- Core sub-plans ---
    const analysis = loadAnalysis(feature.feature_id);
    if (!analysis) {
      log(`  Warning: No analysis found for ${feature.feature_id}, using defaults`);
    }

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

    // --- Final Plan: generate in its own dedicated directory ---
    if (feature.isLastForRoute && feature.route_file) {
      const finalPlanId = formatBookendFeatureId(feature.page_order, '99', feature.page_id, 'data-wiring');
      const finalPlanDir = path.join(SUBPLANS_DIR, finalPlanId);
      fs.mkdirSync(finalPlanDir, { recursive: true });

      const lastPlanNumber = subplans[subplans.length - 1].number;
      const finalPlanContent = generateFinalPlanContent(feature, lastPlanNumber);
      const finalPlanFile = 'subplan-99-00.md';
      fs.writeFileSync(path.join(finalPlanDir, finalPlanFile), finalPlanContent);
      totalPlans++;
      log(`  Generated Final Plan: ${finalPlanId}/${finalPlanFile} (data-access wiring from archived route)`);

      if (!bookendFeatures.has(feature.page_id)) bookendFeatures.set(feature.page_id, {});
      bookendFeatures.get(feature.page_id)!.finalPlan = {
        feature_id: finalPlanId,
        name: 'Data Wiring (Loader & API Integration)',
        description: `Wire up data-access patterns from the archived route into the migrated route. Restore loader, API calls, Suspense boundaries, and dynamic data flow.`,
        priority: 99,
      };
    }

    const planCount = fs.readdirSync(featureDir).filter(f => f.endsWith('.md')).length;
    success(`  Created ${planCount} sub-plans in ${featureDir}/`);
  }

  // --- Inject bookend features into discovery files ---
  for (const [pageId, bookends] of bookendFeatures) {
    const discoveryFiles = fs.readdirSync(MIGRATION_PLANS_DIR)
      .filter(f => f.endsWith('-features.json'));

    for (const file of discoveryFiles) {
      const filePath = path.join(MIGRATION_PLANS_DIR, file);
      const discovery = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

      if (discovery.page_id !== pageId) continue;

      // Remove any previously injected bookend entries
      discovery.features = discovery.features.filter(
        (f: any) => !isGeneratedBookendFeatureId(f.feature_id)
      );

      if (bookends.planZero) {
        discovery.features.unshift({
          feature_id: bookends.planZero.feature_id,
          name: bookends.planZero.name,
          description: bookends.planZero.description,
          selector: '',
          migration_priority: bookends.planZero.priority,
          estimated_complexity: 'low',
          dependencies: [],
        });
      }

      if (bookends.finalPlan) {
        discovery.features.push({
          feature_id: bookends.finalPlan.feature_id,
          name: bookends.finalPlan.name,
          description: bookends.finalPlan.description,
          selector: '',
          migration_priority: bookends.finalPlan.priority,
          estimated_complexity: 'medium',
          dependencies: [],
        });
      }

      // Update migration_order
      discovery.migration_order = discovery.features.map((f: any) => f.feature_id);
      discovery.total_features = discovery.features.length;

      fs.writeFileSync(filePath, JSON.stringify(discovery, null, 2) + '\n');
      log(`  Updated ${file} with bookend features for page "${pageId}"`);
    }
  }

  console.error('');
  success(`Generated ${totalPlans} sub-plans across ${features.length} features`);
  console.error(`\nNext: npx tsx scripts/init-migration-log.ts`);
}

main().catch((err) => {
  error(`Fatal error: ${err.message}`);
  process.exit(1);
});
