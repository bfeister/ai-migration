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
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { loader } from './loaders';
import { fetchCategory } from '@/lib/api/categories';
import type { LoaderFunctionArgs } from 'react-router';
import type { ShopperExperience, ShopperProducts } from '@salesforce/storefront-next-runtime/scapi';

// Mock the fetchCategory function
vi.mock('@/lib/api/categories', () => ({
    fetchCategory: vi.fn(),
}));

const mockFetchCategory = vi.mocked(fetchCategory);

describe('PopularCategory loader', () => {
    let mockContext: LoaderFunctionArgs['context'];

    beforeEach(() => {
        vi.clearAllMocks();
        mockContext = {
            get: vi.fn(),
        } as any;
    });

    test('fetches category when categoryId is provided', async () => {
        const mockCategory: ShopperProducts.schemas['Category'] = {
            id: 'newarrivals',
            name: 'New Arrivals',
            pageDescription: 'Test description',
        };

        mockFetchCategory.mockResolvedValue(mockCategory);

        const componentData: ShopperExperience.schemas['Component'] = {
            id: 'component-1',
            typeId: 'odyssey_base.popularCategory',
            data: {
                category: 'newarrivals',
            },
            regions: [],
            visible: true,
        };

        const result = await loader.server({
            componentData,
            context: mockContext,
        });

        expect(mockFetchCategory).toHaveBeenCalledWith(mockContext, 'newarrivals', 0);
        expect(result).toEqual(mockCategory);
    });

    test('throws error when categoryId is missing', async () => {
        const componentData: ShopperExperience.schemas['Component'] = {
            id: 'component-1',
            typeId: 'odyssey_base.popularCategory',
            data: {},
            regions: [],
            visible: true,
        };

        await expect(
            loader.server({
                componentData,
                context: mockContext,
            })
        ).rejects.toThrow('Category ID is required for PopularCategory component');
    });

    test('throws error when categoryId is not a string', async () => {
        const componentData: ShopperExperience.schemas['Component'] = {
            id: 'component-1',
            typeId: 'odyssey_base.popularCategory',
            data: {
                category: 123 as any,
            },
            regions: [],
            visible: true,
        };

        await expect(
            loader.server({
                componentData,
                context: mockContext,
            })
        ).rejects.toThrow('Category ID is required for PopularCategory component');
    });

    test('throws error when categoryId is empty string', async () => {
        const componentData: ShopperExperience.schemas['Component'] = {
            id: 'component-1',
            typeId: 'odyssey_base.popularCategory',
            data: {
                category: '',
            },
            regions: [],
            visible: true,
        };

        await expect(
            loader.server({
                componentData,
                context: mockContext,
            })
        ).rejects.toThrow('Category ID is required for PopularCategory component');
    });

    test('client loader works the same as server loader', async () => {
        const mockCategory: ShopperProducts.schemas['Category'] = {
            id: 'womens',
            name: 'Womens',
            pageDescription: 'Test description',
        };

        mockFetchCategory.mockResolvedValue(mockCategory);

        const componentData: ShopperExperience.schemas['Component'] = {
            id: 'component-1',
            typeId: 'odyssey_base.popularCategory',
            data: {
                category: 'womens',
            },
            regions: [],
            visible: true,
        };

        const result = await loader.client({
            componentData,
            context: mockContext,
        });

        expect(mockFetchCategory).toHaveBeenCalledWith(mockContext, 'womens', 0);
        expect(result).toEqual(mockCategory);
    });
});
