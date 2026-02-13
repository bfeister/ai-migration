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
import { render, screen } from '@testing-library/react';
import { createMemoryRouter, MemoryRouter, RouterProvider } from 'react-router';
import { getTranslation } from '@/lib/i18next';
import {
    mockOrderDetailsOrder,
    mockOrderDetailsProductsById,
} from '@/components/account/order-details/mock-order-details';

const { t } = getTranslation();

vi.mock('@/components/account/order-details', () => ({
    default: ({ order, productsById }: { order: any; productsById: any }) => (
        <div data-testid="order-details">
            <span data-testid="order-no">{order?.orderNo}</span>
            <span data-testid="products-count">{Object.keys(productsById || {}).length}</span>
        </div>
    ),
}));

vi.mock('@/components/order-skeleton', () => ({
    default: () => <div data-testid="order-skeleton">Loading order...</div>,
}));

import OrderDetailsPage, { loader, ErrorBoundary } from './_app.account.orders.$orderNo';

function createOrderDetailsRouter(orderNo: string) {
    return createMemoryRouter(
        [
            {
                path: '/account/orders/:orderNo',
                element: <OrderDetailsPage />,
                loader: () => ({
                    orderData: Promise.resolve({
                        order: { ...mockOrderDetailsOrder, orderNo },
                        productsById: mockOrderDetailsProductsById,
                    }),
                }),
            },
        ],
        { initialEntries: [`/account/orders/${orderNo}`] }
    );
}

describe('Order Details Route (_app.account.orders.$orderNo)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('loader', () => {
        test('throws redirect when orderNo is missing or undefined', () => {
            expect(() => loader({ params: {} } as any)).toThrow();
            expect(() => loader({ params: { orderNo: undefined } } as any)).toThrow();
        });

        test('returns orderData promise with order and productsById; merges orderNo from params', async () => {
            const result = loader({ params: { orderNo: 'ORD-123' } } as any);

            expect(result).toHaveProperty('orderData');
            expect(result.orderData).toBeInstanceOf(Promise);

            const data = await result.orderData;
            expect(data.order).toBeDefined();
            expect(data.order.orderNo).toBe('ORD-123');
            expect(data.productsById).toEqual(mockOrderDetailsProductsById);

            const result2 = loader({ params: { orderNo: 'CUSTOM-456' } } as any);
            const data2 = await result2.orderData;
            expect(data2.order.orderNo).toBe('CUSTOM-456');
        });
    });

    describe('ErrorBoundary', () => {
        test('renders order not found card and layout', () => {
            const { container } = render(
                <MemoryRouter>
                    <ErrorBoundary />
                </MemoryRouter>
            );

            expect(screen.getByText(t('account:orders.orderNotFound'))).toBeInTheDocument();
            expect(screen.getByText(t('account:orders.orderNotFoundDescription'))).toBeInTheDocument();
            const backLink = screen.getByRole('link', {
                name: t('account:orders.backToOrderHistory'),
            });
            expect(backLink).toHaveAttribute('href', '/account/orders');
            expect(container.querySelector('.max-w-4xl')).toBeInTheDocument();
            expect(container.querySelector('.min-h-screen')).toBeInTheDocument();
        });
    });

    describe('OrderDetailsPage', () => {
        test('renders layout, OrderDetails with resolved data, and page container', async () => {
            const router = createOrderDetailsRouter('INO001');
            const { container } = render(<RouterProvider router={router} />);

            await screen.findByTestId('order-details');
            expect(screen.getByTestId('order-no')).toHaveTextContent('INO001');
            expect(screen.getByTestId('products-count')).toBeInTheDocument();

            const pageDiv = container.querySelector('.max-w-4xl.mx-auto');
            expect(pageDiv).toBeInTheDocument();
            expect(pageDiv?.className).toMatch(/py-8/);
        });
    });
});
