#!/usr/bin/env tsx
/*
 * Screenshot Capture Script with URL Mapping Support
 *
 * Captures screenshots using Playwright with configurable options:
 * - Viewport size
 * - Wait for selectors
 * - Scroll to elements or positions
 * - Crop regions
 *
 * Usage:
 *   tsx scripts/capture-screenshots.ts <url> <output-path> [--mapping <json>]
 *
 * Examples:
 *   # Basic screenshot
 *   tsx scripts/capture-screenshots.ts https://example.com screenshots/test.png
 *
 *   # With URL mapping configuration
 *   tsx scripts/capture-screenshots.ts https://example.com screenshots/test.png --mapping '{"viewport":{"width":1920,"height":1080}}'
 */

import { chromium, Browser, Page } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';

function getSystemChromePath(): string | undefined {
  // Check environment variable first
  if (process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH) {
    return process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
  }

  // macOS paths
  const macPaths = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
  ];

  // Linux paths
  const linuxPaths = [
    '/usr/bin/google-chrome',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
  ];

  const paths = process.platform === 'darwin' ? macPaths : linuxPaths;

  for (const p of paths) {
    try {
      if (fs.existsSync(p)) {
        return p;
      }
    } catch {
      // Continue checking
    }
  }

  return undefined;
}

/**
 * Attempt to dismiss consent/cookie modal using the selector from url-mappings.json
 */
async function dismissConsentModals(page: Page, selector: string): Promise<void> {
  try {
    const button = await page.locator(selector).first();
    if (await button.isVisible({ timeout: 2000 })) {
      await button.click();
      console.log(`[Screenshot] Dismissed consent modal with selector: ${selector}`);
      await page.waitForTimeout(500);
    } else {
      console.log(`[Screenshot] Consent selector not visible: ${selector}`);
    }
  } catch (err: any) {
    console.log(`[Screenshot] Failed to dismiss consent modal with selector "${selector}": ${err.message}`);
  }
}

interface ScreenshotMapping {
  viewport?: { width: number; height: number };
  wait_for_selector?: string;
  scroll_to_selector?: string;
  scroll_to?: 'bottom' | 'top';
  crop?: { x?: number; y?: number; width?: number; height?: number };
  element_selector?: string; // Capture only the matched element (uses element.screenshot())
  dismiss_consent?: boolean; // Auto-dismiss tracking consent modals
  consent_button_selector?: string; // Custom selector for consent button
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

  // Determine browser executable path (system Chrome or Playwright bundled)
  const executablePath = getSystemChromePath();

  if (executablePath) {
    console.log(`[Screenshot] Using browser: ${executablePath}`);
  } else {
    console.log(`[Screenshot] Using Playwright bundled browser`);
  }

  const browser: Browser = await chromium.launch({
    headless: true,
    executablePath,
    args: [
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--disable-blink-features=AutomationControlled',
    ],
  });

  try {
    const context = await browser.newContext({
      viewport: mapping?.viewport || { width: 1920, height: 1080 },
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      locale: 'en-US',
      timezoneId: 'America/New_York',
      extraHTTPHeaders: {
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });

    const page: Page = await context.newPage();

    // Remove navigator.webdriver automation flag
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
    });

    page.setDefaultTimeout(30000);

    // Navigate to URL — use domcontentloaded instead of networkidle to avoid
    // timeouts on sites with long-running analytics/tracking connections
    console.log(`[Screenshot] Navigating to URL...`);
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    console.log(`[Screenshot] Page loaded`);

    // Dismiss consent modal if requested
    if (mapping?.dismiss_consent) {
      if (mapping.consent_button_selector) {
        console.log(`[Screenshot] Attempting to dismiss consent modal...`);
        await dismissConsentModals(page, mapping.consent_button_selector);
      } else {
        console.log(`[Screenshot] dismiss_consent is true but no consent_button_selector provided — skipping`);
      }
    }

    // Wait for specific selector if provided
    if (mapping?.wait_for_selector) {
      console.log(`[Screenshot] Waiting for selector: ${mapping.wait_for_selector}`);
      try {
        await page.waitForSelector(mapping.wait_for_selector, { timeout: 10000 });
      } catch (error) {
        console.warn(`[Screenshot] ⚠️  Selector not found, continuing: ${mapping.wait_for_selector}`);
      }
    }

    // Scroll to element or position if specified
    if (mapping?.scroll_to_selector) {
      console.log(`[Screenshot] Scrolling to: ${mapping.scroll_to_selector}`);
      try {
        await page.locator(mapping.scroll_to_selector).scrollIntoViewIfNeeded();
      } catch (error) {
        console.warn(`[Screenshot] ⚠️  Could not scroll to selector: ${mapping.scroll_to_selector}`);
      }
    } else if (mapping?.scroll_to === 'bottom') {
      console.log(`[Screenshot] Scrolling to bottom`);
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(1000); // Wait for lazy-loaded content
    } else if (mapping?.scroll_to === 'top') {
      console.log(`[Screenshot] Scrolling to top`);
      await page.evaluate(() => window.scrollTo(0, 0));
    }

    // Ensure output directory exists
    const dir = path.dirname(outputPath);
    try {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        console.log(`[Screenshot] Created directory: ${dir}`);
      }
    } catch (error: any) {
      // Ignore EEXIST errors (directory already exists)
      if (error.code !== 'EEXIST') {
        console.warn(`[Screenshot] ⚠️  Could not create directory ${dir}:`, error.message);
        // Try to continue anyway - maybe the directory exists
      }
    }

    // Capture screenshot — prefer element-level capture when a selector is provided
    if (mapping?.element_selector) {
      console.log(`[Screenshot] Element capture with selector: ${mapping.element_selector}`);
      try {
        const element = page.locator(mapping.element_selector).first();
        await element.waitFor({ state: 'visible', timeout: 10000 });
        await element.screenshot({ path: outputPath });
        console.log(`[Screenshot] Saved (element): ${outputPath}`);
      } catch (err: any) {
        console.warn(`[Screenshot] Element selector "${mapping.element_selector}" not found, falling back to full-page: ${err.message}`);
        await page.screenshot({ path: outputPath, fullPage: true });
        console.log(`[Screenshot] Saved (full-page fallback): ${outputPath}`);
      }
    } else {
      const screenshotOptions: any = {
        path: outputPath,
        fullPage: !mapping?.crop
      };

      if (mapping?.crop) {
        screenshotOptions.fullPage = false;
        screenshotOptions.clip = {
          x: mapping.crop.x || 0,
          y: mapping.crop.y || 0,
          width: mapping.crop.width || (mapping.viewport?.width || 1920),
          height: mapping.crop.height || (mapping.viewport?.height || 1080)
        };
        console.log(`[Screenshot] Cropping to region:`, screenshotOptions.clip);
      }

      await page.screenshot(screenshotOptions);
      console.log(`[Screenshot] Saved: ${outputPath}`);
    }

    // Log file size for verification
    const stats = fs.statSync(outputPath);
    const fileSizeKB = (stats.size / 1024).toFixed(2);
    console.log(`[Screenshot] File size: ${fileSizeKB} KB`);

  } catch (error) {
    console.error(`[Screenshot] ❌ Error capturing ${url}:`, error);
    throw error;
  } finally {
    await browser.close();
  }
}

// ---------------------------------------------------------------------------
// CLI helpers
// ---------------------------------------------------------------------------

function getNamedArg(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : undefined;
}

interface PageConfig {
  page_id: string;
  sfra_url?: string;
  target_url?: string;
  viewport?: { width: number; height: number };
  source_config?: { dismiss_consent?: boolean; consent_button_selector?: string };
  [key: string]: unknown;
}

/**
 * Load page config from url-mappings.json by page_id.
 * Returns the matching page entry or exits with an error.
 */
function loadPageConfig(pageId: string): PageConfig {
  const mappingsPath = path.join(
    process.env.WORKSPACE_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
    'url-mappings.json',
  );
  if (!fs.existsSync(mappingsPath)) {
    console.error(`[Screenshot] url-mappings.json not found at: ${mappingsPath}`);
    process.exit(1);
  }
  const data = JSON.parse(fs.readFileSync(mappingsPath, 'utf-8'));
  const page = data.pages?.find((p: any) => p.page_id === pageId);
  if (!page) {
    const ids = (data.pages || []).map((p: any) => p.page_id).join(', ');
    console.error(`[Screenshot] Unknown page_id "${pageId}". Available: ${ids}`);
    process.exit(1);
  }
  return page;
}

function printUsage(): never {
  console.error('Usage:');
  console.error('  tsx capture-screenshots.ts --page <page_id> --type source|target [--selector <css>] [--output <path>]');
  console.error('  tsx capture-screenshots.ts <url> <output-path> [--mapping <json>]');
  console.error('');
  console.error('Simplified (reads url-mappings.json):');
  console.error('  tsx capture-screenshots.ts --page plp --type source');
  console.error('  tsx capture-screenshots.ts --page plp --type target --selector "#product-grid"');
  console.error('  tsx capture-screenshots.ts --page plp --type target --output screenshots/06-plp-product-grid-target.png');
  console.error('');
  console.error('Legacy (inline JSON):');
  console.error('  tsx capture-screenshots.ts https://example.com screenshots/test.png');
  process.exit(1);
}

function resolveOptions(args: string[]): CaptureOptions {
  const pageId = getNamedArg(args, '--page');

  // -----------------------------------------------------------------------
  // Mode 1: --page <page_id> --type source|target  (simplified, no JSON)
  // -----------------------------------------------------------------------
  if (pageId) {
    const captureType = getNamedArg(args, '--type') as 'source' | 'target' | undefined;
    if (!captureType || !['source', 'target'].includes(captureType)) {
      printUsage();
    }

    const page = loadPageConfig(pageId);
    const url = captureType === 'source' ? page.sfra_url : page.target_url;
    if (!url) {
      console.error(`[Screenshot] No ${captureType === 'source' ? 'sfra_url' : 'target_url'} defined for page "${pageId}"`);
      process.exit(1);
    }

    const outputPath = getNamedArg(args, '--output') || `screenshots/${pageId}-${captureType}.png`;
    const selectorArg = getNamedArg(args, '--selector');

    const mapping: ScreenshotMapping = {
      viewport: page.viewport || { width: 1920, height: 1080 },
    };

    if (captureType === 'source' && page.source_config) {
      if (page.source_config.dismiss_consent) {
        mapping.dismiss_consent = true;
        if (page.source_config.consent_button_selector) {
          mapping.consent_button_selector = page.source_config.consent_button_selector;
        }
      }
    }

    if (selectorArg) {
      mapping.element_selector = selectorArg;
    }

    console.log(`[Screenshot] Page mode: page=${pageId} type=${captureType}`);
    return { url, outputPath, mapping };
  }

  // -----------------------------------------------------------------------
  // Mode 2: Positional args (legacy) — <url> <output-path> [--mapping <json>]
  // -----------------------------------------------------------------------
  if (args.length < 2 || args[0].startsWith('--')) {
    printUsage();
  }

  const url = args[0];
  const outputPath = args[1];

  let mapping: ScreenshotMapping | undefined;
  const mappingIndex = args.indexOf('--mapping');
  if (mappingIndex !== -1 && args[mappingIndex + 1]) {
    try {
      mapping = JSON.parse(args[mappingIndex + 1]);
      console.log('[Screenshot] Using mapping configuration:', JSON.stringify(mapping, null, 2));
    } catch (error) {
      console.error('[Screenshot] Failed to parse --mapping JSON:', error);
      process.exit(1);
    }
  }

  return { url, outputPath, mapping };
}

// CLI usage
async function main() {
  const options = resolveOptions(process.argv.slice(2));

  try {
    await captureScreenshot(options);
    process.exit(0);
  } catch (error) {
    console.error('[Screenshot] Fatal error:', error);
    process.exit(1);
  }
}

// Export for use as module
export { captureScreenshot, CaptureOptions, ScreenshotMapping };

// Run if executed directly (ES module syntax)
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const isMainModule = process.argv[1] === __filename;

if (isMainModule) {
  main();
}
