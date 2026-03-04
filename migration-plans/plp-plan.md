# Migration Plan: Product List Page

**Page ID:** `plp`
**Discovered:** 2026-03-03T12:00:00Z
**ISML Template:** `/Users/bfeister/dev/test-storefront/storefront-reference-architecture/cartridge/templates/default/search/pt_productsearchresult.isml`
**Total Features:** 7

---

## Migration Order

Features should be migrated in this order:

1. **Category Breadcrumbs & Page Header** (`07-plp-breadcrumbs-header`) - low complexity
2. **Product Grid** (`04-plp-product-grid`) - medium complexity
3. **Category Banner** (`01-plp-category-banner`) - medium complexity
4. **Filter Actions & Sort Bar** (`02-plp-filter-actions-bar`) - high complexity
5. **Refinement Sidebar** (`03-plp-refinement-sidebar`) - high complexity
6. **In-Grid Promotional Banners** (`05-plp-ingrid-banners`) - high complexity
7. **Infinite Scroll / Pagination** (`06-plp-infinite-scroll`) - medium complexity

---

## Feature Details

### 01-plp-category-banner: Category Banner

Full-width promotional banner at the top of the product listing. When viewing a category, renders the 'cat-banner' content slot (content asset). When viewing search results, falls back to a search promo body or the 'search-result-banner' global slot. Each category has its own configured banner asset.

**Selector:** `.content-slot.slot-grid-header`
**Complexity:** medium
**Priority:** 2

**ISML Source:**
- Lines: 12-26
- Content Type: content-asset

> The React target has a 'plpTopFullWidth' Region that could serve this purpose via Page Designer. Alternatively, implement as a dedicated CategoryBanner component that fetches the content asset for the current category. Multiple category-specific slot configurations exist in slots.xml.

---

### 02-plp-filter-actions-bar: Filter Actions & Sort Bar

Horizontal action bar below the banner containing: (1) Filter toggle button with results count, (2) Selected refinement chips with remove links and 'Clear All', (3) Sort-by dropdown. Also includes a mobile-only CTA row with 'Apply Filters' and 'Clear Filters' buttons.

**Selector:** `.plp-actions`
**Complexity:** high
**Priority:** 3

**ISML Source:**
- Lines: 1-173
- Content Type: dynamic

**Dependencies:** 03-plp-refinement-sidebar

> React target already has CategorySorting component. Missing: filter toggle button, selected refinement chips with removal, results count display, mobile filter apply/clear CTA. The SFRA version tightly couples filter display with refinement state (isRefinedByAttribute, isRefinedByPrice). Consider building a FilterBar component that wraps CategorySorting + adds chip display.

---

### 03-plp-refinement-sidebar: Refinement Sidebar

Left-side panel containing expandable refinement sections: (1) Category refinements with hierarchical navigation, (2) Attribute refinements with special color swatch and size swatch rendering, (3) Price range refinements, (4) 'Features' attribute grouping. Each section is collapsible via toggle headers. Includes 'Clear Selection' per refinement type.

**Selector:** `#secondary.refinements`
**Complexity:** high
**Priority:** 4

**ISML Source:**
- Lines: 1-198
- Content Type: dynamic

> React target already has CategoryRefinements component (desktop only, hidden lg:block). Key differences to verify: (1) color swatch visual rendering, (2) size swatch rendering, (3) Features grouping logic, (4) expandable/collapsible toggle behavior, (5) mobile refinement sheet/drawer. The SFRA implementation has sophisticated logic for unselectable swatches (hitCount == 0) and selected state styling.

---

### 04-plp-product-grid: Product Grid

Main product listing grid rendered as a <ul> of product tiles. Each tile is loaded via remote include (ISInclude URL) with variation data attributes (colors, sizes, widths, waist, length). Tiles support curated positioning and display per-product variation swatches. The grid class supports a compare mode.

**Selector:** `#search-result-items.search-result-items`
**Complexity:** medium
**Priority:** 1

**ISML Source:**
- Lines: 37-133
- Content Type: products

> React target already has ProductGrid component accepting 'products' (search hits) and 'handleProductClick'. The SFRA grid has additional complexity: (1) per-tile variation filtering via data attributes, (2) compare mode class, (3) remote include pattern for tile caching. The core grid functionality likely already works; focus migration on ensuring visual parity with SFRA tile layout (3-column, tile styling).

---

### 05-plp-ingrid-banners: In-Grid Promotional Banners

Up to 3 promotional banner slots injected at configurable positions within the product grid: catGridBanner1 (1x1 tile size), catGridBanner2 (2x1 wide), catGridBanner3 (2x2 large, with optional right alignment). Positions are set per-category via custom attributes (gridBanner1Position, gridBanner2Position, gridBanner3Position). Complex insertion logic handles ordering when multiple banners are near each other.

**Selector:** `.banner-grid.grid-tile`
**Complexity:** high
**Priority:** 5

**ISML Source:**
- Lines: 52-107
- Content Type: content-asset

**Dependencies:** 04-plp-product-grid

> No equivalent in the React target currently. This requires: (1) fetching banner content assets for the category, (2) inserting promotional tiles at configurable positions within the ProductGrid, (3) supporting three tile sizes (1x1, 2x1 spanning 2 cols, 2x2 spanning 2 cols + 2 rows). Could implement as a grid enhancement component or via the Page Designer 'plpTopContent' region. The curated positioning logic (lines 11-12) also controls this feature based on custom category attributes.

---

### 06-plp-infinite-scroll: Infinite Scroll / Pagination

Conditional infinite scroll that loads the next page of products when the user scrolls to the bottom. Controlled by site preference 'enableInfiniteScroll'. Renders a placeholder div with data-grid-url pointing to the next page in 'page-element' format. When disabled, standard pagination is used.

**Selector:** `.infinite-scroll-placeholder`
**Complexity:** medium
**Priority:** 6

**ISML Source:**
- Lines: 135-139
- Content Type: dynamic

**Dependencies:** 04-plp-product-grid

> React target currently uses CategoryPagination component (page-based navigation). SFRA uses intersection observer or scroll-based lazy loading. To match SFRA, implement an InfiniteScroll wrapper around ProductGrid that fetches next pages via the search API and appends results. Could use React 19 'use' + fetcher pattern or react-intersection-observer.

---

### 07-plp-breadcrumbs-header: Category Breadcrumbs & Page Header

Category breadcrumb navigation and page title with product count. The SFRA version builds breadcrumbs from the category path hierarchy. The React target already has CategoryBreadcrumbs and a heading with category name + total count.

**Selector:** `.breadcrumb, h1`
**Complexity:** low
**Priority:** 1

**ISML Source:**
- Lines: 18-29, 61-75
- Content Type: dynamic

> React target already has CategoryBreadcrumbs component and the heading in CategoryPage. This feature likely needs minimal work — verify visual parity with SFRA breadcrumb styling and ensure the category hierarchy renders correctly.

---

## Shared Components

### ProductTile

Individual product card with image, name, price, variation swatches. In SFRA loaded via remote include for per-tile caching. React target uses ProductGrid which renders individual product cards.

Used by: 04-plp-product-grid

### CategoryRefinements

Existing React component for rendering refinement filters. SFRA has color/size swatch rendering and expandable sections that may need enhancement.

Used by: 02-plp-filter-actions-bar, 03-plp-refinement-sidebar

### CategorySorting

Existing React component for sort-by dropdown. Already implemented in the target.

Used by: 02-plp-filter-actions-bar

### CategoryPagination

Existing React component for page-based navigation. May need an InfiniteScroll alternative or wrapper.

Used by: 06-plp-infinite-scroll

### ContentAssetRenderer

Renders SFCC content asset HTML body. Needed for both the top banner and in-grid promotional banners. Equivalent to ISML slots/content/contentassetbody.isml.

Used by: 01-plp-category-banner, 05-plp-ingrid-banners

### Region (Page Designer)

React target already has Region component with plpTopFullWidth, plpTopContent, plpBottom regions. The category banner could potentially be served through Page Designer instead of the legacy slot system.

Used by: 01-plp-category-banner
