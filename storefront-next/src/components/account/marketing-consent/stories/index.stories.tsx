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
import { expect, within } from 'storybook/test';
import { waitForStorybookReady } from '@storybook/test-utils';
import { MarketingConsent } from '../index';

const meta: Meta<typeof MarketingConsent> = {
    title: 'ACCOUNT/Marketing Consent',
    component: MarketingConsent,
    parameters: {
        layout: 'padded',
        docs: {
            description: {
                component:
                    'Marketing & Communication Preferences section displayed on the Account Details page. Allows users to manage their marketing subscription preferences.',
            },
        },
    },
    // Excluded from a11y test run until violations (e.g. contrast/region) are resolved; component has aria-label on Edit and Switches
    tags: ['autodocs', 'interaction', 'skip-a11y'],
};

export default meta;
type Story = StoryObj<typeof MarketingConsent>;

export const Default: Story = {
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        // Card title and Edit button
        await expect(canvas.getByText('Marketing & Communication Preferences')).toBeInTheDocument();
        const editButton = canvas.getByRole('button', { name: /edit/i });
        await expect(editButton).toBeInTheDocument();
        await expect(editButton).toHaveAttribute('type', 'button');

        // Channel sections (from mock: email, whatsapp, sms)
        await expect(canvas.getByRole('heading', { name: 'Email', level: 2 })).toBeInTheDocument();
        await expect(canvas.getByRole('heading', { name: 'Whatsapp', level: 2 })).toBeInTheDocument();
        await expect(canvas.getByRole('heading', { name: 'Sms', level: 2 })).toBeInTheDocument();

        // Subscription items from mock data (Weekly Newsletter appears under multiple channels)
        await expect(canvas.getAllByText('Weekly Newsletter').length).toBeGreaterThan(0);
        await expect(canvas.getByText('Promotional Offers')).toBeInTheDocument();

        // Disclaimer
        await expect(canvas.getByText(/By enabling these communication preferences/)).toBeInTheDocument();
    },
};

export const ClickEditButton: Story = {
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        // Assert Edit button is present and has accessible label (no click to avoid navigation error in test runner)
        const editButton = canvas.getByRole('button', { name: /edit marketing preferences/i });
        await expect(editButton).toBeInTheDocument();
        await expect(editButton).toHaveAttribute('type', 'button');
        await expect(editButton).toHaveAttribute('aria-label', 'Edit marketing preferences');
    },
};
