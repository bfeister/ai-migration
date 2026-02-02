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
import { action } from 'storybook/actions';
import PickupOrDeliveryDropdown from '../pickup-or-delivery-dropdown';
import { DELIVERY_OPTIONS, type DeliveryOption } from '@/extensions/bopis/constants';

const meta: Meta<typeof PickupOrDeliveryDropdown> = {
    title: 'Extensions/BOPIS/PickupOrDeliveryDropdown',
    component: PickupOrDeliveryDropdown,
    tags: ['autodocs', 'interaction'],
    parameters: {
        layout: 'padded',
        docs: {
            description: {
                component: `\
A compact button+dropdown popover for selecting Delivery or Pick Up in Store.\
\
Includes custom states, accessibility support, and styled to match UI guidelines.\
            `,
            },
        },
    },
    argTypes: {
        value: {
            description: 'Current selected fulfillment type',
            control: 'select',
            options: [DELIVERY_OPTIONS.DELIVERY, DELIVERY_OPTIONS.PICKUP],
        },
        onChange: { description: 'Change handler', action: 'onChange' },
    },
};
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
    args: {
        value: DELIVERY_OPTIONS.DELIVERY as DeliveryOption,
        isPickupDisabled: false,
        isDeliveryDisabled: false,
        onChange: action('onChange'),
    },
    parameters: {
        docs: {
            description: { story: 'Delivery selected, both options enabled.' },
        },
    },
};

export const PickupSelected: Story = {
    args: {
        value: DELIVERY_OPTIONS.PICKUP as DeliveryOption,
        isPickupDisabled: false,
        isDeliveryDisabled: false,
        onChange: action('onChange'),
    },
    parameters: {
        docs: {
            description: { story: 'Pickup selected, both options enabled.' },
        },
    },
};

export const CustomClass: Story = {
    args: {
        value: DELIVERY_OPTIONS.DELIVERY as DeliveryOption,
        isPickupDisabled: false,
        isDeliveryDisabled: false,
        onChange: action('onChange'),
    },
    parameters: {
        docs: {
            description: { story: 'Menu with a custom CSS class for styling.' },
        },
    },
};
