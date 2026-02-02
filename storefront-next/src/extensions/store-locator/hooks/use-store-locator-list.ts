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

import { useEffect, useMemo, useState, useCallback } from 'react';
import { useFetcher, useRevalidator } from 'react-router';
import type { ShopperStores } from '@salesforce/storefront-next-runtime/scapi';
import { useStoreLocator } from '@/extensions/store-locator/providers/store-locator';
import type { SelectedStoreInfo } from '@/extensions/store-locator/stores/store-locator-store';

/**
 * Result of searchStores API
 * @property success - Whether the search was successful
 * @property stores - Result of searchStores API
 * @property error - Error message if the search was not successful
 */
export interface SearchStoresResult {
    success: boolean;
    stores?: ShopperStores.schemas['StoreResult'];
    error?: string;
}

/**
 * Hook to fetch and manage store locator list.
 * Triggers searchStores API when shouldSearch is true.
 *
 * @returns Read-only view of state and actions, including pagination helper
 *
 * @example
 * const { storesPaginated, setPage } = useStoreLocatorList();
 * // render list and call setPage((p)=>p+1) for Load More
 */
export function useStoreLocatorList() {
    const mode = useStoreLocator((s) => s.mode);
    const searchParams = useStoreLocator((s) => s.searchParams);
    const deviceCoordinates = useStoreLocator((s) => s.deviceCoordinates);
    const config = useStoreLocator((s) => s.config);
    const selectedStoreInfo = useStoreLocator((s) => s.selectedStoreInfo);
    const setSelectedStoreInfoRaw = useStoreLocator((s) => s.setSelectedStoreInfo);
    const geoError = useStoreLocator((s) => s.geoError);
    const shouldSearch = useStoreLocator((s) => s.shouldSearch);
    const setShouldSearch = useStoreLocator((s) => s.setShouldSearch);

    const fetcher = useFetcher<SearchStoresResult>();
    const revalidator = useRevalidator();
    const [page, setPage] = useState<number>(1);
    const [hasSearched, setHasSearched] = useState<boolean>(false);

    useEffect(() => {
        if (!shouldSearch) return;

        const params = new URLSearchParams();
        params.set('mode', mode);
        params.set('maxDistance', String(config.radius));
        params.set('distanceUnit', config.radiusUnit);
        params.set('limit', String(config.limit));
        let canFetch = false;

        if (mode === 'input') {
            const hasCountry = Boolean(searchParams?.countryCode);
            const hasPostal = Boolean(searchParams?.postalCode);
            if (hasCountry && hasPostal && searchParams) {
                params.set('countryCode', searchParams.countryCode);
                params.set('postalCode', searchParams.postalCode);
                canFetch = true;
            }
        } else if (mode === 'device') {
            const hasLat = typeof deviceCoordinates.latitude === 'number';
            const hasLng = typeof deviceCoordinates.longitude === 'number';
            if (hasLat && hasLng) {
                params.set('latitude', String(deviceCoordinates.latitude));
                params.set('longitude', String(deviceCoordinates.longitude));
                canFetch = true;
            }
        }

        if (canFetch) {
            setHasSearched(true);
            void fetcher.load(`/resource/stores?${params.toString()}`);
            setShouldSearch(false);
        }
        setPage(1);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
        shouldSearch,
        mode,
        searchParams?.countryCode,
        searchParams?.postalCode,
        deviceCoordinates.latitude,
        deviceCoordinates.longitude,
    ]);

    const stores = useMemo(() => fetcher.data?.stores?.data ?? [], [fetcher.data]);
    const hasError = useMemo(() => fetcher.data?.success === false, [fetcher.data]);
    const showCount = page * 10;
    const storesPaginated = stores.slice(0, showCount);

    const isLoading = fetcher.state === 'loading';

    // Wrapper function that updates store selection and triggers revalidation
    // When inventoryId changes, we need to revalidate to refresh product data with new store inventory.
    const setSelectedStoreInfo = useCallback(
        (info: SelectedStoreInfo | null) => {
            const previousInventoryId = selectedStoreInfo?.inventoryId;
            setSelectedStoreInfoRaw(info);

            // Trigger revalidation when inventoryId changes (store selection changed)
            // This ensures pages like PDP refresh with new inventory data
            if (info?.inventoryId !== previousInventoryId) {
                void revalidator.revalidate();
            }
        },
        [setSelectedStoreInfoRaw, selectedStoreInfo?.inventoryId, revalidator]
    );

    return {
        // store state
        mode,
        searchParams,
        config,
        selectedStoreInfo,
        setSelectedStoreInfo,
        geoError,
        // fetch state
        hasSearched,
        hasError,
        isLoading,
        stores,
        storesPaginated,
        setPage,
    } as const;
}
