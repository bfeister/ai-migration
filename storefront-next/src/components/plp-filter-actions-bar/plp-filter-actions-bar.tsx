'use client';

import { type ReactElement, useCallback, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router';
import type { PlpFilterActionsBarProps } from './types';
import CategorySorting from '@/components/category-sorting';
import { SlidersHorizontal, X } from 'lucide-react';

/**
 * PlpFilterActionsBar - Filter Actions & Sort Bar
 *
 * Horizontal bar between the category banner and the product grid.
 * SFRA source: .plp-actions container in search/searchResultsNoDecorator.isml
 *
 * Layout (matches SFRA .plp-actions):
 *   Left:   Filter toggle button (icon + "Filters" text) + result count
 *   Middle: Active refinement tags area (border-separated)
 *   Right:  Sort By dropdown (reuses CategorySorting)
 */
export default function PlpFilterActionsBar({
    result,
    isRefinementsOpen,
    onToggleRefinements,
}: PlpFilterActionsBarProps): ReactElement {
    const totalResults = result.total ?? 0;
    const location = useLocation();
    const navigate = useNavigate();
    const refinements = useMemo(() => result?.refinements || [], [result]);

    // Parse active filters from URL
    const activeFilters = useMemo(() => {
        const params = new URLSearchParams(location.search);
        const refines = params.getAll('refine');
        const filters: Array<{ attributeId: string; value: string; label: string }> = [];

        for (const refine of refines) {
            const separatorIndex = refine.indexOf('=');
            if (separatorIndex === -1) continue;
            const attributeId = refine.substring(0, separatorIndex);
            const value = refine.substring(separatorIndex + 1);

            const refinement = refinements.find((r) => r.attributeId === attributeId);
            const valueObj = refinement?.values?.find((v) => v.value === value);
            filters.push({ attributeId, value, label: valueObj?.label || value });
        }
        return filters;
    }, [location.search, refinements]);

    const removeFilter = useCallback(
        (attributeId: string, value: string) => {
            const params = new URLSearchParams(location.search);
            const refines = params.getAll('refine');
            const refinePair = `${attributeId}=${value}`;
            params.delete('refine');
            refines.filter((r) => r !== refinePair).forEach((r) => params.append('refine', r));
            params.set('offset', '0');
            void navigate({ ...location, search: `?${params.toString()}` });
        },
        [location, navigate]
    );

    return (
        <div className="plp-actions flex w-full items-center">
            {/* Left: Filter toggle button – SFRA .plp-actions-button.refinements-toggle-button */}
            <button
                type="button"
                onClick={onToggleRefinements}
                className="flex items-center gap-2.5 py-5 pl-6 pr-6 text-sm uppercase tracking-wider text-foreground hover:text-foreground/70 transition-colors"
                aria-expanded={isRefinementsOpen}
                aria-controls="category-refinements-panel"
            >
                <SlidersHorizontal className="size-4" aria-hidden="true" />
                <span>{isRefinementsOpen ? 'Hide Filters' : 'Filters'}</span>
            </button>

            {/* Result count – SFRA .results-count */}
            <span className="text-sm uppercase tracking-wider text-muted-foreground">
                {totalResults} {totalResults === 1 ? 'Result' : 'Results'}
            </span>

            {/* Middle: Active refinement tags – SFRA #refined-by-attributes */}
            <div className="flex-1 border-x border-border/40 mx-4 min-h-[3.5rem] flex items-center px-5 gap-2 flex-wrap">
                {activeFilters.map(({ attributeId, value, label }) => (
                    <button
                        key={`${attributeId}:${value}`}
                        type="button"
                        onClick={() => removeFilter(attributeId, value)}
                        className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/40 px-3 py-1 text-xs text-foreground hover:bg-muted transition-colors"
                        aria-label={`Remove filter: ${label}`}
                    >
                        <span>{label}</span>
                        <X className="size-3" aria-hidden="true" />
                    </button>
                ))}
            </div>

            {/* Right: Sort dropdown – SFRA .plp-actions-button.sort-by-button */}
            <div className="flex-shrink-0 py-2 pr-5">
                {result.sortingOptions && result.sortingOptions.length > 0 && (
                    <CategorySorting result={result} />
                )}
            </div>
        </div>
    );
}
