import type { ReactElement } from 'react';
import type { CategoryBannerProps } from './types';

/**
 * Full-width category hero banner.
 *
 * Mirrors the SFRA `.hero.slant-down.search-banner` pattern from
 * search/searchResultsNoDecorator.isml – a background-image hero with a
 * centered category heading and an optional parent-category label above it.
 */
export default function CategoryBanner({
    categoryName,
    parentCategoryLabel,
    bannerImageUrl,
    bannerImageAlt,
}: CategoryBannerProps): ReactElement {
    if (bannerImageUrl) {
        return (
            <div className="content-slot slot-grid-header relative w-full overflow-hidden min-h-[320px] md:min-h-[400px]">
                <img
                    src={bannerImageUrl}
                    alt={bannerImageAlt ?? ''}
                    className="absolute inset-0 w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-black/20" />
                <div className="relative flex flex-col items-center justify-center text-center h-full min-h-[320px] md:min-h-[400px] px-4">
                    {parentCategoryLabel && (
                        <h2 className="text-lg font-medium uppercase tracking-[0.1em] text-white mb-3 font-serif">
                            {parentCategoryLabel}
                        </h2>
                    )}
                    <h1 className="text-4xl md:text-5xl font-medium text-white tracking-tight font-serif uppercase">
                        {categoryName}
                    </h1>
                </div>
            </div>
        );
    }

    return (
        <div className="content-slot slot-grid-header py-8 text-center">
            {parentCategoryLabel && (
                <p className="text-xs uppercase tracking-[0.1em] text-muted-foreground mb-1">
                    {parentCategoryLabel}
                </p>
            )}
            <h1 className="text-3xl font-bold text-foreground uppercase tracking-tight">
                {categoryName}
            </h1>
        </div>
    );
}
