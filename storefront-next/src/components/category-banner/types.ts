export type CategoryBannerProps = {
    /** Category display name (rendered as h1) */
    categoryName: string;
    /** Parent category label displayed above the h1 (e.g. "COLLECTIONS") */
    parentCategoryLabel?: string;
    /** Banner hero image URL (set as background-image on the hero container) */
    bannerImageUrl?: string;
    /** Alt text for the banner image (used in an accessible img element) */
    bannerImageAlt?: string;
};
