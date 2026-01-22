# Phase 3: Playwright Screenshot Infrastructure

**Status:** ✅ Complete
**Date:** January 14-20, 2026

## Overview

Phase 3 implements the screenshot capture infrastructure needed for visual validation of the migration loop. This enables Claude Code to capture dual screenshots (SFRA source + Storefront Next target) at each micro-plan iteration, providing visual proof of incremental progress.

## Key Components

### 1. Playwright + Chromium in Docker

**Challenge:** Running headless browser in Docker container requires specific configuration.

**Solution:** Extended Dockerfile to install Chromium and Playwright dependencies

```dockerfile
# Install Chromium and dependencies for Playwright
RUN apt-get update && apt-get install -y \
    chromium \
    libnss3 \
    libnspr4 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libxkbcommon0 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    libgbm1 \
    libasound2 \
    libpango-1.0-0 \
    libcairo2 \
    && rm -rf /var/lib/apt/lists/*

# Set Playwright to use system Chromium
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
ENV PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium
```

**Key Points:**
- Uses system Chromium instead of downloading browser binaries
- Includes all required shared libraries for headless operation
- Works with `--no-sandbox` flag for Docker compatibility

### 2. Screenshot Capture Script

**File:** `scripts/capture-screenshots.ts`

**Features:**
- Configurable viewport sizes
- Wait for specific selectors before capture
- Scroll to elements or positions (top/bottom)
- Crop regions for focused captures
- **SFRA-specific:** Auto-dismiss tracking consent modals
- JSON-based configuration via URL mappings

**Usage:**
```bash
tsx scripts/capture-screenshots.ts <url> <output-path> [--mapping <json>]
```

**Example:**
```bash
tsx scripts/capture-screenshots.ts \
  https://zzrf-001.dx.commercecloud.salesforce.com/s/RefArchGlobal/en_GB/home \
  screenshots/homepage.png \
  --mapping '{"viewport":{"width":1920,"height":1080},"dismiss_consent":true}'
```

### 3. URL Mappings Configuration

**File:** `url-mappings.json`

**Purpose:** Maps SFRA URLs to Storefront Next URLs with screenshot configuration per feature.

**Structure:**
```json
{
  "version": "1.0",
  "default_target_url": "http://localhost:5173",
  "mappings": [
    {
      "feature_id": "01-homepage-hero",
      "feature_name": "Homepage Hero Section",
      "sfra_url": "https://zzrf-001.dx.commercecloud.salesforce.com/...",
      "target_url": "http://localhost:5173/",
      "viewport": {"width": 1920, "height": 1080},
      "dismiss_consent": true,
      "consent_button_selector": "button.affirm"
    }
  ]
}
```

**Features Mapped:**
1. **01-homepage-hero** - Homepage hero section (full viewport)
2. **02-homepage-featured** - Featured products (scroll to selector)
3. **03-product-tile-component** - Product tiles (search results page)
4. **04-navbar** - Navigation bar (cropped to top 200px)
5. **05-footer** - Footer (scroll to bottom)

### 4. SFRA Consent Modal Handling

**Challenge:** SFRA sites show a tracking consent modal on first load that blocks content.

**Solution:** Auto-detect and dismiss consent modal before capturing screenshot.

**Implementation:**
```typescript
// Try multiple selector patterns
const consentSelectors = [
  'button.affirm',                    // SFRA default
  'button:has-text("Yes")',           // Text-based fallback
  '.modal-footer button.affirm',      // Nested modal button
  '[data-action="consent.submit"]'    // Data attribute
];

for (const selector of consentSelectors) {
  const button = await page.locator(selector).first();
  if (await button.isVisible({ timeout: 2000 })) {
    await button.click();
    await page.waitForTimeout(1000);  // Wait for modal to close
    break;
  }
}
```

**Why This Matters:**
- Without dismissal, screenshots show modal overlay instead of content
- SFRA-specific pattern: `button.affirm` is the "Yes" button class
- Configurable per feature: can disable or customize selector

### 5. Baseline Screenshots

**Directory:** `screenshots/`

**Purpose:** Reference screenshots captured during the first micro-plan execution.

**Files Created:**
- `sfra-homepage-baseline.png` (2.8 MB) - Full SFRA homepage with consent dismissed
- Captured during subplan-01-01 (first task of migration)

**Usage in Migration Loop:**
- First micro-plan captures the SFRA homepage as baseline
- Claude Code compares baseline against incremental screenshots
- Visual diff shows progress toward SFRA parity
- Stored in git for reproducibility

### 6. Testing & Validation

**Script:** `scripts/test-playwright-setup.sh`

**Purpose:** Validates Playwright installation and screenshot capture.

**Tests:**
1. Docker image has Chromium installed
2. Playwright dependencies available
3. Screenshot capture script works
4. Consent modal dismissal successful
5. Output files created with correct size
6. URL mappings JSON valid

**Run:**
```bash
./scripts/test-playwright-setup.sh
```

## Architecture Integration

### Docker Container Flow

```
┌─────────────────────────────────────────────────┐
│  Claude Code Migration Loop                     │
│  ┌───────────────────────────────────────────┐  │
│  │  Micro-Plan Execution                     │  │
│  │  1. Make code change                      │  │
│  │  2. Start dev server                      │  │
│  │  3. Capture screenshots ──────────────┐   │  │
│  │     - Load url-mappings.json          │   │  │
│  │     - Find feature SFRA + target URLs │   │  │
│  │     - Call capture-screenshots.ts     │   │  │
│  │  4. Create git commit                     │  │
│  │  5. Log progress                          │  │
│  └───────────────────────────────────────────┘  │
│                                                  │
│  ┌───────────────────────────────────────────┐  │
│  │  Playwright Screenshot Capture            │  │
│  │  (capture-screenshots.ts)                 │  │
│  │  ┌─────────────────────────────────────┐  │  │
│  │  │  Chromium Browser (headless)        │  │  │
│  │  │  - Navigate to URL                  │  │  │
│  │  │  - Dismiss consent modal (SFRA)     │  │  │
│  │  │  - Wait for selectors               │  │  │
│  │  │  - Scroll if needed                 │  │  │
│  │  │  - Capture screenshot               │  │  │
│  │  └─────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────┘  │
└─────────────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────┐
│  Host Filesystem (volume mount)                 │
│  /workspace/screenshots/                        │
│    - sfra-homepage-baseline.png                 │
│    - 20260121-224748-subplan-01-02-source.png   │
│    - 20260121-224801-subplan-01-02-target.png   │
└─────────────────────────────────────────────────┘
```

### Migration Plan Integration

The screenshot capture is referenced in `migration-main-plan.md`:

```markdown
### 5. Dev Server Startup & Screenshot Capture

Start the dev server and capture dual screenshots:

**IMPORTANT:** Use url-mappings.json to find SFRA source and target URLs.

**Commands:**
1. Load feature config: `cat url-mappings.json | jq '.mappings[] | select(.feature_id == "01-homepage-hero")'`
2. Start dev server: `cd storefront-next/packages/template-retail-rsc-app && pnpm dev`
3. Capture SFRA source: `tsx scripts/capture-screenshots.ts <sfra_url> screenshots/<timestamp>-source.png --mapping <json>`
4. Capture target: `tsx scripts/capture-screenshots.ts http://localhost:5173 screenshots/<timestamp>-target.png`
```

## Lessons Learned

### What Worked Well

1. **System Chromium approach** - Faster than downloading browser binaries, smaller Docker image
2. **JSON-based configuration** - Easy to extend with new features and screenshot options
3. **SFRA consent modal automation** - Saves manual intervention on every screenshot
4. **TypeScript capture script** - Type safety + tsx execution for rapid iteration
5. **Baseline screenshots in git** - Provides reproducible reference point

### Challenges Encountered

1. **Docker Chromium dependencies** - Required manual trial-and-error to find all required libs
2. **Consent modal timing** - Had to add explicit waits for modal to fully close
3. **Network idle timing** - SFRA pages have many async requests, needed `waitUntil: 'networkidle'`
4. **Screenshot file sizes** - Full-page captures are 2-3 MB, git repo grows quickly
5. **Viewport consistency** - Had to standardize 1920x1080 for reproducible captures

### Improvements for Future

1. **Visual diff automation** - Next phase should programmatically compare screenshots
2. **Screenshot compression** - Could use WebP or PNG optimization to reduce file sizes
3. **Parallel screenshot capture** - Could capture source + target simultaneously
4. **Error screenshots** - Capture on failure for debugging
5. **Screenshot metadata** - Embed timestamp, git hash, micro-plan ID in image

## Files Modified/Created

### New Files
- `scripts/capture-screenshots.ts` (225 lines) - Playwright screenshot capture script
- `scripts/test-playwright-setup.sh` (192 lines) - Validation test suite
- `url-mappings.json` (76 lines) - SFRA to Storefront Next URL mappings
- `screenshots/sfra-homepage-baseline.png` (2.8 MB) - Reference screenshot (captured during subplan-01-01)
- `scripts/package.json` - Added Playwright dependency
- `scripts/pnpm-lock.yaml` - Locked Playwright version

### Modified Files
- `docker/Dockerfile` - Added Chromium and dependencies
- `docker/entrypoint.sh` - Added Playwright environment variables
- `.gitignore` - Removed `screenshots/` from ignore list (track screenshots)

### Dependencies Added
```json
{
  "playwright": "^1.40.0",
  "@types/node": "^20.0.0"
}
```

## Success Metrics

**Phase 3 Goals:**
- ✅ Install Playwright + Chromium in Docker
- ✅ Create screenshot capture script with SFRA support
- ✅ Define URL mappings for 5 homepage features
- ✅ Enable baseline SFRA screenshot capture (happens in subplan-01-01)
- ✅ Validate screenshot capture in container
- ✅ Document SFRA-specific quirks (consent modal)

**Validation:**
```bash
# Test screenshot capture
./scripts/test-playwright-setup.sh

# Expected output:
# ✅ Chromium installed at /usr/bin/chromium
# ✅ Playwright dependencies available
# ✅ Screenshot captured: test-output.png (2.1 MB)
# ✅ Consent modal dismissed automatically
# ✅ URL mappings JSON valid
```

## Next Phase

**Phase 4:** First Micro-Plan Demo
- Use screenshot infrastructure for visual validation
- Execute subplan-01-01 through 01-06 with screenshot capture
- Verify dual screenshots (source + target) at each iteration
- Demonstrate incremental visual progress toward SFRA parity

---

**Completion Date:** January 20, 2026
**Time Invested:** ~3 hours (Playwright setup, consent handling, testing)
**Ready for:** Phase 4 execution
