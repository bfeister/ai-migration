# Micro-Plan 01-04: Adjust Featured Products Section

## Feature Context
**Feature ID:** 01-homepage-content
**URLs (from url-mappings.json):**
- SFRA Source: https://zzrf-001.dx.commercecloud.salesforce.com/s/RefArchGlobal/en_GB/home
- Storefront Next Target: http://localhost:5173/

## Scope
Single change: Adjust featured products section styling to better match SFRA baseline.

## Context
Previous step improved hero section. Now focus on the featured products area.

## Files to Modify
- `storefront-next/src/components/product-carousel/index.tsx` (or similar)
- OR adjust featured products section in `_index.tsx`

## Specific Change
Based on SFRA baseline comparison, adjust ONE of the following:
- Section heading styling (size, weight, color)
- Product grid layout (columns, gap spacing)
- Product tile spacing
- Section padding/margins
- Background color

**Choose ONE specific change.**

Example change:
```tsx
// Adjust section heading to match SFRA
<h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-8">
  {t('featuredProducts.title')}
</h2>
```

## Validation
After making the change:
1. Build and start: `pnpm build && pnpm start` (port 3000)
2. Capture dual screenshots
4. Verify featured products section shows improvement

## Success Criteria
- Build passes
- Dual screenshots show improvement in featured products section
- Change moves closer to SFRA appearance
- No regressions in other sections

## Expected Duration
~3-4 minutes

## Next Step
Proceed to subplan-01-05 (Adjust spacing and layout)
