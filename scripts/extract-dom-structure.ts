#!/usr/bin/env tsx
/**
 * DOM Structure Extraction Script
 *
 * Extracts structured DOM with computed styles from a URL using Playwright.
 * Output is JSON suitable for conversion to React components.
 *
 * Usage:
 *   tsx scripts/extract-dom-structure.ts <url> [options]
 *   tsx scripts/extract-dom-structure.ts --feature-id <id> [options]
 *
 * Options:
 *   --feature-id <id>    Look up URL/selector/viewport from url-mappings.json (recommended)
 *   --selector <css>     Target a specific element (default: body)
 *   --output <path>      Output file path (default: stdout)
 *   --depth <number>     Max depth to traverse (default: 10)
 *   --viewport <WxH>     Viewport size (default: 1920x1080)
 *   --dismiss-consent    Attempt to dismiss cookie/consent modals
 *   --include-hidden     Include hidden elements
 *   --format <type>      Output format: "json" | "react-prompt" (default: json)
 *
 * Examples:
 *   # Extract using feature config from url-mappings.json (recommended)
 *   tsx scripts/extract-dom-structure.ts --feature-id 01-homepage-hero --output hero.json
 *
 *   # Extract hero section to JSON (direct URL - not recommended)
 *   tsx scripts/extract-dom-structure.ts https://example.com --selector ".hero" --output hero.json
 *
 *   # Generate prompt for Claude to create React
 *   tsx scripts/extract-dom-structure.ts --feature-id 01-homepage-hero --format react-prompt
 */

import { chromium, Browser, Page } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// URL Mappings Support
// ============================================================================

interface FeatureMapping {
  feature_id: string;
  name?: string;
  source_path?: string; // Path appended to source base URL
  target_path?: string; // Path appended to target base URL
  sfra_url: string;
  target_url?: string;
  selector?: string;
  viewport?: { width: number; height: number };
  source_config?: {
    dismiss_consent?: boolean;
    consent_button_selector?: string;
  };
}

interface URLMappings {
  version: string;
  source_base_url: string;
  target_base_url: string;
  mappings: FeatureMapping[];
}

function loadURLMappings(): URLMappings | null {
  const mappingsPath = path.join(process.cwd(), 'url-mappings.json');
  if (fs.existsSync(mappingsPath)) {
    try {
      return JSON.parse(fs.readFileSync(mappingsPath, 'utf-8'));
    } catch {
      return null;
    }
  }
  return null;
}

function getFeatureConfig(featureId: string): FeatureMapping | null {
  const mappings = loadURLMappings();
  if (!mappings) {
    console.error(`[Extract] Warning: url-mappings.json not found`);
    return null;
  }
  const feature = mappings.mappings.find((m) => m.feature_id === featureId);
  if (!feature) {
    console.error(`[Extract] Warning: Feature "${featureId}" not found in url-mappings.json`);
    return null;
  }
  return feature;
}

// Styles that are relevant for React/CSS recreation
const RELEVANT_STYLE_PROPERTIES = [
  // Layout
  'display',
  'position',
  'top',
  'right',
  'bottom',
  'left',
  'zIndex',
  'float',
  'clear',

  // Flexbox
  'flexDirection',
  'flexWrap',
  'justifyContent',
  'alignItems',
  'alignContent',
  'alignSelf',
  'flex',
  'flexGrow',
  'flexShrink',
  'flexBasis',
  'order',
  'gap',
  'rowGap',
  'columnGap',

  // Grid
  'gridTemplateColumns',
  'gridTemplateRows',
  'gridColumn',
  'gridRow',
  'gridArea',
  'gridAutoFlow',

  // Box Model
  'width',
  'height',
  'minWidth',
  'minHeight',
  'maxWidth',
  'maxHeight',
  'padding',
  'paddingTop',
  'paddingRight',
  'paddingBottom',
  'paddingLeft',
  'margin',
  'marginTop',
  'marginRight',
  'marginBottom',
  'marginLeft',
  'boxSizing',

  // Typography
  'fontFamily',
  'fontSize',
  'fontWeight',
  'fontStyle',
  'lineHeight',
  'letterSpacing',
  'textAlign',
  'textDecoration',
  'textTransform',
  'whiteSpace',
  'wordBreak',
  'overflowWrap',

  // Colors & Background
  'color',
  'backgroundColor',
  'backgroundImage',
  'backgroundSize',
  'backgroundPosition',
  'backgroundRepeat',
  'opacity',

  // Borders
  'border',
  'borderWidth',
  'borderStyle',
  'borderColor',
  'borderRadius',
  'borderTop',
  'borderRight',
  'borderBottom',
  'borderLeft',

  // Effects
  'boxShadow',
  'textShadow',
  'transform',
  'transition',
  'filter',

  // Overflow
  'overflow',
  'overflowX',
  'overflowY',

  // Cursor & Interaction
  'cursor',
  'pointerEvents',
  'userSelect',

  // List styles
  'listStyle',
  'listStyleType',
  'listStylePosition',

  // Object fit (for images)
  'objectFit',
  'objectPosition',

  // Aspect ratio
  'aspectRatio',
];

// Elements to skip entirely
const SKIP_TAGS = new Set([
  'script',
  'style',
  'noscript',
  'meta',
  'link',
  'head',
  'title',
]);

// Inline elements that often just contain text
const INLINE_TEXT_TAGS = new Set([
  'span',
  'strong',
  'em',
  'b',
  'i',
  'u',
  'a',
  'small',
  'mark',
  'sub',
  'sup',
  'code',
  'kbd',
  'var',
]);

interface ExtractedNode {
  tag: string;
  id?: string;
  classes?: string[];
  text?: string;
  attributes?: Record<string, string>;
  styles: Record<string, string>;
  boundingBox?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  children?: ExtractedNode[];
}

interface ExtractionOptions {
  url: string;
  selector: string;
  outputPath?: string;
  maxDepth: number;
  viewport: { width: number; height: number };
  dismissConsent: boolean;
  consentButtonSelector?: string; // Optional: custom CSS selector for consent button
  includeHidden: boolean;
  format: 'json' | 'uidl' | 'react-prompt';
  screenshotPath?: string; // Optional: capture screenshot of matched element
  featureId?: string; // Optional: feature ID for url-mappings.json lookup
}

interface ExtractionSummary {
  totalElements: number;
  links: { href: string; text?: string }[];
  images: { src: string; alt?: string }[];
  headings: { level: number; text: string }[];
  backgroundImages: string[];
  colors: { text: Set<string>; background: Set<string> };
  fonts: Set<string>;
}

interface ExtractionResult {
  url: string;
  selector: string;
  extractedAt: string;
  viewport: { width: number; height: number };
  summary: {
    totalElements: number;
    links: { href: string; text?: string }[];
    images: { src: string; alt?: string }[];
    headings: { level: number; text: string }[];
    backgroundImages: string[];
    textColors: string[];
    backgroundColors: string[];
    fonts: string[];
  };
  rootNode: ExtractedNode;
  screenshotPath?: string; // Path to element screenshot if captured
}

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

async function extractDomStructure(options: ExtractionOptions): Promise<ExtractionResult> {
  const { url, selector, maxDepth, viewport, dismissConsent, includeHidden } = options;

  console.error(`[Extract] URL: ${url}`);
  console.error(`[Extract] Selector: ${selector}`);
  console.error(`[Extract] Max depth: ${maxDepth}`);

  const executablePath = getSystemChromePath();

  if (executablePath) {
    console.error(`[Extract] Using browser: ${executablePath}`);
  } else {
    console.error(`[Extract] Using Playwright bundled browser`);
  }

  const browser: Browser = await chromium.launch({
    headless: true,
    executablePath,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-setuid-sandbox'],
  });

  try {
    const page: Page = await browser.newPage({ viewport });
    page.setDefaultTimeout(30000);

    console.error(`[Extract] Navigating...`);
    await page.goto(url, { waitUntil: 'networkidle' });
    console.error(`[Extract] Page loaded`);

    // Dismiss consent modals if requested
    if (dismissConsent) {
      if (options.consentButtonSelector) {
        console.error(`[Extract] Attempting to dismiss consent modals...`);
        await dismissConsentModals(page, options.consentButtonSelector);
      } else {
        console.error(`[Extract] dismissConsent is true but no consentButtonSelector provided — skipping`);
      }
    }

    // Wait a bit for any animations/transitions
    await page.waitForTimeout(500);

    // Extract DOM structure
    console.error(`[Extract] Extracting DOM structure...`);

    // Build the extraction script as a string to avoid tsx transpilation issues
    const extractionScript = `
      (function(config) {
        var selector = config.selector;
        var maxDepth = config.maxDepth;
        var includeHidden = config.includeHidden;
        var relevantStyles = config.relevantStyles;
        var skipTags = config.skipTags;
        var skipTagsSet = new Set(skipTags);

        function isVisible(el) {
          var tag = el.tagName.toLowerCase();
          // body and html are always "visible" (they have no offsetParent)
          if (tag === 'body' || tag === 'html') return true;
          var style = window.getComputedStyle(el);
          return (
            style.display !== 'none' &&
            style.visibility !== 'hidden' &&
            style.opacity !== '0' &&
            el.offsetParent !== null
          );
        }

        function getRelevantStyles(el) {
          var computed = window.getComputedStyle(el);
          var styles = {};
          for (var i = 0; i < relevantStyles.length; i++) {
            var prop = relevantStyles[i];
            var cssProp = prop.replace(/([A-Z])/g, '-$1').toLowerCase();
            var value = computed.getPropertyValue(cssProp);
            if (value && value !== 'none' && value !== 'normal' && value !== 'auto' && value !== '0px' && value !== 'rgba(0, 0, 0, 0)') {
              styles[prop] = value;
            }
          }
          return styles;
        }

        function getTextContent(el) {
          var text = '';
          for (var i = 0; i < el.childNodes.length; i++) {
            var node = el.childNodes[i];
            if (node.nodeType === Node.TEXT_NODE) {
              var trimmed = (node.textContent || '').trim();
              if (trimmed) {
                text += (text ? ' ' : '') + trimmed;
              }
            }
          }
          return text || undefined;
        }

        function getAttributes(el) {
          var attrs = {};
          var tag = el.tagName.toLowerCase();

          if (tag === 'a') {
            var href = el.getAttribute('href');
            if (href) attrs.href = href;
            var target = el.getAttribute('target');
            if (target) attrs.target = target;
          } else if (tag === 'img') {
            var src = el.getAttribute('src');
            if (src) attrs.src = src;
            var alt = el.getAttribute('alt');
            if (alt !== null) attrs.alt = alt || '';
            var srcset = el.getAttribute('srcset');
            if (srcset) attrs.srcset = srcset;
          } else if (tag === 'input') {
            var type = el.getAttribute('type');
            if (type) attrs.type = type;
            var placeholder = el.getAttribute('placeholder');
            if (placeholder) attrs.placeholder = placeholder;
            var name = el.getAttribute('name');
            if (name) attrs.name = name;
          } else if (tag === 'button') {
            var type2 = el.getAttribute('type');
            if (type2) attrs.type = type2;
          } else if (tag === 'video' || tag === 'audio') {
            var src2 = el.getAttribute('src');
            if (src2) attrs.src = src2;
            if (el.hasAttribute('autoplay')) attrs.autoplay = 'true';
            if (el.hasAttribute('loop')) attrs.loop = 'true';
            if (el.hasAttribute('muted')) attrs.muted = 'true';
          } else if (tag === 'iframe') {
            var src3 = el.getAttribute('src');
            if (src3) attrs.src = src3;
          } else if (tag === 'svg') {
            var viewBox = el.getAttribute('viewBox');
            if (viewBox) attrs.viewBox = viewBox;
          }

          for (var i = 0; i < el.attributes.length; i++) {
            var attr = el.attributes[i];
            if (attr.name.indexOf('aria-') === 0 || attr.name === 'role') {
              attrs[attr.name] = attr.value;
            }
            if (attr.name.indexOf('data-') === 0 && attr.name.length < 30) {
              attrs[attr.name] = attr.value;
            }
          }

          return Object.keys(attrs).length > 0 ? attrs : undefined;
        }

        function extractNode(el, depth) {
          var tag = el.tagName.toLowerCase();

          if (skipTagsSet.has(tag)) return null;
          if (!includeHidden && !isVisible(el)) return null;

          if (depth > maxDepth) {
            return { tag: 'truncated', text: '[Max depth ' + maxDepth + ' reached]', styles: {} };
          }

          var node = { tag: tag, styles: getRelevantStyles(el) };

          var id = el.id;
          if (id) node.id = id;

          var classes = [];
          for (var i = 0; i < el.classList.length; i++) {
            if (el.classList[i].length < 50) classes.push(el.classList[i]);
          }
          if (classes.length > 0) node.classes = classes;

          var text = getTextContent(el);
          if (text) node.text = text;

          var attrs = getAttributes(el);
          if (attrs) node.attributes = attrs;

          var rect = el.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0) {
            node.boundingBox = {
              x: Math.round(rect.x),
              y: Math.round(rect.y),
              width: Math.round(rect.width),
              height: Math.round(rect.height)
            };
          }

          if (tag !== 'svg') {
            var children = [];
            for (var j = 0; j < el.children.length; j++) {
              var childNode = extractNode(el.children[j], depth + 1);
              if (childNode) children.push(childNode);
            }
            if (children.length > 0) node.children = children;
          }

          return node;
        }

        var targetEl = document.querySelector(selector);
        if (!targetEl) {
          throw new Error('Selector not found: ' + selector);
        }

        return extractNode(targetEl, 0);
      })(arguments[0])
    `;

    const evalConfig = {
      selector,
      maxDepth,
      includeHidden,
      relevantStyles: RELEVANT_STYLE_PROPERTIES,
      skipTags: Array.from(SKIP_TAGS),
    };

    // Inject config into the page first, then run the script
    await page.evaluate((config) => {
      (window as any).__extractConfig = config;
    }, evalConfig);

    const rootNode = await page.evaluate(extractionScript.replace('arguments[0]', 'window.__extractConfig'));

    if (!rootNode) {
      throw new Error(`Failed to extract DOM from selector: ${selector}`);
    }

    console.error(`[Extract] Extraction complete`);

    // Build summary from extracted nodes
    const summary = buildSummary(rootNode);
    console.error(`[Extract] Summary: ${summary.totalElements} elements, ${summary.links.length} links, ${summary.images.length} images, ${summary.headings.length} headings`);

    // Capture element screenshot if requested
    let screenshotPath: string | undefined;
    if (options.screenshotPath) {
      try {
        // Find the actual matched element for screenshot
        const element = await page.locator(selector).first();
        if (await element.isVisible({ timeout: 1000 })) {
          // Ensure directory exists
          const screenshotDir = path.dirname(options.screenshotPath);
          if (!fs.existsSync(screenshotDir)) {
            fs.mkdirSync(screenshotDir, { recursive: true });
          }

          await element.screenshot({ path: options.screenshotPath });
          screenshotPath = options.screenshotPath;
          console.error(`[Extract] Element screenshot saved: ${screenshotPath}`);
        } else {
          console.error(`[Extract] Warning: Element not visible for screenshot, skipping`);
        }
      } catch (err: any) {
        console.error(`[Extract] Warning: Could not capture element screenshot: ${err.message}`);
      }
    }

    return {
      url,
      selector,
      extractedAt: new Date().toISOString(),
      viewport,
      summary,
      rootNode,
      screenshotPath,
    };
  } finally {
    await browser.close();
  }
}

function buildSummary(node: ExtractedNode): ExtractionResult['summary'] {
  const links: { href: string; text?: string }[] = [];
  const images: { src: string; alt?: string }[] = [];
  const headings: { level: number; text: string }[] = [];
  const backgroundImages: string[] = [];
  const textColors = new Set<string>();
  const backgroundColors = new Set<string>();
  const fonts = new Set<string>();
  let totalElements = 0;

  function traverse(n: ExtractedNode): void {
    totalElements++;

    // Collect links
    if (n.tag === 'a' && n.attributes?.href) {
      links.push({ href: n.attributes.href, text: n.text || getNestedText(n) });
    }

    // Collect images
    if (n.tag === 'img' && n.attributes?.src) {
      images.push({ src: n.attributes.src, alt: n.attributes.alt });
    }

    // Collect headings
    const headingMatch = n.tag.match(/^h([1-6])$/);
    if (headingMatch) {
      headings.push({ level: parseInt(headingMatch[1]), text: n.text || getNestedText(n) || '' });
    }

    // Collect background images from styles
    if (n.styles.backgroundImage && n.styles.backgroundImage !== 'none') {
      const urlMatch = n.styles.backgroundImage.match(/url\("([^"]+)"\)/);
      if (urlMatch) {
        backgroundImages.push(urlMatch[1]);
      }
    }

    // Collect colors
    if (n.styles.color && !n.styles.color.includes('0, 0, 0')) {
      textColors.add(n.styles.color);
    }
    if (n.styles.backgroundColor && !n.styles.backgroundColor.includes('0, 0, 0, 0')) {
      backgroundColors.add(n.styles.backgroundColor);
    }

    // Collect fonts
    if (n.styles.fontFamily) {
      // Extract primary font
      const primaryFont = n.styles.fontFamily.split(',')[0].trim().replace(/"/g, '');
      if (primaryFont && !primaryFont.includes('system') && !primaryFont.includes('apple')) {
        fonts.add(primaryFont);
      }
    }

    // Traverse children
    if (n.children) {
      n.children.forEach(traverse);
    }
  }

  function getNestedText(n: ExtractedNode): string | undefined {
    if (n.text) return n.text;
    if (n.children) {
      for (const child of n.children) {
        const text = getNestedText(child);
        if (text) return text;
      }
    }
    return undefined;
  }

  traverse(node);

  return {
    totalElements,
    links,
    images,
    headings,
    backgroundImages: [...new Set(backgroundImages)],
    textColors: [...textColors],
    backgroundColors: [...backgroundColors],
    fonts: [...fonts],
  };
}

async function dismissConsentModals(page: Page, selector: string): Promise<void> {
  try {
    const button = await page.locator(selector).first();
    if (await button.isVisible({ timeout: 2000 })) {
      await button.click();
      console.error(`[Extract] Dismissed consent modal with selector: ${selector}`);
      await page.waitForTimeout(500);
    } else {
      console.error(`[Extract] Consent selector not visible: ${selector}`);
    }
  } catch (err: any) {
    console.error(`[Extract] Failed to dismiss consent modal with selector "${selector}": ${err.message}`);
  }
}

function generateReactPrompt(result: ExtractionResult): string {
  return `# Task: Convert DOM Structure to React Component

You are given a structured DOM extraction from a webpage. Convert this to a clean, modern React component using:
- TypeScript
- Tailwind CSS for styling (convert the inline styles to Tailwind classes)
- Semantic HTML elements where appropriate
- Proper component composition (break into sub-components if needed)

## Source URL
${result.url}

## Extracted Element
Selector: \`${result.selector}\`
Viewport: ${result.viewport.width}x${result.viewport.height}

## DOM Structure (JSON)
\`\`\`json
${JSON.stringify(result.rootNode, null, 2)}
\`\`\`

## Guidelines
1. Convert pixel values to Tailwind spacing (4px = 1, 8px = 2, 16px = 4, etc.)
2. Use semantic elements: nav, header, main, section, article, aside, footer
3. Replace generic divs with appropriate elements when the structure/role is clear
4. Extract repeated patterns into reusable components
5. Use Tailwind's responsive prefixes if the layout suggests mobile considerations
6. Preserve accessibility attributes (aria-*, role)
7. For images, use next/image if this is a Next.js project, otherwise use <img>
8. Handle text content appropriately - it may need to be props or hardcoded

## Output Format
Provide:
1. The main React component file
2. Any sub-components if you split them out
3. Brief explanation of key decisions made

Generate the React component(s) now:`;
}

// UIDL format for Teleport Code Generators
// See: https://docs.teleporthq.io/uidl
interface UIDLNode {
  type: 'element' | 'static' | 'dynamic';
  content: UIDLElementContent | string | { referenceType: string; id: string };
}

interface UIDLElementContent {
  elementType: string;
  name?: string;
  style?: Record<string, { type: 'static'; content: string }>;
  attrs?: Record<string, { type: 'static'; content: string }>;
  children?: UIDLNode[];
}

interface UIDLComponent {
  name: string;
  node: UIDLNode;
  propDefinitions?: Record<string, { type: string; defaultValue?: unknown }>;
}

function convertToUIDL(result: ExtractionResult): UIDLComponent {
  const componentName = result.selector
    .replace(/[.#\[\]='"]/g, '')
    .split(/[-_\s]+/)
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join('');

  function convertNode(node: ExtractedNode): UIDLNode {
    // Map HTML tags to UIDL element types
    const elementTypeMap: Record<string, string> = {
      div: 'container',
      span: 'text',
      p: 'text',
      h1: 'text',
      h2: 'text',
      h3: 'text',
      h4: 'text',
      h5: 'text',
      h6: 'text',
      a: 'link',
      img: 'image',
      button: 'button',
      input: 'textinput',
      ul: 'container',
      ol: 'container',
      li: 'container',
      nav: 'container',
      header: 'container',
      footer: 'container',
      main: 'container',
      section: 'container',
      article: 'container',
      aside: 'container',
    };

    const elementType = elementTypeMap[node.tag] || 'container';

    // Convert styles to UIDL format
    const style: Record<string, { type: 'static'; content: string }> = {};
    for (const [key, value] of Object.entries(node.styles)) {
      // Convert camelCase to kebab-case for CSS
      const cssKey = key.replace(/([A-Z])/g, '-$1').toLowerCase();
      style[cssKey] = { type: 'static', content: value };
    }

    // Convert attributes to UIDL format
    const attrs: Record<string, { type: 'static'; content: string }> = {};
    if (node.attributes) {
      for (const [key, value] of Object.entries(node.attributes)) {
        // Map common attribute names
        const attrMap: Record<string, string> = {
          href: 'url',
          src: 'url',
          alt: 'alt',
        };
        const attrKey = attrMap[key] || key;
        attrs[attrKey] = { type: 'static', content: value };
      }
    }

    // Build children
    const children: UIDLNode[] = [];

    // Add text content if present
    if (node.text) {
      children.push({
        type: 'static',
        content: node.text,
      });
    }

    // Add child elements
    if (node.children) {
      for (const child of node.children) {
        children.push(convertNode(child));
      }
    }

    const elementContent: UIDLElementContent = {
      elementType,
    };

    if (Object.keys(style).length > 0) {
      elementContent.style = style;
    }

    if (Object.keys(attrs).length > 0) {
      elementContent.attrs = attrs;
    }

    if (children.length > 0) {
      elementContent.children = children;
    }

    return {
      type: 'element',
      content: elementContent,
    };
  }

  return {
    name: componentName || 'ExtractedComponent',
    node: convertNode(result.rootNode),
  };
}

function parseArgs(args: string[]): ExtractionOptions {
  const options: ExtractionOptions = {
    url: '',
    selector: 'body',
    outputPath: undefined,
    maxDepth: 10,
    viewport: { width: 1920, height: 1080 },
    dismissConsent: false,
    includeHidden: false,
    format: 'json',
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--feature-id' && args[i + 1]) {
      options.featureId = args[++i];
    } else if (arg === '--selector' && args[i + 1]) {
      options.selector = args[++i];
    } else if (arg === '--output' && args[i + 1]) {
      options.outputPath = args[++i];
    } else if (arg === '--depth' && args[i + 1]) {
      options.maxDepth = parseInt(args[++i], 10);
    } else if (arg === '--viewport' && args[i + 1]) {
      const [w, h] = args[++i].split('x').map(Number);
      if (w && h) {
        options.viewport = { width: w, height: h };
      }
    } else if (arg === '--dismiss-consent') {
      options.dismissConsent = true;
    } else if (arg === '--include-hidden') {
      options.includeHidden = true;
    } else if (arg === '--format' && args[i + 1]) {
      const fmt = args[++i];
      if (fmt === 'json' || fmt === 'uidl' || fmt === 'react-prompt') {
        options.format = fmt;
      }
    } else if (!arg.startsWith('-') && !options.url) {
      options.url = arg;
    }
  }

  return options;
}

function printUsage(): void {
  console.error(`
Usage: tsx scripts/extract-dom-structure.ts <url> [options]
       tsx scripts/extract-dom-structure.ts --feature-id <id> [options]

Options:
  --feature-id <id>    Look up URL/selector/viewport from url-mappings.json (recommended)
  --selector <css>     Target a specific element (default: body, overrides feature config)
  --output <path>      Output file path (default: stdout)
  --depth <number>     Max depth to traverse (default: 10)
  --viewport <WxH>     Viewport size (default: 1920x1080, overrides feature config)
  --dismiss-consent    Attempt to dismiss cookie/consent modals
  --include-hidden     Include hidden elements
  --format <type>      Output format: "json" | "uidl" | "react-prompt" (default: json)

Output Formats:
  json          Full extraction with summary metadata and DOM tree
  uidl          Teleport UIDL format for code generation (use with @teleporthq/teleport-*)
  react-prompt  Claude-ready prompt for React + Tailwind conversion

Examples:
  # Extract using feature config from url-mappings.json (RECOMMENDED)
  npx tsx scripts/extract-dom-structure.ts --feature-id 01-homepage-hero --output hero.json

  # Extract hero section to JSON with direct URL (not recommended - use --feature-id)
  npx tsx scripts/extract-dom-structure.ts https://example.com --selector ".hero" --output hero.json

  # Generate UIDL for Teleport code generator
  npx tsx scripts/extract-dom-structure.ts --feature-id 01-homepage-hero --format uidl --output hero.uidl.json

  # Generate prompt for Claude to create React component
  npx tsx scripts/extract-dom-structure.ts --feature-id 01-homepage-hero --format react-prompt

  # Extract with consent dismissal (auto-applied when using --feature-id)
  npx tsx scripts/extract-dom-structure.ts https://shop.example.com --selector "main" --dismiss-consent
`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    printUsage();
    process.exit(args.length === 0 ? 1 : 0);
  }

  const options = parseArgs(args);

  // If --feature-id is provided, load config from url-mappings.json
  if (options.featureId) {
    const featureConfig = getFeatureConfig(options.featureId);
    if (!featureConfig) {
      console.error(`[Extract] Error: Feature "${options.featureId}" not found in url-mappings.json`);
      process.exit(1);
    }

    // Use feature config values, but allow CLI overrides
    options.url = options.url || featureConfig.sfra_url;
    if (options.selector === 'body' && featureConfig.selector) {
      options.selector = featureConfig.selector;
    }
    if (featureConfig.viewport && options.viewport.width === 1920 && options.viewport.height === 1080) {
      options.viewport = featureConfig.viewport;
    }
    if (featureConfig.source_config?.dismiss_consent) {
      options.dismissConsent = true;
      if (featureConfig.source_config.consent_button_selector) {
        options.consentButtonSelector = featureConfig.source_config.consent_button_selector;
      }
    }

    console.error(`[Extract] Using config from url-mappings.json for feature: ${options.featureId}`);
  }

  if (!options.url) {
    console.error('[Extract] Error: URL is required (provide a URL or --feature-id)');
    printUsage();
    process.exit(1);
  }

  try {
    const result = await extractDomStructure(options);

    let output: string;
    if (options.format === 'react-prompt') {
      output = generateReactPrompt(result);
    } else if (options.format === 'uidl') {
      const uidl = convertToUIDL(result);
      output = JSON.stringify(uidl, null, 2);
    } else {
      // Default JSON format
      output = JSON.stringify(result, null, 2);
    }

    if (options.outputPath) {
      const dir = path.dirname(options.outputPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(options.outputPath, output);
      console.error(`[Extract] Output written to: ${options.outputPath}`);
    } else {
      console.log(output);
    }

    process.exit(0);
  } catch (error) {
    console.error('[Extract] Error:', error);
    process.exit(1);
  }
}

// Export for use as module
export { extractDomStructure, ExtractionOptions, ExtractionResult, ExtractedNode };

// Run if executed directly
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const isMainModule = process.argv[1] === __filename;

if (isMainModule) {
  main();
}
