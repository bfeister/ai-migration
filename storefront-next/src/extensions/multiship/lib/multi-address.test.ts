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

import { describe, it, expect } from 'vitest';
import { consolidateAddresses, initializeItemAddresses, updateItemAddresses } from './multi-address';
import type { ShopperBasketsV2, ShopperCustomers } from '@salesforce/storefront-next-runtime/scapi';
import type { CustomerProfile } from '@/components/checkout/utils/checkout-context-types';

describe('multi-address', () => {
    describe('consolidateAddresses', () => {
        const customerAddress1: ShopperCustomers.schemas['CustomerAddress'] = {
            addressId: 'addr-1',
            firstName: 'John',
            lastName: 'Doe',
            address1: '123 Main St',
            city: 'Springfield',
            stateCode: 'IL',
            postalCode: '62701',
            countryCode: 'US',
        };

        const customerAddress2: ShopperCustomers.schemas['CustomerAddress'] = {
            addressId: 'addr-2',
            firstName: 'Jane',
            lastName: 'Smith',
            address1: '456 Oak Ave',
            city: 'Portland',
            stateCode: 'OR',
            postalCode: '97201',
            countryCode: 'US',
        };

        describe('empty or undefined inputs', () => {
            it('returns empty array when no basket and no customer profile', () => {
                const result = consolidateAddresses({});
                expect(result).toEqual([]);
            });

            it('returns empty array when basket is undefined', () => {
                const customerProfile: CustomerProfile = {
                    addresses: [],
                    paymentInstruments: [],
                };
                const result = consolidateAddresses({ basket: undefined, customerProfile });
                expect(result).toEqual([]);
            });

            it('returns empty array when customer profile is undefined', () => {
                const basket: ShopperBasketsV2.schemas['Basket'] = {
                    basketId: 'basket-1',
                };
                const result = consolidateAddresses({ basket, customerProfile: undefined });
                expect(result).toEqual([]);
            });

            it('returns empty array when basket has no shipments', () => {
                const basket: ShopperBasketsV2.schemas['Basket'] = {
                    basketId: 'basket-1',
                };
                const customerProfile: CustomerProfile = {
                    addresses: [],
                    paymentInstruments: [],
                };
                const result = consolidateAddresses({ basket, customerProfile });
                expect(result).toEqual([]);
            });

            it('returns empty array when customer profile has no addresses', () => {
                const basket: ShopperBasketsV2.schemas['Basket'] = {
                    basketId: 'basket-1',
                    shipments: [],
                };
                const customerProfile: CustomerProfile = {
                    addresses: [],
                    paymentInstruments: [],
                };
                const result = consolidateAddresses({ basket, customerProfile });
                expect(result).toEqual([]);
            });
        });

        describe('customer profile addresses only', () => {
            it('returns all customer addresses when no basket', () => {
                const customerProfile: CustomerProfile = {
                    addresses: [customerAddress1, customerAddress2],
                    paymentInstruments: [],
                };
                const result = consolidateAddresses({ customerProfile });
                expect(result).toHaveLength(2);
                expect(result[0].id).toBe('addr-1');
                expect(result[1].id).toBe('addr-2');
            });

            it('returns all customer addresses when basket has no shipments', () => {
                const basket: ShopperBasketsV2.schemas['Basket'] = {
                    basketId: 'basket-1',
                };
                const customerProfile: CustomerProfile = {
                    addresses: [customerAddress1, customerAddress2],
                    paymentInstruments: [],
                };
                const result = consolidateAddresses({ basket, customerProfile });
                expect(result).toHaveLength(2);
                expect(result[0].id).toBe('addr-1');
                expect(result[1].id).toBe('addr-2');
            });
        });

        describe('shipment addresses only', () => {
            it('creates guest addresses for all shipment addresses when no customer profile', () => {
                const basket: ShopperBasketsV2.schemas['Basket'] = {
                    basketId: 'basket-1',
                    shipments: [
                        {
                            shipmentId: 'ship-1',
                            shippingAddress: {
                                firstName: 'John',
                                lastName: 'Doe',
                                address1: '123 Main St',
                                city: 'Springfield',
                                stateCode: 'IL',
                                postalCode: '62701',
                                countryCode: 'US',
                            },
                        },
                        {
                            shipmentId: 'ship-2',
                            shippingAddress: {
                                firstName: 'Jane',
                                lastName: 'Smith',
                                address1: '456 Oak Ave',
                                city: 'Portland',
                                stateCode: 'OR',
                                postalCode: '97201',
                                countryCode: 'US',
                            },
                        },
                    ],
                };
                const result = consolidateAddresses({ basket });

                expect(result).toHaveLength(2);
                expect(result[0]).toMatchObject({
                    firstName: 'John',
                    lastName: 'Doe',
                    address1: '123 Main St',
                    city: 'Springfield',
                    stateCode: 'IL',
                    postalCode: '62701',
                    countryCode: 'US',
                });
                expect(result[0].id).toBe('shipment_ship-1');
                expect(result[1]).toMatchObject({
                    firstName: 'Jane',
                    lastName: 'Smith',
                    address1: '456 Oak Ave',
                    city: 'Portland',
                    stateCode: 'OR',
                    postalCode: '97201',
                    countryCode: 'US',
                });
                expect(result[1].id).toBe('shipment_ship-2');
            });
        });

        describe('matching addresses from shipments and customer profile', () => {
            it('uses customer address when shipment address matches', () => {
                const basket: ShopperBasketsV2.schemas['Basket'] = {
                    basketId: 'basket-1',
                    shipments: [
                        {
                            shipmentId: 'ship-1',
                            shippingAddress: {
                                firstName: 'John',
                                lastName: 'Doe',
                                address1: '123 Main St',
                                city: 'Springfield',
                                stateCode: 'IL',
                                postalCode: '62701',
                                countryCode: 'US',
                            },
                        },
                    ],
                };
                const customerProfile: CustomerProfile = {
                    addresses: [customerAddress1],
                    paymentInstruments: [],
                };
                const result = consolidateAddresses({ basket, customerProfile });

                expect(result).toHaveLength(1);
                expect(result[0].id).toBe('addr-1');
                expect(result[0].firstName).toBe('John');
            });

            it('appends unused customer addresses after shipment addresses', () => {
                const basket: ShopperBasketsV2.schemas['Basket'] = {
                    basketId: 'basket-1',
                    shipments: [
                        {
                            shipmentId: 'ship-1',
                            shippingAddress: {
                                firstName: 'John',
                                lastName: 'Doe',
                                address1: '123 Main St',
                                city: 'Springfield',
                                stateCode: 'IL',
                                postalCode: '62701',
                                countryCode: 'US',
                            },
                        },
                    ],
                };
                const customerProfile: CustomerProfile = {
                    addresses: [customerAddress1, customerAddress2],
                    paymentInstruments: [],
                };
                const result = consolidateAddresses({ basket, customerProfile });

                expect(result).toHaveLength(2);
                expect(result[0].id).toBe('addr-1'); // Used in shipment
                expect(result[1].id).toBe('addr-2'); // Not used, appended
            });
        });

        describe('deliveryShipments filtering', () => {
            it('only processes shipments in deliveryShipments when provided', () => {
                const basket: ShopperBasketsV2.schemas['Basket'] = {
                    basketId: 'basket-1',
                    shipments: [
                        {
                            shipmentId: 'ship-1',
                            shippingAddress: {
                                firstName: 'John',
                                lastName: 'Doe',
                                address1: '123 Main St',
                                city: 'Springfield',
                                stateCode: 'IL',
                                postalCode: '62701',
                                countryCode: 'US',
                            },
                        },
                        {
                            shipmentId: 'ship-2',
                            shippingAddress: {
                                firstName: 'Jane',
                                lastName: 'Smith',
                                address1: '456 Oak Ave',
                                city: 'Portland',
                                stateCode: 'OR',
                                postalCode: '97201',
                                countryCode: 'US',
                            },
                        },
                    ],
                };
                const deliveryShipments = basket.shipments ? [basket.shipments[0]] : [];
                const result = consolidateAddresses({ basket, deliveryShipments });

                expect(result).toHaveLength(1);
                expect(result[0].id).toBe('shipment_ship-1');
            });
        });

        describe('duplicate address handling', () => {
            it('removes duplicate addresses from shipments', () => {
                const basket: ShopperBasketsV2.schemas['Basket'] = {
                    basketId: 'basket-1',
                    shipments: [
                        {
                            shipmentId: 'ship-1',
                            shippingAddress: {
                                firstName: 'John',
                                lastName: 'Doe',
                                address1: '123 Main St',
                                city: 'Springfield',
                                stateCode: 'IL',
                                postalCode: '62701',
                                countryCode: 'US',
                            },
                        },
                        {
                            shipmentId: 'ship-2',
                            shippingAddress: {
                                firstName: 'John',
                                lastName: 'Doe',
                                address1: '123 Main St',
                                city: 'Springfield',
                                stateCode: 'IL',
                                postalCode: '62701',
                                countryCode: 'US',
                            },
                        },
                    ],
                };
                const customerProfile: CustomerProfile = {
                    addresses: [customerAddress1],
                    paymentInstruments: [],
                };
                const result = consolidateAddresses({ basket, customerProfile });

                // Should only include the address once (from first shipment)
                expect(result).toHaveLength(1);
                expect(result[0].id).toBe('addr-1');
            });
        });

        describe('savedAddresses', () => {
            it('includes savedAddresses after shipments and customer addresses', () => {
                const basket: ShopperBasketsV2.schemas['Basket'] = {
                    basketId: 'basket-1',
                    shipments: [
                        {
                            shipmentId: 'ship-1',
                            shippingAddress: {
                                firstName: 'John',
                                lastName: 'Doe',
                                address1: '123 Main St',
                                city: 'Springfield',
                                stateCode: 'IL',
                                postalCode: '62701',
                                countryCode: 'US',
                            },
                        },
                    ],
                };
                const customerProfile: CustomerProfile = {
                    addresses: [customerAddress2],
                    paymentInstruments: [],
                };
                const savedAddresses: ShopperBasketsV2.schemas['OrderAddress'][] = [
                    {
                        id: 'saved-addr-1',
                        firstName: 'Bob',
                        lastName: 'Wilson',
                        address1: '789 Saved St',
                        city: 'Seattle',
                        stateCode: 'WA',
                        postalCode: '98101',
                        countryCode: 'US',
                    },
                ];

                const result = consolidateAddresses({ basket, customerProfile, savedAddresses });

                // Should have shipment address, customer address, and saved address in the correct order
                expect(result).toHaveLength(3);
                expect(result[0].address1).toBe('123 Main St'); // Shipment address (matched to customer)
                expect(result[1].address1).toBe('456 Oak Ave'); // Customer address
                expect(result[2].address1).toBe('789 Saved St'); // Saved address from checkout context
                expect(result[2].firstName).toBe('Bob');
            });

            it('removes duplicate addresses when savedAddresses match existing addresses', () => {
                const basket: ShopperBasketsV2.schemas['Basket'] = {
                    basketId: 'basket-1',
                    shipments: [
                        {
                            shipmentId: 'ship-1',
                            shippingAddress: {
                                firstName: 'John',
                                lastName: 'Doe',
                                address1: '123 Main St',
                                city: 'Springfield',
                                stateCode: 'IL',
                                postalCode: '62701',
                                countryCode: 'US',
                            },
                        },
                    ],
                };
                const customerProfile: CustomerProfile = {
                    addresses: [customerAddress1, customerAddress2],
                    paymentInstruments: [],
                };
                // savedAddresses contains an address that matches customerAddress1
                const savedAddresses: ShopperBasketsV2.schemas['OrderAddress'][] = [
                    {
                        id: 'saved-addr-1',
                        firstName: 'John',
                        lastName: 'Doe',
                        address1: '123 Main St',
                        city: 'Springfield',
                        stateCode: 'IL',
                        postalCode: '62701',
                        countryCode: 'US',
                    },
                ];

                const result = consolidateAddresses({ basket, customerProfile, savedAddresses });

                // Should only include the address once (duplicate removed)
                expect(result).toHaveLength(2);
                expect(result[0].id).toBe('addr-1'); // Shipment address (matched to customer)
                expect(result[1].id).toBe('addr-2'); // Customer address
                // savedAddresses duplicate should be removed
            });

            it('includes savedAddresses when no basket or customer profile', () => {
                const savedAddresses: ShopperBasketsV2.schemas['OrderAddress'][] = [
                    {
                        id: 'saved-addr-1',
                        firstName: 'Saved',
                        lastName: 'Address',
                        address1: '999 Saved Ave',
                        city: 'Saved City',
                        stateCode: 'CA',
                        postalCode: '90210',
                        countryCode: 'US',
                    },
                ];

                const result = consolidateAddresses({ savedAddresses });

                expect(result).toHaveLength(1);
                expect(result[0].id).toBe('saved-addr-1');
                expect(result[0].firstName).toBe('Saved');
            });
        });
    });

    describe('initializeItemAddresses', () => {
        const consolidatedAddresses: (ShopperBasketsV2.schemas['OrderAddress'] & { id: string })[] = [
            {
                id: 'addr-1',
                firstName: 'John',
                lastName: 'Doe',
                address1: '123 Main St',
                city: 'Springfield',
                stateCode: 'IL',
                postalCode: '62701',
                countryCode: 'US',
            },
            {
                id: 'addr-2',
                firstName: 'Jane',
                lastName: 'Smith',
                address1: '456 Oak Ave',
                city: 'Portland',
                stateCode: 'OR',
                postalCode: '97201',
                countryCode: 'US',
            },
        ];

        it('returns empty Map when productItems is undefined', () => {
            const shipments: ShopperBasketsV2.schemas['Shipment'][] = [
                {
                    shipmentId: 'ship-1',
                    shippingAddress: {
                        firstName: 'John',
                        lastName: 'Doe',
                        address1: '123 Main St',
                        city: 'Springfield',
                        stateCode: 'IL',
                        postalCode: '62701',
                        countryCode: 'US',
                    },
                },
            ];
            const result = initializeItemAddresses(consolidatedAddresses, undefined, shipments);
            expect(result.size).toBe(0);
        });

        it('returns empty Map when shipments is undefined', () => {
            const productItems: ShopperBasketsV2.schemas['ProductItem'][] = [
                {
                    itemId: 'item-1',
                    shipmentId: 'ship-1',
                    productId: 'prod-1',
                },
            ];
            const result = initializeItemAddresses(consolidatedAddresses, productItems, undefined);
            expect(result.size).toBe(0);
        });

        it('maps product items to their shipment addresses', () => {
            const productItems: ShopperBasketsV2.schemas['ProductItem'][] = [
                {
                    itemId: 'item-1',
                    shipmentId: 'ship-1',
                    productId: 'prod-1',
                },
                {
                    itemId: 'item-2',
                    shipmentId: 'ship-1',
                    productId: 'prod-2',
                },
            ];
            const shipments: ShopperBasketsV2.schemas['Shipment'][] = [
                {
                    shipmentId: 'ship-1',
                    shippingAddress: {
                        firstName: 'John',
                        lastName: 'Doe',
                        address1: '123 Main St',
                        city: 'Springfield',
                        stateCode: 'IL',
                        postalCode: '62701',
                        countryCode: 'US',
                    },
                },
            ];

            const result = initializeItemAddresses(consolidatedAddresses, productItems, shipments);

            expect(result.size).toBe(2);
            expect(result.get('item-1')?.id).toBe('addr-1');
            expect(result.get('item-1')?.firstName).toBe('John');
            expect(result.get('item-2')?.id).toBe('addr-1');
        });

        it('handles multiple items with different shipments', () => {
            const productItems: ShopperBasketsV2.schemas['ProductItem'][] = [
                {
                    itemId: 'item-1',
                    shipmentId: 'ship-1',
                    productId: 'prod-1',
                },
                {
                    itemId: 'item-2',
                    shipmentId: 'ship-2',
                    productId: 'prod-2',
                },
            ];
            const shipments: ShopperBasketsV2.schemas['Shipment'][] = [
                {
                    shipmentId: 'ship-1',
                    shippingAddress: {
                        firstName: 'John',
                        lastName: 'Doe',
                        address1: '123 Main St',
                        city: 'Springfield',
                        stateCode: 'IL',
                        postalCode: '62701',
                        countryCode: 'US',
                    },
                },
                {
                    shipmentId: 'ship-2',
                    shippingAddress: {
                        firstName: 'Jane',
                        lastName: 'Smith',
                        address1: '456 Oak Ave',
                        city: 'Portland',
                        stateCode: 'OR',
                        postalCode: '97201',
                        countryCode: 'US',
                    },
                },
            ];

            const result = initializeItemAddresses(consolidatedAddresses, productItems, shipments);

            expect(result.size).toBe(2);
            expect(result.get('item-1')?.id).toBe('addr-1');
            expect(result.get('item-2')?.id).toBe('addr-2');
        });

        it('skips items without itemId or shipmentId', () => {
            const productItems: ShopperBasketsV2.schemas['ProductItem'][] = [
                {
                    shipmentId: 'ship-1',
                    productId: 'prod-1',
                    // Missing itemId
                },
                {
                    itemId: 'item-2',
                    productId: 'prod-2',
                    // Missing shipmentId
                },
            ];
            const shipments: ShopperBasketsV2.schemas['Shipment'][] = [
                {
                    shipmentId: 'ship-1',
                    shippingAddress: {
                        firstName: 'John',
                        lastName: 'Doe',
                        address1: '123 Main St',
                        city: 'Springfield',
                        stateCode: 'IL',
                        postalCode: '62701',
                        countryCode: 'US',
                    },
                },
            ];

            const result = initializeItemAddresses(consolidatedAddresses, productItems, shipments);

            expect(result.size).toBe(0);
        });

        it('skips items when shipment has no address', () => {
            const productItems: ShopperBasketsV2.schemas['ProductItem'][] = [
                {
                    itemId: 'item-1',
                    shipmentId: 'ship-1',
                    productId: 'prod-1',
                },
            ];
            const shipments: ShopperBasketsV2.schemas['Shipment'][] = [
                {
                    shipmentId: 'ship-1',
                    // No shippingAddress
                },
            ];

            const result = initializeItemAddresses(consolidatedAddresses, productItems, shipments);

            expect(result.size).toBe(0);
        });

        it('skips items when shipment address does not match consolidated addresses', () => {
            const productItems: ShopperBasketsV2.schemas['ProductItem'][] = [
                {
                    itemId: 'item-1',
                    shipmentId: 'ship-1',
                    productId: 'prod-1',
                },
            ];
            const shipments: ShopperBasketsV2.schemas['Shipment'][] = [
                {
                    shipmentId: 'ship-1',
                    shippingAddress: {
                        firstName: 'Unknown',
                        lastName: 'Person',
                        address1: '999 Unknown St',
                        city: 'Unknown',
                        stateCode: 'XX',
                        postalCode: '99999',
                        countryCode: 'US',
                    },
                },
            ];

            const result = initializeItemAddresses(consolidatedAddresses, productItems, shipments);

            expect(result.size).toBe(0);
        });
    });

    describe('updateItemAddresses', () => {
        const consolidatedAddresses: (ShopperBasketsV2.schemas['OrderAddress'] & { id: string })[] = [
            {
                id: 'addr-1',
                firstName: 'John',
                lastName: 'Doe',
                address1: '123 Main St',
                city: 'Springfield',
                stateCode: 'IL',
                postalCode: '62701',
                countryCode: 'US',
            },
            {
                id: 'addr-2',
                firstName: 'Jane',
                lastName: 'Smith',
                address1: '456 Oak Ave',
                city: 'Portland',
                stateCode: 'OR',
                postalCode: '97201',
                countryCode: 'US',
            },
        ];

        it('returns consolidated addresses when itemAddresses is undefined', () => {
            const result = updateItemAddresses({
                consolidatedAddresses,
            });

            expect(result).toHaveLength(2);
            expect(result[0].id).toBe('addr-1');
            expect(result[1].id).toBe('addr-2');
        });

        it('prioritizes item addresses first', () => {
            const itemAddress: ShopperBasketsV2.schemas['OrderAddress'] & { id: string } = {
                id: 'item-addr-1',
                firstName: 'Item',
                lastName: 'Address',
                address1: '111 Item St',
                city: 'Itemville',
                stateCode: 'IA',
                postalCode: '11111',
                countryCode: 'US',
            };

            const result = updateItemAddresses({
                itemAddresses: new Map([['item', itemAddress]]),
                consolidatedAddresses,
            });

            expect(result).toHaveLength(3);
            expect(result[0].id).toBe('item-addr-1'); // Item address comes first
            expect(result[0].firstName).toBe('Item');
            expect(result[1].id).toBe('addr-1');
            expect(result[2].id).toBe('addr-2');
        });

        it('removes duplicates between item addresses and consolidated addresses', () => {
            const itemAddress: ShopperBasketsV2.schemas['OrderAddress'] & { id: string } = {
                id: 'item-addr-1',
                firstName: 'John',
                lastName: 'Doe',
                address1: '123 Main St',
                city: 'Springfield',
                stateCode: 'IL',
                postalCode: '62701',
                countryCode: 'US',
            };

            const result = updateItemAddresses({
                itemAddresses: new Map([['item', itemAddress]]),
                consolidatedAddresses,
            });

            expect(result).toHaveLength(2); // Duplicate removed
            expect(result[0].id).toBe('item-addr-1'); // Item address has priority
            expect(result[0].firstName).toBe('John');
            expect(result[1].id).toBe('addr-2'); // Second address remains
        });

        it('processes multiple item addresses in order', () => {
            const itemAddress1: ShopperBasketsV2.schemas['OrderAddress'] & { id: string } = {
                id: 'item-addr-1',
                firstName: 'First',
                lastName: 'Item',
                address1: '111 First St',
                city: 'Firstville',
                stateCode: 'IA',
                postalCode: '11111',
                countryCode: 'US',
            };

            const itemAddress2: ShopperBasketsV2.schemas['OrderAddress'] & { id: string } = {
                id: 'item-addr-2',
                firstName: 'Second',
                lastName: 'Item',
                address1: '222 Second St',
                city: 'Secondville',
                stateCode: 'IA',
                postalCode: '22222',
                countryCode: 'US',
            };

            const result = updateItemAddresses({
                itemAddresses: new Map([
                    ['item1', itemAddress1],
                    ['item2', itemAddress2],
                ]),
                consolidatedAddresses,
            });

            expect(result).toHaveLength(4);
            expect(result[0].id).toBe('item-addr-1');
            expect(result[1].id).toBe('item-addr-2');
            expect(result[2].id).toBe('addr-1');
            expect(result[3].id).toBe('addr-2');
        });

        it('removes duplicates within item addresses', () => {
            const itemAddress: ShopperBasketsV2.schemas['OrderAddress'] & { id: string } = {
                id: 'item-addr-1',
                firstName: 'John',
                lastName: 'Doe',
                address1: '123 Main St',
                city: 'Springfield',
                stateCode: 'IL',
                postalCode: '62701',
                countryCode: 'US',
            };

            // Same address added twice with different keys
            const result = updateItemAddresses({
                itemAddresses: new Map([
                    ['item1', itemAddress],
                    ['item2', itemAddress],
                ]),
                consolidatedAddresses,
            });

            expect(result).toHaveLength(2); // Duplicate removed
            expect(result[0].id).toBe('item-addr-1');
            expect(result[1].id).toBe('addr-2');
        });
    });
});
