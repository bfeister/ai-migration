import { Fragment, Suspense, useEffect, useMemo, useRef, useState, use } from 'react';
import { Await, type LoaderFunctionArgs, useLocation } from 'react-router';
import type { ShopperProducts, ShopperSearch, ShopperExperience } from '@salesforce/storefront-next-runtime/scapi';
import { fetchCategory } from '@/lib/api/categories';
import { fetchSearchProducts } from '@/lib/api/search';
import { getAllQueryParams, getQueryParam, PRODUCT_SEARCH_QUERY_PARAMS } from '@/lib/query-params';
import { getConfig, useConfig } from '@/config';
import { currencyContext } from '@/lib/currency';
import { collectComponentDataPromises, fetchPageFromLoader } from '@/lib/util/pageLoader';
import { generateCategorySchema } from '@/utils/category-schema';
import CategorySkeleton, {
    CategoryBreadcrumbsSkeleton,
    CategoryHeaderSkeleton,
    CategoryRefinementsSkeleton,
} from '@/components/category-skeleton';
import CategoryPageHeader from '@/components/category-page-header';
import CategoryRefinements from '@/components/category-refinements';
import { PlpFilterActionsBar } from '@/components/plp-filter-actions-bar';
import ProductGrid from '@/components/product-grid';
import CategoryPagination from '@/components/category-pagination';
import { useAnalytics } from '@/hooks/use-analytics';
import { PageType } from '@/lib/decorators/page-type';
import { RegionDefinition } from '@/lib/decorators/region-definition';
import { Region } from '@/components/region';
import { JsonLd } from '@/components/json-ld';

/**
 * Product listing page (PLP) – category route.
 *
 * ISML source templates:
 *   - search/pt_productsearchresult.isml (page decorator)
 *   - search/searchResultsNoDecorator.isml (base SFRA content)
 *   - search/productGrid.isml (product tile grid)
 */

@PageType({
    name: 'Product Listing Page',
    description: 'Product listing page with product listings and personalized content',
    supportedAspectTypes: ['plp'],
})
@RegionDefinition([
    {
        id: 'plpTopFullWidth',
        name: 'Top Full Width Region',
        description: 'Full screen width region at the top of the results',
        maxComponents: 5,
    },
    {
        id: 'plpTopContent',
        name: 'Top Content Region',
        description: 'Content width region below sort/filter, above product grid',
        maxComponents: 5,
    },
    {
        id: 'plpBottom',
        name: 'Bottom Region',
        description: 'Region at the bottom of search results after product grid',
        maxComponents: 5,
    },
])
export class ProductListingPageMetadata {}

type CategoryPageData = {
    category: Promise<ShopperProducts.schemas['Category']>;
    refinements: Promise<ShopperSearch.schemas['ProductSearchResult']>;
    searchResult: Promise<ShopperSearch.schemas['ProductSearchResult']>;
    page: Promise<ShopperExperience.schemas['Page']>;
    componentData: Promise<Record<string, Promise<unknown>>>;
    categoryId: string;
    currency: string;
    locale: string;
    categorySchema: Promise<ReturnType<typeof generateCategorySchema> | null>;
};

// eslint-disable-next-line react-refresh/only-export-components
export function loader(args: LoaderFunctionArgs): CategoryPageData {
    const { searchParams } = new URL(args.request.url);
    const { categoryId = '' } = args.params;
    const safeCategoryId = categoryId && categoryId !== 'undefined' ? categoryId : 'root';

    const offset = parseInt(getQueryParam(searchParams, PRODUCT_SEARCH_QUERY_PARAMS.OFFSET) || '0', 10);
    const sort = getQueryParam(searchParams, PRODUCT_SEARCH_QUERY_PARAMS.SORT);
    const refine = getAllQueryParams(searchParams, PRODUCT_SEARCH_QUERY_PARAMS.REFINE);

    const config = getConfig(args.context);
    const currency = args.context.get(currencyContext) as string;
    const currentSite = config.commerce.sites[0];
    const locale = currentSite.defaultLocale;
    const limit = config.global.productListing.productsPerPage;

    const pagePromise = fetchPageFromLoader(args, {
        pageId: 'plp',
        categoryId: safeCategoryId,
    });

    const categoryPromise = fetchCategory(args.context, safeCategoryId, 0);
    const searchResultPromise = fetchSearchProducts(args.context, {
        categoryId: safeCategoryId,
        limit,
        offset,
        sort,
        refine: refine as unknown as string,
        currency,
    });

    const categorySchemaPromise = Promise.all([categoryPromise, searchResultPromise])
        .then(([category, searchResult]) => {
            try {
                const url = new URL(args.request.url);
                const pageUrl = `${url.origin}${url.pathname}${url.search}`;
                if (!category || !searchResult) {
                    return null;
                }
                return generateCategorySchema({ category, searchResult, config, pageUrl, defaultCurrency: currency });
            } catch (error) {
                // eslint-disable-next-line no-console
                console.error('Error generating category schema in loader:', error);
                return null;
            }
        })
        .catch((error) => {
            // eslint-disable-next-line no-console
            console.error('Error in category schema promise chain:', error);
            return null;
        });

    return {
        refinements: fetchSearchProducts(args.context, {
            categoryId: safeCategoryId,
            limit: 1,
            offset: 0,
            sort,
            refine: refine as unknown as string,
            expand: ['none'],
            currency,
        }),
        searchResult: searchResultPromise,
        category: categoryPromise,
        page: pagePromise,
        componentData: collectComponentDataPromises(args, pagePromise),
        categoryId: safeCategoryId,
        currency,
        locale,
        categorySchema: categorySchemaPromise,
    };
}

function CategoryJsonLdWrapper({
    categorySchemaPromise,
}: {
    categorySchemaPromise: Promise<ReturnType<typeof generateCategorySchema> | null>;
}) {
    const categorySchema = use(categorySchemaPromise);
    return categorySchema ? <JsonLd data={categorySchema} id="category-schema" /> : null;
}

export default function CategoryPage({
    loaderData: {
        category,
        refinements,
        searchResult,
        page,
        componentData,
        categoryId,
        locale,
        currency,
        categorySchema,
    },
}: {
    loaderData: CategoryPageData;
}) {
    const config = useConfig();
    const limit = config.global.productListing.productsPerPage;
    const analytics = useAnalytics();
    const lastTrackedDataRef = useRef<string | null>(null);
    const [isRefinementsOpen, setIsRefinementsOpen] = useState(false);

    // Memoize Promise.all to prevent creating new promises on every render
    const combinedPromise = useMemo(() => Promise.all([category, searchResult]), [category, searchResult]);

    useEffect(() => {
        const dataKey = `${String(category)}-${String(searchResult)}`;
        if (dataKey !== lastTrackedDataRef.current) {
            void Promise.all([Promise.resolve(category), searchResult])
                .then(([categoryData, searchData]) => {
                    if (analytics) {
                        void analytics.trackViewCategory({
                            category: categoryData,
                            searchResults: searchData.hits ?? [],
                            sort: searchData.selectedSortingOption || searchData.sortingOptions?.[0]?.label || '',
                            refinements: searchData.selectedRefinements ?? {},
                        });
                    }
                })
                .catch(() => {
                    // Silently handle promise rejection
                });
            lastTrackedDataRef.current = dataKey;
        }
    }, [analytics, category, searchResult]);

    // Force remount when currency/locale/search params change to update Suspense boundaries
    const location = useLocation();
    const pageKey = `${categoryId}-${currency}-${locale}-${location.search}-${location.hash}`;

    return (
        <Fragment key={pageKey}>
            <Suspense fallback={null}>
                <CategoryJsonLdWrapper categorySchemaPromise={categorySchema} />
            </Suspense>
            <div className="pb-16">
                {/* Category page header with breadcrumbs – SFRA banner + heading pattern */}
                <Suspense fallback={<CategoryBreadcrumbsSkeleton />}>
                    <Await resolve={category}>
                        {(categoryData: ShopperProducts.schemas['Category']) => (
                            <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8">
                                <CategoryPageHeader
                                    category={categoryData}
                                    bannerImageUrl={(categoryData.c_slotBannerImage ?? categoryData.image) as string | undefined}
                                />
                            </div>
                        )}
                    </Await>
                </Suspense>

                <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8">
                    {/* Filter Actions & Sort Bar – SFRA .plp-actions */}
                    <div className="mb-8">
                        <Suspense fallback={<CategoryHeaderSkeleton />}>
                            <Await resolve={refinements}>
                                {(refinementsData: ShopperSearch.schemas['ProductSearchResult']) => (
                                    <PlpFilterActionsBar
                                        result={refinementsData}
                                        isRefinementsOpen={isRefinementsOpen}
                                        onToggleRefinements={() => setIsRefinementsOpen((prev) => !prev)}
                                    />
                                )}
                            </Await>
                        </Suspense>
                    </div>

                    {/* plpTopFullWidth */}
                    <div className="mb-8">
                        <Region
                            page={page}
                            regionId="plpTopFullWidth"
                            componentData={componentData}
                            errorElement={<div />}
                        />
                    </div>

                    <div className="flex flex-col lg:flex-row gap-8">
                        {/* Refinement Sidebar – SFRA #secondary.refinements */}
                        <aside
                            id="category-refinements-panel"
                            role="region"
                            aria-label="Product filters"
                            className={`w-64 flex-shrink-0 transition-all duration-300 ${
                                isRefinementsOpen
                                    ? 'block opacity-100'
                                    : 'hidden opacity-0'
                            }`}
                        >
                            <div className="sticky top-4">
                                <h2 className="text-sm font-semibold uppercase tracking-wider text-foreground mb-4">
                                    Refine By
                                </h2>
                                <Suspense fallback={<CategoryRefinementsSkeleton />}>
                                    <Await resolve={refinements}>
                                        {(refinementsData: ShopperSearch.schemas['ProductSearchResult']) => (
                                            <CategoryRefinements result={refinementsData} />
                                        )}
                                    </Await>
                                </Suspense>
                            </div>
                        </aside>

                        {/* Main content column */}
                        <div className="flex-grow min-w-0">
                            {/* plpTopContent */}
                            <Region
                                page={page}
                                regionId="plpTopContent"
                                componentData={componentData}
                                errorElement={<div />}
                            />

                            <Suspense fallback={<CategorySkeleton />}>
                                <Await resolve={combinedPromise}>
                                    {([categoryData, searchResultData]: [
                                        ShopperProducts.schemas['Category'],
                                        ShopperSearch.schemas['ProductSearchResult'],
                                    ]) => {
                                        const handleProductClick = (
                                            product: ShopperSearch.schemas['ProductSearchHit']
                                        ) => {
                                            if (analytics) {
                                                void analytics.trackClickProductInCategory({
                                                    category: categoryData,
                                                    product,
                                                });
                                            }
                                        };

                                        return (
                                            <>
                                                <ProductGrid
                                                    products={searchResultData.hits ?? []}
                                                    handleProductClick={handleProductClick}
                                                />
                                                {searchResultData.total > 1 && (
                                                    <div className="mt-10">
                                                        <CategoryPagination limit={limit} result={searchResultData} />
                                                    </div>
                                                )}
                                            </>
                                        );
                                    }}
                                </Await>
                            </Suspense>

                            {/* plpBottom */}
                            <div className="mt-8">
                                <Region
                                    page={page}
                                    regionId="plpBottom"
                                    componentData={componentData}
                                    errorElement={<div />}
                                />
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </Fragment>
    );
}
