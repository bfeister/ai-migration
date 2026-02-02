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
import { render } from '@testing-library/react';

// React Router
import { createMemoryRouter, RouterProvider } from 'react-router';

// Components
import { CartItemEditModal } from '@/components/cart-item-edit-modal';

// Mock data
import { variantProduct } from '@/components/__mocks__/master-variant-product';

// Utils
import { AllProvidersWrapper } from '@/test-utils/context-provider';

import PickupProvider from '@/extensions/bopis/context/pickup-context';
import { createMockBasketWithPickupItems } from '@/extensions/bopis/tests/__mocks__/basket';

// Mock useScapiFetcher to prevent actual API calls
const mockLoad = vi.fn().mockResolvedValue(undefined);
vi.mock('@/hooks/use-scapi-fetcher', () => ({
    useScapiFetcher: vi.fn(() => ({
        load: mockLoad,
        data: variantProduct,
        state: 'idle',
    })),
}));

describe('CartItemEditModal', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    const defaultProps = {
        open: true,
        onOpenChange: vi.fn(),
        product: variantProduct,
        initialQuantity: 1,
        itemId: 'test-item-id',
    };

    describe('pickup inventory fetching', () => {
        beforeEach(async () => {
            mockLoad.mockClear();
            // Reset the mock implementation
            const { useScapiFetcher } = await import('@/hooks/use-scapi-fetcher');
            vi.mocked(useScapiFetcher).mockReturnValue({
                load: mockLoad,
                data: variantProduct,
                state: 'idle',
            });
        });

        test('includes inventoryIds when editing pickup item', async () => {
            const { useScapiFetcher } = await import('@/hooks/use-scapi-fetcher');
            let capturedParameters: any = null;

            // Mock useScapiFetcher to capture parameters
            vi.mocked(useScapiFetcher).mockImplementation((_service, _method, options) => {
                capturedParameters = (options as any)?.params;
                return {
                    load: mockLoad,
                    data: variantProduct,
                    state: 'idle',
                };
            });

            // Setup pickup context with the item marked for pickup
            const basket = createMockBasketWithPickupItems([
                { productId: 'variant-product-id', inventoryId: 'inventory-store-123', storeId: 'store-123' },
            ]);

            const router = createMemoryRouter(
                [
                    {
                        path: '/',
                        element: (
                            <PickupProvider basket={basket}>
                                <AllProvidersWrapper>
                                    <CartItemEditModal
                                        {...defaultProps}
                                        product={{ ...variantProduct, id: 'variant-product-id' }}
                                    />
                                </AllProvidersWrapper>
                            </PickupProvider>
                        ),
                    },
                ],
                {
                    initialEntries: ['/'],
                }
            );
            render(<RouterProvider router={router} />);

            // Check that inventoryIds parameter was included
            expect(capturedParameters).toBeDefined();
            expect(capturedParameters.query.inventoryIds).toEqual(['inventory-store-123']);
        });

        test('does not include inventoryIds when editing non-pickup item', async () => {
            const { useScapiFetcher } = await import('@/hooks/use-scapi-fetcher');
            let capturedParameters: any = null;

            // Mock useScapiFetcher to capture parameters
            vi.mocked(useScapiFetcher).mockImplementation((_service, _method, options) => {
                capturedParameters = (options as any)?.params;
                return {
                    load: mockLoad,
                    data: variantProduct,
                    state: 'idle',
                };
            });

            // Setup pickup context without the item (not a pickup item)
            const basket = createMockBasketWithPickupItems([]);

            const router = createMemoryRouter(
                [
                    {
                        path: '/',
                        element: (
                            <PickupProvider basket={basket}>
                                <AllProvidersWrapper>
                                    <CartItemEditModal {...defaultProps} />
                                </AllProvidersWrapper>
                            </PickupProvider>
                        ),
                    },
                ],
                {
                    initialEntries: ['/'],
                }
            );
            render(<RouterProvider router={router} />);

            // Check that inventoryIds parameter was not included
            expect(capturedParameters).toBeDefined();
            expect(capturedParameters.query.inventoryIds).toBeUndefined();
        });

        test('works without pickup context', async () => {
            const { useScapiFetcher } = await import('@/hooks/use-scapi-fetcher');
            let capturedParameters: any = null;

            // Mock useScapiFetcher to capture parameters
            vi.mocked(useScapiFetcher).mockImplementation((_service, _method, options) => {
                capturedParameters = (options as any)?.params;
                return {
                    load: mockLoad,
                    data: variantProduct,
                    state: 'idle',
                };
            });

            // Render without PickupProvider (pickup context is null)
            const router = createMemoryRouter(
                [
                    {
                        path: '/',
                        element: (
                            <AllProvidersWrapper>
                                <CartItemEditModal {...defaultProps} />
                            </AllProvidersWrapper>
                        ),
                    },
                ],
                {
                    initialEntries: ['/'],
                }
            );
            render(<RouterProvider router={router} />);

            // Should not crash and should not include inventoryIds
            expect(capturedParameters).toBeDefined();
            expect(capturedParameters.query.inventoryIds).toBeUndefined();
        });
    });
});
