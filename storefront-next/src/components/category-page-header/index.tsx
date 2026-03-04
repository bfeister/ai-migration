import type { ReactElement } from 'react';
import { Link } from 'react-router';
import { ChevronRight } from 'lucide-react';
import type { CategoryPageHeaderProps, BreadcrumbItem } from './types';

/**
 * Category page header combining breadcrumb navigation and the category title
 * with an optional hero banner image.
 *
 * Mirrors the SFRA PLP header pattern:
 *   - Full-width hero banner image with a dark overlay
 *   - Parent category label centered above the h1 (e.g., "COLLECTIONS")
 *   - Category name as the primary h1 heading in large serif font
 *   - Breadcrumb trail below the banner for navigation
 *
 * ISML source: search/searchResultsNoDecorator.isml (category banner + heading area)
 */
export default function CategoryPageHeader({
    category,
    totalProducts,
    bannerImageUrl,
    bannerImageAlt,
}: CategoryPageHeaderProps): ReactElement {
    const breadcrumbItems: BreadcrumbItem[] = (category.parentCategoryTree ?? [
        { id: category.id, name: category.name },
    ]) as BreadcrumbItem[];

    // The parent category label is the second-to-last breadcrumb item (if there are at least 2).
    const parentLabel =
        breadcrumbItems.length >= 2 ? breadcrumbItems[breadcrumbItems.length - 2]?.name : undefined;

    const categoryName = category.name ?? category.id;

    return (
        <div>
            {/* Hero banner with category title overlay – matches SFRA .plp-overlay pattern */}
            {bannerImageUrl ? (
                <div className="relative w-full overflow-hidden min-h-[320px] md:min-h-[400px]">
                    <img
                        src={bannerImageUrl}
                        alt={bannerImageAlt ?? ''}
                        className="absolute inset-0 w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-black/20" />
                    <div className="relative flex flex-col items-center justify-center text-center h-full min-h-[320px] md:min-h-[400px] px-4">
                        {parentLabel && (
                            <h2 className="text-lg font-medium uppercase tracking-[0.1em] text-white mb-3 font-serif">
                                {parentLabel}
                            </h2>
                        )}
                        <h1 className="text-4xl md:text-5xl font-medium text-white tracking-tight font-serif">
                            {categoryName}
                        </h1>
                    </div>
                </div>
            ) : (
                /* Fallback: simple heading area when no banner image is available */
                <div className="py-8 text-center">
                    {parentLabel && (
                        <p className="text-xs uppercase tracking-[0.1em] text-muted-foreground mb-1">
                            {parentLabel}
                        </p>
                    )}
                    <h1 className="text-3xl font-bold text-foreground uppercase tracking-tight">
                        {categoryName}
                        {typeof totalProducts === 'number' && (
                            <span className="text-lg font-normal text-muted-foreground ml-2">
                                ({totalProducts})
                            </span>
                        )}
                    </h1>
                </div>
            )}

            {/* Breadcrumb navigation – below the banner for accessible wayfinding */}
            <nav aria-label="Breadcrumb" className="mt-4 mb-4">
                <ol className="flex flex-wrap items-center text-sm text-muted-foreground">
                    {breadcrumbItems.map((item, index) => (
                        <li key={item.id} className="flex items-center">
                            {index > 0 && <ChevronRight className="mx-1 size-3" />}
                            {index < breadcrumbItems.length - 1 ? (
                                <Link
                                    to={`/category/${item.id}`}
                                    className="hover:underline hover:text-foreground transition-colors"
                                >
                                    {item.name}
                                </Link>
                            ) : (
                                <span aria-current="page" className="text-foreground font-medium">
                                    {item.name}
                                </span>
                            )}
                        </li>
                    ))}
                </ol>
            </nav>
        </div>
    );
}
