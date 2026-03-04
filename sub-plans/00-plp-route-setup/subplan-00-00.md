# Sub-Plan 01-00: Archive Route and Create ISML Canvas

---
id: subplan-01-00
feature: 01-plp-category-banner
status: pending
dependencies: []
---

## Goal
Archive the existing Storefront Next route file and create a blank canvas route that mirrors the ISML template structure from `storefront-reference-architecture/cartridge/templates/default/search/pt_product_searchresult.isml`. This establishes the skeleton that subsequent sub-plans will fill in region by region.

## Implementation Steps

### Step 0: Create the archive directory
Create `/Users/bfeister/dev/test-storefront/storefront-next/src/routes/archived/` if it does not exist:
```bash
mkdir -p /Users/bfeister/dev/test-storefront/storefront-next/src/routes/archived
```

### Step 1: Move the existing route to the archive
Move the current route file so we have a reference for its data-access patterns later:
```bash
mv /Users/bfeister/dev/test-storefront/storefront-next/src/routes/_app.category.$categoryId.tsx /Users/bfeister/dev/test-storefront/storefront-next/src/routes/archived/_app.category.$categoryId.tsx
```
> If the route file does not exist, skip this step.

### Step 2: Read the ISML template
Read the source ISML template to understand the page structure:
- **Path:** `storefront-reference-architecture/cartridges/app_storefront_base/cartridge/templates/default/storefront-reference-architecture/cartridge/templates/default/search/pt_product_searchresult.isml`

Identify every `<isslot>`, `<isinclude>`, and structural `<div>` in the template.

### Step 3: Read slots.xml for slot configurations
For each `<isslot id="...">` found, look up its configuration in `slots/slots.xml`:
- Find the `<slot-configuration>` matching each slot-id
- Note the `<template>` (ISML renderer) and `<content>` (data source type)

**Slots in this ISML template:**
- *No slots detected (static template)*

### Step 4: Create the blank canvas route
Create a new `/Users/bfeister/dev/test-storefront/storefront-next/src/routes/_app.category.$categoryId.tsx` with:
1. A minimal React Router 7 route structure (`loader` + default export component)
2. Commented regions matching each ISML slot / structural section
3. Empty `<div data-region="...">` placeholders for each slot
4. TypeScript types for the loader return shape

**Canvas structure example:**
```tsx
import { type LoaderFunctionArgs } from 'react-router';

export function loader(args: LoaderFunctionArgs) {
  return {};
}

export default function Page() {
  return (
    <div>
      {/* Canvas: add ISML regions here */}
    </div>
  );
}
```

### Step 5: Verify the canvas route compiles
Run `pnpm typecheck` from the storefront-next directory to ensure the canvas route has no TypeScript errors.

## Verification Checklist
- [ ] Original route is archived at `src/routes/archived/_app.category.$categoryId.tsx`
- [ ] New canvas route exists at `src/routes/_app.category.$categoryId.tsx`
- [ ] Canvas route has commented regions for each ISML slot
- [ ] Canvas route compiles without TypeScript errors
- [ ] Dev server renders the canvas route without errors

## Files to Create/Modify
| File | Action | Description |
|------|--------|-------------|
| `src/routes/archived/_app.category.$categoryId.tsx` | Create (move) | Archived original route for data-access reference |
| `src/routes/_app.category.$categoryId.tsx` | Create | Blank canvas route with ISML region placeholders |

---
*Generated: 2026-03-03T21:04:53.086Z*
