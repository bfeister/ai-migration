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
import { getTranslation } from '@/lib/i18next';

const { t } = getTranslation();

// React Router
import { createMemoryRouter, RouterProvider } from 'react-router';

// Components
import { CartItemEditModal } from './index';

// Mock data
import { variantProduct } from '@/components/__mocks__/master-variant-product';

// Utils
import { AllProvidersWrapper } from '@/test-utils/context-provider';

// Mock useScapiFetcher to prevent actual API calls
const mockLoad = vi.fn().mockResolvedValue(undefined);
vi.mock('@/hooks/use-scapi-fetcher', () => ({
    useScapiFetcher: vi.fn(() => ({
        load: mockLoad,
        data: variantProduct,
        state: 'idle',
    })),
}));

const renderCartItemEditModal = (props: React.ComponentProps<typeof CartItemEditModal>) => {
    // Using createMemoryRouter in framework mode is fine
    // because both framework and data routers share the same underlying architecture, so it provides a valid navigation context for hooks and <Link>.
    // Even though it's listed under "data routers," it fully supports testing non-route components that rely on router behavior.
    const router = createMemoryRouter(
        [
            {
                path: '/',
                element: (
                    <AllProvidersWrapper>
                        <CartItemEditModal {...props} />
                    </AllProvidersWrapper>
                ),
            },
        ],
        {
            initialEntries: ['/'],
        }
    );
    return { ...render(<RouterProvider router={router} />), router };
};

describe('CartItemEditModal', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    const defaultProps = {
        open: true,
        onOpenChange: vi.fn(),
        product: variantProduct,
        initialQuantity: 1,
        itemId: 'test-item-id',
    };

    test('renders modal when open is true', () => {
        renderCartItemEditModal(defaultProps);

        expect(screen.getByRole('dialog')).toBeInTheDocument();
        expect(screen.getByText(t('editItem:title'))).toBeInTheDocument();
    });

    test('does not render modal when open is false', () => {
        renderCartItemEditModal({ ...defaultProps, open: false });

        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        expect(screen.queryByText(t('editItem:title'))).not.toBeInTheDocument();
    });

    test('displays product name in modal content', () => {
        renderCartItemEditModal(defaultProps);

        expect(screen.getByText(variantProduct.name as string)).toBeInTheDocument();
    });

    test('calls onOpenChange when modal is closed', async () => {
        const user = userEvent.setup();
        const mockOnOpenChange = vi.fn();
        renderCartItemEditModal({ ...defaultProps, onOpenChange: mockOnOpenChange });

        // Find and click the close button
        const closeButton = screen.getByRole('button', { name: /close/i });
        await user.click(closeButton);

        expect(mockOnOpenChange).toHaveBeenCalledWith(false);
    });

    test('displays correct dialog title', () => {
        renderCartItemEditModal(defaultProps);

        expect(screen.getByText(t('editItem:title'))).toBeInTheDocument();
    });

    test('maintains accessibility with proper ARIA attributes', () => {
        renderCartItemEditModal(defaultProps);

        const dialog = screen.getByRole('dialog');
        expect(dialog).toBeInTheDocument();

        // Check for dialog title
        const title = screen.getByText(t('editItem:title'));
        expect(title).toBeInTheDocument();
    });
});
