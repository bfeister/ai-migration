# ISML + Bootstrap + jQuery → React 19 Migration Cookbook

This cookbook provides opinionated recipes for migrating SFRA storefronts to React 19. All recipes enforce strict technology choices with no alternatives.

---

## Table of Contents

1. [Component Patterns](#1-component-patterns)
2. [ISML Template Conversions](#2-isml-template-conversions)
3. [Bootstrap Grid to Tailwind](#3-bootstrap-grid-to-tailwind)
4. [Bootstrap Components to Radix/Tailwind](#4-bootstrap-components-to-radixtailwind)
5. [jQuery DOM Manipulation](#5-jquery-dom-manipulation)
6. [jQuery AJAX to Server Actions](#6-jquery-ajax-to-server-actions)
7. [jQuery Events to React](#7-jquery-events-to-react)
8. [jQuery Plugins to React Components](#8-jquery-plugins-to-react-components)
9. [Form Handling](#9-form-handling)
10. [Data Fetching](#10-data-fetching)
11. [State Management](#11-state-management)
12. [Animation & Transitions](#12-animation--transitions)

---

## 1. Component Patterns

### Server Component (Default)

Use for static content and data fetching. No directive needed.

```tsx
// src/components/product/ProductDetails.tsx
import { getProduct } from '@/lib/api/products';

interface ProductDetailsProps {
  productId: string;
}

export async function ProductDetails({ productId }: ProductDetailsProps) {
  const product = await getProduct(productId);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">{product.name}</h1>
      <p className="text-muted-foreground">{product.description}</p>
    </div>
  );
}
```

### Client Component

Use ONLY when you need interactivity, hooks, or browser APIs.

```tsx
// src/components/product/AddToCartButton.tsx
'use client';

import { useActionState } from 'react';
import { addToCart } from '@/actions/cart';

interface AddToCartButtonProps {
  productId: string;
  variant: string;
}

export function AddToCartButton({ productId, variant }: AddToCartButtonProps) {
  const [state, action, isPending] = useActionState(addToCart, null);

  return (
    <form action={action}>
      <input type="hidden" name="productId" value={productId} />
      <input type="hidden" name="variant" value={variant} />
      <button
        type="submit"
        disabled={isPending}
        className="rounded-md bg-primary px-4 py-2 text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
      >
        {isPending ? 'Adding...' : 'Add to Cart'}
      </button>
      {state?.error && (
        <p className="mt-2 text-sm text-destructive">{state.error}</p>
      )}
    </form>
  );
}
```

---

## 2. ISML Template Conversions

### Conditionals

**ISML:**
```html
<isif condition="${pdict.product.available}">
    <span class="in-stock">In Stock</span>
<iselseif condition="${pdict.product.preorder}">
    <span class="preorder">Pre-order</span>
<iselse>
    <span class="out-of-stock">Out of Stock</span>
</isif>
```

**React 19:**
```tsx
function StockStatus({ product }: { product: Product }) {
  if (product.available) {
    return <span className="text-green-600">In Stock</span>;
  }
  if (product.preorder) {
    return <span className="text-amber-600">Pre-order</span>;
  }
  return <span className="text-destructive">Out of Stock</span>;
}
```

### Loops

**ISML:**
```html
<isloop items="${pdict.products}" var="product" status="loopstate">
    <div class="col-md-4">
        <isinclude template="product/productTile" />
    </div>
</isloop>
```

**React 19:**
```tsx
function ProductGrid({ products }: { products: Product[] }) {
  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
      {products.map((product, index) => (
        <ProductTile key={product.id} product={product} index={index} />
      ))}
    </div>
  );
}
```

### Includes

**ISML:**
```html
<isinclude template="components/header" />
<isinclude template="product/productCard" sf-toolkit="off" />
```

**React 19:**
```tsx
import { Header } from '@/components/layout/Header';
import { ProductCard } from '@/components/product/ProductCard';

export function Page() {
  return (
    <>
      <Header />
      <ProductCard product={product} />
    </>
  );
}
```

### Decorators (Layouts)

**ISML:**
```html
<isdecorate template="common/layout/page">
    <isreplace name="content">
        <div class="product-page">...</div>
    </isreplace>
</isdecorate>
```

**React 19:**
```tsx
// src/app/layout.tsx
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Header />
        <main>{children}</main>
        <Footer />
      </body>
    </html>
  );
}

// src/app/products/[id]/page.tsx
export default function ProductPage() {
  return <div className="product-page">...</div>;
}
```

### Print with Encoding

**ISML:**
```html
<isprint value="${pdict.product.name}" encoding="htmlcontent" />
<isprint value="${pdict.product.price}" style="MONEY_LONG" />
```

**React 19:**
```tsx
// Text content - direct interpolation (auto-escaped)
<span>{product.name}</span>

// Currency formatting
import { formatPrice } from '@/lib/formatters';
<span>{formatPrice(product.price, currency)}</span>

// lib/formatters.ts
export function formatPrice(amount: number, currency: string): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format(amount);
}
```

### Content Assets

**ISML:**
```html
<iscontentasset aid="homepage-banner" />
```

**React 19:**
```tsx
// Fetch from CMS (Amplience, Contentful, etc.)
import { getContentAsset } from '@/lib/cms';

export async function HomeBanner() {
  const content = await getContentAsset('homepage-banner');
  return (
    <div
      className="prose max-w-none"
      dangerouslySetInnerHTML={{ __html: content.html }}
    />
  );
}
```

---

## 3. Bootstrap Grid to Tailwind

### Container

**Bootstrap:**
```html
<div class="container">
<div class="container-fluid">
```

**Tailwind:**
```tsx
// Standard container (max-width responsive)
<div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">

// Fluid (full-width with padding)
<div className="w-full px-4 sm:px-6 lg:px-8">
```

### Row + Columns (Flexbox approach)

**Bootstrap:**
```html
<div class="row">
    <div class="col-12 col-md-6 col-lg-4">Column 1</div>
    <div class="col-12 col-md-6 col-lg-4">Column 2</div>
    <div class="col-12 col-md-6 col-lg-4">Column 3</div>
</div>
```

**Tailwind:**
```tsx
<div className="flex flex-wrap -mx-4">
  <div className="w-full px-4 md:w-1/2 lg:w-1/3">Column 1</div>
  <div className="w-full px-4 md:w-1/2 lg:w-1/3">Column 2</div>
  <div className="w-full px-4 md:w-1/2 lg:w-1/3">Column 3</div>
</div>
```

### Row + Columns (CSS Grid approach - PREFERRED)

**Tailwind:**
```tsx
<div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
  <div>Column 1</div>
  <div>Column 2</div>
  <div>Column 3</div>
</div>
```

### Offset Columns

**Bootstrap:**
```html
<div class="col-md-6 offset-md-3">Centered</div>
```

**Tailwind:**
```tsx
<div className="mx-auto w-full md:w-1/2">Centered</div>
// Or with grid:
<div className="md:col-start-4 md:col-span-6">Centered</div>
```

---

## 4. Bootstrap Components to Radix/Tailwind

### Modal/Dialog

**Bootstrap + jQuery:**
```html
<button data-toggle="modal" data-target="#myModal">Open</button>
<div class="modal fade" id="myModal">
    <div class="modal-dialog">
        <div class="modal-content">
            <div class="modal-header">
                <h5 class="modal-title">Title</h5>
                <button class="close" data-dismiss="modal">&times;</button>
            </div>
            <div class="modal-body">Content</div>
            <div class="modal-footer">
                <button class="btn btn-secondary" data-dismiss="modal">Close</button>
            </div>
        </div>
    </div>
</div>
```

**React 19 + Radix:**
```tsx
'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';

export function Modal({ trigger, title, children }: ModalProps) {
  return (
    <Dialog.Root>
      <Dialog.Trigger asChild>{trigger}</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content className="fixed left-1/2 top-1/2 w-full max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-lg bg-background p-6 shadow-lg">
          <Dialog.Title className="text-lg font-semibold">{title}</Dialog.Title>
          <Dialog.Close className="absolute right-4 top-4 rounded-sm opacity-70 hover:opacity-100">
            <X className="h-4 w-4" />
          </Dialog.Close>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
```

### Dropdown

**Bootstrap + jQuery:**
```html
<div class="dropdown">
    <button class="btn dropdown-toggle" data-toggle="dropdown">Menu</button>
    <div class="dropdown-menu">
        <a class="dropdown-item" href="#">Action</a>
        <a class="dropdown-item" href="#">Another</a>
    </div>
</div>
```

**React 19 + Radix:**
```tsx
'use client';

import * as DropdownMenu from '@radix-ui/react-dropdown-menu';

export function Dropdown({ trigger, items }: DropdownProps) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>{trigger}</DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content className="min-w-[160px] rounded-md border bg-popover p-1 shadow-md">
          {items.map((item) => (
            <DropdownMenu.Item
              key={item.id}
              className="cursor-pointer rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent"
              onSelect={item.onSelect}
            >
              {item.label}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
```

### Accordion/Collapse

**Bootstrap + jQuery:**
```html
<div class="accordion" id="accordionExample">
    <div class="card">
        <div class="card-header">
            <button class="btn" data-toggle="collapse" data-target="#collapseOne">
                Section 1
            </button>
        </div>
        <div id="collapseOne" class="collapse show" data-parent="#accordionExample">
            <div class="card-body">Content 1</div>
        </div>
    </div>
</div>
```

**React 19 + Radix:**
```tsx
'use client';

import * as Accordion from '@radix-ui/react-accordion';
import { ChevronDown } from 'lucide-react';

export function AccordionComponent({ items }: AccordionProps) {
  return (
    <Accordion.Root type="single" collapsible className="w-full">
      {items.map((item) => (
        <Accordion.Item key={item.id} value={item.id} className="border-b">
          <Accordion.Header>
            <Accordion.Trigger className="flex w-full items-center justify-between py-4 font-medium hover:underline [&[data-state=open]>svg]:rotate-180">
              {item.title}
              <ChevronDown className="h-4 w-4 transition-transform" />
            </Accordion.Trigger>
          </Accordion.Header>
          <Accordion.Content className="overflow-hidden data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down">
            <div className="pb-4">{item.content}</div>
          </Accordion.Content>
        </Accordion.Item>
      ))}
    </Accordion.Root>
  );
}
```

### Tabs

**Bootstrap + jQuery:**
```html
<ul class="nav nav-tabs">
    <li class="nav-item">
        <a class="nav-link active" data-toggle="tab" href="#tab1">Tab 1</a>
    </li>
</ul>
<div class="tab-content">
    <div class="tab-pane active" id="tab1">Content 1</div>
</div>
```

**React 19 + Radix:**
```tsx
'use client';

import * as Tabs from '@radix-ui/react-tabs';

export function TabsComponent({ tabs }: TabsProps) {
  return (
    <Tabs.Root defaultValue={tabs[0].id}>
      <Tabs.List className="flex border-b">
        {tabs.map((tab) => (
          <Tabs.Trigger
            key={tab.id}
            value={tab.id}
            className="border-b-2 border-transparent px-4 py-2 data-[state=active]:border-primary"
          >
            {tab.label}
          </Tabs.Trigger>
        ))}
      </Tabs.List>
      {tabs.map((tab) => (
        <Tabs.Content key={tab.id} value={tab.id} className="py-4">
          {tab.content}
        </Tabs.Content>
      ))}
    </Tabs.Root>
  );
}
```

### Tooltip

**Bootstrap + jQuery:**
```html
<button data-toggle="tooltip" title="Helpful tip">Hover me</button>
<script>$('[data-toggle="tooltip"]').tooltip();</script>
```

**React 19 + Radix:**
```tsx
'use client';

import * as Tooltip from '@radix-ui/react-tooltip';

export function TooltipComponent({ trigger, content }: TooltipProps) {
  return (
    <Tooltip.Provider>
      <Tooltip.Root>
        <Tooltip.Trigger asChild>{trigger}</Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content
            className="rounded-md bg-popover px-3 py-1.5 text-sm shadow-md"
            sideOffset={4}
          >
            {content}
            <Tooltip.Arrow className="fill-popover" />
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  );
}
```

---

## 5. jQuery DOM Manipulation

### Show/Hide

**jQuery:**
```javascript
$('#element').show();
$('#element').hide();
$('#element').toggle();
```

**React 19:**
```tsx
'use client';

import { useState } from 'react';

export function ToggleContent() {
  const [isVisible, setIsVisible] = useState(true);

  return (
    <>
      <button onClick={() => setIsVisible((v) => !v)}>Toggle</button>
      {isVisible && <div>Content</div>}
    </>
  );
}
```

### Add/Remove Class

**jQuery:**
```javascript
$('#element').addClass('active');
$('#element').removeClass('active');
$('#element').toggleClass('active');
```

**React 19:**
```tsx
'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';

export function ClassToggle() {
  const [isActive, setIsActive] = useState(false);

  return (
    <div className={cn('base-class', isActive && 'active')}>
      <button onClick={() => setIsActive((a) => !a)}>Toggle</button>
    </div>
  );
}

// lib/utils.ts
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

### Set/Get Attribute

**jQuery:**
```javascript
$('#input').attr('disabled', true);
const value = $('#input').val();
$('#input').val('new value');
```

**React 19:**
```tsx
'use client';

import { useState } from 'react';

export function ControlledInput() {
  const [value, setValue] = useState('');
  const [isDisabled, setIsDisabled] = useState(false);

  return (
    <input
      value={value}
      onChange={(e) => setValue(e.target.value)}
      disabled={isDisabled}
      className="rounded-md border px-3 py-2"
    />
  );
}
```

### Find/Parent/Closest

**jQuery:**
```javascript
$('#parent').find('.child');
$('#child').parent();
$('#nested').closest('.container');
```

**React 19:**
```tsx
// Use component composition and props instead of DOM traversal
export function Parent() {
  const handleChildAction = (data: Data) => {
    // Parent handles child events via callbacks
  };

  return (
    <div className="container">
      <Child onAction={handleChildAction} />
    </div>
  );
}

// Or use Context for deeply nested components
const ContainerContext = createContext<ContainerContextValue | null>(null);

export function Container({ children }: { children: React.ReactNode }) {
  const value = { /* shared state */ };
  return (
    <ContainerContext.Provider value={value}>
      {children}
    </ContainerContext.Provider>
  );
}

export function DeepChild() {
  const container = useContext(ContainerContext);
  // Access container data without DOM traversal
}
```

---

## 6. jQuery AJAX to Server Actions

### GET Request

**jQuery:**
```javascript
$.ajax({
    url: '/api/products',
    method: 'GET',
    data: { category: 'shoes' },
    success: function(data) {
        renderProducts(data);
    },
    error: function(xhr) {
        showError(xhr.responseText);
    }
});
```

**React 19 (Server Component):**
```tsx
// src/app/products/page.tsx
interface ProductsPageProps {
  searchParams: Promise<{ category?: string }>;
}

export default async function ProductsPage({ searchParams }: ProductsPageProps) {
  const { category } = await searchParams;
  const products = await getProducts(category);

  return <ProductGrid products={products} />;
}

// src/lib/api/products.ts
export async function getProducts(category?: string): Promise<Product[]> {
  const params = new URLSearchParams();
  if (category) params.set('category', category);

  const response = await fetch(`${API_URL}/products?${params}`, {
    next: { revalidate: 60 }, // Cache for 60 seconds
  });

  if (!response.ok) {
    throw new Error('Failed to fetch products');
  }

  return response.json();
}
```

### POST Request

**jQuery:**
```javascript
$.ajax({
    url: '/api/cart/add',
    method: 'POST',
    data: JSON.stringify({ productId: '123', quantity: 1 }),
    contentType: 'application/json',
    success: function(data) {
        updateCartCount(data.count);
    }
});
```

**React 19 (Server Action):**
```tsx
// src/actions/cart.ts
'use server';

import { revalidatePath } from 'next/cache';

interface AddToCartState {
  success: boolean;
  error?: string;
  cartCount?: number;
}

export async function addToCart(
  prevState: AddToCartState | null,
  formData: FormData
): Promise<AddToCartState> {
  const productId = formData.get('productId') as string;
  const quantity = Number(formData.get('quantity') || 1);

  try {
    const response = await fetch(`${API_URL}/cart/add`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productId, quantity }),
    });

    if (!response.ok) {
      return { success: false, error: 'Failed to add to cart' };
    }

    const data = await response.json();
    revalidatePath('/cart');

    return { success: true, cartCount: data.count };
  } catch (error) {
    return { success: false, error: 'Network error' };
  }
}

// src/components/AddToCartButton.tsx
'use client';

import { useActionState } from 'react';
import { addToCart } from '@/actions/cart';

export function AddToCartButton({ productId }: { productId: string }) {
  const [state, action, isPending] = useActionState(addToCart, null);

  return (
    <form action={action}>
      <input type="hidden" name="productId" value={productId} />
      <button type="submit" disabled={isPending}>
        {isPending ? 'Adding...' : 'Add to Cart'}
      </button>
    </form>
  );
}
```

---

## 7. jQuery Events to React

### Click Handler

**jQuery:**
```javascript
$('.btn-add').on('click', function(e) {
    e.preventDefault();
    const productId = $(this).data('product-id');
    addToCart(productId);
});
```

**React 19:**
```tsx
'use client';

interface ButtonProps {
  productId: string;
}

export function AddButton({ productId }: ButtonProps) {
  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    addToCart(productId);
  };

  return (
    <button onClick={handleClick} className="btn">
      Add to Cart
    </button>
  );
}
```

### Form Submit

**jQuery:**
```javascript
$('#login-form').on('submit', function(e) {
    e.preventDefault();
    const formData = $(this).serialize();
    submitLogin(formData);
});
```

**React 19:**
```tsx
// src/actions/auth.ts
'use server';

export async function login(prevState: LoginState | null, formData: FormData) {
  const email = formData.get('email') as string;
  const password = formData.get('password') as string;

  // Validate and authenticate
  const result = await authenticate(email, password);

  if (!result.success) {
    return { error: result.message };
  }

  redirect('/dashboard');
}

// src/components/LoginForm.tsx
'use client';

import { useActionState } from 'react';
import { login } from '@/actions/auth';

export function LoginForm() {
  const [state, action, isPending] = useActionState(login, null);

  return (
    <form action={action} className="space-y-4">
      <div>
        <label htmlFor="email">Email</label>
        <input id="email" name="email" type="email" required />
      </div>
      <div>
        <label htmlFor="password">Password</label>
        <input id="password" name="password" type="password" required />
      </div>
      {state?.error && <p className="text-destructive">{state.error}</p>}
      <button type="submit" disabled={isPending}>
        {isPending ? 'Logging in...' : 'Log In'}
      </button>
    </form>
  );
}
```

### Input Change

**jQuery:**
```javascript
$('#quantity').on('change', function() {
    const qty = $(this).val();
    updatePrice(qty);
});
```

**React 19:**
```tsx
'use client';

import { useState, useTransition } from 'react';

export function QuantitySelector({ onQuantityChange }: Props) {
  const [quantity, setQuantity] = useState(1);
  const [isPending, startTransition] = useTransition();

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const qty = Number(e.target.value);
    setQuantity(qty);

    startTransition(() => {
      onQuantityChange(qty);
    });
  };

  return (
    <input
      type="number"
      value={quantity}
      onChange={handleChange}
      min={1}
      className="w-20 rounded border px-2 py-1"
    />
  );
}
```

### Document Ready

**jQuery:**
```javascript
$(document).ready(function() {
    initializeSlider();
    loadUserData();
});
```

**React 19:**
```tsx
'use client';

import { useEffect } from 'react';

export function AppInitializer({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    // Run once on mount
    initializeSlider();
    loadUserData();
  }, []);

  return <>{children}</>;
}
```

---

## 8. jQuery Plugins to React Components

### Slick Carousel → Embla Carousel

**jQuery:**
```javascript
$('.product-carousel').slick({
    slidesToShow: 4,
    slidesToScroll: 1,
    responsive: [{ breakpoint: 768, settings: { slidesToShow: 2 } }]
});
```

**React 19:**
```tsx
'use client';

import useEmblaCarousel from 'embla-carousel-react';
import { useCallback } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export function ProductCarousel({ products }: { products: Product[] }) {
  const [emblaRef, emblaApi] = useEmblaCarousel({
    slidesToScroll: 1,
    breakpoints: {
      '(min-width: 768px)': { slidesToScroll: 2 },
      '(min-width: 1024px)': { slidesToScroll: 4 },
    },
  });

  const scrollPrev = useCallback(() => emblaApi?.scrollPrev(), [emblaApi]);
  const scrollNext = useCallback(() => emblaApi?.scrollNext(), [emblaApi]);

  return (
    <div className="relative">
      <div className="overflow-hidden" ref={emblaRef}>
        <div className="flex">
          {products.map((product) => (
            <div key={product.id} className="min-w-0 flex-[0_0_100%] md:flex-[0_0_50%] lg:flex-[0_0_25%] px-2">
              <ProductCard product={product} />
            </div>
          ))}
        </div>
      </div>
      <button onClick={scrollPrev} className="absolute left-0 top-1/2 -translate-y-1/2">
        <ChevronLeft />
      </button>
      <button onClick={scrollNext} className="absolute right-0 top-1/2 -translate-y-1/2">
        <ChevronRight />
      </button>
    </div>
  );
}
```

### Select2 → Radix Select

**jQuery:**
```javascript
$('#country-select').select2({
    placeholder: 'Select a country',
    allowClear: true
});
```

**React 19:**
```tsx
'use client';

import * as Select from '@radix-ui/react-select';
import { Check, ChevronDown } from 'lucide-react';

export function CountrySelect({ countries, value, onChange }: Props) {
  return (
    <Select.Root value={value} onValueChange={onChange}>
      <Select.Trigger className="flex h-10 w-full items-center justify-between rounded-md border px-3">
        <Select.Value placeholder="Select a country" />
        <Select.Icon>
          <ChevronDown className="h-4 w-4" />
        </Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Content className="overflow-hidden rounded-md border bg-popover shadow-md">
          <Select.Viewport className="p-1">
            {countries.map((country) => (
              <Select.Item
                key={country.code}
                value={country.code}
                className="flex cursor-pointer items-center rounded-sm px-2 py-1.5 outline-none hover:bg-accent"
              >
                <Select.ItemText>{country.name}</Select.ItemText>
                <Select.ItemIndicator className="ml-auto">
                  <Check className="h-4 w-4" />
                </Select.ItemIndicator>
              </Select.Item>
            ))}
          </Select.Viewport>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  );
}
```

---

## 9. Form Handling

### Complete Form Example

**SFRA (ISML + jQuery):**
```html
<form id="registration-form" action="${URLUtils.url('Account-SubmitRegistration')}" method="POST">
    <div class="form-group">
        <label for="email">Email</label>
        <input type="email" class="form-control" id="email" name="dwfrm_profile_customer_email" required>
        <div class="invalid-feedback"></div>
    </div>
    <button type="submit" class="btn btn-primary">Register</button>
</form>

<script>
$('#registration-form').on('submit', function(e) {
    e.preventDefault();
    $.ajax({
        url: $(this).attr('action'),
        method: 'POST',
        data: $(this).serialize(),
        success: function(data) {
            if (data.success) {
                window.location.href = data.redirectUrl;
            } else {
                showErrors(data.fields);
            }
        }
    });
});
</script>
```

**React 19:**
```tsx
// src/actions/registration.ts
'use server';

import { z } from 'zod';
import { redirect } from 'next/navigation';

const registrationSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
});

interface RegistrationState {
  errors?: {
    email?: string[];
    password?: string[];
    firstName?: string[];
    lastName?: string[];
    _form?: string[];
  };
  success?: boolean;
}

export async function register(
  prevState: RegistrationState | null,
  formData: FormData
): Promise<RegistrationState> {
  const validatedFields = registrationSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
    firstName: formData.get('firstName'),
    lastName: formData.get('lastName'),
  });

  if (!validatedFields.success) {
    return {
      errors: validatedFields.error.flatten().fieldErrors,
    };
  }

  try {
    await createAccount(validatedFields.data);
  } catch (error) {
    return {
      errors: { _form: ['Registration failed. Please try again.'] },
    };
  }

  redirect('/account');
}

// src/components/RegistrationForm.tsx
'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { register } from '@/actions/registration';

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-md bg-primary px-4 py-2 text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
    >
      {pending ? 'Registering...' : 'Register'}
    </button>
  );
}

export function RegistrationForm() {
  const [state, action] = useActionState(register, null);

  return (
    <form action={action} className="space-y-4">
      <div className="space-y-2">
        <label htmlFor="email" className="text-sm font-medium">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2"
        />
        {state?.errors?.email && (
          <p className="text-sm text-destructive">{state.errors.email[0]}</p>
        )}
      </div>

      <div className="space-y-2">
        <label htmlFor="password" className="text-sm font-medium">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2"
        />
        {state?.errors?.password && (
          <p className="text-sm text-destructive">{state.errors.password[0]}</p>
        )}
      </div>

      {state?.errors?._form && (
        <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {state.errors._form[0]}
        </p>
      )}

      <SubmitButton />
    </form>
  );
}
```

---

## 10. Data Fetching

### Product Detail Page

**SFRA Controller:**
```javascript
// Product-Show.js
server.get('Show', function (req, res, next) {
    var productId = req.querystring.pid;
    var product = ProductMgr.getProduct(productId);

    res.render('product/productDetails', {
        product: product,
        breadcrumbs: getBreadcrumbs(product)
    });
});
```

**React 19:**
```tsx
// src/app/products/[id]/page.tsx
import { notFound } from 'next/navigation';
import { getProduct, getProductBreadcrumbs } from '@/lib/api/products';
import { ProductDetails } from '@/components/product/ProductDetails';
import { Breadcrumbs } from '@/components/ui/Breadcrumbs';

interface ProductPageProps {
  params: Promise<{ id: string }>;
}

export default async function ProductPage({ params }: ProductPageProps) {
  const { id } = await params;
  const [product, breadcrumbs] = await Promise.all([
    getProduct(id),
    getProductBreadcrumbs(id),
  ]);

  if (!product) {
    notFound();
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <Breadcrumbs items={breadcrumbs} />
      <ProductDetails product={product} />
    </div>
  );
}

// Generate static params for common products
export async function generateStaticParams() {
  const products = await getFeaturedProducts();
  return products.map((product) => ({ id: product.id }));
}
```

---

## 11. State Management

### Shared State (Context)

**jQuery (Global State):**
```javascript
window.cart = { items: [], count: 0 };

function updateCart(item) {
    window.cart.items.push(item);
    window.cart.count++;
    $('.cart-count').text(window.cart.count);
}
```

**React 19:**
```tsx
// src/providers/CartProvider.tsx
'use client';

import { createContext, useContext, useOptimistic, useTransition } from 'react';

interface CartContextValue {
  items: CartItem[];
  count: number;
  addItem: (item: CartItem) => void;
  isPending: boolean;
}

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children, initialCart }: Props) {
  const [isPending, startTransition] = useTransition();
  const [optimisticItems, addOptimisticItem] = useOptimistic(
    initialCart.items,
    (state, newItem: CartItem) => [...state, newItem]
  );

  const addItem = (item: CartItem) => {
    startTransition(async () => {
      addOptimisticItem(item);
      await addToCartAction(item);
    });
  };

  return (
    <CartContext.Provider
      value={{
        items: optimisticItems,
        count: optimisticItems.length,
        addItem,
        isPending,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error('useCart must be used within CartProvider');
  }
  return context;
}
```

---

## 12. Animation & Transitions

### Fade In/Out

**jQuery:**
```javascript
$('#element').fadeIn(300);
$('#element').fadeOut(300);
```

**React 19 + Tailwind:**
```tsx
'use client';

import { useState } from 'react';

export function FadeContent() {
  const [isVisible, setIsVisible] = useState(true);

  return (
    <>
      <button onClick={() => setIsVisible((v) => !v)}>Toggle</button>
      <div
        className={`transition-opacity duration-300 ${
          isVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        Content
      </div>
    </>
  );
}
```

### Slide Up/Down

**jQuery:**
```javascript
$('#element').slideUp(300);
$('#element').slideDown(300);
```

**React 19 + Tailwind:**
```tsx
'use client';

import { useState } from 'react';

export function SlideContent() {
  const [isOpen, setIsOpen] = useState(true);

  return (
    <>
      <button onClick={() => setIsOpen((o) => !o)}>Toggle</button>
      <div
        className={`grid transition-all duration-300 ${
          isOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
        }`}
      >
        <div className="overflow-hidden">
          <div className="p-4">Content that slides</div>
        </div>
      </div>
    </>
  );
}
```

---

## Quick Reference Card

| Category | SFRA Pattern | React 19 Pattern |
|----------|--------------|------------------|
| Templates | ISML `<isif>`, `<isloop>` | JSX conditionals, `.map()` |
| Layout | `<isdecorate>` | Layout components |
| Styling | Bootstrap classes | Tailwind classes |
| Grid | `row` + `col-*` | `grid` + `grid-cols-*` |
| Components | Bootstrap JS | Radix UI primitives |
| DOM | jQuery selectors | React refs (sparingly) |
| State | Global vars / jQuery | useState, Context |
| Events | `.on('click')` | `onClick` prop |
| AJAX | `$.ajax()` | Server Actions |
| Forms | `serialize()` + AJAX | `useActionState` |
| Animation | `.fadeIn()`, `.slideUp()` | CSS transitions |
| Plugins | jQuery plugins | React components |
