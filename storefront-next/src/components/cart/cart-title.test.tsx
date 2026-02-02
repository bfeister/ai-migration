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
import { describe, test, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { getTranslation } from '@/lib/i18next';

const { t } = getTranslation();

// Components
import CartTitle from './cart-title';

// Utils
describe('CartTitle', () => {
    const mockBasket = {
        basketId: 'test-basket-id',
        productItems: [
            { itemId: 'item-1', quantity: 2 },
            { itemId: 'item-2', quantity: 1 },
            { itemId: 'item-3', quantity: 3 },
        ],
    };

    test('renders correct title for zero items', () => {
        const emptyBasket = { ...mockBasket, productItems: [] };
        render(<CartTitle basket={emptyBasket} />);

        expect(screen.getByText(t('cart:itemCount.zero'))).toBeInTheDocument();
    });

    test('renders correct title for one item', () => {
        const singleItemBasket = { ...mockBasket, productItems: [{ itemId: 'item-1', quantity: 1 }] };
        render(<CartTitle basket={singleItemBasket} />);

        expect(screen.getByText(t('cart:itemCount.one'))).toBeInTheDocument();
    });

    test('renders correct title for multiple items', () => {
        render(<CartTitle basket={mockBasket} />);

        // Total items: 2 + 1 + 3 = 6
        expect(screen.getByText(t('cart:itemCount.other', { count: 6 }))).toBeInTheDocument();
    });

    test('handles basket with undefined productItems', () => {
        const basketWithoutItems = { basketId: 'test-basket-id' };
        render(<CartTitle basket={basketWithoutItems as { basketId: string }} />);

        expect(screen.getByText(t('cart:itemCount.zero'))).toBeInTheDocument();
    });

    test('handles basket with null productItems', () => {
        const basketWithNullItems = { basketId: 'test-basket-id', productItems: undefined };
        render(<CartTitle basket={basketWithNullItems} />);

        expect(screen.getByText(t('cart:itemCount.zero'))).toBeInTheDocument();
    });

    test('handles items with undefined quantity', () => {
        const basketWithUndefinedQuantity = {
            ...mockBasket,
            productItems: [
                { itemId: 'item-1', quantity: 2 },
                { itemId: 'item-2' }, // no quantity
                { itemId: 'item-3', quantity: 3 },
            ],
        };
        render(<CartTitle basket={basketWithUndefinedQuantity} />);

        // Total items: 2 + 0 + 3 = 5
        expect(screen.getByText(t('cart:itemCount.other', { count: 5 }))).toBeInTheDocument();
    });

    test('renders with correct heading level', () => {
        render(<CartTitle basket={mockBasket} />);

        const heading = screen.getByRole('heading', { level: 1 });
        expect(heading).toBeInTheDocument();
    });

    test('calculates total items correctly with mixed quantities', () => {
        const mixedQuantityBasket = {
            ...mockBasket,
            productItems: [
                { itemId: 'item-1', quantity: 0 },
                { itemId: 'item-2', quantity: 1 },
                { itemId: 'item-3', quantity: 10 },
                { itemId: 'item-4' }, // undefined quantity
            ],
        };
        render(<CartTitle basket={mixedQuantityBasket} />);

        // Total items: 0 + 1 + 10 + 0 = 11
        expect(screen.getByText(t('cart:itemCount.other', { count: 11 }))).toBeInTheDocument();
    });
});
