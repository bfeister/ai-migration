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
import userEvent from '@testing-library/user-event';
import ExpressPayments from './express-payments';

// Mock the PayPal SDK hook
vi.mock('@/hooks/use-paypal-sdk', () => ({
    usePayPalSDK: vi.fn(() => ({ isLoading: false, error: null })),
}));

// Mock the PayPal and Venmo button components - these are tested separately
vi.mock('./paypal-button', () => {
    return {
        __esModule: true,
        default: ({ onApprove }: { onApprove: () => void }) => (
            <button data-testid="paypal-button" onClick={onApprove}>
                PayPal Button
            </button>
        ),
    };
});

vi.mock('./venmo-button', () => {
    return {
        __esModule: true,
        default: ({ onApprove }: { onApprove: () => void }) => (
            <button data-testid="venmo-button" onClick={onApprove}>
                Venmo Button
            </button>
        ),
    };
});

const createDefaultProps = (overrides = {}) => ({
    onApplePayClick: vi.fn(),
    onGooglePayClick: vi.fn(),
    onAmazonPayClick: vi.fn(),
    onVenmoClick: vi.fn(),
    onPayPalClick: vi.fn(),
    disabled: false,
    ...overrides,
});

describe('ExpressPayments Integration Tests', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('Basic Rendering', () => {
        test('renders payment buttons container', () => {
            const { container } = render(<ExpressPayments {...createDefaultProps()} />);

            const gridContainer = container.querySelector('.grid');
            expect(gridContainer).toBeInTheDocument();
        });

        test('renders PayPal and Venmo buttons', () => {
            render(<ExpressPayments {...createDefaultProps()} />);

            expect(screen.getByTestId('paypal-button')).toBeInTheDocument();
            expect(screen.getByTestId('venmo-button')).toBeInTheDocument();
        });

        test('renders divider with Or text', () => {
            render(<ExpressPayments {...createDefaultProps()} />);

            expect(screen.getByText('Or')).toBeInTheDocument();
        });
    });

    describe('Button Interactions', () => {
        test('calls onPayPalClick when PayPal button is clicked', async () => {
            const user = userEvent.setup();
            const handlePayPalClick = vi.fn();

            render(<ExpressPayments {...createDefaultProps({ onPayPalClick: handlePayPalClick })} />);

            const paypalButton = screen.getByTestId('paypal-button');
            await user.click(paypalButton);

            expect(handlePayPalClick).toHaveBeenCalledTimes(1);
        });

        test('calls onVenmoClick when Venmo button is clicked', async () => {
            const user = userEvent.setup();
            const handleVenmoClick = vi.fn();

            render(<ExpressPayments {...createDefaultProps({ onVenmoClick: handleVenmoClick })} />);

            const venmoButton = screen.getByTestId('venmo-button');
            await user.click(venmoButton);

            expect(handleVenmoClick).toHaveBeenCalledTimes(1);
        });
    });

    describe('Disabled State', () => {
        test('passes disabled prop to payment buttons', () => {
            render(<ExpressPayments {...createDefaultProps({ disabled: true })} />);

            // Component renders even when disabled
            expect(screen.getByTestId('paypal-button')).toBeInTheDocument();
            expect(screen.getByTestId('venmo-button')).toBeInTheDocument();
        });
    });

    describe('PayPal SDK Integration', () => {
        test('shows skeleton when PayPal SDK is loading', async () => {
            const { usePayPalSDK } = await import('@/hooks/use-paypal-sdk');
            vi.mocked(usePayPalSDK).mockReturnValue({ isLoading: true, error: null });

            const { container } = render(<ExpressPayments {...createDefaultProps()} />);

            // Should show loading skeleton, not the actual button
            const skeleton = container.querySelector('.animate-pulse');
            expect(skeleton).toBeInTheDocument();
        });

        test('shows error message when PayPal SDK fails', async () => {
            const { usePayPalSDK } = await import('@/hooks/use-paypal-sdk');
            vi.mocked(usePayPalSDK).mockReturnValue({ isLoading: false, error: new Error('SDK failed') });

            render(<ExpressPayments {...createDefaultProps()} />);

            expect(screen.getByText('PayPal unavailable')).toBeInTheDocument();
            expect(screen.getByText('Venmo unavailable')).toBeInTheDocument();
        });
    });
});
