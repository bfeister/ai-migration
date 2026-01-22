# Micro-Plan 01-03: Adjust Hero Section Styling

## Feature Context
**Feature ID:** 01-homepage-content
**URLs (from url-mappings.json):**
- SFRA Source: https://zzrf-001.dx.commercecloud.salesforce.com/s/RefArchGlobal/en_GB/home
- Storefront Next Target: http://localhost:5173/

## Scope
Single change: Adjust hero section styling to better match SFRA baseline appearance.

## Context
Previous steps documented SFRA baseline and current Storefront Next implementation. This step makes the first targeted improvement to the hero section based on visual comparison.

## Files to Modify
- `storefront-next/src/components/hero-carousel/index.tsx` (or similar)
- OR adjust styling in `_index.tsx` hero section

## Specific Change
Based on SFRA baseline screenshot comparison, adjust ONE of the following:
- Hero height/aspect ratio
- Typography size/weight for title
- Spacing/padding around hero content
- Button styling (size, color, border-radius)
- Background overlay opacity

**Choose ONE specific change that has the most visible impact.**

Example change:
```tsx
// Adjust hero title typography to match SFRA
<h1 className="text-5xl md:text-6xl font-bold">
  {slide.title}
</h1>
```

## Validation
After making the change:
1. Build check: `pnpm build`
2. Dev server: `pnpm dev`
3. Capture dual screenshots:
   - SFRA source (baseline reference)
   - Storefront Next target (with new change)
4. Compare screenshots to verify improvement

## Success Criteria
- Build passes
- Dev server starts successfully
- Dual screenshots show visible improvement in hero section
- Change moves closer to SFRA appearance
- No TypeScript errors

## Expected Duration
~3-4 minutes

## Next Step
Proceed to subplan-01-04 (Make second hero adjustment)
