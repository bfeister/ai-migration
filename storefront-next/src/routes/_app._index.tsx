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
import { type LoaderFunctionArgs } from 'react-router';
import type { ShopperExperience, ShopperProducts, ShopperSearch } from '@salesforce/storefront-next-runtime/scapi';
import { useTranslation } from 'react-i18next';
import { fetchSearchProducts } from '@/lib/api/search';
import { fetchCategories } from '@/lib/api/categories';
import { currencyContext } from '@/lib/currency';
import { Region } from '@/components/region';
import { getConfig } from '@/config';
import { PageType } from '@/lib/decorators/page-type';
import { RegionDefinition } from '@/lib/decorators/region-definition';
import { collectComponentDataPromises, fetchPageFromLoader } from '@/lib/util/pageLoader';
import { HomeBanner1 } from '@/components/home-banner-1';
import { HomeBanner2 } from '@/components/home-banner-2';
import { HomeBanner3 } from '@/components/home-banner-3';
import { HomeCarousel } from '@/components/home-carousel';
import { HomeBanner5 } from '@/components/home-banner-5';

/**
 * Home Page Route — SFRA-migrated layout with Page Designer data wiring.
 *
 * Data flow:
 *   Loader fetches Page Designer page (homepage), search products, and categories via SCAPI.
 *   Region components render Page Designer content when configured in SFCC.
 *   Static ISML-migrated banner components serve as errorElement fallbacks.
 *
 * Regions:
 *   headerbanner — slots 1-2 (hero banner, headcovers banner)
 *   main         — slots 3-5 (spirit banner, collection carousel, quality banner)
 *
 * SFRA source: storefront-reference-architecture/cartridge/templates/default/content/home/homepage.isml
 * Archived original: src/routes/archived/_app._index.tsx
 */

@PageType({
    name: 'Home Page',
    description: 'Main landing page with hero content, collections, and brand messaging',
    supportedAspectTypes: [],
})
@RegionDefinition([
    {
        id: 'headerbanner',
        name: 'Header Banner Region',
        description: 'Region for promotional banners and hero content',
        maxComponents: 3,
    },
    {
        id: 'main',
        name: 'Main Content Region',
        description: 'Region for main content',
        maxComponents: 5,
    },
])
export class HomePageMetadata {}

export type HomePageData = {
    page: Promise<ShopperExperience.schemas['Page']>;
    searchResult: Promise<ShopperSearch.schemas['ProductSearchResult']>;
    categories: Promise<ShopperProducts.schemas['Category'][]>;
    componentData: Promise<Record<string, Promise<unknown>>>;
};

// eslint-disable-next-line react-refresh/only-export-components
export function loader(args: LoaderFunctionArgs): HomePageData {
    const currency = args.context.get(currencyContext) as string;
    const pagePromise = fetchPageFromLoader(args, {
        pageId: 'homepage',
    });

    return {
        page: pagePromise,
        searchResult: fetchSearchProducts(args.context, {
            categoryId: 'root',
            limit: getConfig(args.context).pages.home.featuredProductsCount,
            currency: currency ?? undefined,
        }),
        categories: fetchCategories(args.context, 'root', 1),
        componentData: collectComponentDataPromises(args, pagePromise),
    };
}

/** Static fallback content from SFRA content asset lk-home-banner-1.
 *  Used when Page Designer headerbanner region is not configured. */
const BANNER_1_CONTENT = {
    topPanel: {
        heading: 'Luxury Leather Belts',
        body: 'The Final Piece to Your Signature Style',
        backgroundImageUrl:
            'https://www.linksandkings.com/on/demandware.static/-/Library-Sites-LinksAndKingsSharedLibrary/default/dw4ef56a23/Links-and-Kings/images/homepage/slot-1-belts-2-background.jpg',
        backgroundImageAlt: 'Leather Belts',
        cta: {
            label: 'SHOP NOW',
            href: '/belts/',
        },
    },
    bottomPanel: {
        heading: "GOLF'S LUXURY",
        body: 'Master artisans handcraft each piece starting with the finest materials sourced from all over the world to create products that are as unique as they are special.',
        backgroundImageUrl: '',
        backgroundImageAlt: '',
        watermarkLogoUrl:
            'https://www.linksandkings.com/on/demandware.static/-/Library-Sites-LinksAndKingsSharedLibrary/default/dw9e417f23/Links-and-Kings/images/linksandkings-logo-mobile.svg',
    },
} as const;

/** Static fallback content from SFRA content asset lk-home-banner-2.
 *  Used when Page Designer headerbanner region is not configured. */
const BANNER_2_CONTENT = {
    heading: 'Full-Grain Leather Headcovers',
    subheading: 'With Superior Lasting Protection.',
    backgroundImageUrl:
        'https://www.linksandkings.com/on/demandware.static/-/Library-Sites-LinksAndKingsSharedLibrary/default/dw6bd90486/Links-and-Kings/images/homepage/slot-1-dancing-5-background.jpg',
    backgroundImageAlt: 'Sundance Collection',
    cta: {
        label: 'EXPLORE',
        href: '/headcovers/',
    },
} as const;

/** Static fallback content from SFRA content asset lk-home-banner-3.
 *  Used when Page Designer main region is not configured. */
const BANNER_3_CONTENT = {
    heading: 'THE SPIRIT OF LINKS & KINGS',
    body: "Inspired by golf's rich history to create products that pay homage to the heritage of the game while meeting the performance demands of the modern player.",
    backgroundImageUrl:
        'https://www.linksandkings.com/on/demandware.static/-/Library-Sites-LinksAndKingsSharedLibrary/default/dw5a18b4f5/Links-and-Kings/images/homepage/slot-4-background.jpg',
    backgroundImageAlt: 'Golf Course',
    watermarkLogoUrl:
        'https://www.linksandkings.com/on/demandware.static/-/Library-Sites-LinksAndKingsSharedLibrary/default/dw9e417f23/Links-and-Kings/images/linksandkings-logo-mobile.svg',
} as const;

/** Static fallback content from SFRA content asset lk-home-carousel.
 *  Slick carousel with 4 collection slides.
 *  Used when Page Designer main region is not configured. */
const CAROUSEL_CONTENT = [
    {
        heading: 'LINKS COLLECTION',
        imageUrl:
            'https://www.linksandkings.com/on/demandware.static/-/Library-Sites-LinksAndKingsSharedLibrary/default/dw6aa8a792/Links-and-Kings/images/homepage/lk2020_homepage_carousel_0006_Final_Links.jpg',
        imageAlt: 'Links Collection',
        cta: { label: 'LEARN MORE', href: '/links-collection/' },
    },
    {
        heading: 'CROWN COLLECTION',
        imageUrl:
            'https://www.linksandkings.com/on/demandware.static/-/Library-Sites-LinksAndKingsSharedLibrary/default/dw4ded24a1/Links-and-Kings/images/homepage/lk2022_homepage_carousel_0010_Final_Crown.jpg',
        imageAlt: 'Crown Collection',
        cta: { label: 'LEARN MORE', href: '/crown-collection/' },
    },
    {
        heading: 'SUNDANCE COLLECTION',
        imageUrl:
            'https://www.linksandkings.com/on/demandware.static/-/Library-Sites-LinksAndKingsSharedLibrary/default/dwc3b2d826/Links-and-Kings/images/homepage/lk2024_hompage_carousel_0011_Final_Sundance_Collection.jpg',
        imageAlt: 'Sundance Collection',
        cta: { label: 'LEARN MORE', href: '/sundance-collection/' },
    },
    {
        heading: 'HEAD COVERS',
        imageUrl:
            'https://www.linksandkings.com/on/demandware.static/-/Library-Sites-LinksAndKingsSharedLibrary/default/dw53a2f4e4/Links-and-Kings/images/homepage/lk2020_hompage_carousel_0001_Final_Headcovers_2.jpg',
        imageAlt: 'Head Covers',
        cta: { label: 'LEARN MORE', href: '/headcovers/' },
    },
] as const;

/** Static fallback content from SFRA content asset lk-home-banner-5.
 *  Full-height banner with leather artisan background.
 *  Used when Page Designer main region is not configured. */
const BANNER_5_CONTENT = {
    subheading: 'Meticulous attention to detail',
    heading: 'A COMMITMENT TO QUALITY',
    body: "For over two decades, Links & Kings' master artisans have handcrafted every product with painstaking attention detail to ensure the absolute highest quality.",
    backgroundImageUrl:
        'https://www.linksandkings.com/on/demandware.static/-/Library-Sites-LinksAndKingsSharedLibrary/default/dwa7684390/Links-and-Kings/images/homepage/slot-5-background.jpg',
    backgroundImageAlt: 'leather artisan',
    cta: {
        label: 'Learn More',
        href: '/lk-heritage.html',
    },
} as const;

export default function HomePage({ loaderData }: { loaderData: HomePageData }) {
    const { t } = useTranslation('home');

    return (
        <div className="-mt-8">
            {/* Visually-hidden site title (ISML: <h1 class="visually-hidden">) */}
            <h1 className="sr-only">{t('siteTitle')}</h1>

            {/* Header Banner Region — Page Designer takes over when configured,
                otherwise falls back to static ISML-migrated banners (slots 1-2) */}
            <Region
                page={loaderData.page}
                regionId="headerbanner"
                componentData={loaderData.componentData}
                errorElement={
                    <>
                        <section id="home-slot-1" className="w-full">
                            <HomeBanner1
                                topPanel={BANNER_1_CONTENT.topPanel}
                                bottomPanel={BANNER_1_CONTENT.bottomPanel}
                            />
                        </section>
                        <section id="home-slot-2" className="w-full">
                            <HomeBanner2 {...BANNER_2_CONTENT} />
                        </section>
                    </>
                }
            />

            {/* Main Content Region — Page Designer takes over when configured,
                otherwise falls back to static ISML-migrated content (slots 3-5) */}
            <Region
                page={loaderData.page}
                regionId="main"
                componentData={loaderData.componentData}
                errorElement={
                    <>
                        <section id="home-slot-3" className="w-full">
                            <HomeBanner3 {...BANNER_3_CONTENT} />
                        </section>
                        <section id="home-slot-4" className="w-full">
                            <HomeCarousel slides={CAROUSEL_CONTENT} />
                        </section>
                        <section id="home-slot-5" className="w-full">
                            <HomeBanner5 {...BANNER_5_CONTENT} />
                        </section>
                    </>
                }
            />
        </div>
    );
}
