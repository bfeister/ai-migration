#!/usr/bin/env tsx
/**
 * Generate React Components from UIDL
 *
 * Converts UIDL (Universal Interface Description Language) JSON to React components
 * using Teleport Code Generators.
 *
 * Usage:
 *   npx tsx scripts/generate-react.ts <uidl-file> [options]
 *
 * Options:
 *   --output <dir>       Output directory (default: ./generated)
 *   --framework <name>   Framework: react | react-styled | vue | angular (default: react)
 *   --typescript         Generate TypeScript (default: true)
 *
 * Examples:
 *   npx tsx scripts/generate-react.ts extracted.uidl.json
 *   npx tsx scripts/generate-react.ts extracted.uidl.json --output ./src/components
 *   npx tsx scripts/generate-react.ts extracted.uidl.json --framework vue
 *
 * Pipeline:
 *   1. Extract DOM: npx tsx scripts/extract-dom-structure.ts <url> --format uidl --output component.uidl.json
 *   2. Generate React: npx tsx scripts/generate-react.ts component.uidl.json --output ./src/components
 */

import * as fs from 'fs';
import * as path from 'path';

// Teleport code generators
// These need to be installed: pnpm add @teleporthq/teleport-component-generator-react
type Framework = 'react' | 'react-styled' | 'vue' | 'angular';

interface GenerateOptions {
  inputFile: string;
  outputDir: string;
  framework: Framework;
  typescript: boolean;
}

interface UIDLComponent {
  name: string;
  node: unknown;
  propDefinitions?: Record<string, unknown>;
}

async function generateComponent(options: GenerateOptions): Promise<void> {
  const { inputFile, outputDir, framework, typescript } = options;

  // Read UIDL file
  if (!fs.existsSync(inputFile)) {
    throw new Error(`Input file not found: ${inputFile}`);
  }

  const uidlContent = fs.readFileSync(inputFile, 'utf-8');
  let uidl: UIDLComponent;

  try {
    uidl = JSON.parse(uidlContent);
  } catch (error) {
    throw new Error(`Invalid JSON in UIDL file: ${inputFile}`);
  }

  if (!uidl.name || !uidl.node) {
    throw new Error('UIDL must have "name" and "node" properties');
  }

  console.log(`[Generate] Component: ${uidl.name}`);
  console.log(`[Generate] Framework: ${framework}`);
  console.log(`[Generate] Output: ${outputDir}`);

  // Dynamically import the appropriate generator
  let generator: any;

  try {
    switch (framework) {
      case 'react':
        generator = await import('@teleporthq/teleport-component-generator-react');
        break;
      case 'react-styled':
        generator = await import('@teleporthq/teleport-component-generator-react');
        // Configure for styled-components
        break;
      case 'vue':
        generator = await import('@teleporthq/teleport-component-generator-vue');
        break;
      case 'angular':
        generator = await import('@teleporthq/teleport-component-generator-angular');
        break;
      default:
        throw new Error(`Unknown framework: ${framework}`);
    }
  } catch (error: any) {
    if (error.code === 'ERR_MODULE_NOT_FOUND' || error.code === 'MODULE_NOT_FOUND') {
      console.error(`[Generate] Error: Teleport generator not installed`);
      console.error(`[Generate] Run: pnpm add @teleporthq/teleport-component-generator-${framework}`);
      process.exit(1);
    }
    throw error;
  }

  // Create generator instance
  const createGenerator = generator.createReactComponentGenerator || generator.default?.createReactComponentGenerator;

  if (!createGenerator) {
    console.error('[Generate] Error: Could not find generator factory function');
    console.error('[Generate] The Teleport package structure may have changed');
    process.exit(1);
  }

  const componentGenerator = createGenerator();

  // Generate the component
  console.log('[Generate] Generating component...');

  try {
    const result = await componentGenerator.generateComponent(uidl);

    // Ensure output directory exists
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Write files
    for (const file of result.files) {
      const filePath = path.join(outputDir, file.name);
      fs.writeFileSync(filePath, file.content);
      console.log(`[Generate] ✅ Written: ${filePath}`);
    }

    // Write dependencies if any
    if (result.dependencies && Object.keys(result.dependencies).length > 0) {
      console.log('[Generate] Dependencies required:');
      for (const [dep, version] of Object.entries(result.dependencies)) {
        console.log(`  - ${dep}: ${version}`);
      }
    }

    console.log(`[Generate] ✅ Component generated successfully`);
  } catch (error: any) {
    console.error('[Generate] Error generating component:', error.message);

    // Provide helpful error messages
    if (error.message.includes('elementType')) {
      console.error('[Generate] Hint: UIDL node types may need adjustment for Teleport');
      console.error('[Generate] Valid types: container, text, image, link, etc.');
    }

    process.exit(1);
  }
}

function parseArgs(args: string[]): GenerateOptions {
  const options: GenerateOptions = {
    inputFile: '',
    outputDir: './generated',
    framework: 'react',
    typescript: true,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--output' && args[i + 1]) {
      options.outputDir = args[++i];
    } else if (arg === '--framework' && args[i + 1]) {
      const fw = args[++i] as Framework;
      if (['react', 'react-styled', 'vue', 'angular'].includes(fw)) {
        options.framework = fw;
      }
    } else if (arg === '--typescript') {
      options.typescript = true;
    } else if (arg === '--no-typescript') {
      options.typescript = false;
    } else if (!arg.startsWith('-') && !options.inputFile) {
      options.inputFile = arg;
    }
  }

  return options;
}

function printUsage(): void {
  console.error(`
Usage: npx tsx scripts/generate-react.ts <uidl-file> [options]

Options:
  --output <dir>       Output directory (default: ./generated)
  --framework <name>   Framework: react | react-styled | vue | angular (default: react)
  --typescript         Generate TypeScript (default: true)

Prerequisites:
  pnpm add @teleporthq/teleport-component-generator-react

Full Pipeline:
  # 1. Extract DOM to UIDL
  npx tsx scripts/extract-dom-structure.ts https://example.com --selector ".hero" --format uidl --output hero.uidl.json

  # 2. Generate React component
  npx tsx scripts/generate-react.ts hero.uidl.json --output ./src/components

Examples:
  npx tsx scripts/generate-react.ts extracted.uidl.json
  npx tsx scripts/generate-react.ts extracted.uidl.json --output ./src/components
  npx tsx scripts/generate-react.ts extracted.uidl.json --framework vue
`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    printUsage();
    process.exit(args.length === 0 ? 1 : 0);
  }

  const options = parseArgs(args);

  if (!options.inputFile) {
    console.error('[Generate] Error: UIDL input file is required');
    printUsage();
    process.exit(1);
  }

  try {
    await generateComponent(options);
    process.exit(0);
  } catch (error) {
    console.error('[Generate] Error:', error);
    process.exit(1);
  }
}

main();
