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
import { render, screen } from '@testing-library/react';
import { describe, test, expect } from 'vitest';
import { MemoryRouter } from 'react-router';
import { OrderDetails } from './index';
import { getTranslation } from '@/lib/i18next';
import { ConfigWrapper } from '@/test-utils/config';
import type { ShopperOrders } from '@salesforce/storefront-next-runtime/scapi';
import { mockOrderDetailsOrder, mockOrderDetailsProductsById } from './mock-order-details';

const { t } = getTranslation();

/** Wraps OrderDetails with required router + config context (Link, ProductImage). */
function OrderDetailsWithProviders({ order = mockOrderDetailsOrder }: { order?: ShopperOrders.schemas['Order'] }) {
    return (
        <MemoryRouter>
            <ConfigWrapper>
                <OrderDetails order={order} productsById={mockOrderDetailsProductsById} />
            </ConfigWrapper>
        </MemoryRouter>
    );
}

describe('OrderDetails', () => {
    const renderOrderDetails = (order = mockOrderDetailsOrder) => render(<OrderDetailsWithProviders order={order} />);

    test('renders order details section', () => {
        const { container } = renderOrderDetails();
        expect(container.querySelector('[data-section="order-details"]')).toBeInTheDocument();
    });

    test('renders page title and order number', () => {
        renderOrderDetails();
        expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(t('account:orders.orderDetailsPageTitle'));
        expect(screen.getByText(t('account:orders.orderDetailsTitle'))).toBeInTheDocument();
        expect(screen.getByText(/INO001/)).toBeInTheDocument();
    });

    test('renders status label from order.status (new, shipped, delivered)', () => {
        const cases: Array<{
            status: ShopperOrders.schemas['Order']['status'] | 'shipped' | 'delivered';
            expectedLabel: string;
        }> = [
            { status: 'new', expectedLabel: 'New' },
            {
                status: 'shipped' as ShopperOrders.schemas['Order']['status'],
                expectedLabel: t('account:orders.status.inTransit'),
            },
            {
                status: 'delivered' as ShopperOrders.schemas['Order']['status'],
                expectedLabel: t('account:orders.status.delivered'),
            },
        ];
        cases.forEach(({ status, expectedLabel }) => {
            const { unmount } = renderOrderDetails({
                ...mockOrderDetailsOrder,
                status,
            } as ShopperOrders.schemas['Order']);
            expect(screen.getByText(expectedLabel)).toBeInTheDocument();
            unmount();
        });
    });

    test('renders back to order history link with correct text and href', () => {
        renderOrderDetails();
        const link = screen.getByRole('link', { name: /back to order history/i });
        expect(link).toBeInTheDocument();
        expect(link).toHaveAttribute('href', '/account/orders');
        expect(link).toHaveTextContent(new RegExp(t('account:orders.backToOrderHistory')));
    });

    test('renders Items Ordered heading', () => {
        renderOrderDetails();
        expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(t('account:orders.itemsOrdered'));
    });

    test('renders Order Summary heading', () => {
        renderOrderDetails();
        expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent(t('account:orders.orderSummary'));
    });

    test('renders OrderSummary with subtotal and order total from order', () => {
        renderOrderDetails();
        const orderSummary = document.querySelector('[data-testid="sf-order-summary"]');
        expect(orderSummary).toBeInTheDocument();
        expect(screen.getByText(t('cart:summary.subtotal'))).toBeInTheDocument();
        expect(screen.getByText(t('cart:summary.orderTotal'))).toBeInTheDocument();
        expect(screen.getByText(/71\.38/)).toBeInTheDocument();
    });

    test('renders Shipment 1 with recipient name (Shipment 1 → Name)', () => {
        renderOrderDetails();
        const shipmentLabel = t('account:orders.shipmentNumber', { n: '1' });
        const recipientName = mockOrderDetailsOrder.shipments?.[0]?.shippingAddress?.fullName ?? '';
        const shipmentHeaderParagraph = screen.getByText((_, element) => {
            const text = element?.textContent ?? '';
            return (
                element?.tagName === 'P' &&
                text.includes(shipmentLabel) &&
                text.includes(recipientName) &&
                text.includes('→')
            );
        });
        expect(shipmentHeaderParagraph).toBeInTheDocument();
    });

    test('renders recipient name from fullName when firstName and lastName are absent', () => {
        const orderWithFullNameOnly = {
            ...mockOrderDetailsOrder,
            shipments: [
                {
                    shipmentId: 'me',
                    shippingAddress: {
                        fullName: 'Acme Corp',
                        address1: '1 Main St',
                        city: 'Seattle',
                        countryCode: 'US',
                        postalCode: '98101',
                        stateCode: 'WA',
                    },
                },
            ],
            productItems: mockOrderDetailsOrder.productItems,
        };
        renderOrderDetails(orderWithFullNameOnly as ShopperOrders.schemas['Order']);
        const shipmentSection = document.querySelector('[data-shipment-id="me"]');
        expect(shipmentSection).toHaveTextContent('Acme Corp');
        expect(shipmentSection).toHaveTextContent('→');
    });

    test('renders product name from order items', () => {
        renderOrderDetails();
        expect(screen.getByText('First Product')).toBeInTheDocument();
    });

    test('renders multiple products in a single shipment grouped under Shipment 1', () => {
        const firstItem = mockOrderDetailsOrder.productItems?.[0];
        if (!firstItem) throw new Error('mock order has no product items');
        const secondItem = {
            itemId: 'item-2',
            productId: 'prod-2',
            productName: 'Second Product',
            quantity: 2,
            priceAfterItemDiscount: 29.99,
            shipmentId: 'me',
        };
        const orderWithMultipleItems = {
            ...mockOrderDetailsOrder,
            productItems: [firstItem, secondItem],
        };
        renderOrderDetails(orderWithMultipleItems);
        expect(screen.getByText(t('account:orders.shipmentNumber', { n: '1' }))).toBeInTheDocument();
        expect(screen.getByText('First Product')).toBeInTheDocument();
        expect(screen.getByText('Second Product')).toBeInTheDocument();
        expect(screen.getAllByText('$61.99')).toHaveLength(2); // item + order summary
        expect(screen.getAllByText('$29.99')).toHaveLength(1); // item only
        expect(screen.getAllByRole('listitem')).toHaveLength(2);
    });

    test('renders multiple shipments with items grouped by shipment', () => {
        const orderWithMultipleShipments = {
            orderNo: 'INV002',
            status: 'new',
            shipments: [
                {
                    shipmentId: 'ship-a',
                    shipmentNo: '00002501',
                    shippingAddress: {
                        firstName: 'Alice',
                        lastName: 'Smith',
                        fullName: 'Alice Smith',
                    },
                },
                {
                    shipmentId: 'ship-b',
                    shipmentNo: '00002502',
                    shippingAddress: {
                        firstName: 'Bob',
                        lastName: 'Jones',
                        fullName: 'Bob Jones',
                    },
                },
            ],
            productItems: [
                {
                    itemId: 'item-a1',
                    productId: 'prod-a',
                    productName: 'Product for Alice',
                    quantity: 1,
                    priceAfterItemDiscount: 10,
                    shipmentId: 'ship-a',
                },
                {
                    itemId: 'item-b1',
                    productId: 'prod-b',
                    productName: 'Product for Bob',
                    quantity: 1,
                    priceAfterItemDiscount: 20,
                    shipmentId: 'ship-b',
                },
            ],
        };
        renderOrderDetails(orderWithMultipleShipments as ShopperOrders.schemas['Order']);
        expect(screen.getByText(t('account:orders.shipmentNumber', { n: '1' }))).toBeInTheDocument();
        expect(screen.getByText(t('account:orders.shipmentNumber', { n: '2' }))).toBeInTheDocument();
        expect(screen.getAllByText(/Alice Smith/)).toHaveLength(2); // header + shipping address
        expect(screen.getAllByText(/Bob Jones/)).toHaveLength(2); // header + shipping address
        expect(screen.getByText('Product for Alice')).toBeInTheDocument();
        expect(screen.getByText('Product for Bob')).toBeInTheDocument();
        const section1 = document.querySelector('[data-shipment-id="ship-a"]');
        const section2 = document.querySelector('[data-shipment-id="ship-b"]');
        expect(section1).toHaveTextContent('Product for Alice');
        expect(section1).not.toHaveTextContent('Product for Bob');
        expect(section2).toHaveTextContent('Product for Bob');
        expect(section2).not.toHaveTextContent('Product for Alice');
    });

    test('renders tracking number and shipping address per shipment when present', () => {
        renderOrderDetails();
        expect(screen.getByText(t('account:orders.trackingNumber'))).toBeInTheDocument();
        expect(screen.getByText('1234567890')).toBeInTheDocument();
        expect(document.querySelector('[data-card="tracking-number"]')).toBeInTheDocument();

        expect(screen.getByText(t('account:orders.shippingAddress'))).toBeInTheDocument();
        expect(document.querySelector('[data-card="shipping-address"]')).toBeInTheDocument();
        expect(screen.getAllByText(/John Snow/).length).toBeGreaterThanOrEqual(1);
        expect(screen.getByText(/2030 Market street 8th st/)).toBeInTheDocument();
        expect(screen.getByText(/Seattle,\s*WA\s*98121/)).toBeInTheDocument();
        expect(screen.getByText('Ground')).toBeInTheDocument();
    });

    test('omits tracking card when trackingNumber is null; omits shipping address card when shippingAddress is missing', () => {
        const orderWithoutTrackingOrAddress = {
            ...mockOrderDetailsOrder,
            shipments: [
                {
                    ...mockOrderDetailsOrder.shipments?.[0],
                    trackingNumber: null,
                    shippingAddress: null,
                    shippingMethod: null,
                },
            ],
        };
        renderOrderDetails(orderWithoutTrackingOrAddress as unknown as ShopperOrders.schemas['Order']);
        expect(document.querySelector('[data-card="tracking-number"]')).not.toBeInTheDocument();
        expect(document.querySelector('[data-card="shipping-address"]')).not.toBeInTheDocument();
    });
});
