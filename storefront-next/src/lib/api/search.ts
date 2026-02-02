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
import type { LoaderFunctionArgs } from 'react-router';
import type { ShopperSearch } from '@salesforce/storefront-next-runtime/scapi';
import { createApiClients } from '@/lib/api-clients';

export const fetchSearchProducts = (
    context: LoaderFunctionArgs['context'],
    parameters: {
        categoryId?: string;
        q?: string;
        filters?: Record<string, string[]>;
        sort?: string;
        limit?: number;
        offset?: number;
        expand?: ShopperSearch.operations['productSearch']['parameters']['query']['expand'];
        refine?: ShopperSearch.operations['productSearch']['parameters']['query']['refine'] | string[];
        select?: ShopperSearch.operations['productSearch']['parameters']['query']['select'];
        allImages?: boolean;
        allVariationProperties?: boolean;
        perPricebook?: boolean;
        currency?: string;
    }
): Promise<ShopperSearch.schemas['ProductSearchResult']> => {
    const {
        categoryId,
        q = '',
        filters,
        sort = 'best-matches',
        limit = 24,
        offset = 0,
        expand = ['promotions', 'variations', 'prices', 'images', 'page_meta_tags', 'custom_properties'],
        refine = [],
        allImages = true,
        allVariationProperties = true,
        perPricebook = true,
        currency,
    } = parameters || {};

    // Build refinements for product search
    const refineSet = new Set<string>(refine);
    if (categoryId) {
        refineSet.add(`cgid=${categoryId}`);
    }
    if (filters) {
        Object.entries(filters).forEach(([key, values]) => {
            values.forEach((value) => {
                refineSet.add(`${key}=${value}`);
            });
        });
    }

    const clients = createApiClients(context);

    return clients.shopperSearch
        .productSearch({
            params: {
                query: {
                    q,
                    sort,
                    limit,
                    offset,
                    expand,

                    // This is a known type limitation, the API intelligently serializes the refine parameter (array) automatically, but the OAS types refers to string.
                    ...(refineSet.size > 0 && { refine: [...refineSet] as unknown as string }),
                    currency,
                    allImages,
                    allVariationProperties,
                    perPricebook,
                },
            },
        })
        .then(({ data }) => data);
};

export const fetchSearchSuggestions = (
    context: LoaderFunctionArgs['context'],
    parameters: {
        q: ShopperSearch.operations['getSearchSuggestions']['parameters']['query']['q'];
        expand?: ShopperSearch.operations['getSearchSuggestions']['parameters']['query']['expand'];
        limit?: ShopperSearch.operations['getSearchSuggestions']['parameters']['query']['limit'];
        includeEinsteinSuggestedPhrases?: boolean;
        currency?: string;
    }
): Promise<ShopperSearch.schemas['SuggestionResult']> => {
    const { q, expand, limit, includeEinsteinSuggestedPhrases, currency } = parameters;
    const clients = createApiClients(context);

    return clients.shopperSearch
        .getSearchSuggestions({
            params: {
                query: {
                    q,
                    ...(expand && { expand }),
                    ...(limit && { limit }),
                    currency,
                    ...(includeEinsteinSuggestedPhrases !== undefined && { includeEinsteinSuggestedPhrases }),
                },
            },
        })
        .then(({ data }) => data);
};
