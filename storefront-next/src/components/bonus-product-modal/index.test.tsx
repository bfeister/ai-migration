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

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
// eslint-disable-next-line import/no-namespace -- vi.spyOn requires namespace import
import * as ReactRouter from 'react-router';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { BonusProductModal } from './index';
import { AllProvidersWrapper } from '@/test-utils/context-provider';

// Mock dependencies
const mockFetcherLoad = vi.fn();
const mockFetcherSubmit = vi.fn();
const mockAddToast = vi.fn();

// Mock state for fetcher
let mockFetcherData: any = null;
let mockFetcherState: 'idle' | 'loading' | 'submitting' = 'idle';
let mockFetcherSuccess = false;

vi.mock('@/hooks/use-scapi-fetcher', () => ({
    useScapiFetcher: () => ({
        load: mockFetcherLoad,
        data: mockFetcherData,
        state: mockFetcherState,
        success: mockFetcherSuccess,
    }),
}));

vi.mock('@/hooks/product/use-product-images', () => ({
    useProductImages: () => ({
        galleryImages: [],
        selectedImage: null,
    }),
}));

vi.mock('@/components/toast', () => ({
    useToast: () => ({
        addToast: mockAddToast,
    }),
}));

vi.mock('@/providers/product-view', () => ({
    default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    useProductView: () => ({
        quantity: 1,
        setQuantity: vi.fn(),
    }),
}));

vi.mock('@/components/image-gallery', () => ({
    default: () => <div data-testid="image-gallery">Image Gallery</div>,
}));

vi.mock('@/components/product-view/product-info', () => ({
    default: () => <div data-testid="product-info">Product Info</div>,
}));

// Helper to render with router context - similar to CartItemEditModal pattern
function renderWithRouter(ui: React.ReactElement) {
    const router = createMemoryRouter(
        [
            {
                path: '/',
                element: <AllProvidersWrapper>{ui}</AllProvidersWrapper>,
            },
        ],
        {
            initialEntries: ['/'],
        }
    );

    return render(<RouterProvider router={router} />);
}

describe('BonusProductModal', () => {
    const mockOnOpenChange = vi.fn();

    const mockProps = {
        open: true,
        onOpenChange: mockOnOpenChange,
        productId: 'test-product-123',
        productName: 'Striped Silk Tie',
        promotionId: 'promo-abc',
        bonusDiscountLineItemId: 'bdli-xyz',
        bonusDiscountSlots: [
            { id: 'bdli-xyz', maxBonusItems: 2, bonusProductsSelected: 0 },
            { id: 'bdli-abc', maxBonusItems: 1, bonusProductsSelected: 0 },
        ],
        maxQuantity: 3,
    };

    beforeEach(() => {
        vi.clearAllMocks();
        mockFetcherData = null;
        mockFetcherState = 'idle';
        mockFetcherSuccess = false;
        mockFetcherLoad.mockClear();
        mockFetcherSubmit.mockClear();
        mockAddToast.mockClear();
        // Use vi.spyOn to mock useFetcher while keeping real router exports
        vi.spyOn(ReactRouter, 'useFetcher').mockReturnValue({
            submit: mockFetcherSubmit,
            data: null,
            state: 'idle',
        } as any);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('Rendering', () => {
        it('should render the modal when open is true', () => {
            renderWithRouter(<BonusProductModal {...mockProps} />);

            expect(screen.getByRole('dialog')).toBeInTheDocument();
            // The modal shows product name in the title
            expect(screen.getByText(/Striped Silk Tie/)).toBeInTheDocument();
        });

        it('should not render modal content when open is false', () => {
            renderWithRouter(<BonusProductModal {...mockProps} open={false} />);

            expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        });

        it('should display all passed props in scaffold', () => {
            renderWithRouter(<BonusProductModal {...mockProps} />);

            // Check that the modal is rendered
            const dialog = screen.getByRole('dialog');
            expect(dialog).toBeInTheDocument();

            // Check that product name is displayed in title
            expect(screen.getByText(/Striped Silk Tie/)).toBeInTheDocument();

            // Check that selected count is displayed (0 of 2 selected - matches maxBonusItems in mockProps)
            expect(screen.getByText(/0 of 2 selected/)).toBeInTheDocument();
        });

        it('should update when open prop changes from false to true', () => {
            const { rerender } = renderWithRouter(<BonusProductModal {...mockProps} open={false} />);

            // Initially should not be visible
            expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

            // Rerender with open=true - need to wrap in providers again
            const router = createMemoryRouter(
                [
                    {
                        path: '/',
                        element: (
                            <AllProvidersWrapper>
                                <BonusProductModal {...mockProps} open={true} />
                            </AllProvidersWrapper>
                        ),
                    },
                ],
                { initialEntries: ['/'] }
            );
            rerender(<RouterProvider router={router} />);

            // Should now be visible
            expect(screen.getByRole('dialog')).toBeInTheDocument();
        });

        it('should update when open prop changes from true to false', () => {
            const { rerender } = renderWithRouter(<BonusProductModal {...mockProps} open={true} />);

            // Initially should be visible
            expect(screen.getByRole('dialog')).toBeInTheDocument();

            // Rerender with open=false
            const router = createMemoryRouter(
                [
                    {
                        path: '/',
                        element: (
                            <AllProvidersWrapper>
                                <BonusProductModal {...mockProps} open={false} />
                            </AllProvidersWrapper>
                        ),
                    },
                ],
                { initialEntries: ['/'] }
            );
            rerender(<RouterProvider router={router} />);

            // Should now be hidden
            expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        });

        it('should have proper Dialog role', () => {
            renderWithRouter(<BonusProductModal {...mockProps} />);

            // Dialog element should have role="dialog"
            const dialog = screen.getByRole('dialog');

            expect(dialog).toBeInTheDocument();
            expect(dialog).toHaveAttribute('role', 'dialog');
        });
    });

    describe('User Interactions', () => {
        it('should call onOpenChange with false when close button clicked', () => {
            renderWithRouter(<BonusProductModal {...mockProps} />);

            // Find and click the close button
            const closeButton = screen.getByRole('button', { name: /close/i });
            fireEvent.click(closeButton);

            expect(mockOnOpenChange).toHaveBeenCalledWith(false);
            expect(mockOnOpenChange).toHaveBeenCalledTimes(1);
        });

        it('should call onOpenChange with false when ESC key pressed', () => {
            renderWithRouter(<BonusProductModal {...mockProps} />);

            // Press ESC key
            fireEvent.keyDown(document, { key: 'Escape', code: 'Escape' });

            expect(mockOnOpenChange).toHaveBeenCalledWith(false);
        });

        it('should call onOpenChange with false when clicking outside modal', () => {
            renderWithRouter(<BonusProductModal {...mockProps} />);

            // Click on the overlay/backdrop (outside the modal content)
            const overlay = document.querySelector('[data-radix-dialog-overlay]');
            if (overlay) {
                fireEvent.click(overlay);
                expect(mockOnOpenChange).toHaveBeenCalledWith(false);
            }
        });

        it('should have close button enabled', () => {
            renderWithRouter(<BonusProductModal {...mockProps} />);

            const closeButton = screen.getByRole('button', { name: /close/i });

            expect(closeButton).toBeInTheDocument();
            expect(closeButton).not.toBeDisabled();
        });
    });

    describe('Styling', () => {
        it('should have correct modal dimensions', () => {
            renderWithRouter(<BonusProductModal {...mockProps} />);

            // Dialog is rendered in a portal, use document to query
            const dialogContent = document.querySelector('[class*="lg:max-w-4xl"]');

            expect(dialogContent).toBeInTheDocument();
            expect(dialogContent?.className).toContain('lg:max-w-4xl');
            expect(dialogContent?.className).toContain('lg:max-h-[90vh]');
            expect(dialogContent?.className).toContain('lg:overflow-y-auto');
        });
    });
});
