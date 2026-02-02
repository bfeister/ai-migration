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
import { describe, test, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CheckoutPickup from './checkout-pickup';

vi.mock('@/components/address-display', () => ({
    __esModule: true,
    default: ({ address }: any) => (
        <div data-testid="address-display">
            {address?.firstName} {address?.lastName} {address?.address1}
        </div>
    ),
}));
vi.mock('react-i18next', () => ({
    useTranslation: (_namespace?: string | string[]) => {
        // Return the key as-is for testing (matching the actual behavior)
        return {
            t: (key: string) => key,
            i18n: {
                language: 'en-US',
            },
        };
    },
}));
vi.mock('@/providers/currency', () => ({
    useCurrency: () => 'USD',
}));

const defaultStore = {
    id: 'store-123',
    name: 'Test Store',
    address1: '123 Main St',
    address2: 'Apt B',
    city: 'Springfield',
    stateCode: 'MA',
    postalCode: '01101',
    countryCode: 'US',
    phone: '555-1111',
    email: 'help@store.com',
};
const defaultProduct = {
    id: 'item-1',
    itemId: 'item-1',
    productId: 'PID1',
    name: 'Black Hat',
    productName: 'Black Hat',
    image: '/assets/black-hat.png',
    attributes: [
        { label: 'Color', value: 'Black' },
        { label: 'Size', value: 'L' },
    ],
    variationAttributes: [
        { id: 'color', name: 'Color' },
        { id: 'size', name: 'Size' },
    ],
    variationValues: { color: 'Black', size: 'L' },
    quantity: 2,
    price: 29.95,
};
const productsByItemId = { 'item-1': defaultProduct };
const baseCart = {
    shipments: [{ shipmentId: 'ship1', c_fromStoreId: 'store-123' }],
    productItems: [{ ...defaultProduct, shipmentId: 'ship1' }],
};
const pickupContext = { pickupStores: new Map([['store-123', defaultStore]]) };
vi.mock('@/extensions/bopis/context/pickup-context', () => ({ usePickup: () => pickupContext }));

describe('CheckoutPickup', () => {
    beforeEach(() => {});
    test('renders store and address in summary mode', () => {
        render(
            <CheckoutPickup
                cart={baseCart as any}
                productsByItemId={productsByItemId}
                isEditing={false}
                onEdit={() => {}}
                onContinue={() => {}}
                continueButtonLabel="Continue"
            />
        );
        expect(screen.getByText('checkout.pickUp.title')).toBeInTheDocument();
        expect(screen.getByTestId('address-display')).toHaveTextContent('Test Store');
        expect(screen.getByText(/edit/i)).toBeInTheDocument();
    });
    test('renders pickup products and their details in edit mode', () => {
        render(
            <CheckoutPickup
                cart={baseCart as any}
                productsByItemId={productsByItemId}
                isEditing={true}
                onEdit={() => {}}
                onContinue={() => {}}
                continueButtonLabel="Continue"
            />
        );
        expect(screen.getByTestId('address-display')).toBeInTheDocument();
        expect(screen.getByText(defaultProduct.name)).toBeInTheDocument();
        expect(screen.queryByText(/edit/i)).not.toBeInTheDocument();
    });
    test('edit button calls onEdit', async () => {
        const onEdit = vi.fn();
        render(
            <CheckoutPickup
                cart={baseCart as any}
                productsByItemId={productsByItemId}
                isEditing={false}
                onEdit={onEdit}
                onContinue={() => {}}
                continueButtonLabel="Continue"
            />
        );
        const editBtn = screen.getByText(/edit/i);
        await userEvent.click(editBtn);
        expect(onEdit).toHaveBeenCalled();
    });

    test('renders multiple products if present', () => {
        const multiProductCart = {
            ...baseCart,
            productItems: [
                { ...defaultProduct, itemId: 'item-1', shipmentId: 'ship1' },
                {
                    ...defaultProduct,
                    itemId: 'item-2',
                    name: 'Red Shirt',
                    productName: 'Red Shirt',
                    shipmentId: 'ship1',
                    attributes: [{ label: 'Color', value: 'Red' }],
                    variationValues: { color: 'Red', size: 'M' },
                    quantity: 1,
                    price: 49.99,
                    image: '/assets/red-shirt.png',
                },
            ],
        };
        const productsMap = {
            'item-1': defaultProduct,
            'item-2': {
                ...defaultProduct,
                name: 'Red Shirt',
                productName: 'Red Shirt',
                image: '/assets/red-shirt.png',
            },
        };
        render(
            <CheckoutPickup
                cart={multiProductCart as any}
                productsByItemId={productsMap}
                isEditing={true}
                onEdit={() => {}}
                onContinue={() => {}}
                continueButtonLabel="Continue"
            />
        );
        expect(screen.getByText('Black Hat')).toBeInTheDocument();
        expect(screen.getByText('Red Shirt')).toBeInTheDocument();
    });
});
