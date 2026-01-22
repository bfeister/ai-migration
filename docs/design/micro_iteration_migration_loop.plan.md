---
name: Micro-Iteration Migration Loop with Visual Validation
overview: Execute screenshot-driven migration from SFRA to Storefront Next using tight iterative loops with frequent visual checkpoints, git commits, and progress logging. Each iteration makes one atomic change, captures dual screenshots (source + target), and validates immediately.
status: draft
created: 2026-01-20
builds_on:
  - dockerized_claude_code_migration_runner_55f331bd.plan.md (Phase 0-2 completed)
---

# Micro-Iteration Migration Loop with Visual Validation

## Overview

This plan implements a **tight iterative loop** for migrating SFRA pages to Storefront Next, where each iteration:
1. Makes ONE atomic code change
2. Captures screenshots of BOTH source (SFRA) and target (Storefront Next)
3. Commits to git with descriptive message
4. Logs progress with timestamp, changes, and screenshot paths

The loop uses a **sliding window** of recent context (last 5 iterations) to maintain focus without context bloat, and **micro-plans** that break large features into 2-5 minute tasks.

## Architecture

### Core Loop (Runs Every 2-5 Minutes)

```
┌──────────────────────────────────────────────────────────────┐
│ 1. Read migration-log.md (sliding window: last 5 entries)   │
├──────────────────────────────────────────────────────────────┤
│ 2. Read url-mappings.json for current feature               │
├──────────────────────────────────────────────────────────────┤
│ 3. Identify next micro-plan (e.g., subplan-01-03.md)        │
├──────────────────────────────────────────────────────────────┤
│ 4. Make ONE specific change (edit 1-3 files)                │
├──────────────────────────────────────────────────────────────┤
│ 5. Build check: pnpm build                                  │
├──────────────────────────────────────────────────────────────┤
│ 6. Start dev server: pnpm dev (background)                  │
├──────────────────────────────────────────────────────────────┤
│ 7. DUAL Screenshot Capture:                                 │
│    A. Source (SFRA): {sfra_url} from url-mappings.json      │
│       → screenshots/20260120-143022-subplan-01-03-source.png│
│    B. Target (Storefront Next): http://localhost:5173       │
│       → screenshots/20260120-143022-subplan-01-03-target.png│
├──────────────────────────────────────────────────────────────┤
│ 8. Git commit: "subplan-01-03: Add hero title component"    │
├──────────────────────────────────────────────────────────────┤
│ 9. Log progress: append to migration-log.md                 │
│    - Timestamp, subplan ID, changes made                    │
│    - Screenshot paths (source + target)                     │
│    - Commit hash, build status                              │
├──────────────────────────────────────────────────────────────┤
│ 10. Stop dev server, cleanup                                │
├──────────────────────────────────────────────────────────────┤
│ 11. Check: More micro-plans? → Loop back to 1               │
└──────────────────────────────────────────────────────────────┘
```

## URL Mapping Configuration

### Configuration File: `url-mappings.json`

This file defines the source (SFRA) and target (Storefront Next) URLs for each feature/page being migrated.

```json
{
  "version": "1.0",
  "default_target_url": "http://localhost:5173",
  "mappings": [
    {
      "feature_id": "01-homepage-hero",
      "feature_name": "Homepage Hero Section",
      "sfra_url": "https://zzrf-001.dx.commercecloud.salesforce.com/on/demandware.store/Sites-RefArchGlobal-Site",
      "target_url": "http://localhost:5173/",
      "viewport": {
        "width": 1920,
        "height": 1080
      },
      "wait_for_selector": ".hero-section",
      "notes": "Homepage apex URL, full viewport to capture hero"
    },
    {
      "feature_id": "02-homepage-featured",
      "feature_name": "Homepage Featured Products",
      "sfra_url": "https://zzrf-001.dx.commercecloud.salesforce.com/on/demandware.store/Sites-RefArchGlobal-Site",
      "target_url": "http://localhost:5173/",
      "viewport": {
        "width": 1920,
        "height": 1080
      },
      "scroll_to_selector": ".featured-products",
      "notes": "Same homepage URL, scroll to featured section before screenshot"
    },
    {
      "feature_id": "03-product-tile-component",
      "feature_name": "Product Tile Component",
      "sfra_url": "https://zzrf-001.dx.commercecloud.salesforce.com/on/demandware.store/Sites-RefArchGlobal-Site/en_US/Search-Show?q=shirt",
      "target_url": "http://localhost:5173/search?q=shirt",
      "viewport": {
        "width": 1920,
        "height": 1080
      },
      "wait_for_selector": ".product-tile",
      "notes": "Product search results page to show tiles"
    },
    {
      "feature_id": "04-navbar",
      "feature_name": "Navigation Bar",
      "sfra_url": "https://zzrf-001.dx.commercecloud.salesforce.com/on/demandware.store/Sites-RefArchGlobal-Site",
      "target_url": "http://localhost:5173/",
      "viewport": {
        "width": 1920,
        "height": 200
      },
      "crop": {
        "y": 0,
        "height": 200
      },
      "notes": "Crop to just navbar area"
    },
    {
      "feature_id": "05-footer",
      "feature_name": "Footer",
      "sfra_url": "https://zzrf-001.dx.commercecloud.salesforce.com/on/demandware.store/Sites-RefArchGlobal-Site",
      "target_url": "http://localhost:5173/",
      "viewport": {
        "width": 1920,
        "height": 1080
      },
      "scroll_to": "bottom",
      "notes": "Scroll to bottom to capture footer"
    }
  ]
}
```

### URL Mapping Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `feature_id` | string | Matches directory name in `sub-plans/` (e.g., "01-homepage-hero") |
| `feature_name` | string | Human-readable feature name |
| `sfra_url` | string | Full URL to SFRA page/section to capture |
| `target_url` | string | Local dev server URL (usually `http://localhost:5173/...`) |
| `viewport` | object | `{width, height}` for screenshot viewport size |
| `wait_for_selector` | string | (Optional) CSS selector to wait for before screenshot |
| `scroll_to_selector` | string | (Optional) Scroll to element before screenshot |
| `scroll_to` | string | (Optional) "bottom" to scroll to page bottom |
| `crop` | object | (Optional) `{x, y, width, height}` to crop screenshot |
| `notes` | string | Human-readable notes for context |

### Dynamic Port Detection

The `target_url` will use the actual port assigned by `pnpm dev`. The screenshot script should:
1. Parse `pnpm dev` output for the port (e.g., "Local: http://localhost:5173")
2. Replace `5173` in `target_url` with actual port if different
3. Default to `5173` if port not detected

## Micro-Plan Hierarchy

```
sub-plans/
├── 01-homepage-hero/
│   ├── subplan-01-01.md  # Create hero section container
│   ├── subplan-01-02.md  # Add hero title text
│   ├── subplan-01-03.md  # Request user intervention for theme color
│   ├── subplan-01-04.md  # Apply theme color to background
│   ├── subplan-01-05.md  # Add hero CTA button
│   └── subplan-01-06.md  # Style button with Tailwind
│
├── 02-homepage-featured/
│   ├── subplan-02-01.md  # Create featured products grid container
│   ├── subplan-02-02.md  # Add section heading
│   ├── subplan-02-03.md  # Integrate product data fetching
│   └── subplan-02-04.md  # Add product tile styling
│
├── 03-product-tile-component/
│   ├── subplan-03-01.md  # Create ProductTile.tsx skeleton
│   ├── subplan-03-02.md  # Add product image display
│   ├── subplan-03-03.md  # Add product title and price
│   └── subplan-03-04.md  # Add hover effects
│
├── 04-navbar/
│   ├── subplan-04-01.md  # Create Navbar component structure
│   ├── subplan-04-02.md  # Add logo
│   ├── subplan-04-03.md  # Add navigation links
│   └── subplan-04-04.md  # Add mobile menu toggle
│
└── 05-footer/
    ├── subplan-05-01.md  # Create Footer component structure
    ├── subplan-05-02.md  # Add footer links columns
    └── subplan-05-03.md  # Add copyright text
```

## Main Control Plan

**File: `migration-main-plan.md`**

```markdown
# Migration Control Loop - Micro-Iteration Mode

## Your Mission
Execute micro-plans sequentially, making small atomic changes with immediate dual-screenshot validation (SFRA source + Storefront Next target) after EVERY change.

## Configuration Files

### URL Mappings
Read `/workspace/url-mappings.json` to get SFRA and Storefront Next URLs for current feature.

Example mapping for homepage hero:
```json
{
  "feature_id": "01-homepage-hero",
  "sfra_url": "https://zzrf-001.dx.commercecloud.salesforce.com/on/demandware.store/Sites-RefArchGlobal-Site",
  "target_url": "http://localhost:5173/",
  "viewport": {"width": 1920, "height": 1080}
}
```

## Iteration Workflow (Repeat Until Done)

### 1. Context Loading (Sliding Window)
Read `migration-log.md` and extract the **last 5 log entries** to understand:
- What was just completed
- What worked vs what had issues
- Current momentum and patterns
- Any user intervention responses

### 2. Next Micro-Plan Selection
- Check `migration-log.md` for last completed subplan (e.g., "subplan-01-02")
- Load next sequential micro-plan: `sub-plans/01-homepage-hero/subplan-01-03.md`
- If directory complete (all subplans done), move to next directory
- Extract `feature_id` from directory name (e.g., "01-homepage-hero")

### 3. Load URL Mapping
```bash
# Read url-mappings.json and extract mapping for current feature_id
FEATURE_ID="01-homepage-hero"  # Extracted from current subplan path
MAPPING=$(jq -r ".mappings[] | select(.feature_id == \"$FEATURE_ID\")" /workspace/url-mappings.json)
SFRA_URL=$(echo "$MAPPING" | jq -r '.sfra_url')
TARGET_URL=$(echo "$MAPPING" | jq -r '.target_url')
```

### 4. Execute Micro-Plan
Follow the micro-plan's instructions precisely. Each micro-plan is ONE focused change:
- Edit 1-3 files maximum
- Make specific, testable change
- Use `mcp__intervention__RequestUserIntervention` if the plan requests user input

### 5. Validation Cycle

**Build Check:**
```bash
cd /workspace/storefront-next/packages/template-retail-rsc-app
pnpm build
```
If build fails, fix immediately (don't proceed to screenshot).

**Dev Server Startup:**
```bash
# Start dev in background, capture port
cd /workspace/storefront-next/packages/template-retail-rsc-app
pnpm dev > /tmp/dev-server.log 2>&1 &
DEV_PID=$!

# Wait for ready (poll localhost)
for i in {1..30}; do
  # Extract actual port from log
  PORT=$(grep -oP "Local:.*:(\d+)" /tmp/dev-server.log | grep -oP "\d+$" || echo "5173")
  curl -s http://localhost:$PORT > /dev/null && break
  sleep 1
done

# Update target URL with actual port
TARGET_URL_WITH_PORT=$(echo "$TARGET_URL" | sed "s/:5173/:$PORT/")
```

**Dual Screenshot Capture:**
```bash
# Generate timestamp and subplan ID
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
SUBPLAN_ID=$(basename $(dirname $PWD))/$(basename "$CURRENT_SUBPLAN" .md)

# Capture SFRA source screenshot
pnpm tsx /workspace/scripts/capture-screenshots.ts \
  "$SFRA_URL" \
  "/workspace/screenshots/${TIMESTAMP}-${SUBPLAN_ID}-source.png" \
  --mapping "$MAPPING"

# Capture Storefront Next target screenshot
pnpm tsx /workspace/scripts/capture-screenshots.ts \
  "$TARGET_URL_WITH_PORT" \
  "/workspace/screenshots/${TIMESTAMP}-${SUBPLAN_ID}-target.png" \
  --mapping "$MAPPING"

# Cleanup
kill $DEV_PID
```

### 6. Git Commit
```bash
cd /workspace/storefront-next
git add -A
git commit -m "subplan-01-03: Add hero title component

- Updated App.tsx with hero section
- Screenshots:
  - Source: screenshots/20260120-143022-subplan-01-03-source.png
  - Target: screenshots/20260120-143022-subplan-01-03-target.png
"
```

### 7. Progress Logging
Append to `/workspace/migration-log.md`:
```markdown
---
## [2026-01-20 14:30:22] subplan-01-03: Add hero title component
**Status:** ✅ Success
**Feature:** 01-homepage-hero (Homepage Hero Section)
**Changes:**
- Updated `storefront-next/packages/template-retail-rsc-app/src/App.tsx`
- Added hero section with title "Shop the Latest Collection"

**URLs:**
- SFRA Source: https://zzrf-001.dx.commercecloud.salesforce.com/on/demandware.store/Sites-RefArchGlobal-Site
- Storefront Next Target: http://localhost:5173/

**Validation:**
- Build: ✅ Passed (2.3s)
- Screenshots:
  - Source: `screenshots/20260120-143022-subplan-01-03-source.png`
  - Target: `screenshots/20260120-143022-subplan-01-03-target.png`
- Commit: `a3f5d8e`

**Notes:** None
---
```

### 8. Loop Decision
- If more micro-plans exist in current directory → Continue to next
- If current directory complete → Move to next directory (reload URL mapping)
- If all directories complete → Write final summary and exit
- If error occurs → Log error, request intervention if needed, retry or skip

## Critical Rules

1. **One Change at a Time:** Each micro-plan = ONE atomic change
2. **Always Dual Screenshot:** Capture both SFRA source and Storefront Next target
3. **Always Commit:** Frequent commits enable easy rollback
4. **Always Log:** Keep migration-log.md in sync with reality
5. **Sliding Window Only:** Don't read entire log history, just last 5 entries
6. **Dev Server Cleanup:** Always kill dev server before next iteration
7. **URL Mapping per Feature:** Load correct URLs from url-mappings.json for current feature

## Error Handling

**Build Failure:**
- Log error with full output
- Attempt to fix (read error, make correction)
- If can't fix in 1 attempt, request intervention via `mcp__intervention__RequestUserIntervention`
- Don't proceed to screenshot if build broken

**Screenshot Failure:**
- Log warning, save error screenshot if possible
- Capture what's available (if source fails, still capture target)
- Don't block on this - commit and log anyway
- User can inspect git history

**Dev Server Startup Failure:**
- Check for port conflicts
- Try alternative port if needed
- Log error if can't start after 3 attempts
- Request intervention

**Intervention Timeout:**
- If waiting for user response, pause loop
- Log current state as "⏸️ Awaiting Intervention"
- Resume from same micro-plan when response received

## First Action
Read `/workspace/migration-log.md` (create if missing with header), read `/workspace/url-mappings.json`, identify next micro-plan, and begin iteration loop.
```

## Screenshot Capture Script

**File: `scripts/capture-screenshots.ts`**

```typescript
import { chromium, Browser, Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

interface ScreenshotMapping {
  viewport?: { width: number; height: number };
  wait_for_selector?: string;
  scroll_to_selector?: string;
  scroll_to?: 'bottom' | 'top';
  crop?: { x?: number; y?: number; width?: number; height?: number };
}

interface CaptureOptions {
  url: string;
  outputPath: string;
  mapping?: ScreenshotMapping;
}

async function captureScreenshot(options: CaptureOptions): Promise<void> {
  const { url, outputPath, mapping } = options;

  console.log(`[Screenshot] Capturing: ${url}`);
  console.log(`[Screenshot] Output: ${outputPath}`);

  const browser: Browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage']
  });

  try {
    const page: Page = await browser.newPage({
      viewport: mapping?.viewport || { width: 1920, height: 1080 }
    });

    // Set reasonable timeout
    page.setDefaultTimeout(30000);

    // Navigate to URL
    await page.goto(url, { waitUntil: 'networkidle' });

    // Wait for specific selector if provided
    if (mapping?.wait_for_selector) {
      console.log(`[Screenshot] Waiting for selector: ${mapping.wait_for_selector}`);
      await page.waitForSelector(mapping.wait_for_selector, { timeout: 10000 });
    }

    // Scroll to element or position if specified
    if (mapping?.scroll_to_selector) {
      console.log(`[Screenshot] Scrolling to: ${mapping.scroll_to_selector}`);
      await page.locator(mapping.scroll_to_selector).scrollIntoViewIfNeeded();
    } else if (mapping?.scroll_to === 'bottom') {
      console.log(`[Screenshot] Scrolling to bottom`);
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(1000); // Wait for lazy-loaded content
    } else if (mapping?.scroll_to === 'top') {
      await page.evaluate(() => window.scrollTo(0, 0));
    }

    // Ensure output directory exists
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Capture screenshot
    const screenshotOptions: any = {
      path: outputPath,
      fullPage: !mapping?.crop // Full page unless cropping
    };

    if (mapping?.crop) {
      // If crop specified, use clip instead of fullPage
      screenshotOptions.fullPage = false;
      screenshotOptions.clip = {
        x: mapping.crop.x || 0,
        y: mapping.crop.y || 0,
        width: mapping.crop.width || (mapping.viewport?.width || 1920),
        height: mapping.crop.height || (mapping.viewport?.height || 1080)
      };
    }

    await page.screenshot(screenshotOptions);
    console.log(`[Screenshot] ✅ Saved: ${outputPath}`);

  } catch (error) {
    console.error(`[Screenshot] ❌ Error capturing ${url}:`, error);
    throw error;
  } finally {
    await browser.close();
  }
}

// CLI usage
async function main() {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.error('Usage: tsx capture-screenshots.ts <url> <output-path> [--mapping <json>]');
    process.exit(1);
  }

  const url = args[0];
  const outputPath = args[1];

  let mapping: ScreenshotMapping | undefined;
  const mappingIndex = args.indexOf('--mapping');
  if (mappingIndex !== -1 && args[mappingIndex + 1]) {
    try {
      mapping = JSON.parse(args[mappingIndex + 1]);
    } catch (error) {
      console.error('Failed to parse --mapping JSON:', error);
      process.exit(1);
    }
  }

  await captureScreenshot({ url, outputPath, mapping });
}

if (require.main === module) {
  main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export { captureScreenshot, CaptureOptions, ScreenshotMapping };
```

## Example Micro-Plan

**File: `sub-plans/01-homepage-hero/subplan-01-02.md`**

```markdown
# Micro-Plan 01-02: Add Hero Title Text

## Feature Context
**Feature ID:** 01-homepage-hero
**URLs (from url-mappings.json):**
- SFRA Source: https://zzrf-001.dx.commercecloud.salesforce.com/on/demandware.store/Sites-RefArchGlobal-Site
- Storefront Next Target: http://localhost:5173/

## Scope
Single change: Add the hero section title to the homepage.

## Context
Previous step (subplan-01-01) created the hero container. Now add the title text inside it.

## File to Modify
`storefront-next/packages/template-retail-rsc-app/src/pages/Home.tsx`

## Specific Change
Inside the hero container (created in 01-01), add:
```tsx
<h1 className="text-5xl font-bold text-gray-900">
  Shop the Latest Collection
</h1>
```

## Validation
After making the change:
1. Build must pass: `pnpm build`
2. Dual screenshots will capture:
   - **Source**: SFRA homepage hero title
   - **Target**: Storefront Next homepage with new title
3. Visual comparison: Title should be visible in target screenshot

## Success Criteria
- Build passes
- Screenshot shows title text visible on homepage
- No TypeScript errors
- Title text is readable and positioned correctly

## Expected Duration
~2 minutes

## Next Step
Proceed to subplan-01-03 (request user intervention for theme color)
```

## Migration Log Format

**File: `migration-log.md`**

```markdown
# Migration Progress Log

**Started:** 2026-01-20 14:00:00
**Current Status:** 🔄 In Progress
**Completed Micro-Plans:** 8 / 47
**Current Feature:** 01-homepage-hero (Homepage Hero Section)

---

## [2026-01-20 14:05:12] subplan-01-01: Create hero container
**Status:** ✅ Success
**Feature:** 01-homepage-hero (Homepage Hero Section)
**Changes:**
- Created `<section id="hero">` in App.tsx
- Added container div with responsive classes

**URLs:**
- SFRA Source: https://zzrf-001.dx.commercecloud.salesforce.com/on/demandware.store/Sites-RefArchGlobal-Site
- Storefront Next Target: http://localhost:5173/

**Validation:**
- Build: ✅ Passed (2.1s)
- Screenshots:
  - Source: `screenshots/20260120-140512-subplan-01-01-source.png`
  - Target: `screenshots/20260120-140512-subplan-01-01-target.png`
- Commit: `7f2a9d1`

**Notes:** Baseline hero structure in place. SFRA shows full hero with background image, our target has basic container.

---

## [2026-01-20 14:08:45] subplan-01-02: Add hero title text
**Status:** ✅ Success
**Feature:** 01-homepage-hero (Homepage Hero Section)
**Changes:**
- Added `<h1>` with title "Shop the Latest Collection"
- Applied Tailwind classes for typography

**URLs:**
- SFRA Source: https://zzrf-001.dx.commercecloud.salesforce.com/on/demandware.store/Sites-RefArchGlobal-Site
- Storefront Next Target: http://localhost:5173/

**Validation:**
- Build: ✅ Passed (2.0s)
- Screenshots:
  - Source: `screenshots/20260120-140845-subplan-01-02-source.png`
  - Target: `screenshots/20260120-140845-subplan-01-02-target.png`
- Commit: `b8c3e4f`

**Notes:** Title visible in screenshot, centered layout. SFRA uses different font weight.

---

## [2026-01-20 14:12:30] subplan-01-03: Request theme color
**Status:** ⏸️ Awaiting Intervention
**Feature:** 01-homepage-hero (Homepage Hero Section)
**Intervention Request:**
- Question: "What color theme for hero background?"
- Options: ["blue", "green", "purple"]
- Intervention ID: `needed-worker-1`
- Requested at: 2026-01-20 14:12:30

**Waiting for user response...**

---

## [2026-01-20 14:45:22] subplan-01-03: Apply theme color (resumed)
**Status:** ✅ Success
**Feature:** 01-homepage-hero (Homepage Hero Section)
**Changes:**
- User selected: "blue" (responded at 14:45:15)
- Applied `bg-blue-600` to hero section

**URLs:**
- SFRA Source: https://zzrf-001.dx.commercecloud.salesforce.com/on/demandware.store/Sites-RefArchGlobal-Site
- Storefront Next Target: http://localhost:5173/

**Validation:**
- Build: ✅ Passed (2.2s)
- Screenshots:
  - Source: `screenshots/20260120-144522-subplan-01-03-source.png`
  - Target: `screenshots/20260120-144522-subplan-01-03-target.png`
- Commit: `d1f8a7c`

**Notes:** Blue theme applied successfully. SFRA uses gradient background, we're using solid blue for now.

---
```

## Screenshot Directory Structure

```
screenshots/
├── 20260120-140512-subplan-01-01-source.png  # SFRA hero baseline
├── 20260120-140512-subplan-01-01-target.png  # Storefront Next hero baseline
├── 20260120-140845-subplan-01-02-source.png  # SFRA with title
├── 20260120-140845-subplan-01-02-target.png  # Storefront Next with title
├── 20260120-144522-subplan-01-03-source.png  # SFRA with theme
├── 20260120-144522-subplan-01-03-target.png  # Storefront Next with blue theme
├── 20260120-145033-subplan-01-04-source.png  # SFRA with CTA
├── 20260120-145033-subplan-01-04-target.png  # Storefront Next with CTA
...
```

## Git Commit History

```bash
git log --oneline
e9a2f5b subplan-01-04: Add CTA button
d1f8a7c subplan-01-03: Apply theme color (blue)
b8c3e4f subplan-01-02: Add hero title text
7f2a9d1 subplan-01-01: Create hero container
```

## Implementation Phases

### Phase 0-2: Foundation (COMPLETED)
- ✅ Docker sandbox with Claude Code CLI
- ✅ `--dangerously-skip-permissions` support
- ✅ MCP intervention server
- ✅ File-based intervention protocol
- ✅ Comprehensive testing (33 tests)

### Phase 3: Playwright + URL Mapping Setup (COMPLETED ✅)

**Completed:** 2026-01-20
**Actual Duration:** ~3.5 hours

**3.1: Playwright Installation** ✅
- Updated `docker/Dockerfile` to install Playwright + Chromium (Alpine packages)
- Configured environment variables for system Chromium
- Tested screenshot capture in Docker environment
- Added Playwright to `scripts/package.json`

**3.2: Screenshot Script Implementation** ✅
- Created `scripts/capture-screenshots.ts` with full URL mapping support
- Implemented viewport, scroll, wait, and crop options
- **Added automatic consent modal dismissal** (clicks "Yes" button)
- Error handling for network timeouts and missing selectors
- ES module compatible with proper main module detection

**3.3: URL Mapping Configuration** ✅
- Created `url-mappings.json` with 5 feature mappings
- Updated all SFRA URLs to correct format: `https://zzrf-001.dx.commercecloud.salesforce.com/s/RefArchGlobal/en_GB/home`
- Added `dismiss_consent: true` and `consent_button_selector` for all homepage mappings
- Documented mapping format and parameters in screenshots/README.md

**3.4: Main Control Plan** ✅
- Wrote `migration-main-plan.md` with complete micro-iteration logic
- Included URL mapping loading via jq
- Added dual screenshot capture instructions (SFRA + Storefront Next)
- Documented error handling and intervention flow

**3.5: Baseline Screenshot Captured** ✅
- Captured SFRA homepage baseline: `screenshots/baseline/sfra-homepage-baseline.png` (2.7 MB)
- Clean screenshot without consent modal overlay
- Serves as visual reference for migration

**3.6: Docker Permissions Fixed** ✅
- Created `screenshots/` directory with 777 permissions
- Resolved volume mount write permissions for non-root `node` user
- Tested and validated screenshot writes work in container

**Deliverables:**
- ✅ Updated `docker/Dockerfile` with Playwright + Chromium
- ✅ `scripts/capture-screenshots.ts` (TypeScript screenshot utility with consent handling)
- ✅ `url-mappings.json` (5 feature mappings configured)
- ✅ `migration-main-plan.md` (Main control plan with micro-iteration logic)
- ✅ `screenshots/baseline/sfra-homepage-baseline.png` (2.7 MB, clean)
- ✅ `screenshots/README.md` (Documentation)
- ✅ Test validation: Dual screenshots work, consent dismissed automatically

### Phase 4: First Micro-Plan Demo (IN PROGRESS 🔄)

**Goal:** Start the migration loop with a simple, focused task: **"Migrate homepage content (except header and footer)"**

**Status:** Ready to begin
**Estimated Duration:** 1-2 hours

#### What's Missing to Start the Loop:

**Missing Components:**
1. ❌ **Micro-Plan Files** - No `sub-plans/` directory exists yet
2. ❌ **Migration Log** - No `migration-log.md` initialized
3. ❌ **Storefront Next Dev Server** - Need to verify it runs in Docker

**What Exists:**
- ✅ `migration-main-plan.md` (the control loop logic)
- ✅ `url-mappings.json` (SFRA → Storefront Next URL mappings)
- ✅ `screenshots/baseline/sfra-homepage-baseline.png` (visual reference)
- ✅ Screenshot capture script with consent handling
- ✅ Docker environment with Playwright + Claude Code

#### Implementation Steps:

**4.1: Create Micro-Plans for Homepage Content** (30-45 min)

Create directory structure:
```
sub-plans/
└── 01-homepage-content/
    ├── subplan-01-01.md  # Analyze SFRA homepage baseline
    ├── subplan-01-02.md  # Create homepage route/component
    ├── subplan-01-03.md  # Implement hero section structure
    ├── subplan-01-04.md  # Add hero title and description
    ├── subplan-01-05.md  # Add hero CTA button
    ├── subplan-01-06.md  # Create featured products grid
    └── subplan-01-07.md  # Style to match SFRA baseline
```

**Scope for Phase 4:**
- Focus on **main content area only** (hero + featured products)
- **Exclude** header/navigation (will be separate feature)
- **Exclude** footer (will be separate feature)
- Each micro-plan = ONE small change (2-5 minutes)
- Build → screenshot → commit after each micro-plan

**4.2: Initialize Migration Log** (5 min)

Create `migration-log.md`:
```markdown
# Migration Progress Log

**Started:** 2026-01-20 16:30:00
**Status:** 🔄 In Progress
**Completed Micro-Plans:** 0 / 7
**Current Feature:** 01-homepage-content

---
```

**4.3: Test First Iteration** (30-45 min)

Run the loop:
```bash
# Start Docker container with interactive session
docker run -it --rm \
  --name claude-migration-loop \
  --env-file .env \
  -v "$(pwd):/workspace" \
  -v "/workspace/node_modules" \
  -v "/workspace/storefront-next/node_modules" \
  -v "/workspace/mcp-server/node_modules" \
  -w /workspace \
  claude-migration:latest \
  bash

# Inside container, run Claude Code with main plan
claude code run --dangerously-skip-permissions < migration-main-plan.md
```

**Expected Behavior:**
1. Claude reads `migration-log.md` (empty, starts from beginning)
2. Claude reads `url-mappings.json` (loads homepage URLs)
3. Claude finds first micro-plan: `sub-plans/01-homepage-content/subplan-01-01.md`
4. Claude executes micro-plan (analyzes SFRA baseline screenshot)
5. Claude makes code changes in `storefront-next/`
6. Claude runs `pnpm build`
7. Claude starts dev server, captures dual screenshots
8. Claude commits to git
9. Claude logs to `migration-log.md`
10. Claude loops back to step 1, loads next micro-plan

**4.4: Verify Loop Works** (15-30 min)

Check that:
- ✅ Micro-plans are executed in sequence
- ✅ Build succeeds after each change
- ✅ Screenshots captured (source + target)
- ✅ Git commits created with proper messages
- ✅ `migration-log.md` updated with each iteration
- ✅ Sliding window context works (last 5 log entries)

**4.5: Debug and Refine** (if needed)

Common issues to watch for:
- Dev server port conflicts
- Screenshot timing (page not fully loaded)
- Build failures (TypeScript errors)
- Git commit formatting
- Log entry formatting

**Deliverables:**
- ❌ `sub-plans/01-homepage-content/` with 5-7 micro-plans (NOT CREATED YET)
- ❌ `migration-log.md` initialized and populated (NOT CREATED YET)
- ❌ Dual screenshots showing homepage progress (NOT CAPTURED YET)
- ❌ Git commits in storefront-next (NOT CREATED YET)
- ❌ Proof of concept: First iteration completes successfully (NOT TESTED YET)

**Next Immediate Action:**
Create the micro-plan files in `sub-plans/01-homepage-content/` to enable loop startup.

### Phase 5: Scale to Multiple Features (2-3 hours)

**5.1: Create Remaining Micro-Plans** (1-2 hours)
- Break down features 02-05 into micro-plans
- Homepage featured products (4-5 micro-plans)
- Product tile component (4-5 micro-plans)
- Navbar (4-5 micro-plans)
- Footer (3-4 micro-plans)

**5.2: Test Multi-Feature Execution** (1 hour)
- Run loop across multiple feature directories
- Verify URL mapping switches correctly between features
- Confirm sliding window context maintains continuity
- Test error recovery (build failure, screenshot failure)

**Deliverables:**
- ✅ Complete `sub-plans/` directory structure (25-30 micro-plans total)
- ✅ All URL mappings in `url-mappings.json`
- ✅ End-to-end test: Execute 10+ iterations across 2+ features
- ✅ Documentation of learnings and edge cases

### Phase 6: CI Integration (Optional - 2 hours)

**6.1: GitHub Actions Workflow** (1 hour)
- Create `.github/workflows/migration.yml`
- Configure Docker execution in CI
- Set `ANTHROPIC_API_KEY` from GitHub Secrets
- Upload screenshots and logs as artifacts

**6.2: Test CI Execution** (1 hour)
- Run workflow on GitHub Actions
- Verify artifacts uploaded correctly
- Test intervention flow in CI (should pause, wait for manual response)
- Document CI usage and limitations

**Deliverables:**
- ✅ `.github/workflows/migration.yml`
- ✅ Successful CI run with artifacts
- ✅ Documentation: How to use in CI context

## Key Design Decisions

1. **Dual Screenshot Validation:** Capture both SFRA source and Storefront Next target at each iteration to create visual proof of progress and enable side-by-side comparison.

2. **URL Mapping per Feature:** Each feature (homepage hero, product tile, navbar) has its own URL mapping configuration for flexible screenshot capture (different pages, scroll positions, crops).

3. **Micro-Iterations (2-5 minutes):** Break large features into tiny atomic changes with immediate validation. This creates a granular audit trail and enables precise rollback.

4. **Sliding Window Context:** Load only last 5 log entries to prevent context bloat while maintaining awareness of recent changes and patterns.

5. **Timestamp + Subplan ID Naming:** Screenshots and logs use consistent naming: `{timestamp}-{subplan-id}-{source|target}.png` for easy correlation.

6. **File-Based Everything:** Configuration (url-mappings.json), logs (migration-log.md), screenshots (files), and interventions (JSON files) all use filesystem for simplicity and debuggability.

7. **Local Dev Server + External SFRA:** No need to run SFRA locally. Capture source screenshots from live public SFRA demo site while developing against local Storefront Next.

8. **Playwright for Screenshots:** Use Playwright for reliable, configurable screenshot capture with viewport control, scrolling, waiting for selectors, and cropping.

9. **Git Commit per Iteration:** Every micro-plan execution creates a git commit, enabling precise rollback to any point in the migration.

10. **MCP Intervention Integration:** User decisions (theme colors, layout choices) flow through existing MCP intervention server, pausing loop until response provided.

## Testing Strategy

### Unit Tests (Existing - Phase 0)
- 33 automated Bats tests for intervention protocol
- Script validation and Docker configuration
- Run with: `./scripts/test-runner.sh`

### Screenshot Script Tests (New - Phase 3)
- Test URL mapping parsing
- Test viewport configuration
- Test scroll and wait logic
- Test error handling (invalid URL, timeout)
- Test dual capture (SFRA + local dev server)

### Integration Tests (New - Phase 4)
- Execute 5+ micro-plans in sequence
- Verify sliding window context loads correctly
- Test intervention flow (request + response + resume)
- Validate dual screenshots captured at each iteration
- Confirm git commits and log entries match

### End-to-End Tests (New - Phase 5)
- Complete one full feature (homepage hero)
- Verify final screenshots match expectations
- Test build validation catches errors
- Test error recovery (retry on failure)

## Dependencies

- Node.js 24+ (matches project requirement)
- pnpm 10.26.1+ (matches project requirement)
- Docker & Docker Compose
- Claude Code CLI (installable via npm)
- Playwright (new dependency)
- Git (for version control)
- jq (for JSON parsing in bash scripts)

## Future Enhancements

1. **Visual Diff Tool:** Automated comparison of source vs target screenshots with highlighted differences
2. **Screenshot Annotations:** Overlay markup on screenshots (arrows, labels) to highlight specific changes
3. **Multi-Viewport Testing:** Capture mobile, tablet, desktop screenshots at each iteration
4. **Video Recording:** Record Playwright sessions as video for debugging
5. **AI-Powered Screenshot Analysis:** Use vision model to compare screenshots and suggest improvements
6. **Parallel Feature Execution:** Multiple Docker containers working on different features simultaneously (builds on Phase 0-2 multi-worker foundation)
7. **Web Dashboard:** Visual timeline of screenshots, git commits, and log entries

## Success Criteria

**Phase 3 Success:**
- Dual screenshots captured successfully (SFRA + Storefront Next)
- URL mapping configuration works for homepage
- Main control plan executes at least one micro-plan
- Logs and git commits show proper structure

**Phase 4 Success:**
- Complete homepage hero migration (5-6 iterations)
- All dual screenshots show incremental progress
- Sliding window context maintains continuity
- Intervention flow works (user can respond to questions)
- Final hero section matches SFRA design

**Phase 5 Success:**
- 25-30 micro-plans created across 5 features
- Loop executes across multiple features correctly
- URL mappings switch appropriately per feature
- Visual timeline of screenshots shows clear progression
- All git commits have meaningful messages

**Overall Project Success:**
- Storefront Next homepage matches SFRA design
- All components migrated with visual proof (screenshots)
- Complete audit trail (logs, screenshots, git commits)
- System can be extended to migrate additional pages
- Documentation enables others to use the system

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| SFRA site goes down | Cache source screenshots locally, use cached versions if live site unavailable |
| Dev server port conflicts | Detect actual port from `pnpm dev` output, update URL dynamically |
| Screenshot timing issues | Use Playwright's `waitForSelector` and `networkidle` options |
| Context window bloat | Hard limit to last 5 log entries (sliding window) |
| Build failures breaking loop | Error handling with retry logic, intervention request if can't auto-fix |
| Network timeouts (SFRA) | Increase Playwright timeout, retry up to 3 times before failing |
| Disk space (many screenshots) | Monitor disk usage, implement screenshot cleanup for old iterations |

## Conclusion

This plan builds directly on the completed Phase 0-2 foundation to create a screenshot-driven, micro-iteration migration system. The key innovation is **dual screenshot validation** at every step, creating a visual time-lapse of the migration from SFRA to Storefront Next.

By breaking features into 2-5 minute micro-plans and capturing both source and target at each iteration, we get:
- **Visual proof of progress** (side-by-side comparisons)
- **Granular audit trail** (screenshots, logs, git commits)
- **Easy debugging** (pinpoint exact change that broke something)
- **Natural resumability** (sliding window context + file-based state)

The system is practical, testable, and extensible—perfect for validating the migration approach before scaling to additional pages.

**Estimated Time to Working Prototype:** 5-7 hours across Phase 3-4.

**Next Action:** Implement Phase 3 (Playwright + URL Mapping Setup).
