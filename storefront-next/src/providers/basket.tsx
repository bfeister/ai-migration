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

import { createContext, type PropsWithChildren, useContext } from 'react';
import type { ShopperBasketsV2 } from '@salesforce/storefront-next-runtime/scapi';

const BasketContext = createContext<ShopperBasketsV2.schemas['Basket'] | undefined>(undefined);

/**
 * Provider for given basket data that's typically retrieved by the basket middleware.
 *
 * **Note:** In the current implementation, basket data is only retrieved on the client, i.e., during the server-side
 * rendering phase there's no basket data available. That means that all components relying on basket data have to
 * take the possibility into account that the data is `undefined`.
 */
const BasketProvider = ({ children, value }: PropsWithChildren<{ value?: ShopperBasketsV2.schemas['Basket'] }>) => {
    return <BasketContext.Provider value={value}>{children}</BasketContext.Provider>;
};

// eslint-disable-next-line react-refresh/only-export-components
export const useBasket = (): ShopperBasketsV2.schemas['Basket'] | undefined => {
    return useContext(BasketContext);
};

export default BasketProvider;
