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
import { createContext, useContext, type PropsWithChildren } from 'react';

const CurrencyContext = createContext<string | undefined>(undefined);

export function CurrencyProvider({ value, children }: PropsWithChildren<{ value: string }>) {
    return <CurrencyContext.Provider value={value}>{children}</CurrencyContext.Provider>;
}

/**
 * React hook to get currency from context (for use in components).
 * Currency is automatically derived from the current locale.
 * @returns The current currency code
 */
// eslint-disable-next-line react-refresh/only-export-components
export function useCurrency(): string | undefined {
    const currency = useContext(CurrencyContext);

    return currency ?? undefined;
}
