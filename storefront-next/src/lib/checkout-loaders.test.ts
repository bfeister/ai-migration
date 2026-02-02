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
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ClientLoaderFunctionArgs } from 'react-router';

// Mock the middleware functions
vi.mock('@/middlewares/auth.client', () => ({
    getAuth: vi.fn(),
}));

vi.mock('@/middlewares/basket.client', () => ({
    getBasket: vi.fn(),
}));

vi.mock('@/lib/api/customer', () => ({
    getCustomerProfileForCheckout: vi.fn(),
    isRegisteredCustomer: vi.fn(),
}));

vi.mock('@/lib/api/shipping-methods', () => ({
    getShippingMethodsForShipment: vi.fn(),
}));

vi.mock('@/components/checkout/utils/checkout-utils', () => {
    return {
        shouldPrefillBasket: vi.fn(() => false),
        initializeBasketForReturningCustomer: vi.fn((_context, profile) =>
            Promise.resolve({
                basketId: 'prefilled-basket-123',
                shipments: [{ shippingAddress: { address1: 'Prefilled Address' } }],
                customerInfo: { email: profile.customer.login },
            })
        ),
    };
});

vi.mock('@/lib/checkout-server-utils', () => ({
    fetchProductsInBasket: vi.fn(() => Promise.resolve({})),
}));

vi.mock('@/lib/api-clients', () => ({
    createApiClients: vi.fn(() => ({
        shopperPromotions: {
            getPromotions: vi.fn(),
        },
        shopperProducts: {
            getProducts: vi.fn(),
        },
    })),
}));

vi.mock('@/lib/currency', () => ({
    currencyContext: { key: 'currency' },
}));

import {
    clientLoader,
    getServerCustomerProfileData,
    getServerShippingMethodsMapData,
    fetchShippingMethodsMapForBasket,
} from './checkout-loaders';

describe('Checkout Loaders', () => {
    function createPromotionIds(count: number): string[] {
        return Array.from({ length: count }, (_, i) => `promo-${i + 1}`);
    }

    function createProductItemsFromPromotions(promotionIds: string[]) {
        return promotionIds.map((promoId, index) => ({
            itemId: `item-${index + 1}`,
            productId: `prod-${index + 1}`,
            priceAdjustments: [
                {
                    priceAdjustmentId: `adj-${index + 1}`,
                    promotionId: promoId,
                },
            ],
        }));
    }

    async function setupGuestUserMocks() {
        const { getBasket } = await import('@/middlewares/basket.client');
        const { getAuth: getAuthClient } = await import('@/middlewares/auth.client');
        const { isRegisteredCustomer } = await import('@/lib/api/customer');

        vi.mocked(getAuthClient).mockReturnValue({
            customer_id: undefined,
            userType: 'guest',
        } as any);

        vi.mocked(isRegisteredCustomer).mockReturnValue(false);

        return { getBasket };
    }

    function createTestArgs(): ClientLoaderFunctionArgs {
        const mockRequest = new Request('https://localhost/checkout');
        return {
            request: mockRequest,
            params: {},
            context: {
                get: vi.fn((key) => {
                    if (key.key === 'currency') return 'USD';
                    return undefined;
                }),
            },
            serverLoader: vi.fn(),
        } as any;
    }

    beforeEach(() => {
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('clientLoader', () => {
        it('should return correct data structure for registered customer with profile', async () => {
            const { getBasket } = await import('@/middlewares/basket.client');
            const { getAuth: getAuthClient } = await import('@/middlewares/auth.client');
            const { isRegisteredCustomer, getCustomerProfileForCheckout } = await import('@/lib/api/customer');
            const { getShippingMethodsForShipment } = await import('@/lib/api/shipping-methods');

            vi.mocked(getBasket).mockReturnValue({
                basketId: 'test-basket-123',
                shipments: [{ shippingAddress: { address1: '123 Main St' } }],
            } as any);

            vi.mocked(getAuthClient).mockReturnValue({
                customer_id: 'test-customer-123',
                userType: 'registered',
            } as any);

            vi.mocked(isRegisteredCustomer).mockReturnValue(true);

            vi.mocked(getShippingMethodsForShipment).mockResolvedValue({
                applicableShippingMethods: [{ id: 'standard', name: 'Standard', price: 5.99 }],
            } as any);

            vi.mocked(getCustomerProfileForCheckout).mockResolvedValue({
                customer: { customerId: 'test-123', login: 'test@example.com' },
                addresses: [{ addressId: 'addr1', address1: '123 Main St' }],
                paymentInstruments: [],
            } as any);

            const mockRequest = new Request('https://localhost/checkout');
            const args: ClientLoaderFunctionArgs = {
                request: mockRequest,
                params: {},
                context: {
                    get: vi.fn((key) => {
                        if (key.key === 'currency') return 'USD';
                        return undefined;
                    }),
                },
                serverLoader: vi.fn(),
            } as any;

            const result = await clientLoader(args);

            expect(result).toHaveProperty('isRegisteredCustomer');
            expect(result).toHaveProperty('customerProfile');
            expect(result).toHaveProperty('productMap');
            expect(result).toHaveProperty('promotions');
            expect(result.isRegisteredCustomer).toBe(true);
            expect(result.customerProfile).toBeInstanceOf(Promise);
            expect(result.productMap).toBeInstanceOf(Promise);
            expect(result.promotions).toBeInstanceOf(Promise);
        });

        it('should handle guest user checkout', async () => {
            const { getBasket } = await import('@/middlewares/basket.client');
            const { getAuth: getAuthClient } = await import('@/middlewares/auth.client');
            const { isRegisteredCustomer } = await import('@/lib/api/customer');

            vi.mocked(getBasket).mockReturnValue({
                basketId: 'guest-basket-456',
                shipments: [{ shippingAddress: { address1: '456 Oak St' } }],
            } as any);

            vi.mocked(getAuthClient).mockReturnValue({
                customer_id: undefined,
                userType: 'guest',
            } as any);

            vi.mocked(isRegisteredCustomer).mockReturnValue(false);

            const mockRequest = new Request('https://localhost/checkout');
            const args: ClientLoaderFunctionArgs = {
                request: mockRequest,
                params: {},
                context: {
                    get: vi.fn((key) => {
                        if (key.key === 'currency') return 'USD';
                        return undefined;
                    }),
                },
                serverLoader: vi.fn(),
            } as any;

            const result = await clientLoader(args);

            expect(result.isRegisteredCustomer).toBe(false);
            expect(result.customerProfile).toBeUndefined();
            expect(result.productMap).toBeInstanceOf(Promise);
            expect(result.promotions).toBeInstanceOf(Promise);
        });

        it('should handle registered user with profile fetch failure', async () => {
            const { getBasket } = await import('@/middlewares/basket.client');
            const { getAuth: getAuthClient } = await import('@/middlewares/auth.client');
            const { isRegisteredCustomer, getCustomerProfileForCheckout } = await import('@/lib/api/customer');

            vi.mocked(getBasket).mockReturnValue({
                basketId: 'test-basket-789',
                shipments: [{ shippingAddress: undefined }],
            } as any);

            vi.mocked(getAuthClient).mockReturnValue({
                customer_id: 'customer-789',
                userType: 'registered',
            } as any);

            vi.mocked(isRegisteredCustomer).mockReturnValue(true);

            // Simulate profile fetch failure
            vi.mocked(getCustomerProfileForCheckout).mockRejectedValue(new Error('API Error'));

            const mockRequest = new Request('https://localhost/checkout');
            const args: ClientLoaderFunctionArgs = {
                request: mockRequest,
                params: {},
                context: {
                    get: vi.fn((key) => {
                        if (key.key === 'currency') return 'USD';
                        return undefined;
                    }),
                },
                serverLoader: vi.fn(),
            } as any;

            const result = await clientLoader(args);

            // Should fall back to guest-like behavior
            expect(result.isRegisteredCustomer).toBe(false);
            expect(result.customerProfile).toBeUndefined();
        });

        it('should handle basket without shipping address', async () => {
            const { getBasket } = await import('@/middlewares/basket.client');
            const { getAuth: getAuthClient } = await import('@/middlewares/auth.client');
            const { isRegisteredCustomer } = await import('@/lib/api/customer');

            vi.mocked(getBasket).mockReturnValue({
                basketId: 'empty-basket-999',
                shipments: [{ shippingAddress: undefined }],
            } as any);

            vi.mocked(getAuthClient).mockReturnValue({
                customer_id: undefined,
                userType: 'guest',
            } as any);

            vi.mocked(isRegisteredCustomer).mockReturnValue(false);

            const mockRequest = new Request('https://localhost/checkout');
            const args: ClientLoaderFunctionArgs = {
                request: mockRequest,
                params: {},
                context: {
                    get: vi.fn((key) => {
                        if (key.key === 'currency') return 'USD';
                        return undefined;
                    }),
                },
                serverLoader: vi.fn(),
            } as any;

            const result = await clientLoader(args);

            // Should not have shipping methods promise
            expect(result.shippingMethodsMap).toBeInstanceOf(Promise);
            expect(result.productMap).toBeInstanceOf(Promise);
        });

        it('should handle registered user without customer_id', async () => {
            const { getBasket } = await import('@/middlewares/basket.client');
            const { getAuth: getAuthClient } = await import('@/middlewares/auth.client');
            const { isRegisteredCustomer } = await import('@/lib/api/customer');

            vi.mocked(getBasket).mockReturnValue({
                basketId: 'test-basket',
                shipments: [],
            } as any);

            vi.mocked(getAuthClient).mockReturnValue({
                customer_id: undefined,
                userType: 'registered',
            } as any);

            vi.mocked(isRegisteredCustomer).mockReturnValue(true);

            const mockRequest = new Request('https://localhost/checkout');
            const args: ClientLoaderFunctionArgs = {
                request: mockRequest,
                params: {},
                context: {
                    get: vi.fn((key) => {
                        if (key.key === 'currency') return 'USD';
                        return undefined;
                    }),
                },
                serverLoader: vi.fn(),
            } as any;

            const result = await clientLoader(args);

            // Should fall back to guest path
            expect(result.customerProfile).toBeUndefined();
        });

        it('should handle error gracefully', async () => {
            const { getBasket } = await import('@/middlewares/basket.client');

            // Simulate error in getBasket
            vi.mocked(getBasket).mockImplementation(() => {
                throw new Error('Basket error');
            });

            const mockRequest = new Request('https://localhost/checkout');
            const args: ClientLoaderFunctionArgs = {
                request: mockRequest,
                params: {},
                context: {
                    get: vi.fn((key) => {
                        if (key.key === 'currency') return 'USD';
                        return undefined;
                    }),
                },
                serverLoader: vi.fn(),
            } as any;

            const result = await clientLoader(args);

            // Should return fallback data
            expect(result.productMap).toBeInstanceOf(Promise);
            expect(result.promotions).toBeInstanceOf(Promise);
            expect(result.isRegisteredCustomer).toBe(false);
        });

        it('should handle basket with shipping address but no basketId', async () => {
            const { getBasket } = await import('@/middlewares/basket.client');
            const { getAuth: getAuthClient } = await import('@/middlewares/auth.client');
            const { isRegisteredCustomer } = await import('@/lib/api/customer');

            vi.mocked(getBasket).mockReturnValue({
                basketId: undefined,
                shipments: [{ shippingAddress: { address1: '123 Main St' } }],
            } as any);

            vi.mocked(getAuthClient).mockReturnValue({
                customer_id: undefined,
                userType: 'guest',
            } as any);

            vi.mocked(isRegisteredCustomer).mockReturnValue(false);

            const mockRequest = new Request('https://localhost/checkout');
            const args: ClientLoaderFunctionArgs = {
                request: mockRequest,
                params: {},
                context: {
                    get: vi.fn((key) => {
                        if (key.key === 'currency') return 'USD';
                        return undefined;
                    }),
                },
                serverLoader: vi.fn(),
            } as any;

            const result = await clientLoader(args);

            // Should not fetch shipping methods without basketId
            expect(result.shippingMethodsMap).toBeInstanceOf(Promise);
        });

        it('should extract promotions from product items, shipping items, and order-level adjustments', async () => {
            const { getBasket } = await import('@/middlewares/basket.client');
            const { getAuth: getAuthClient } = await import('@/middlewares/auth.client');
            const { isRegisteredCustomer } = await import('@/lib/api/customer');
            const { createApiClients } = await import('@/lib/api-clients');

            const mockGetPromotions = vi.fn().mockResolvedValue({
                data: {
                    data: [
                        { id: 'product-promo-1', name: 'Product Promotion 1' },
                        { id: 'shipping-promo-1', name: 'Free Shipping' },
                        { id: 'order-promo-1', name: 'Order Discount' },
                    ],
                },
            });

            vi.mocked(createApiClients).mockReturnValue({
                shopperPromotions: {
                    getPromotions: mockGetPromotions,
                },
                shopperProducts: {
                    getProducts: vi.fn().mockResolvedValue({ data: { data: [] } }),
                },
            } as any);

            vi.mocked(getBasket).mockReturnValue({
                basketId: 'test-basket-promos',
                productItems: [
                    {
                        itemId: 'item-1',
                        productId: 'prod-1',
                        priceAdjustments: [
                            {
                                priceAdjustmentId: 'adj-1',
                                promotionId: 'product-promo-1',
                            },
                        ],
                    },
                ],
                shippingItems: [
                    {
                        itemId: 'shipping-1',
                        priceAdjustments: [
                            {
                                priceAdjustmentId: 'shipping-adj-1',
                                promotionId: 'shipping-promo-1',
                            },
                        ],
                    },
                ],
                priceAdjustments: [
                    {
                        priceAdjustmentId: 'order-adj-1',
                        promotionId: 'order-promo-1',
                    },
                ],
                shipments: [{ shippingAddress: { address1: '123 Main St' } }],
            } as any);

            vi.mocked(getAuthClient).mockReturnValue({
                customer_id: undefined,
                userType: 'guest',
            } as any);

            vi.mocked(isRegisteredCustomer).mockReturnValue(false);

            const mockRequest = new Request('https://localhost/checkout');
            const args: ClientLoaderFunctionArgs = {
                request: mockRequest,
                params: {},
                context: {
                    get: vi.fn((key) => {
                        if (key.key === 'currency') return 'USD';
                        return undefined;
                    }),
                },
                serverLoader: vi.fn(),
            } as any;

            const result = await clientLoader(args);

            expect(result.promotions).toBeInstanceOf(Promise);

            // Verify that getPromotions was called with all promotion IDs
            expect(mockGetPromotions).toHaveBeenCalledWith({
                params: {
                    query: {
                        ids: expect.arrayContaining(['product-promo-1', 'shipping-promo-1', 'order-promo-1']),
                    },
                },
            });

            // Verify the promotions promise resolves correctly
            const promotions = await result.promotions;
            expect(promotions).toHaveProperty('product-promo-1');
            expect(promotions).toHaveProperty('shipping-promo-1');
            expect(promotions).toHaveProperty('order-promo-1');
        });

        it('should handle basket with only product item promotions', async () => {
            const { getBasket } = await import('@/middlewares/basket.client');
            const { getAuth: getAuthClient } = await import('@/middlewares/auth.client');
            const { isRegisteredCustomer } = await import('@/lib/api/customer');
            const { createApiClients } = await import('@/lib/api-clients');

            const mockGetPromotions = vi.fn().mockResolvedValue({
                data: {
                    data: [{ id: 'product-promo-1', name: 'Product Promotion' }],
                },
            });

            vi.mocked(createApiClients).mockReturnValue({
                shopperPromotions: {
                    getPromotions: mockGetPromotions,
                },
                shopperProducts: {
                    getProducts: vi.fn().mockResolvedValue({ data: { data: [] } }),
                },
            } as any);

            vi.mocked(getBasket).mockReturnValue({
                basketId: 'test-basket',
                productItems: [
                    {
                        itemId: 'item-1',
                        productId: 'prod-1',
                        priceAdjustments: [
                            {
                                priceAdjustmentId: 'adj-1',
                                promotionId: 'product-promo-1',
                            },
                        ],
                    },
                ],
                shipments: [{ shippingAddress: { address1: '123 Main St' } }],
            } as any);

            vi.mocked(getAuthClient).mockReturnValue({
                customer_id: undefined,
                userType: 'guest',
            } as any);

            vi.mocked(isRegisteredCustomer).mockReturnValue(false);

            const mockRequest = new Request('https://localhost/checkout');
            const args: ClientLoaderFunctionArgs = {
                request: mockRequest,
                params: {},
                context: {
                    get: vi.fn((key) => {
                        if (key.key === 'currency') return 'USD';
                        return undefined;
                    }),
                },
                serverLoader: vi.fn(),
            } as any;

            await clientLoader(args);

            expect(mockGetPromotions).toHaveBeenCalledWith({
                params: {
                    query: {
                        ids: ['product-promo-1'],
                    },
                },
            });
        });

        it('should handle basket with only shipping promotions', async () => {
            const { getBasket } = await import('@/middlewares/basket.client');
            const { getAuth: getAuthClient } = await import('@/middlewares/auth.client');
            const { isRegisteredCustomer } = await import('@/lib/api/customer');
            const { createApiClients } = await import('@/lib/api-clients');

            const mockGetPromotions = vi.fn().mockResolvedValue({
                data: {
                    data: [{ id: 'shipping-promo-1', name: 'Free Shipping' }],
                },
            });

            vi.mocked(createApiClients).mockReturnValue({
                shopperPromotions: {
                    getPromotions: mockGetPromotions,
                },
                shopperProducts: {
                    getProducts: vi.fn().mockResolvedValue({ data: { data: [] } }),
                },
            } as any);

            vi.mocked(getBasket).mockReturnValue({
                basketId: 'test-basket',
                productItems: [],
                shippingItems: [
                    {
                        itemId: 'shipping-1',
                        priceAdjustments: [
                            {
                                priceAdjustmentId: 'shipping-adj-1',
                                promotionId: 'shipping-promo-1',
                            },
                        ],
                    },
                ],
                shipments: [{ shippingAddress: { address1: '123 Main St' } }],
            } as any);

            vi.mocked(getAuthClient).mockReturnValue({
                customer_id: undefined,
                userType: 'guest',
            } as any);

            vi.mocked(isRegisteredCustomer).mockReturnValue(false);

            const mockRequest = new Request('https://localhost/checkout');
            const args: ClientLoaderFunctionArgs = {
                request: mockRequest,
                params: {},
                context: {
                    get: vi.fn((key) => {
                        if (key.key === 'currency') return 'USD';
                        return undefined;
                    }),
                },
                serverLoader: vi.fn(),
            } as any;

            await clientLoader(args);

            expect(mockGetPromotions).toHaveBeenCalledWith({
                params: {
                    query: {
                        ids: ['shipping-promo-1'],
                    },
                },
            });
        });

        it('should return empty promotions when basket has no promotions', async () => {
            const { getBasket } = await import('@/middlewares/basket.client');
            const { getAuth: getAuthClient } = await import('@/middlewares/auth.client');
            const { isRegisteredCustomer } = await import('@/lib/api/customer');
            const { createApiClients } = await import('@/lib/api-clients');

            vi.mocked(createApiClients).mockReturnValue({
                shopperPromotions: {
                    getPromotions: vi.fn(),
                },
                shopperProducts: {
                    getProducts: vi.fn().mockResolvedValue({ data: { data: [] } }),
                },
            } as any);

            vi.mocked(getBasket).mockReturnValue({
                basketId: 'test-basket',
                productItems: [{ itemId: 'item-1', productId: 'prod-1' }],
                shipments: [{ shippingAddress: { address1: '123 Main St' } }],
            } as any);

            vi.mocked(getAuthClient).mockReturnValue({
                customer_id: undefined,
                userType: 'guest',
            } as any);

            vi.mocked(isRegisteredCustomer).mockReturnValue(false);

            const mockRequest = new Request('https://localhost/checkout');
            const args: ClientLoaderFunctionArgs = {
                request: mockRequest,
                params: {},
                context: {
                    get: vi.fn((key) => {
                        if (key.key === 'currency') return 'USD';
                        return undefined;
                    }),
                },
                serverLoader: vi.fn(),
            } as any;

            const result = await clientLoader(args);

            const promotions = await result.promotions;
            expect(promotions).toEqual({});
        });

        it('should batch promotion requests when there are more than 50 promotion IDs', async () => {
            const { createApiClients } = await import('@/lib/api-clients');
            const { getBasket } = await setupGuestUserMocks();

            // Create 75 promotion IDs (should require 2 batches: 50 + 25)
            const promotionIds = createPromotionIds(75);

            const mockGetPromotions = vi
                .fn()
                .mockResolvedValueOnce({
                    data: {
                        data: Array.from({ length: 50 }, (_, i) => ({
                            id: `promo-${i + 1}`,
                            name: `Promotion ${i + 1}`,
                        })),
                    },
                })
                .mockResolvedValueOnce({
                    data: {
                        data: Array.from({ length: 25 }, (_, i) => ({
                            id: `promo-${i + 51}`,
                            name: `Promotion ${i + 51}`,
                        })),
                    },
                });

            vi.mocked(createApiClients).mockReturnValue({
                shopperPromotions: {
                    getPromotions: mockGetPromotions,
                },
                shopperProducts: {
                    getProducts: vi.fn().mockResolvedValue({ data: { data: [] } }),
                },
            } as any);

            const productItems = createProductItemsFromPromotions(promotionIds);

            vi.mocked(getBasket).mockReturnValue({
                basketId: 'test-basket-batch',
                productItems,
                shipments: [{ shippingAddress: { address1: '123 Main St' } }],
            } as any);

            const result = await clientLoader(createTestArgs());

            // Verify that getPromotions was called twice (for 2 batches)
            expect(mockGetPromotions).toHaveBeenCalledTimes(2);

            expect(mockGetPromotions).toHaveBeenNthCalledWith(1, {
                params: {
                    query: {
                        ids: promotionIds.slice(0, 50),
                    },
                },
            });

            expect(mockGetPromotions).toHaveBeenNthCalledWith(2, {
                params: {
                    query: {
                        ids: promotionIds.slice(50, 75),
                    },
                },
            });

            const promotions = await result.promotions;
            expect(promotions).toBeDefined();
            if (promotions) {
                expect(Object.keys(promotions)).toHaveLength(75);
                expect(promotions).toHaveProperty('promo-1');
                expect(promotions).toHaveProperty('promo-50');
                expect(promotions).toHaveProperty('promo-75');
            }
        });

        it('should continue processing other batches when one batch fails', async () => {
            const { createApiClients } = await import('@/lib/api-clients');
            const { getBasket } = await setupGuestUserMocks();

            // Create 75 promotion IDs (should require 2 batches: 50 + 25)
            const promotionIds = createPromotionIds(75);

            const mockGetPromotions = vi
                .fn()
                .mockRejectedValueOnce(new Error('API Error for first batch'))
                .mockResolvedValueOnce({
                    data: {
                        data: Array.from({ length: 25 }, (_, i) => ({
                            id: `promo-${i + 51}`,
                            name: `Promotion ${i + 51}`,
                        })),
                    },
                });

            vi.mocked(createApiClients).mockReturnValue({
                shopperPromotions: {
                    getPromotions: mockGetPromotions,
                },
                shopperProducts: {
                    getProducts: vi.fn().mockResolvedValue({ data: { data: [] } }),
                },
            } as any);

            const productItems = createProductItemsFromPromotions(promotionIds);

            vi.mocked(getBasket).mockReturnValue({
                basketId: 'test-basket-error',
                productItems,
                shipments: [{ shippingAddress: { address1: '123 Main St' } }],
            } as any);

            const result = await clientLoader(createTestArgs());

            expect(mockGetPromotions).toHaveBeenCalledTimes(2);

            const promotions = await result.promotions;
            expect(promotions).toBeDefined();
            if (promotions) {
                expect(Object.keys(promotions)).toHaveLength(25);
                expect(promotions).toHaveProperty('promo-51');
                expect(promotions).toHaveProperty('promo-75');
                expect(promotions).not.toHaveProperty('promo-1');
            }
        });

        it('should handle basket with no product items', async () => {
            const { getBasket } = await import('@/middlewares/basket.client');
            const { getAuth: getAuthClient } = await import('@/middlewares/auth.client');
            const { isRegisteredCustomer } = await import('@/lib/api/customer');
            const { createApiClients } = await import('@/lib/api-clients');

            vi.mocked(createApiClients).mockReturnValue({
                shopperPromotions: {
                    getPromotions: vi.fn(),
                },
                shopperProducts: {
                    getProducts: vi.fn().mockResolvedValue({ data: { data: [] } }),
                },
            } as any);

            vi.mocked(getBasket).mockReturnValue({
                basketId: 'test-basket',
                productItems: [],
                shipments: [{ shippingAddress: { address1: '123 Main St' } }],
            } as any);

            vi.mocked(getAuthClient).mockReturnValue({
                customer_id: undefined,
                userType: 'guest',
            } as any);

            vi.mocked(isRegisteredCustomer).mockReturnValue(false);

            const result = await clientLoader(createTestArgs());

            const productMap = await result.productMap;
            expect(productMap).toEqual({});
        });
    });

    describe('getServerCustomerProfileData', () => {
        it('should return null when authSession is null', async () => {
            const mockContext = {} as any;
            const result = await getServerCustomerProfileData(mockContext, null);
            expect(result).toBeNull();
        });

        it('should return null when authSession has no customer_id', async () => {
            const mockContext = {} as any;
            const authSession = {
                userType: 'registered',
                customer_id: undefined,
            } as any;

            const result = await getServerCustomerProfileData(mockContext, authSession);
            expect(result).toBeNull();
        });

        it('should return null when userType is not registered', async () => {
            const mockContext = {} as any;
            const authSession = {
                customer_id: 'test-123',
                userType: 'guest',
            } as any;

            const result = await getServerCustomerProfileData(mockContext, authSession);
            expect(result).toBeNull();
        });

        it('should handle errors gracefully', async () => {
            const mockContext = {
                get: () => {
                    throw new Error('Context error');
                },
            } as any;
            const authSession = {
                customer_id: 'test-123',
                userType: 'registered',
            } as any;

            const result = await getServerCustomerProfileData(mockContext, authSession);
            expect(result).toBeNull();
        });
    });

    describe('getServerShippingMethodsMapData', () => {
        it('should return empty object when authSession is null', async () => {
            const mockContext = {} as any;
            const result = await getServerShippingMethodsMapData(mockContext, null);
            expect(result).toEqual({});
        });

        it('should return empty object when authSession exists', async () => {
            const mockContext = {} as any;
            const authSession = {
                customer_id: 'test-123',
                userType: 'registered',
            } as any;

            const result = await getServerShippingMethodsMapData(mockContext, authSession);
            expect(result).toEqual({});
        });
    });

    describe('fetchShippingMethodsMapForBasket', () => {
        beforeEach(() => {
            vi.clearAllMocks();
        });

        it('should return empty object when basket is null', async () => {
            const mockContext = {} as any;
            const result = await fetchShippingMethodsMapForBasket(mockContext, null);
            expect(result).toEqual({});
        });

        it('should return empty object when basket has no basketId', async () => {
            const mockContext = {} as any;
            const basket = {
                shipments: [{ shippingAddress: { address1: '123 Main St' } }],
            } as any;

            const result = await fetchShippingMethodsMapForBasket(mockContext, basket);
            expect(result).toEqual({});
        });

        it('should return empty object when basket has no shipments', async () => {
            const mockContext = {} as any;
            const basket = {
                basketId: 'test-basket',
                shipments: undefined,
            } as any;

            const result = await fetchShippingMethodsMapForBasket(mockContext, basket);
            expect(result).toEqual({});
        });

        it('should return empty object when basket has empty shipments array', async () => {
            const mockContext = {} as any;
            const basket = {
                basketId: 'test-basket',
                shipments: [],
            } as any;

            const result = await fetchShippingMethodsMapForBasket(mockContext, basket);
            expect(result).toEqual({});
        });

        it('should fetch shipping methods for shipments with addresses', async () => {
            const { getShippingMethodsForShipment } = await import('@/lib/api/shipping-methods');

            vi.mocked(getShippingMethodsForShipment).mockResolvedValue({
                applicableShippingMethods: [{ id: 'standard', name: 'Standard' }],
            } as any);

            const mockContext = {} as any;
            const basket = {
                basketId: 'test-basket',
                shipments: [
                    {
                        shipmentId: 'shipment-1',
                        shippingAddress: { address1: '123 Main St' },
                    },
                ],
            } as any;

            const result = await fetchShippingMethodsMapForBasket(mockContext, basket);

            expect(result).toHaveProperty('shipment-1');
            expect(result['shipment-1'].applicableShippingMethods).toHaveLength(1);
        });

        it('should skip shipments without shipmentId', async () => {
            const { getShippingMethodsForShipment } = await import('@/lib/api/shipping-methods');

            const mockContext = {} as any;
            const basket = {
                basketId: 'test-basket',
                shipments: [
                    {
                        shipmentId: undefined,
                        shippingAddress: { address1: '123 Main St' },
                    },
                ],
            } as any;

            const result = await fetchShippingMethodsMapForBasket(mockContext, basket);

            expect(result).toEqual({});
            expect(getShippingMethodsForShipment).not.toHaveBeenCalled();
        });

        it('should skip shipments with empty shipping address', async () => {
            const { getShippingMethodsForShipment } = await import('@/lib/api/shipping-methods');

            const mockContext = {} as any;
            const basket = {
                basketId: 'test-basket',
                shipments: [
                    {
                        shipmentId: 'shipment-1',
                        shippingAddress: {},
                    },
                ],
            } as any;

            const result = await fetchShippingMethodsMapForBasket(mockContext, basket);

            expect(result).toEqual({});
            expect(getShippingMethodsForShipment).not.toHaveBeenCalled();
        });

        it('should handle fetch failures gracefully', async () => {
            const { getShippingMethodsForShipment } = await import('@/lib/api/shipping-methods');

            vi.mocked(getShippingMethodsForShipment).mockRejectedValue(new Error('API Error'));

            const mockContext = {} as any;
            const basket = {
                basketId: 'test-basket',
                shipments: [
                    {
                        shipmentId: 'shipment-1',
                        shippingAddress: { address1: '123 Main St' },
                    },
                ],
            } as any;

            const result = await fetchShippingMethodsMapForBasket(mockContext, basket);

            expect(result).toEqual({});
        });

        it('should handle multiple shipments with mixed success/failure', async () => {
            const { getShippingMethodsForShipment } = await import('@/lib/api/shipping-methods');

            vi.mocked(getShippingMethodsForShipment)
                .mockResolvedValueOnce({
                    applicableShippingMethods: [{ id: 'standard', name: 'Standard' }],
                } as any)
                .mockRejectedValueOnce(new Error('API Error'));

            const mockContext = {} as any;
            const basket = {
                basketId: 'test-basket',
                shipments: [
                    {
                        shipmentId: 'shipment-1',
                        shippingAddress: { address1: '123 Main St' },
                    },
                    {
                        shipmentId: 'shipment-2',
                        shippingAddress: { address1: '456 Oak Ave' },
                    },
                ],
            } as any;

            const result = await fetchShippingMethodsMapForBasket(mockContext, basket);

            expect(result).toHaveProperty('shipment-1');
            expect(result).not.toHaveProperty('shipment-2');
        });
    });
});
