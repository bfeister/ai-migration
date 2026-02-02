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
import { type LoaderFunctionArgs } from 'react-router';
import type { ShopperExperience } from '@salesforce/storefront-next-runtime/scapi';
import { createApiClients } from '@/lib/api-clients';

export type PageDesignerPageParams = {
    pageId: string;
    mode?: string;
    pdToken?: string;
    aspectType?: string;
    categoryId?: string;
    productId?: string;
};

export const fetchPage = async (
    context: LoaderFunctionArgs['context'],
    parameters: PageDesignerPageParams
): Promise<ShopperExperience.schemas['Page']> => {
    const { pageId = '', pdToken, mode, aspectType, categoryId, productId } = parameters || {};
    const clients = createApiClients(context);

    const aspectAttributes = {
        ...(aspectType && { aspectType }),
        ...(categoryId && { categoryId }),
        ...(productId && { productId }),
    };

    const result = await clients.shopperExperience.getPage({
        params: {
            path: { pageId },
            query: {
                ...(mode && { mode }),
                ...(pdToken && { pdToken }),
                ...(Object.keys(aspectAttributes).length > 0 && {
                    aspectAttributes: JSON.stringify(aspectAttributes),
                }),
            },
        },
    });

    return result.data;
};
