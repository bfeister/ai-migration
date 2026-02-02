/**
 * Copyright 2026 Salesforce, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
import { Skeleton } from '@/components/ui/skeleton';

/**
 * ProductSkeleton component provides a loading state placeholder for product pages.
 *
 * This skeleton component mimics the layout of a product page including:
 * - Breadcrumb navigation
 * - Mobile product title and description
 * - Two-column layout with image gallery and product info
 * - Product information accordion
 * - Recommended products section
 *
 * Used to improve perceived performance while product data is being fetched
 * from the commerce API, providing visual feedback to users during loading states.
 * @returns A skeleton layout matching the product page structure
 */
export default function ProductSkeleton() {
    return (
        <div className="min-h-screen bg-background" data-testid="product-skeleton">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                {/* Promo Content Region placeholder */}
                <div className="mb-8" data-testid="promo-content-skeleton">
                    {/* Commented out for the time being, until required Page Designer metadata is available across the grid */}
                    {/*<Skeleton className="h-16 w-full rounded-lg" />*/}
                </div>

                {/* Mobile Product Title skeleton - shown on mobile only */}
                <div className="block md:hidden mb-8" data-testid="mobile-title-skeleton">
                    <Skeleton className="h-8 w-3/4 mb-2" />
                    <Skeleton className="h-4 w-full mb-1" />
                    <Skeleton className="h-4 w-2/3" />
                </div>

                <div className="space-y-8">
                    {/* Main Product Layout */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 space-y-6">
                        {/* Left Column - Image Gallery skeleton */}
                        <div className="order-1">
                            <ImageGallerySkeleton />
                        </div>

                        {/* Right Column - Product Info skeleton */}
                        <div className="order-2">
                            <ProductInfoSkeleton />
                        </div>
                    </div>

                    {/* Engagement Content / Recommended Products Section skeleton */}
                    <div className="mt-16">
                        <RecommendedProductsSkeleton />
                    </div>
                </div>
            </div>
        </div>
    );
}

/**
 * ImageGallerySkeleton component provides a loading state for the product image gallery.
 *
 * Renders skeleton placeholders for:
 * - Main product image (square aspect ratio)
 * - Thumbnail navigation images
 * @returns A skeleton layout for the product image gallery
 */
function ImageGallerySkeleton() {
    return (
        <div className="space-y-4" data-testid="image-gallery-skeleton">
            {/* Main product image */}
            <Skeleton className="aspect-square w-full rounded-lg" data-testid="main-image-skeleton" />

            {/* Thumbnail images */}
            <div className="flex space-x-2 overflow-x-auto" data-testid="thumbnails-skeleton">
                <Skeleton className="h-16 w-16 flex-shrink-0 rounded-md" />
                <Skeleton className="h-16 w-16 flex-shrink-0 rounded-md" />
                <Skeleton className="h-16 w-16 flex-shrink-0 rounded-md" />
                <Skeleton className="h-16 w-16 flex-shrink-0 rounded-md" />
                <Skeleton className="h-16 w-16 flex-shrink-0 rounded-md" />
            </div>
        </div>
    );
}

/**
 * ProductInfoSkeleton component provides a loading state for the product information section.
 *
 * Renders skeleton placeholders for:
 * - Product title and description (desktop only)
 * - Price information
 * - Product variant options (size, color, etc.)
 * - Quantity selector
 * - Add to cart and wishlist buttons
 * - Product features list
 * @returns A skeleton layout for the product information panel
 */
function ProductInfoSkeleton() {
    return (
        <div className="grid gap-4" data-testid="product-info-skeleton">
            {/* Breadcrumbs skeleton - inside right column like original */}
            <div className="hidden md:block" data-testid="breadcrumbs-skeleton">
                <nav aria-label="Breadcrumb" className="mb-6">
                    <div className="flex flex-wrap items-center text-sm">
                        <Skeleton className="h-5 w-20" />
                        <Skeleton className="mx-1 h-3 w-3" />
                        <Skeleton className="h-5 w-24" />
                        <Skeleton className="mx-1 h-3 w-3" />
                        <Skeleton className="h-5 w-32" />
                    </div>
                </nav>
            </div>

            {/* Desktop Product Title */}
            <div className="hidden md:block" data-testid="desktop-title-skeleton">
                <Skeleton className="h-9 w-3/4 mb-2" />
                <Skeleton className="h-5 w-full mb-1" />
                <Skeleton className="h-5 w-2/3" />
            </div>

            {/* Price */}
            <div data-testid="price-skeleton">
                <Skeleton className="h-7 w-24" />
            </div>

            {/* Inventory Status Message */}
            <div data-testid="inventory-skeleton">
                <Skeleton className="h-5 w-32" />
            </div>

            {/* Product options/variants (Swatch Groups) */}
            <div className="space-y-4" data-testid="variants-skeleton">
                <div>
                    <Skeleton className="h-5 w-20 mb-2" />
                    <div className="flex space-x-2">
                        <Skeleton className="h-10 w-10 rounded-full" />
                        <Skeleton className="h-10 w-10 rounded-full" />
                        <Skeleton className="h-10 w-10 rounded-full" />
                    </div>
                </div>

                <div>
                    <Skeleton className="h-5 w-16 mb-2" />
                    <div className="flex space-x-2">
                        <Skeleton className="h-10 w-14 rounded-md" />
                        <Skeleton className="h-10 w-14 rounded-md" />
                        <Skeleton className="h-10 w-14 rounded-md" />
                    </div>
                </div>
            </div>

            {/* Quantity selector */}
            <div data-testid="quantity-skeleton">
                <Skeleton className="h-5 w-20 mb-2" />
                <Skeleton className="h-10 w-24 rounded-md" />
            </div>

            {/* Delivery Options (BOPIS) */}
            <div className="mt-6" data-testid="delivery-options-skeleton">
                <Skeleton className="h-5 w-32 mb-3" />
                <div className="space-y-2">
                    <Skeleton className="h-12 w-full rounded-md" />
                    <Skeleton className="h-12 w-full rounded-md" />
                </div>
            </div>

            {/* Product features */}
            <div className="space-y-2" data-testid="features-skeleton">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-5/6" />
                <Skeleton className="h-4 w-4/5" />
            </div>

            {/* Cart Actions */}
            <div className="mt-6" data-testid="cart-actions-skeleton">
                {/* Add to cart button */}
                <div className="flex flex-col gap-3">
                    <Skeleton className="h-12 w-full rounded-md" data-testid="add-to-cart-skeleton" />

                    {/* Wishlist + Share buttons (2-column grid) */}
                    <div className="grid grid-cols-2 gap-3">
                        <Skeleton className="h-12 w-full rounded-md" data-testid="wishlist-skeleton" />
                        <Skeleton className="h-12 w-full rounded-md" data-testid="share-skeleton" />
                    </div>
                </div>
            </div>
        </div>
    );
}

/**
 * RecommendationSectionSkeleton component provides a loading state for a single recommendation section.
 * @returns A skeleton layout for a single recommendation section
 */
function RecommendationSectionSkeleton() {
    return (
        <div className="space-y-6" data-testid="recommendation-section-skeleton">
            {/* Section title */}
            <Skeleton className="h-8 w-48" />

            {/* Product carousel */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                {Array.from({ length: 4 }, (_, i) => i).map((index) => (
                    <div key={index} className="space-y-3" data-testid="recommended-product-item">
                        <Skeleton className="aspect-square w-full rounded-md" />
                        <div className="space-y-2">
                            <Skeleton className="h-4 w-full" />
                            <Skeleton className="h-4 w-3/4" />
                            <Skeleton className="h-5 w-16" />
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

/**
 * RecommendedProductsSkeleton component provides a loading state for the recommended products section.
 *
 * Renders a single recommendation section skeleton. Additional sections are not rendered
 * as they are typically below the initial viewport fold.
 * @returns A skeleton layout for the recommended products section
 */
function RecommendedProductsSkeleton() {
    return (
        <div data-testid="recommended-products-skeleton">
            <RecommendationSectionSkeleton />
        </div>
    );
}
