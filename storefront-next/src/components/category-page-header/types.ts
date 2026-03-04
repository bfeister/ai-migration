import type { ShopperProducts } from '@salesforce/storefront-next-runtime/scapi';

export type BreadcrumbItem = {
    id: string;
    name: string;
};

export type CategoryPageHeaderProps = {
    /** Category data from the commerce API */
    category: ShopperProducts.schemas['Category'];
    /** Total product count from search results */
    totalProducts?: number;
    /** Optional banner image URL for the category hero */
    bannerImageUrl?: string;
    /** Alt text for the banner image */
    bannerImageAlt?: string;
};
