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
'use client';

import { useCallback, useMemo, type JSX } from 'react';
import { useLocation, useNavigate } from 'react-router';
import type { ShopperSearch } from '@salesforce/storefront-next-runtime/scapi';
import { Button } from '@/components/ui/button';
import { X as Close } from 'lucide-react';
// @sfdc-extension-block-start SFDC_EXT_BOPIS
import { useStoreLocator } from '@/extensions/store-locator/providers/store-locator';
import { useTranslation } from 'react-i18next';
import { type TFunction } from 'i18next';
// @sfdc-extension-block-end SFDC_EXT_BOPIS

// Get human-readable label for a specific value
const getValueLabel = (
    attributeId: string,
    value: string,
    refinements: ShopperSearch.schemas['ProductSearchRefinement'][],
    // @sfdc-extension-line SFDC_EXT_BOPIS
    selectedStoreInfo: { inventoryId?: string; name?: string } | null,
    // @sfdc-extension-line SFDC_EXT_BOPIS
    tBopis: TFunction<'extBopis'>
): string => {
    // @sfdc-extension-block-start SFDC_EXT_BOPIS
    if (attributeId === 'ilids') {
        // If the filter value matches the selected store's inventory ID and we have a store name
        if (selectedStoreInfo?.name) {
            return tBopis('storeInventoryFilter.label', { storeName: selectedStoreInfo.name });
        }
        return tBopis('storeInventoryFilter.inStock');
    }
    // @sfdc-extension-block-end SFDC_EXT_BOPIS
    const refinement = refinements.find((r) => r.attributeId === attributeId);
    const valueObj = refinement?.values?.find((v) => v.value === value);
    return valueObj?.label || value;
};

export default function CategoryFilters({
    result,
}: {
    result: ShopperSearch.schemas['ProductSearchResult'];
}): JSX.Element | null {
    const navigate = useNavigate();
    const location = useLocation();
    const refinements = useMemo(() => result?.refinements || [], [result]);
    // @sfdc-extension-block-start SFDC_EXT_BOPIS
    const selectedStoreInfo = useStoreLocator((s) => s.selectedStoreInfo);
    const { t: tBopis } = useTranslation('extBopis');
    // @sfdc-extension-block-end SFDC_EXT_BOPIS

    const activeFilters = useMemo(() => {
        const params = new URLSearchParams(location.search);
        const refines = params.getAll('refine');
        const filters: Array<{
            attributeId: string;
            value: string;
            valueLabel: string;
        }> = [];

        for (const refine of refines) {
            const separatorIndex = refine.indexOf('=');
            if (separatorIndex === -1) continue;

            const attributeId = refine.substring(0, separatorIndex);
            const value = refine.substring(separatorIndex + 1);

            const valueLabel = getValueLabel(
                attributeId,
                value,
                refinements,
                // @sfdc-extension-line SFDC_EXT_BOPIS
                selectedStoreInfo,
                // @sfdc-extension-line SFDC_EXT_BOPIS
                tBopis
            );
            filters.push({
                attributeId,
                value,
                valueLabel,
            });
        }
        return filters;
    }, [
        location,
        refinements,
        // @sfdc-extension-block-start SFDC_EXT_BOPIS
        selectedStoreInfo,
        tBopis,
        // @sfdc-extension-block-end SFDC_EXT_BOPIS
    ]);

    // Remove a specific filter
    const removeFilter = useCallback(
        (attributeId: string, value: string) => {
            const params = new URLSearchParams(location.search);
            const refines = params.getAll('refine');
            const refinePair = `${attributeId}=${value}`;

            // Remove this specific refinement
            params.delete('refine');
            refines.filter((r) => r !== refinePair).forEach((r) => params.append('refine', r));

            params.set('offset', '0');
            return navigate({
                ...location,
                search: `?${params.toString()}`,
            });
        },
        [location, navigate]
    );

    // Clear all filters
    const clearAllFilters = useCallback(() => {
        const params = new URLSearchParams(location.search);
        params.delete('refine');
        params.set('offset', '0');

        void navigate({
            ...location,
            search: `?${params.toString()}`,
        });
    }, [location, navigate]);

    // Don't render if no active filters
    if (activeFilters.length === 0) {
        return null;
    }

    return (
        <div className="mb-4 pb-4 border-b border-border">
            <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-foreground">
                    Active Filters
                </p>
                <Button
                    variant="link"
                    size="sm"
                    className="h-auto p-0 cursor-pointer underline text-xs text-muted-foreground hover:text-foreground"
                    onClick={clearAllFilters}>
                    Clear all
                </Button>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
                {activeFilters.map(({ attributeId, value, valueLabel }) => (
                    <Button
                        key={`${attributeId}:${value}`}
                        variant="outline"
                        size="sm"
                        className="h-7 cursor-pointer gap-1 rounded-full px-2.5 text-xs"
                        onClick={() => void removeFilter(attributeId, value)}>
                        <span>{valueLabel}</span>
                        <Close className="size-3" />
                    </Button>
                ))}
            </div>
        </div>
    );
}
