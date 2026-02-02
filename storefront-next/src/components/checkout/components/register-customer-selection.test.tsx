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
import { describe, test, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import RegisterCustomerSelection from './register-customer-selection';

describe('RegisterCustomerSelection', () => {
    test('renders component with correct elements', () => {
        render(<RegisterCustomerSelection />);

        // Should render checkbox
        const checkbox = screen.getByRole('checkbox');
        expect(checkbox).toBeInTheDocument();
        expect(checkbox).toHaveAttribute('id', 'create-account-checkbox');
    });

    test('checkbox has correct initial state', () => {
        render(<RegisterCustomerSelection />);

        const checkbox = screen.getByRole('checkbox');
        expect(checkbox).toHaveAttribute('aria-checked', 'false');
        expect(checkbox).toHaveAttribute('data-state', 'unchecked');
    });

    test('calls onSaved callback when checkbox is toggled', async () => {
        const user = userEvent.setup();
        const handleSaved = vi.fn();

        render(<RegisterCustomerSelection onSaved={handleSaved} />);

        const checkbox = screen.getByRole('checkbox');

        // Click checkbox
        await user.click(checkbox);

        // Should have called with true
        expect(handleSaved).toHaveBeenCalledWith(true);
    });

    test('works without onSaved callback', async () => {
        const user = userEvent.setup();

        // Should not throw when callback is not provided
        expect(() => render(<RegisterCustomerSelection />)).not.toThrow();

        const checkbox = screen.getByRole('checkbox');

        // Should be able to click without error
        await expect(user.click(checkbox)).resolves.not.toThrow();
    });

    test('renders ToggleCard structure', () => {
        render(<RegisterCustomerSelection />);

        // Should have the toggle card with editing state
        const checkbox = screen.getByRole('checkbox');
        expect(checkbox).toBeInTheDocument();

        // Should have label element connected to checkbox
        const label = document.querySelector('label[for="create-account-checkbox"]');
        expect(label).toBeInTheDocument();
    });
});
