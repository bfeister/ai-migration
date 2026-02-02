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

import { createContext, type PropsWithChildren, useContext, useRef, useSyncExternalStore, useCallback } from 'react';
import {
    type StoreLocatorStore,
    type StoreApi,
    createStoreLocatorStore,
    type SelectedStoreInfo,
} from '@/extensions/store-locator/stores/store-locator-store';
import { getCookieFromDocumentAs, getSelectedStoreInfoCookieName } from '@/extensions/store-locator/utils';

export type StoreLocatorStoreApi = StoreApi<StoreLocatorStore>;

const StoreLocatorContext = createContext<StoreLocatorStoreApi | undefined>(undefined);

/**
 * StoreLocatorProvider
 *
 * Provides a scoped store instance for the store locator feature. Hydrates the
 * initially selected store id from a cookie scoped by site id.
 *
 * @param children - React subtree that needs access to store locator state
 * @returns ReactElement
 */
const StoreLocatorProvider = ({ children }: PropsWithChildren) => {
    const storeRef = useRef<StoreLocatorStoreApi | null>(null);
    if (storeRef.current === null) {
        // Hydrate selected store info from cookie (includes id, name, inventoryId)
        const cookieName = getSelectedStoreInfoCookieName();
        const initSelectedStoreInfo = getCookieFromDocumentAs<SelectedStoreInfo>(cookieName);

        storeRef.current = createStoreLocatorStore({
            selectedStoreInfo: initSelectedStoreInfo,
        });
    }

    return <StoreLocatorContext.Provider value={storeRef.current}>{children}</StoreLocatorContext.Provider>;
};

/**
 * Selector-based hook to read from the store locator state within the provider.
 * Uses {@link useSyncExternalStore} for optimal re-render behavior.
 * Throws if used outside the provider.
 *
 * @param selector - Function selecting a slice of `StoreLocatorStore`
 * @returns The selected slice value
 *
 * @example
 * const selectedStoreInfo = useStoreLocator((s) => s.selectedStoreInfo);
 * const selectedStoreId = selectedStoreInfo?.id;
 */
// eslint-disable-next-line react-refresh/only-export-components
export const useStoreLocator = <T,>(selector: (store: StoreLocatorStore) => T): T => {
    const store = useContext(StoreLocatorContext);
    if (!store) {
        throw new Error('useStoreLocator must be used within StoreLocatorProvider');
    }

    const getSnapshot = useCallback(() => selector(store.getState()), [store, selector]);
    return useSyncExternalStore(store.subscribe, getSnapshot, getSnapshot);
};

export default StoreLocatorProvider;
