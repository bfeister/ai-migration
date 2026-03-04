import type { ShopperSearch } from '@salesforce/storefront-next-runtime/scapi';

export type PlpFilterActionsBarProps = {
    /** Product search result with sorting options and total count */
    result: ShopperSearch.schemas['ProductSearchResult'];
    /** Whether the refinements panel is currently visible */
    isRefinementsOpen: boolean;
    /** Callback to toggle refinements panel visibility */
    onToggleRefinements: () => void;
};
