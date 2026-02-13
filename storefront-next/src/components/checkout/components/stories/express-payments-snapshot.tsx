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
import { vi, expect, test, describe, afterEach } from 'vitest';

// Mock PayPal SDK hook
vi.mock('@/hooks/use-paypal-sdk', () => ({
    usePayPalSDK: vi.fn(() => ({ isLoading: false, error: null })),
}));

// Mock PayPal and Venmo button components
vi.mock('../paypal-button', () => ({
    default: ({ onApprove, disabled }: { onApprove: () => void; disabled?: boolean }) => (
        <button
            data-testid="paypal-button"
            onClick={onApprove}
            disabled={disabled}
            className="w-full h-12 bg-[#0070ba] hover:bg-[#005ea6] text-background rounded flex items-center justify-center">
            PayPal
        </button>
    ),
}));

vi.mock('../venmo-button', () => ({
    default: ({ onApprove, disabled }: { onApprove: () => void; disabled?: boolean }) => (
        <button
            data-testid="venmo-button"
            onClick={onApprove}
            disabled={disabled}
            className="w-full h-12 bg-[#3D95CE] hover:bg-[#2d7fb8] text-background rounded flex items-center justify-center">
            Venmo
        </button>
    ),
}));

import { composeStories } from '@storybook/react-vite';

import * as ExpressPaymentsStories from './express-payments.stories';

import { render, cleanup } from '@testing-library/react';
const composed = composeStories(ExpressPaymentsStories);

afterEach(() => {
    cleanup();
});

describe('ExpressPayments stories snapshot', () => {
    for (const [storyName, Story] of Object.entries(composed)) {
        test(`${storyName} story renders and matches snapshot`, () => {
            const { container } = render(<Story />);
            expect(container.firstChild).toMatchSnapshot();
        });
    }
});
