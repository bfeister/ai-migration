# ISML Migration Scripts - Implementation Plan

This document outlines the Node.js scripts needed to compile and execute the ISML migration Handlebars templates.

## Overview

We need to create a series of simple, single-purpose Node.js scripts mirroring the pwa-upgrade pattern but adapted for ISML → React 19 migrations.

## Script Architecture

```
test-storefront/
├── scripts/isml-migration/           # New scripts directory
│   ├── index.js                      # Main entry point / orchestrator
│   ├── analyze-templates.js          # Discover all ISML templates
│   ├── generate-plan.js              # Generate sub-plans for a feature
│   ├── generate-prompt.js            # Generate execution prompt for a sub-plan
│   ├── migrate-subplan.js            # Execute a single sub-plan migration
│   ├── generate-progress.js          # Aggregate migration progress
│   ├── compare-screenshots.js        # Visual comparison tool
│   ├── agent.js                      # Core LLM integration functions
│   ├── utils.js                      # Shared utilities
│   ├── llm-command.js                # LLM command configuration
│   └── package.json                  # Script dependencies
├── prompts/isml-migration/           # ✅ Already created
│   ├── isml-analysis.hbs
│   ├── subplan-generation.hbs
│   ├── subplan-instruction.hbs
│   ├── visual-comparison.hbs
│   └── isml-cookbook.md
└── output/isml-migration/            # Generated artifacts
    ├── template-list.json
    ├── feature-{id}/
    │   ├── subplan-01.md
    │   ├── subplan-02.md
    │   └── ...
    └── progress.json
```

---

## Script Specifications

### 1. `llm-command.js` - LLM Command Configuration

**Purpose**: Centralized LLM command constants

```javascript
// scripts/isml-migration/llm-command.js
export const CLAUDE_COMMAND = 'claude -p --permission-mode acceptEdits';
export const CURSOR_COMMAND = 'cursor-agent -p --force';

export function getLLMCommand(type = 'claude') {
  return type === 'cursor' ? CURSOR_COMMAND : CLAUDE_COMMAND;
}
```

**Dependencies**: None
**Effort**: Trivial (copy from pwa-upgrade)

---

### 2. `utils.js` - Shared Utilities

**Purpose**: Template compilation, file operations, loading animation

**Key Functions**:
```javascript
// Template compilation
export function createPromptFile(templateFile, context, outputFileName, baseDir = '.')

// JSON parsing with markdown cleanup
export function parseTemplateList(filePath)
export function parseFeatureList(filePath)

// Filename sanitization
export function sanitizeFilename(str)  // "homepage/hero" → "homepage-hero"

// Loading animation wrapper
export async function withLoadingAnimation(message, asyncFn)

// Screenshot capture
export async function takeScreenshot(url, outputPath, options = {})
```

**Dependencies**: `handlebars`, `playwright`, `fs`, `path`
**Effort**: Medium (adapt from pwa-upgrade/utils.js)

---

### 3. `analyze-templates.js` - Template Discovery

**Purpose**: Scan SFRA codebase and discover all migratable ISML templates

**Usage**:
```bash
node scripts/isml-migration/analyze-templates.js <sfra-source-dir> [--force]
```

**Flow**:
1. Compile `isml-analysis.hbs` with `{ sourceDir }`
2. Save to `output/isml-migration/template-analysis-prompt.md`
3. Pipe to Claude CLI
4. Extract JSON array from output
5. Save to `output/isml-migration/template-list.json`

**Output Schema** (`template-list.json`):
```json
[
  {
    "id": "homepage-hero",
    "name": "Homepage Hero Banner",
    "type": "component",
    "priority": 1,
    "templates": [...],
    "scripts": [...],
    "controllers": [...],
    "functionalities": [...],
    "migrationComplexity": "medium",
    "dependencies": []
  }
]
```

**Dependencies**: `utils.js`, `llm-command.js`
**Effort**: Medium

---

### 4. `generate-plan.js` - Sub-Plan Generation

**Purpose**: Generate atomic sub-plans for a specific feature

**Usage**:
```bash
node scripts/isml-migration/generate-plan.js <feature-id> <sfra-dir> <react-dir> [--force]
```

**Flow**:
1. Load `template-list.json`
2. Find feature by ID
3. Compile `subplan-generation.hbs` with feature context
4. Pipe to Claude CLI
5. Parse response and split into individual sub-plan files
6. Save to `output/isml-migration/feature-{id}/subplan-XX.md`

**Output**:
```
output/isml-migration/homepage-hero/
├── subplan-01.md   # Create component structure
├── subplan-02.md   # Migrate hero image carousel
├── subplan-03.md   # Convert Bootstrap grid
├── subplan-04.md   # Remove jQuery handlers
└── subplan-05.md   # Add TypeScript types
```

**Dependencies**: `utils.js`, `llm-command.js`
**Effort**: Medium-High (parsing multiple sub-plans from output)

---

### 5. `generate-prompt.js` - Execution Prompt Generation

**Purpose**: Generate the execution prompt for a specific sub-plan

**Usage**:
```bash
node scripts/isml-migration/generate-prompt.js <feature-id> <subplan-number> <sfra-dir> <react-dir>
```

**Flow**:
1. Load sub-plan from `output/isml-migration/{feature-id}/subplan-{number}.md`
2. Load cookbook from `prompts/isml-migration/isml-cookbook.md`
3. Compile `subplan-instruction.hbs` with context
4. Save to `output/isml-migration/{feature-id}/instruction-{number}.md`

**Output**:
```
output/isml-migration/homepage-hero/instruction-01.md
```

**Dependencies**: `utils.js`
**Effort**: Low

---

### 6. `migrate-subplan.js` - Execute Single Sub-Plan

**Purpose**: Execute a migration sub-plan via Claude

**Usage**:
```bash
node scripts/isml-migration/migrate-subplan.js <feature-id> <subplan-number> [--llm claude|cursor]
```

**Flow**:
1. Load instruction file
2. Pipe to Claude CLI
3. Save output to `output/isml-migration/{feature-id}/result-{number}.out`
4. Parse result for functionality status table
5. Update progress.json

**Output**:
```
output/isml-migration/homepage-hero/result-01.out
```

**Dependencies**: `utils.js`, `llm-command.js`, `generate-progress.js`
**Effort**: Medium

---

### 7. `generate-progress.js` - Progress Aggregation

**Purpose**: Scan output files and generate aggregated progress report

**Usage**:
```bash
node scripts/isml-migration/generate-progress.js
```

**Flow**:
1. Scan all `output/isml-migration/*/result-*.out` files
2. Parse functionality status tables from each
3. Aggregate into `progress.json`

**Output Schema** (`progress.json`):
```json
{
  "lastUpdated": "2024-01-15T10:30:00Z",
  "features": [
    {
      "id": "homepage-hero",
      "name": "Homepage Hero Banner",
      "totalSubplans": 5,
      "completedSubplans": 2,
      "percentage": 40,
      "subplans": [
        {
          "id": "subplan-01",
          "title": "Create component structure",
          "status": "completed",
          "functionalities": [
            { "name": "Component files", "percentage": 100, "status": "✅" }
          ]
        }
      ]
    }
  ],
  "overall": {
    "totalFeatures": 10,
    "completedFeatures": 1,
    "percentage": 10
  }
}
```

**Dependencies**: `utils.js`
**Effort**: Medium

---

### 8. `compare-screenshots.js` - Visual Comparison

**Purpose**: Capture and compare screenshots between SFRA and React

**Usage**:
```bash
node scripts/isml-migration/compare-screenshots.js <sfra-url> <react-url> <feature-id> <subplan-number>
```

**Flow**:
1. Capture screenshot of SFRA URL
2. Capture screenshot of React URL
3. Compile `visual-comparison.hbs` with both images
4. Optionally send to Claude for visual analysis
5. Save comparison report

**Output**:
```
output/isml-migration/homepage-hero/
├── screenshot-sfra-01.png
├── screenshot-react-01.png
└── comparison-01.md
```

**Dependencies**: `utils.js`, `playwright`
**Effort**: Medium

---

### 9. `agent.js` - Core LLM Functions

**Purpose**: High-level LLM integration functions called by other scripts

**Key Functions**:
```javascript
// Analyze all ISML templates in source directory
export async function analyzeISMLTemplates(sourceDir, force = false)

// Generate sub-plans for a feature
export async function generateFeatureSubplans(featureId, sourceDir, targetDir, force = false)

// Execute a single sub-plan
export async function executeSubplan(featureId, subplanNumber, llmType = 'claude')

// Revise a sub-plan based on feedback
export async function reviseSubplan(featureId, subplanNumber, revisionInstructions)

// Get next pending sub-plan
export function getNextSubplan(featureId = null)
```

**Dependencies**: `utils.js`, `llm-command.js`
**Effort**: High (main integration logic)

---

### 10. `index.js` - Main Entry Point

**Purpose**: CLI orchestrator with interactive mode

**Usage**:
```bash
# Full interactive mode
node scripts/isml-migration/index.js

# With options
node scripts/isml-migration/index.js \
  --source /path/to/sfra \
  --target /path/to/react \
  --sfra-url http://localhost:3000 \
  --react-url http://localhost:5173
```

**Features**:
- Interactive prompts for missing options
- Menu-driven workflow selection
- Orchestrates other scripts

**Dependencies**: `commander`, `prompts`, all other scripts
**Effort**: Medium

---

## Implementation Order

### Phase 1: Foundation (Day 1)
1. ✅ `llm-command.js` - Copy and adapt
2. ✅ `utils.js` - Copy and adapt core functions

### Phase 2: Discovery (Day 1-2)
3. `analyze-templates.js` - Template discovery script

### Phase 3: Planning (Day 2)
4. `generate-plan.js` - Sub-plan generation
5. `generate-prompt.js` - Instruction generation

### Phase 4: Execution (Day 3)
6. `migrate-subplan.js` - Execute migrations
7. `generate-progress.js` - Progress tracking

### Phase 5: Verification (Day 3-4)
8. `compare-screenshots.js` - Visual comparison

### Phase 6: Integration (Day 4)
9. `agent.js` - High-level functions
10. `index.js` - CLI orchestrator

---

## Dependencies (package.json)

```json
{
  "name": "isml-migration-scripts",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "analyze": "node analyze-templates.js",
    "plan": "node generate-plan.js",
    "prompt": "node generate-prompt.js",
    "migrate": "node migrate-subplan.js",
    "progress": "node generate-progress.js",
    "compare": "node compare-screenshots.js",
    "start": "node index.js"
  },
  "dependencies": {
    "commander": "^14.0.0",
    "handlebars": "^4.7.8",
    "playwright": "^1.57.0",
    "prompts": "^2.4.2"
  }
}
```

---

## Key Differences from pwa-upgrade Scripts

| Aspect | pwa-upgrade | isml-migration |
|--------|-------------|----------------|
| Discovery unit | Route | ISML Template/Feature |
| Planning output | Single plan file | Multiple sub-plan files |
| Instruction input | Route + plan | Sub-plan + cookbook |
| Progress tracking | Per-route | Per-sub-plan |
| Visual comparison | Side-by-side | With AI analysis |

---

## Example Workflow

```bash
# 1. Initial setup
cd /Users/bfeister/dev/test-storefront/scripts/isml-migration
pnpm install

# 2. Discover all ISML templates
node analyze-templates.js /path/to/sfra

# 3. Generate sub-plans for homepage-hero
node generate-plan.js homepage-hero /path/to/sfra /path/to/react

# 4. Generate execution prompt for first sub-plan
node generate-prompt.js homepage-hero 01 /path/to/sfra /path/to/react

# 5. Execute the sub-plan
node migrate-subplan.js homepage-hero 01

# 6. Compare screenshots
node compare-screenshots.js http://localhost:3000 http://localhost:5173 homepage-hero 01

# 7. Check progress
node generate-progress.js
cat output/isml-migration/progress.json

# Or use the orchestrator
node index.js --source /path/to/sfra --target /path/to/react
```

---

## Next Steps

1. **Approve this plan** - Review the script specifications
2. **Create directory structure** - Set up `scripts/isml-migration/`
3. **Implement Phase 1** - Foundation scripts
4. **Test with real SFRA codebase** - Validate template discovery
5. **Iterate** - Refine based on actual usage
