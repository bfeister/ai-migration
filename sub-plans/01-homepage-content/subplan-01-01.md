# Micro-Plan 01-01: Capture and Analyze SFRA Homepage

## Feature Context

**Feature ID:** 01-homepage-content
**URLs (from url-mappings.json):**

-   SFRA Source: https://zzrf-001.dx.commercecloud.salesforce.com/s/RefArchGlobal/en_GB/home
-   Storefront Next Target: http://localhost:5173/

## Scope

Single task: Capture a screenshot of the SFRA homepage and analyze its content structure (excluding header and footer).

## Context

This is the first micro-plan in the homepage content migration. Before writing any code, we need to capture and understand what we're building by examining the SFRA homepage.

## Tasks

<!-- TODO: update this to us our screenshot MCP tool -->

### 1. Capture SFRA Homepage Screenshot

Use Playwright to capture a full-page screenshot of the SFRA homepage:

-   URL: https://zzrf-001.dx.commercecloud.salesforce.com/s/RefArchGlobal/en_GB/home
-   Save to: `screenshots/sfra-homepage-baseline.png`
-   Handle any consent modals (dismiss if present)
-   Wait for page to fully load

### 2. Analyze the Screenshot

After capturing, document:

1. **Hero Section:**

    - Background styling (color, image, gradient)
    - Title text and styling
    - Subtitle/description text
    - Call-to-action (CTA) button text and styling
    - Overall layout and spacing

2. **Featured Products Section:**
    - Section heading
    - Number of products displayed
    - Product tile layout (grid columns, spacing)
    - Product tile content (image, title, price, etc.)

## Validation

After completion:

1. Screenshot captured successfully at `screenshots/sfra-homepage-baseline.png`
2. Screenshot shows full SFRA homepage (not truncated)
3. Analysis documented in migration-log.md with key findings
4. No code changes (screenshot capture + analysis only)

## Success Criteria

-   ✅ SFRA homepage screenshot captured
-   ✅ Screenshot shows clean page (consent modal dismissed if present)
-   ✅ Key content elements identified and documented
-   ✅ Clear understanding of hero section structure
-   ✅ Clear understanding of featured products layout
-   ✅ Baseline established for comparison in subsequent micro-plans

## Expected Duration

~3-5 minutes (includes screenshot capture and analysis)

## Next Step

Proceed to subplan-01-02 (Create homepage route/component)
