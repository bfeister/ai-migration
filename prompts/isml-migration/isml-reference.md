# ISML to React Migration Reference

This document provides universal knowledge for converting SFRA ISML templates to React 19 + React Router 7 components. This knowledge applies to ALL ISML migrations.

---

## ISML Core Concepts

### Template Decoration (`<isdecorate>`)

ISML templates are wrapped in layouts using `<isdecorate>`:

```isml
<isdecorate template="common/layout/page">
    <!-- Page content here -->
</isdecorate>
```

**React Equivalent:** Layout is handled by React Router's nested routes. The `_app.tsx` layout wrapper provides header/footer automatically. No explicit decoration needed in child routes.

### Template Includes (`<isinclude>`)

ISML includes other templates:

```isml
<isinclude template="components/header" />
<isinclude url="${URLUtils.url('Controller-Action')}" />
```

**React Equivalent:**
- Static includes → Import React components
- URL includes (remote includes) → Use `<Suspense>` + `<Await>` with loader data, or client-side fetch

### Content Slots (`<isslot>`)

SFRA slots are CMS-managed content regions:

```isml
<isslot id="home-main-m" description="Main slot" context="global" />
```

**Resolution Path:**
1. `<isslot id="xyz">` in ISML
2. `slots.xml` defines `<slot-configuration slot-id="xyz">`
3. Slot config specifies `<template>` (another ISML) and `<content>` (data source)
4. Content can be: `<content-assets>`, `<products>`, `<categories>`, or `<html>`

**React Equivalent Options:**
1. **Page Designer Regions** - Use `<Region>` component with `ShopperExperience` API
2. **Direct API calls** - Fetch slot content via Commerce Cloud APIs in loader
3. **Static content** - For hardcoded content, render directly as React components

### Loops (`<isloop>`)

```isml
<isloop items="${products}" var="product" status="loopState">
    <div class="product">${product.name}</div>
    <isif condition="${loopState.first}">First item!</isif>
</isloop>
```

**React Equivalent:**
```tsx
{products.map((product, index) => (
    <div key={product.id} className="product">
        {product.name}
        {index === 0 && <span>First item!</span>}
    </div>
))}
```

### Conditionals (`<isif>`)

```isml
<isif condition="${pdict.isLoggedIn}">
    Welcome back!
<iselseif condition="${pdict.isGuest}">
    Guest user
<iselse>
    Please log in
</isif>
```

**React Equivalent:**
```tsx
{isLoggedIn ? (
    <span>Welcome back!</span>
) : isGuest ? (
    <span>Guest user</span>
) : (
    <span>Please log in</span>
)}
```

### Output (`<isprint>`)

```isml
<isprint value="${product.name}" encoding="htmlcontent" />
<isprint value="${richText}" encoding="off" />
```

**React Equivalent:**
- `encoding="htmlcontent"` (default) → React auto-escapes: `{product.name}`
- `encoding="off"` → Use `dangerouslySetInnerHTML` (avoid if possible)

### Variables (`<isset>`)

```isml
<isset name="totalPrice" value="${cart.total}" scope="page" />
```

**React Equivalent:** Use JavaScript variables, React state, or loader data.

### Server Scripts (`<isscript>`)

```isml
<isscript>
    var assets = require('*/cartridge/scripts/assets.js');
    assets.addJs('/js/productTile.js');
    assets.addCss('/css/homePage.css');
</isscript>
```

**React Equivalent:**
- CSS → Import CSS modules or use Tailwind
- JS → Import/use React hooks and components
- Asset registration → Handle via Vite/bundler

---

## SFRA Data Access Patterns

### Pipeline Dictionary (`pdict`)

SFRA controllers populate `pdict` with data passed to templates:

```isml
${pdict.product.name}
${pdict.CurrentCustomer.profile.firstName}
```

**React Equivalent:** Data comes from React Router loader:

```tsx
export function loader({ context }: LoaderFunctionArgs) {
    return {
        product: fetchProduct(context, productId),
        customer: getCurrentCustomer(context),
    };
}

export default function Page({ loaderData }: { loaderData: LoaderData }) {
    const { product, customer } = loaderData;
}
```

### Resource Bundles (`Resource.msg()`)

```isml
${Resource.msg('button.addtocart', 'product', null)}
${Resource.msg('label.price', 'common', 'Default Price')}
```

**React Equivalent:** Use `react-i18next`:

```tsx
import { useTranslation } from 'react-i18next';

function Component() {
    const { t } = useTranslation('product');
    return <button>{t('button.addtocart')}</button>;
}
```

### URL Generation (`URLUtils`)

```isml
${URLUtils.url('Product-Show', 'pid', product.ID)}
${URLUtils.abs('Home-Show')}
${URLUtils.staticURL('/images/logo.png')}
```

**React Equivalent:**
- Internal routes → Use `<Link to="/product/${productId}">`
- Absolute URLs → Use full URL strings
- Static assets → Import or use public path

---

## Common Slot Content Templates

### `contentAssetBody.isml`

Renders content asset body HTML:

```isml
<isloop items="${slotcontent.content}" var="contentAsset">
    <isprint value="${contentAsset.custom.body}" encoding="off"/>
</isloop>
```

**React:** Fetch content asset via API, render with `dangerouslySetInnerHTML` or parse to components.

### `homePageProductSlot.isml`

Renders product tiles in a grid:

```isml
<isloop items="${slotcontent.content}" var="product">
    <isinclude url="${URLUtils.url('Tile-Show', 'pid', product.ID)}"/>
</isloop>
```

**React:** Fetch products via `ShopperSearch` API, render with `ProductTile` components.

### `htmlSlotContainer.isml`

Renders raw HTML from slot configuration:

```isml
<isprint value="${slotcontent.markup}" encoding="off"/>
```

**React:** Use `dangerouslySetInnerHTML` or avoid if content can be structured.

---

## Bootstrap to Tailwind Mapping

| Bootstrap | Tailwind |
|-----------|----------|
| `container` | `container mx-auto px-4` |
| `row` | `flex flex-wrap` or `grid` |
| `col-6` | `w-1/2` or `basis-1/2` |
| `col-sm-4` | `sm:w-1/3` or `sm:basis-1/3` |
| `col-md-6 col-lg-4` | `md:w-1/2 lg:w-1/3` |
| `no-gutters` | `gap-0` |
| `d-none d-md-block` | `hidden md:block` |
| `text-center` | `text-center` |
| `btn btn-primary` | Custom button component |
| `form-control` | `w-full px-3 py-2 border rounded` |
| `input-group` | `flex` |
| `input-group-append` | Child of flex container |

---

## jQuery to React Patterns

### Event Handling

```javascript
// jQuery
$('.subscribe-email').on('click', function(e) {
    e.preventDefault();
    $.ajax({ url: $(this).data('href'), ... });
});
```

```tsx
// React
function EmailForm() {
    const fetcher = useFetcher();
    return (
        <fetcher.Form method="post" action="/action/subscribe">
            <button type="submit">Subscribe</button>
        </fetcher.Form>
    );
}
```

### AJAX Requests

```javascript
// jQuery
$.ajax({
    url: URLUtils.url('Controller-Action'),
    method: 'POST',
    data: { pid: productId },
    success: function(response) { ... }
});
```

```tsx
// React Router
const fetcher = useFetcher();
fetcher.submit({ pid: productId }, {
    method: 'POST',
    action: '/action/controller-action'
});
```

### DOM Manipulation

```javascript
// jQuery
$('.product-tile').addClass('selected');
$('#quantity').val(newQty);
```

```tsx
// React - Use state
const [selected, setSelected] = useState(false);
const [quantity, setQuantity] = useState(1);

<div className={cn('product-tile', selected && 'selected')} />
<input value={quantity} onChange={e => setQuantity(e.target.value)} />
```

---

## React Router 7 Patterns

### Loader Pattern

```tsx
import { type LoaderFunctionArgs } from 'react-router';

export function loader({ context, params }: LoaderFunctionArgs) {
    return {
        // Return promises for streaming
        products: fetchProducts(context),
        categories: fetchCategories(context),
    };
}
```

### Streaming with Suspense

```tsx
import { Suspense } from 'react';
import { Await } from 'react-router';

export default function Page({ loaderData }) {
    return (
        <Suspense fallback={<Skeleton />}>
            <Await resolve={loaderData.products}>
                {(products) => <ProductGrid products={products} />}
            </Await>
        </Suspense>
    );
}
```

### Action Pattern

```tsx
export async function action({ request }: ActionFunctionArgs) {
    const formData = await request.formData();
    // Process form submission
    return { success: true };
}
```

---

## Storefront Next API Patterns

### Creating API Clients

```tsx
import { createApiClients } from '@/lib/api-clients';

const clients = createApiClients(context);
const result = await clients.shopperSearch.productSearch({ ... });
```

### Common API Methods

- `shopperSearch.productSearch()` - Search/browse products
- `shopperProducts.getProduct()` - Single product details
- `shopperProducts.getCategory()` - Category information
- `shopperExperience.getPage()` - Page Designer content
- `shopperCustomers.*` - Customer operations
- `shopperBaskets.*` - Cart/basket operations

---

## File Naming Conventions

### React Router 7 Flat Routes

| Route Pattern | File Name |
|--------------|-----------|
| `/` (index) | `_app._index.tsx` |
| `/about` | `_app.about.tsx` |
| `/product/:id` | `_app.product.$productId.tsx` |
| `/category/:id` | `_app.category.$categoryId.tsx` |
| Action-only | `action.email-subscribe.ts` |
| Resource | `resource.api.$resource.ts` |

### Component Organization

```
src/
├── components/
│   └── {feature-name}/
│       ├── index.tsx          # Main component + exports
│       ├── {sub-component}.tsx
│       └── stories/           # Storybook stories
├── routes/
│   └── _app.{route-name}.tsx  # Route components
└── lib/
    └── api/                   # API utilities
```
