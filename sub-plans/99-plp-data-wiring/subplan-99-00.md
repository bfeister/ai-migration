# Sub-Plan 07-08: Wire Up Data Access from Archived Route

---
id: subplan-07-08
feature: 07-plp-breadcrumbs-header
status: pending
dependencies: ["subplan-07-07"]
---

## Goal
Complete the migration by integrating data-access patterns from the archived original Storefront Next route into the newly migrated SFRA-based React route. This final step ensures the migrated route has proper loader data fetching, API integration, and dynamic data wiring.

## Implementation Steps

### Step 0: Read the archived original route
Read the archived route to understand its data-access patterns:
- **Path:** `/Users/bfeister/dev/test-storefront/storefront-next/src/routes/archived/_app.category.$categoryId.tsx`

Extract and catalog:
1. **Loader function** — What APIs does it call? What data shape does it return?
2. **Imports** — Which API utilities, types, and helpers does it use?
3. **Context usage** — How does it access currency, locale, auth context?
4. **Page Designer integration** — Does it use `fetchPageFromLoader`, `collectComponentDataPromises`, `Region`?
5. **Component data flow** — How does loader data flow to components via props?

### Step 1: Read the current migrated route
Read the current migrated route:
- **Path:** `/Users/bfeister/dev/test-storefront/storefront-next/src/routes/_app.category.$categoryId.tsx`

Identify what data is currently hardcoded or missing that the archived route fetches dynamically.

### Step 2: Integrate loader data fetching
Update the migrated route's `loader` function to:
1. Import the same API utilities as the archived route (`fetchSearchProducts`, `fetchCategories`, etc.)
2. Add the same data fetching calls (returning promises for streaming SSR)
3. Match the return type shape so components receive the data they need
4. Preserve any currency/locale context access patterns

### Step 3: Wire dynamic data to components
Replace hardcoded data in components with loader data:
1. Update the component's `loaderData` type to match the new loader return
2. Replace static content with dynamic data from the loader (product data, category data, CMS content)
3. Add `<Suspense>` + `<Await>` boundaries for streamed promises where the archived route used them
4. Ensure progressive loading works correctly

### Step 4: Restore Page Designer integration (if applicable)
If the archived route used Page Designer (`Region` component, `@PageType`, `@RegionDefinition`):
1. Import the Page Designer decorators and `Region` component
2. Add the page metadata class with region definitions
3. Wire `fetchPageFromLoader` into the loader
4. Place `<Region>` components at appropriate positions in the JSX

### Step 5: Restore i18n integration
If the archived route used `useTranslation`:
1. Import `useTranslation` from `react-i18next`
2. Replace any hardcoded strings with translation keys
3. Verify translation keys exist in locale files

### Step 6: Verify full integration
1. Run `pnpm typecheck` — no TypeScript errors
2. Run `pnpm dev` — page renders without console errors
3. Verify dynamic data loads (products, categories, CMS content)
4. Compare with SFRA source — visual layout should match
5. Compare with archived original — data richness should be equivalent or better

## Verification Checklist
- [ ] Loader fetches all required data (matches archived route's API calls)
- [ ] Components receive dynamic data instead of hardcoded values
- [ ] `<Suspense>` boundaries provide progressive loading
- [ ] Page Designer `Region` components work (if applicable)
- [ ] i18n strings are translated (if applicable)
- [ ] TypeScript compiles without errors
- [ ] No console errors during page render
- [ ] Visual layout matches SFRA source
- [ ] Data richness matches or exceeds the archived original

## Files to Create/Modify
| File | Action | Description |
|------|--------|-------------|
| `src/routes/_app.category.$categoryId.tsx` | Modify | Add loader data fetching and dynamic data wiring |
| `src/routes/archived/_app.category.$categoryId.tsx` | Read-only | Reference for data-access patterns |

## Reference
The archived original route at `src/routes/archived/_app.category.$categoryId.tsx` serves as the authoritative reference for:
- API endpoints and data shapes
- Authentication and context patterns
- Page Designer configuration
- Component data flow architecture

---
*Generated: 2026-03-03T21:04:53.093Z*
