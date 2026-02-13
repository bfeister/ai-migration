/**
 * Home Page Route - Converted from SFRA homePage.isml
 *
 * SFRA Source: storefront-reference-architecture/cartridges/app_storefront_base/cartridge/templates/default/home/homePage.isml
 *
 * This React Router 7 route component mirrors the SFRA homepage structure:
 * - home-main-m slot → HomeMainSlot component (hero content)
 * - home-categories-m slot → HomeCategoriesSlot component (category tiles)
 * - home-products-m slot → HomeProductsSlot component (product tiles)
 * - home-product-set-m slot → HomeProductSetSlot component (shop the style)
 * - Email signup form at bottom
 *
 * Slot configurations from slots.xml:
 * - home-main-m: contentAssetBody.isml with content-asset "home-main"
 * - home-categories-m: contentAssetBody.isml with content-asset "home-categories"
 * - home-products-m: homePageProductSlot.isml with products
 * - home-product-set-m: contentAssetBody.isml with content-asset "home-product-set-content"
 */
import { Suspense, useState, type FormEvent } from 'react';
import { type LoaderFunctionArgs, Await, useFetcher } from 'react-router';
import type { ShopperProducts, ShopperSearch } from '@salesforce/storefront-next-runtime/scapi';
import { fetchSearchProducts } from '@/lib/api/search';
import { fetchCategories } from '@/lib/api/categories';
import { currencyContext } from '@/lib/currency';
import { getConfig } from '@/config';

// Types for loader data
export type HomePageSFRAData = {
    // Products for home-products-m slot (homePageProductSlot.isml)
    featuredProducts: Promise<ShopperSearch.schemas['ProductSearchResult']>;
    // Categories for home-categories-m slot
    categories: Promise<ShopperProducts.schemas['Category'][]>;
};

/**
 * Server-side loader function - mirrors SFRA homePage controller data loading
 *
 * In SFRA, slot content is resolved at render time via <isslot> tags.
 * In React Router 7, we pre-fetch data in the loader for streaming SSR.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function loader(args: LoaderFunctionArgs): HomePageSFRAData {
    const currency = args.context.get(currencyContext) as string;

    return {
        // Equivalent to home-products-m slot content (products)
        featuredProducts: fetchSearchProducts(args.context, {
            categoryId: 'root',
            limit: getConfig(args.context).pages.home.featuredProductsCount,
            currency: currency ?? undefined,
        }),
        // For home-categories-m slot
        categories: fetchCategories(args.context, 'root', 1),
    };
}

/**
 * Home Main Slot Component
 *
 * SFRA equivalent: <isslot id="home-main-m">
 * slots.xml config: contentAssetBody.isml with content-asset "home-main"
 *
 * In SFRA, this renders content from a content asset's body field.
 * In React, we render a hero section with similar visual structure.
 */
function HomeMainSlot() {
    // In production, this would fetch from a content asset API or CMS
    // For now, render a hero structure matching SFRA visual appearance
    return (
        <div className="relative w-full overflow-hidden bg-gradient-to-r from-gray-900 to-gray-700">
            <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 py-16 lg:py-24">
                <div className="text-center text-white">
                    <h1 className="text-4xl lg:text-6xl font-bold mb-4">
                        Welcome to Our Store
                    </h1>
                    <p className="text-lg lg:text-xl mb-8 text-gray-300">
                        Discover our latest collections and exclusive offers
                    </p>
                    <a
                        href="/category/root"
                        className="inline-block bg-white text-gray-900 px-8 py-3 rounded-lg font-semibold hover:bg-gray-100 transition-colors"
                    >
                        Shop Now
                    </a>
                </div>
            </div>
        </div>
    );
}

/**
 * Home Categories Slot Component
 *
 * SFRA equivalent: <isslot id="home-categories-m">
 * slots.xml config: contentAssetBody.isml with content-asset "home-categories"
 *
 * Structure mirrors SFRA:
 * <div class="container home-categories homepage">
 *   <div class="row home-main-categories no-gutters">
 */
function HomeCategoriesSlot({
    categoriesPromise,
}: {
    categoriesPromise: Promise<ShopperProducts.schemas['Category'][]>;
}) {
    return (
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-12">
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                <Suspense fallback={<CategoryTilesSkeleton />}>
                    <Await resolve={categoriesPromise}>
                        {(categories) =>
                            categories?.slice(0, 4).map((category) => (
                                <a
                                    key={category.id}
                                    href={`/category/${category.id}`}
                                    className="group relative aspect-square overflow-hidden rounded-lg bg-gray-100"
                                >
                                    {category.thumbnail && (
                                        <img
                                            src={category.thumbnail}
                                            alt={category.name || ''}
                                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                                            loading="lazy"
                                        />
                                    )}
                                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                                        <span className="text-white text-lg font-semibold">
                                            {category.name}
                                        </span>
                                    </div>
                                </a>
                            ))
                        }
                    </Await>
                </Suspense>
            </div>
        </div>
    );
}

function CategoryTilesSkeleton() {
    return (
        <>
            {[...Array(4)].map((_, i) => (
                <div
                    key={i}
                    className="aspect-square rounded-lg bg-gray-200 animate-pulse"
                />
            ))}
        </>
    );
}

/**
 * Home Products Slot Component
 *
 * SFRA equivalent: <isslot id="home-products-m">
 * slots.xml config: homePageProductSlot.isml
 *
 * SFRA structure:
 * <div class="container home-product-tiles homepage">
 *   <div class="hp-product-grid" itemtype="http://schema.org/SomeProducts">
 *     <!-- Product tiles via Tile-Show include -->
 *   </div>
 * </div>
 *
 * homePageProductSlot.isml loops through slotcontent.content products
 * and renders each via URLUtils.url('Tile-Show', 'pid', product.ID, ...)
 */
function HomeProductsSlot({
    productsPromise,
}: {
    productsPromise: Promise<ShopperSearch.schemas['ProductSearchResult']>;
}) {
    return (
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-12">
            <h2 className="text-2xl font-bold mb-8">Featured Products</h2>
            <div
                className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4"
                itemType="http://schema.org/SomeProducts"
                itemScope
            >
                <Suspense fallback={<ProductTilesSkeleton />}>
                    <Await resolve={productsPromise}>
                        {(result) =>
                            result?.hits?.map((product) => (
                                <ProductTile key={product.productId} product={product} />
                            ))
                        }
                    </Await>
                </Suspense>
            </div>
        </div>
    );
}

/**
 * Product Tile Component
 *
 * SFRA equivalent: Tile-Show controller renders tile via productTile.isml
 * Includes product image, name, price, and ratings
 */
function ProductTile({
    product,
}: {
    product: ShopperSearch.schemas['ProductSearchHit'];
}) {
    const image = product.image;
    const price = product.price;

    return (
        <a
            href={`/product/${product.productId}`}
            className="group block"
            itemProp="itemListElement"
            itemScope
            itemType="http://schema.org/Product"
        >
            <div className="aspect-square overflow-hidden rounded-lg bg-gray-100 mb-3">
                {image && (
                    <img
                        src={image.disBaseLink || image.link}
                        alt={image.alt || product.productName || ''}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        loading="lazy"
                        itemProp="image"
                    />
                )}
            </div>
            <h3
                className="text-sm font-medium text-gray-900 group-hover:text-gray-600 line-clamp-2"
                itemProp="name"
            >
                {product.productName}
            </h3>
            {price !== undefined && (
                <p
                    className="mt-1 text-sm font-semibold text-gray-900"
                    itemProp="offers"
                    itemScope
                    itemType="http://schema.org/Offer"
                >
                    <span itemProp="price">${price.toFixed(2)}</span>
                </p>
            )}
        </a>
    );
}

function ProductTilesSkeleton() {
    return (
        <>
            {[...Array(8)].map((_, i) => (
                <div key={i} className="animate-pulse">
                    <div className="aspect-square rounded-lg bg-gray-200 mb-3" />
                    <div className="h-4 bg-gray-200 rounded w-3/4 mb-2" />
                    <div className="h-4 bg-gray-200 rounded w-1/4" />
                </div>
            ))}
        </>
    );
}

/**
 * Home Product Set Slot Component
 *
 * SFRA equivalent: <isslot id="home-product-set-m">
 * slots.xml config: contentAssetBody.isml with content-asset "home-product-set-content"
 *
 * SFRA structure:
 * <div class="homepage shop-the-style">
 *   <!-- Content asset body rendered here -->
 * </div>
 */
function HomeProductSetSlot() {
    return (
        <div className="bg-gray-50 py-16">
            <div className="container mx-auto px-4 sm:px-6 lg:px-8">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-center">
                    <div className="aspect-video bg-gray-200 rounded-lg overflow-hidden">
                        {/* Placeholder for product set image */}
                        <div className="w-full h-full flex items-center justify-center text-gray-500">
                            Shop the Style Image
                        </div>
                    </div>
                    <div>
                        <h2 className="text-3xl font-bold mb-4">Shop the Style</h2>
                        <p className="text-gray-600 mb-6">
                            Complete your look with our curated product sets. Each set is designed
                            to help you achieve a polished, coordinated style effortlessly.
                        </p>
                        <a
                            href="/category/womens-outfits"
                            className="inline-block bg-gray-900 text-white px-6 py-3 rounded-lg font-semibold hover:bg-gray-800 transition-colors"
                        >
                            View Collection
                        </a>
                    </div>
                </div>
            </div>
        </div>
    );
}

/**
 * Email Signup Form Component
 *
 * SFRA equivalent: The email signup form at the bottom of homePage.isml
 *
 * SFRA structure:
 * <div class="home-email-signup">
 *   <div class="container">
 *     <form role="form">
 *       <div class="row">
 *         <div class="col-sm-5">
 *           <div class="input-group">
 *             <input type="text" name="hpEmailSignUp" placeholder="...">
 *             <button type="submit" class="btn btn-primary subscribe-email" data-href="EmailSubscribe-Subscribe">
 *               Sign Up
 *             </button>
 *           </div>
 *         </div>
 *         <div class="col-sm-7 email-description">...</div>
 *       </div>
 *     </form>
 *   </div>
 * </div>
 *
 * SFRA uses data-href="EmailSubscribe-Subscribe" with jQuery AJAX.
 * React version uses useFetcher for form submission.
 */
function EmailSignupForm() {
    const fetcher = useFetcher();
    const [email, setEmail] = useState('');

    const isSubmitting = fetcher.state === 'submitting';
    const isSuccess = fetcher.data?.success;
    const error = fetcher.data?.error;

    const handleSubmit = (e: FormEvent) => {
        e.preventDefault();
        fetcher.submit(
            { email },
            { method: 'post', action: '/action/email-subscribe' }
        );
    };

    return (
        <div className="bg-gray-900 py-12">
            <div className="container mx-auto px-4 sm:px-6 lg:px-8">
                <fetcher.Form
                    method="post"
                    action="/action/email-subscribe"
                    onSubmit={handleSubmit}
                    className="flex flex-col sm:flex-row gap-4 items-center justify-center"
                >
                    <div className="flex-1 max-w-md w-full">
                        <div className="flex">
                            <input
                                type="email"
                                name="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="Enter your email address"
                                aria-label="Enter your email address"
                                className="flex-1 px-4 py-3 rounded-l-lg border-0 focus:ring-2 focus:ring-white focus:outline-none"
                                required
                                disabled={isSubmitting}
                            />
                            <button
                                type="submit"
                                disabled={isSubmitting}
                                className="px-6 py-3 bg-white text-gray-900 font-semibold rounded-r-lg hover:bg-gray-100 transition-colors disabled:opacity-50"
                            >
                                {isSubmitting ? 'Signing Up...' : 'Sign Up'}
                            </button>
                        </div>
                        {error && (
                            <p className="mt-2 text-red-400 text-sm">{error}</p>
                        )}
                        {isSuccess && (
                            <p className="mt-2 text-green-400 text-sm">
                                Thank you for subscribing!
                            </p>
                        )}
                    </div>
                    <p className="text-gray-400 text-sm max-w-md text-center sm:text-left">
                        Sign up for our newsletter to receive exclusive offers, new arrivals,
                        and style inspiration delivered straight to your inbox.
                    </p>
                </fetcher.Form>
            </div>
        </div>
    );
}

/**
 * Home Page Component
 *
 * Main page component that renders all slots in the same structure as SFRA homePage.isml.
 * The layout wrapper (_app.tsx) provides header and footer, equivalent to
 * SFRA's <isdecorate template="common/layout/page">.
 */
export default function HomePageSFRA({
    loaderData,
}: {
    loaderData: HomePageSFRAData;
}) {
    return (
        <div className="homepage">
            {/* home-main-m slot: Main home page slot */}
            <div className="home-main">
                <HomeMainSlot />
            </div>

            {/* home-categories-m slot: Categories slots on the home page */}
            <div className="home-categories">
                <HomeCategoriesSlot categoriesPromise={loaderData.categories} />
            </div>

            {/* home-products-m slot: Product tiles on the home page */}
            <div className="home-product-tiles">
                <HomeProductsSlot productsPromise={loaderData.featuredProducts} />
            </div>

            {/* home-product-set-m slot: Link to a Product Set */}
            <div className="shop-the-style">
                <HomeProductSetSlot />
            </div>

            {/* Email signup form */}
            <div className="home-email-signup">
                <EmailSignupForm />
            </div>
        </div>
    );
}
