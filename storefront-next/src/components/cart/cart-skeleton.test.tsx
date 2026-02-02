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
import { describe, expect, test } from 'vitest';

// Components
import CartSkeleton from './cart-skeleton';

describe('CartSkeleton', () => {
    describe('Component Rendering', () => {
        test('should render without errors', () => {
            render(<CartSkeleton />);

            expect(screen.getByTestId('sf-cart-container')).toBeInTheDocument();
        });

        test('should display cart title skeleton', () => {
            render(<CartSkeleton />);

            expect(screen.getByTestId('cart-title-skeleton')).toBeInTheDocument();
        });
    });

    describe('Cart Structure', () => {
        test('should display product item skeleton', () => {
            render(<CartSkeleton />);

            expect(screen.getByTestId('cart-product-item')).toBeInTheDocument();
        });

        test('should display order summary skeleton', () => {
            render(<CartSkeleton />);

            expect(screen.getByTestId('cart-order-summary')).toBeInTheDocument();
        });
    });

    describe('Checkout Actions', () => {
        test('should display desktop CTA skeleton', () => {
            render(<CartSkeleton />);

            expect(screen.getByTestId('cart-cta-desktop')).toBeInTheDocument();
        });

        test('should display mobile CTA skeleton', () => {
            render(<CartSkeleton />);

            expect(screen.getByTestId('cart-cta-mobile')).toBeInTheDocument();
        });
    });

    describe('Consistent State', () => {
        test('should render consistently across multiple renders', () => {
            const { rerender } = render(<CartSkeleton />);

            expect(screen.getByTestId('sf-cart-container')).toBeInTheDocument();
            expect(screen.getByTestId('cart-title-skeleton')).toBeInTheDocument();
            expect(screen.getByTestId('cart-product-item')).toBeInTheDocument();
            expect(screen.getByTestId('cart-order-summary')).toBeInTheDocument();

            rerender(<CartSkeleton />);

            expect(screen.getByTestId('sf-cart-container')).toBeInTheDocument();
            expect(screen.getByTestId('cart-title-skeleton')).toBeInTheDocument();
            expect(screen.getByTestId('cart-product-item')).toBeInTheDocument();
            expect(screen.getByTestId('cart-order-summary')).toBeInTheDocument();
        });
    });
});
