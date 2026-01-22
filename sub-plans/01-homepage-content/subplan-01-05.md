# Micro-Plan 01-05: Adjust Overall Page Spacing

## Feature Context
**Feature ID:** 01-homepage-content
**URLs (from url-mappings.json):**
- SFRA Source: https://zzrf-001.dx.commercecloud.salesforce.com/s/RefArchGlobal/en_GB/home
- Storefront Next Target: http://localhost:5173/

## Scope
Single change: Adjust overall page spacing and section gaps to match SFRA rhythm.

## Context
Previous steps improved hero and featured products sections. Now focus on overall page layout spacing.

## Files to Modify
- `storefront-next/src/routes/_index.tsx`

## Specific Change
Based on SFRA baseline comparison, adjust ONE of the following:
- Top-level container padding
- Spacing between major sections (pt-16, pt-8, etc.)
- Max-width constraints
- Horizontal padding (px-4, px-6, px-8)

**Choose ONE specific spacing adjustment.**

Example change:
```tsx
// Adjust spacing between sections to match SFRA
<div className="pt-12 md:pt-16"> {/* Changed from pt-16 */}
  <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8">
    <ProductCarouselWithSuspense ... />
  </div>
</div>
```

## Validation
After making the change:
1. Build check: `pnpm build`
2. Dev server: `pnpm dev`
3. Capture dual screenshots
4. Verify overall page rhythm matches SFRA better

## Success Criteria
- Build passes
- Page spacing looks more consistent with SFRA
- No layout breaks or overflows
- Screenshots show improved visual rhythm

## Expected Duration
~2-3 minutes

## Next Step
Proceed to subplan-01-06 (Final polish and verification)
