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
import type { Meta, StoryObj } from '@storybook/react-vite';
import SelectBonusProductsCard from '../select-bonus-products-card';
import {
    basketWithBonusOpportunity,
    basketWithBonusOpportunityPartialSelection,
    basketWithBonusOpportunityAllSlotsFilled,
} from '@/components/__mocks__/basket-with-bonus';
import { action } from 'storybook/actions';

const meta: Meta<typeof SelectBonusProductsCard> = {
    title: 'CART/Select Bonus Products Card',
    component: SelectBonusProductsCard,
    tags: ['autodocs'],
    parameters: {
        layout: 'centered',
        docs: {
            description: {
                component: `
Card component that displays promotion callout text and a button for selecting bonus products.
Only renders if there's remaining capacity for bonus products (remainingAvailable > 0).

### Features:
- Promotion callout text with selection counter
- "Select bonus products in Cart" button
- Automatically hides when all bonus slots are filled
- Based on PWA Kit's SelectBonusProductsCard pattern

### Usage in Mini Cart:
This card appears below qualifying products in the mini cart to prompt users to select their bonus products.
Clicking the button closes the mini cart and navigates to the full cart page where bonus selection happens.
                `,
            },
        },
    },
    argTypes: {
        onSelectClick: {
            action: 'clicked',
            description: 'Callback when select button is clicked',
        },
    },
};

export default meta;
type Story = StoryObj<typeof SelectBonusProductsCard>;

/**
 * Default state: No bonus products selected yet (0 of 2 selected)
 */
export const Default: Story = {
    args: {
        basket: basketWithBonusOpportunity,
        productId: 'shirt-123',
        onSelectClick: action('select-bonus-products-clicked'),
    },
    parameters: {
        docs: {
            description: {
                story: `
Initial state when a qualifying product is in the cart but no bonus products have been selected yet.
Shows the promotion text and counter "(0 of 2 selected)".
                `,
            },
        },
    },
};

/**
 * Partial selection: 1 bonus product selected (1 of 2 selected)
 */
export const PartiallySelected: Story = {
    args: {
        basket: basketWithBonusOpportunityPartialSelection,
        productId: 'shirt-123',
        onSelectClick: action('select-bonus-products-clicked'),
    },
    parameters: {
        docs: {
            description: {
                story: `
State when some but not all bonus products have been selected.
Shows counter "(1 of 2 selected)" and button remains clickable.
                `,
            },
        },
    },
};

/**
 * All slots filled: Should NOT render (returns null)
 */
export const AllSlotsFilled: Story = {
    args: {
        basket: basketWithBonusOpportunityAllSlotsFilled,
        productId: 'shirt-123',
        onSelectClick: action('select-bonus-products-clicked'),
    },
    parameters: {
        docs: {
            description: {
                story: `
When all bonus product slots are filled (remainingAvailable = 0), the component returns null and does not render.
This story should display nothing - this is the expected behavior.
                `,
            },
        },
    },
};

/**
 * Long promotion text to test wrapping
 */
export const LongPromotionText: Story = {
    args: {
        basket: {
            ...basketWithBonusOpportunity,
            productItems: [
                {
                    ...basketWithBonusOpportunity.productItems![0],
                    priceAdjustments: [
                        {
                            promotionId: 'promo-buy-one-get-tie',
                            itemText:
                                'Buy one Classic Fit Shirt from our premium collection and get up to 2 free designer ties of your choice from our extensive tie collection!',
                            price: 0,
                        },
                    ],
                },
            ],
        },
        productId: 'shirt-123',
        onSelectClick: action('select-bonus-products-clicked'),
    },
    parameters: {
        docs: {
            description: {
                story: `
Tests text wrapping behavior with a very long promotion message.
The card should expand to accommodate the text without breaking the layout.
                `,
            },
        },
    },
};

/**
 * No promotion text - only selection counter
 */
export const OnlySelectionCounter: Story = {
    args: {
        basket: {
            ...basketWithBonusOpportunity,
            productItems: [
                {
                    ...basketWithBonusOpportunity.productItems![0],
                    priceAdjustments: [
                        {
                            promotionId: 'promo-buy-one-get-tie',
                            price: 0,
                            // no itemText
                        },
                    ],
                },
            ],
        },
        productId: 'shirt-123',
        onSelectClick: action('select-bonus-products-clicked'),
    },
    parameters: {
        docs: {
            description: {
                story: `
Edge case where promotion text is missing from the API.
Should still render with just the selection counter "(0 of 2 selected)".
                `,
            },
        },
    },
};

/**
 * Multiple cards in a container (simulating mini cart with multiple qualifying products)
 */
export const MultipleCards: Story = {
    render: () => (
        <div className="space-y-4 max-w-md">
            <div className="p-4 border rounded">
                <div className="font-bold mb-2">Classic Fit Shirt - $20.00</div>
                <SelectBonusProductsCard
                    basket={basketWithBonusOpportunity}
                    productId="shirt-123"
                    onSelectClick={action('shirt-select-clicked')}
                />
            </div>
            <div className="p-4 border rounded">
                <div className="font-bold mb-2">Men&apos;s Classic Suit - $100.00</div>
                <SelectBonusProductsCard
                    basket={{
                        ...basketWithBonusOpportunity,
                        productItems: [
                            {
                                itemId: 'item-2',
                                productId: 'suit-456',
                                productName: "Men's Classic Suit",
                                bonusProductLineItem: false,
                                quantity: 1,
                                price: 100.0,
                                priceAdjustments: [
                                    {
                                        promotionId: 'promo-buy-suit',
                                        itemText: 'Buy a suit, get free shoes!',
                                        price: 0,
                                    },
                                ],
                            },
                        ],
                        bonusDiscountLineItems: [
                            {
                                id: 'bonus-2',
                                promotionId: 'promo-buy-suit',
                                maxBonusItems: 1,
                            },
                        ],
                    }}
                    productId="suit-456"
                    onSelectClick={action('suit-select-clicked')}
                />
            </div>
        </div>
    ),
    parameters: {
        docs: {
            description: {
                story: `
Shows how multiple bonus product cards would appear in a mini cart with multiple qualifying products.
Each product has its own independent bonus opportunity and selection counter.
                `,
            },
        },
    },
};
