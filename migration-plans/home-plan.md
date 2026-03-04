# Migration Plan: Home Page

**Page ID:** `home`
**Discovered:** 2026-02-23T00:00:00.000Z
**ISML Template:** `/Users/bfeister/dev/test-storefront/storefront-reference-architecture/cartridge/templates/default/content/home/homepage.isml`
**Total Features:** 5

---

## Migration Order

Features should be migrated in this order:

1. **Primary Hero Banner** (`01-home-banner-1`) - low complexity
2. **Full-Height Banner Section 2** (`02-home-banner-2`) - low complexity
3. **Full-Height Banner Section 3** (`03-home-banner-3`) - low complexity
4. **Homepage Carousel** (`04-home-carousel`) - medium complexity
5. **Full-Height Banner Section 5** (`05-home-banner-5`) - low complexity

---

## Feature Details

### 01-home-banner-1: Primary Hero Banner

Main homepage banner slot at top of page. Renders content asset HTML (likely a full-width hero image with CTA overlay). Does NOT have the slot-full-height class, so may be a shorter/auto-height banner.

**Selector:** `#home-slot-1`
**Complexity:** low
**Priority:** 1

**ISML Source:**
- Lines: 9-11
- Slot ID: `lk-content-home-banner-1`
- Template: `slots/content/contentassetbody.isml`
- Content Type: content-asset

> Content asset body is raw HTML stored in SFCC. Migration requires fetching the content asset via OCAPI/SCAPI and rendering the HTML body. Consider sanitizing or converting to structured React components if the HTML is complex.

---

### 02-home-banner-2: Full-Height Banner Section 2

Second homepage banner, rendered as a full-viewport-height section (has slot-full-height class). Displays content asset HTML — likely a lifestyle image with text overlay.

**Selector:** `#home-slot-2`
**Complexity:** low
**Priority:** 2

**ISML Source:**
- Lines: 12-14
- Slot ID: `lk-content-home-banner-2`
- Template: `slots/content/contentassetbody.isml`
- Content Type: content-asset

**Dependencies:** 01-home-banner-1

> The slot-full-height class suggests CSS that makes this section fill the viewport height. Ensure the React component replicates this full-height layout behavior.

---

### 03-home-banner-3: Full-Height Banner Section 3

Third homepage banner, also full-viewport-height. Renders content asset HTML — another promotional or brand storytelling section.

**Selector:** `#home-slot-3`
**Complexity:** low
**Priority:** 3

**ISML Source:**
- Lines: 15-17
- Slot ID: `lk-content-home-banner-3`
- Template: `slots/content/contentassetbody.isml`
- Content Type: content-asset

**Dependencies:** 01-home-banner-1

> Same structural pattern as 02-home-banner-2. Once the ContentAssetSlot component and full-height CSS are established, this is a repeat application.

---

### 04-home-carousel: Homepage Carousel

Carousel section (slot 4). Despite using the same contentassetbody.isml template, the content asset likely contains carousel HTML/JS (e.g., product image carousel or featured items slider). Does NOT have slot-full-height class.

**Selector:** `#home-slot-4`
**Complexity:** medium
**Priority:** 4

**ISML Source:**
- Lines: 18-20
- Slot ID: `lk-content-home-carousel`
- Template: `slots/content/contentassetbody.isml`
- Content Type: content-asset

**Dependencies:** 01-home-banner-1

> The slot name includes 'carousel', indicating interactive sliding behavior. The content asset body likely contains markup for a carousel (possibly using Slick, Owl, or custom JS). Migration will need a React carousel component (e.g., Swiper, Embla) to replace the legacy JS carousel. Inspect the actual content asset HTML on the live site to determine carousel structure.

---

### 05-home-banner-5: Full-Height Banner Section 5

Fifth and final homepage banner, full-viewport-height. Renders content asset HTML — likely a closing promotional or brand section at the bottom of the homepage.

**Selector:** `#home-slot-5`
**Complexity:** low
**Priority:** 5

**ISML Source:**
- Lines: 21-23
- Slot ID: `lk-content-home-banner-5`
- Template: `slots/content/contentassetbody.isml`
- Content Type: content-asset

**Dependencies:** 01-home-banner-1

> Same pattern as banners 2 and 3. By this point, the reusable ContentAssetSlot component should be fully established.

---

## Shared Components

### ContentAssetSlot

Reusable component that fetches a content asset by ID via OCAPI/SCAPI and renders its HTML body. All 5 homepage slots use the same contentassetbody.isml template, so a single React component can serve all of them. Should accept props for content-asset-id and optional CSS class overrides (e.g., slot-full-height).

Used by: 01-home-banner-1, 02-home-banner-2, 03-home-banner-3, 04-home-carousel, 05-home-banner-5

### CarouselWrapper

React carousel component (e.g., Embla Carousel or Swiper) to replace whatever legacy JS carousel is embedded in the lk-home-carousel content asset. May need to parse the content asset HTML to extract individual slides.

Used by: 04-home-carousel
