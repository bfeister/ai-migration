/**
 * Example ISML Migration Workflow
 *
 * This script demonstrates how to integrate the ISML migration templates
 * into an automated workflow similar to the pwa-upgrade project.
 *
 * Run with: npx tsx prompts/isml-migration/example-workflow.ts
 */

import fs from 'fs';
import path from 'path';
import {
  compileAnalysisPrompt,
  compileSubplanGenerationPrompt,
  compileSubplanInstructionPrompt,
  compileVisualComparisonPrompt,
  loadFeatureSubplans,
  getNextSubplan,
  type ISMLFeature,
  type SubPlan,
} from './template-compiler';

// ============================================================================
// Configuration
// ============================================================================

const CONFIG = {
  // SFRA source directory
  sourceDir: process.env.SFRA_SRC_DIR || '/path/to/sfra-cartridges',

  // React 19 target directory
  targetDir: process.env.REACT_TARGET_DIR || '/path/to/react-app',

  // Output directory for plans and prompts
  outputDir: process.env.OUTPUT_DIR || './output',

  // URLs for visual comparison
  sourceUrl: process.env.SFRA_URL || 'http://localhost:3000',
  targetUrl: process.env.REACT_URL || 'http://localhost:5173',
};

// ============================================================================
// Workflow Steps
// ============================================================================

/**
 * Step 1: Analyze SFRA codebase and discover migratable features
 */
async function analyzeISMLTemplates(): Promise<string> {
  console.log('📊 Generating ISML analysis prompt...');

  const prompt = compileAnalysisPrompt({
    sourceDir: CONFIG.sourceDir,
  });

  // Save prompt to output directory
  const outputPath = path.join(CONFIG.outputDir, 'isml-analysis-prompt.md');
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, prompt);

  console.log(`   Saved to: ${outputPath}`);
  console.log('   Send this prompt to Claude to discover features');

  return prompt;
}

/**
 * Step 2: Generate sub-plans for a specific feature
 */
async function generateSubplans(feature: ISMLFeature): Promise<string> {
  console.log(`📝 Generating sub-plans for: ${feature.name}`);

  const prompt = compileSubplanGenerationPrompt({
    feature,
    targetDir: CONFIG.targetDir,
  });

  // Save prompt to output directory
  const outputPath = path.join(
    CONFIG.outputDir,
    `subplan-generation-${feature.id}.md`
  );
  fs.writeFileSync(outputPath, prompt);

  console.log(`   Saved to: ${outputPath}`);
  console.log('   Send this prompt to Claude to generate sub-plans');

  return prompt;
}

/**
 * Step 3: Execute a single sub-plan
 */
async function executeSubplan(subplan: SubPlan): Promise<string> {
  console.log(`🔧 Generating instruction for: ${subplan.id}`);

  const prompt = compileSubplanInstructionPrompt({
    subplan,
    sourceDir: CONFIG.sourceDir,
    targetDir: CONFIG.targetDir,
  });

  // Save prompt to output directory
  const outputPath = path.join(CONFIG.outputDir, `instruction-${subplan.id}.md`);
  fs.writeFileSync(outputPath, prompt);

  console.log(`   Saved to: ${outputPath}`);
  console.log('   Send this prompt to Claude to execute the sub-plan');

  return prompt;
}

/**
 * Step 4: Compare screenshots for visual verification
 */
async function compareScreenshots(
  feature: ISMLFeature,
  subplan: SubPlan
): Promise<string> {
  console.log(`📸 Generating visual comparison prompt for: ${subplan.id}`);

  const prompt = compileVisualComparisonPrompt({
    feature,
    subplan,
    sourceUrl: `${CONFIG.sourceUrl}${feature.templates[0]?.path || '/'}`,
    targetUrl: `${CONFIG.targetUrl}${feature.templates[0]?.path || '/'}`,
  });

  // Save prompt to output directory
  const outputPath = path.join(
    CONFIG.outputDir,
    `visual-comparison-${subplan.id}.md`
  );
  fs.writeFileSync(outputPath, prompt);

  console.log(`   Saved to: ${outputPath}`);
  console.log('   Send this with screenshots to Claude for visual analysis');

  return prompt;
}

// ============================================================================
// Main Workflow
// ============================================================================

async function main() {
  console.log('🚀 ISML to React 19 Migration Workflow\n');

  // Example feature (in real usage, this comes from Claude's analysis)
  const exampleFeature: ISMLFeature = {
    id: 'homepage-hero',
    name: 'Homepage Hero Banner',
    type: 'component',
    priority: 1,
    templates: [
      {
        path: 'default/homepage/heroSlot.isml',
        type: 'component',
        includes: ['components/heroImage.isml'],
        pdictVars: ['heroContent', 'heroImages'],
        bootstrapClasses: ['container', 'row', 'col-12', 'carousel'],
        bootstrapComponents: ['carousel'],
      },
    ],
    scripts: [
      {
        path: 'client/default/js/components/hero.js',
        jqueryPatterns: ['$(selector).slick', '$(document).ready', '$.ajax'],
        exports: ['initHeroCarousel'],
        dependencies: ['jquery', 'slick-carousel'],
      },
    ],
    controllers: [
      {
        path: 'controllers/Home.js',
        endpoints: [
          {
            name: 'Show',
            method: 'GET',
            pdictVars: ['heroContent', 'heroImages', 'promotions'],
          },
        ],
      },
    ],
    functionalities: [
      'Hero image carousel with auto-rotation',
      'Responsive image loading',
      'CTA button with tracking',
      'Promotion badge overlay',
    ],
    migrationComplexity: 'medium',
    dependencies: [],
    notes: 'Uses Slick carousel which needs to be replaced with Embla',
  };

  // Step 1: Analysis (usually done once at the start)
  console.log('═══════════════════════════════════════════════════════════');
  await analyzeISMLTemplates();

  // Step 2: Generate sub-plans for a feature
  console.log('\n═══════════════════════════════════════════════════════════');
  await generateSubplans(exampleFeature);

  // Step 3: Load and execute sub-plans (simulated)
  console.log('\n═══════════════════════════════════════════════════════════');

  // In real usage, sub-plans would be loaded from files created by Claude
  const mockSubplan: SubPlan = {
    id: 'subplan-homepage-hero-01',
    feature: 'homepage-hero',
    title: 'Create Hero Component Structure',
    status: 'pending',
    dependencies: [],
    content: `
# Sub-Plan 01: Create Hero Component Structure

## Goal
Create the basic file structure for the Hero component.

## Implementation Steps

### Step 1: Create component directory
Create \`src/components/hero/\` directory.

### Step 2: Create Hero.tsx
\`\`\`tsx
export function Hero() {
  return (
    <section className="relative w-full">
      {/* Hero content will go here */}
    </section>
  );
}
\`\`\`

### Step 3: Create index.ts
\`\`\`ts
export { Hero } from './Hero';
\`\`\`

## Verification
- [ ] Directory exists
- [ ] Component renders without errors
- [ ] TypeScript compiles
    `.trim(),
  };

  await executeSubplan(mockSubplan);

  // Step 4: Visual comparison (after code changes)
  console.log('\n═══════════════════════════════════════════════════════════');
  await compareScreenshots(exampleFeature, mockSubplan);

  // Summary
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('✅ Workflow prompts generated!\n');
  console.log('Next steps:');
  console.log('1. Send isml-analysis-prompt.md to Claude');
  console.log('2. Parse the JSON response to get feature list');
  console.log('3. For each feature, send subplan-generation-*.md');
  console.log('4. Execute each sub-plan using instruction-*.md');
  console.log('5. Verify with visual-comparison-*.md\n');
}

// ============================================================================
// Run
// ============================================================================

main().catch(console.error);
