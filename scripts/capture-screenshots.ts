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

interface ScreenshotMapping {
  viewport?: { width: number; height: number };
  wait_for_selector?: string;
  scroll_to_selector?: string;
  scroll_to?: 'bottom' | 'top';
  crop?: { x?: number; y?: number; width?: number; height?: number };
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

  // Determine browser executable path (system Chromium in Docker vs local Chromium)
  const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined;

  const browser: Browser = await chromium.launch({
    headless: true,
    executablePath,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-setuid-sandbox']
  });

  try {
    const page: Page = await browser.newPage({
      viewport: mapping?.viewport || { width: 1920, height: 1080 }
    });

    // Set reasonable timeout
    page.setDefaultTimeout(30000);

    // Navigate to URL
    console.log(`[Screenshot] Navigating to URL...`);
    await page.goto(url, { waitUntil: 'networkidle' });
    console.log(`[Screenshot] Page loaded`);

    // Dismiss consent modal if requested (default: true for SFRA sites)
    const shouldDismissConsent = mapping?.dismiss_consent !== false; // Default to true
    if (shouldDismissConsent) {
      console.log(`[Screenshot] Checking for consent modal...`);

      // Try custom selector first, then common SFRA consent button patterns
      const consentSelectors = [
        mapping?.consent_button_selector,
        'button.affirm', // SFRA consent "Yes" button
        'button:has-text("Yes")',
        '.modal-footer button.affirm',
        '[data-action="consent.submit"]'
      ].filter(Boolean) as string[];

      for (const selector of consentSelectors) {
        try {
          const button = await page.locator(selector).first();
          if (await button.isVisible({ timeout: 2000 })) {
            console.log(`[Screenshot] Found consent button: ${selector}`);
            await button.click();
            console.log(`[Screenshot] ✅ Consent dismissed`);
            // Wait a moment for modal to close
            await page.waitForTimeout(1000);
            break;
          }
        } catch (error) {
          // Button not found or not visible, try next selector
          continue;
        }
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
      console.log(`[Screenshot] Cropping to region:`, screenshotOptions.clip);
    }

    await page.screenshot(screenshotOptions);
    console.log(`[Screenshot] ✅ Saved: ${outputPath}`);

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

// CLI usage
async function main() {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.error('Usage: tsx capture-screenshots.ts <url> <output-path> [--mapping <json>]');
    console.error('');
    console.error('Examples:');
    console.error('  tsx capture-screenshots.ts https://example.com screenshots/test.png');
    console.error('  tsx capture-screenshots.ts https://example.com screenshots/test.png --mapping \'{"viewport":{"width":1920,"height":1080}}\'');
    process.exit(1);
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

  try {
    await captureScreenshot({ url, outputPath, mapping });
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
