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
import { expect, within, userEvent } from 'storybook/test';
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
    tags: ['autodocs', 'interaction'],
};

export default meta;
type Story = StoryObj<typeof MarketingConsent>;

export const Default: Story = {
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        // Check title is rendered
        await expect(canvas.getByText('Marketing & Communication Preferences')).toBeInTheDocument();

        // Check Edit button is rendered
        const editButton = canvas.getByRole('button', { name: /edit/i });
        await expect(editButton).toBeInTheDocument();
        await expect(editButton).toHaveAttribute('type', 'button');
    },
};

export const ClickEditButton: Story = {
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        const editButton = canvas.getByRole('button', { name: /edit/i });
        await userEvent.click(editButton);

        // Button should still be visible after click (no action implemented yet)
        await expect(editButton).toBeInTheDocument();
    },
};
