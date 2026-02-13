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
import userEvent from '@testing-library/user-event';
import { describe, expect, test } from 'vitest';
import { MarketingConsent } from './index';
import { getTranslation } from '@/lib/i18next';

const { t } = getTranslation();

describe('MarketingConsent', () => {
    test('renders card with title and Edit button', () => {
        render(<MarketingConsent />);

        expect(screen.getByText(t('account:marketingConsent.title'))).toBeInTheDocument();
        expect(screen.getByRole('button', { name: t('account:marketingConsent.editA11y') })).toBeInTheDocument();
    });

    test('renders Edit button with correct type and aria-label', () => {
        render(<MarketingConsent />);

        const editButton = screen.getByRole('button', { name: t('account:marketingConsent.editA11y') });
        expect(editButton).toHaveAttribute('type', 'button');
        expect(editButton).toHaveAttribute('aria-label', t('account:marketingConsent.editA11y'));
    });

    test('renders all channel section headings from mock data', () => {
        render(<MarketingConsent />);

        expect(screen.getByRole('heading', { name: 'Email', level: 2 })).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: 'Whatsapp', level: 2 })).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: 'Sms', level: 2 })).toBeInTheDocument();
    });

    test('renders subscription titles from mock data', () => {
        render(<MarketingConsent />);

        expect(screen.getAllByText('Weekly Newsletter').length).toBeGreaterThan(0);
        expect(screen.getByText('Promotional Offers')).toBeInTheDocument();
    });

    test('renders disclaimer text', () => {
        render(<MarketingConsent />);

        expect(screen.getByText(t('account:marketingConsent.disclaimer'))).toBeInTheDocument();
    });

    test('renders card with data-section attribute for marketing consent', () => {
        const { container } = render(<MarketingConsent />);

        const card = container.querySelector('[data-section="marketing-consent"]');
        expect(card).toBeInTheDocument();
    });

    test('toggling a switch opts in the subscription', async () => {
        const user = userEvent.setup();
        render(<MarketingConsent />);

        // Mock data has defaultStatus opt_out, so switches start unchecked.
        // Weekly Newsletter appears under Email and Whatsapp; use the first switch.
        const optedOutLabel = t('account:marketingConsent.optedOut');
        const switches = screen.getAllByRole('switch', {
            name: new RegExp(`Weekly Newsletter.*${optedOutLabel}`),
        });
        const switchForNewsletter = switches[0];
        expect(switchForNewsletter).toHaveAttribute('aria-checked', 'false');

        await user.click(switchForNewsletter);

        expect(switchForNewsletter).toHaveAttribute('aria-checked', 'true');
    });
});
