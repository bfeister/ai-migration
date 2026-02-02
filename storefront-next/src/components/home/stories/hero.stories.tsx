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
import { expect } from 'storybook/test';
import { waitForStorybookReady } from '@storybook/test-utils';
import { useEffect, useRef, type ReactElement, type ReactNode } from 'react';
import { action } from 'storybook/actions';
import HeroSkeleton from '../hero';

function ActionLogger({ children }: { children: ReactNode }): ReactElement {
    const containerRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        const root = containerRef.current;
        if (!root) return;

        const logClick = action('interaction');

        const handleClick = (event: MouseEvent) => {
            const target = event.target as HTMLElement | null;
            if (!target || !root.contains(target)) return;

            const button = target.closest('button, [role="button"]');
            if (button) {
                const label = button.textContent?.trim() || button.getAttribute('aria-label') || '';
                logClick({ type: 'click', element: 'button', label });
            }
        };

        root.addEventListener('click', handleClick, true);

        return () => {
            root.removeEventListener('click', handleClick, true);
        };
    }, []);

    return <div ref={containerRef}>{children}</div>;
}

const meta: Meta<typeof HeroSkeleton> = {
    title: 'HOME/HeroSkeleton',
    component: HeroSkeleton,
    tags: ['autodocs', 'interaction'],
    parameters: {
        layout: 'fullscreen',
        docs: {
            description: {
                component: `
HeroSkeleton component displays loading placeholders for hero carousel sections.

## Features

- **Loading State**: Skeleton UI that matches hero carousel dimensions
- **Visual Feedback**: Provides visual feedback during loading
- **Responsive**: Adapts to different screen sizes
- **Structure Match**: Matches the structure of the HeroCarousel component

## Usage

This component is used as a loading placeholder for hero sections, providing visual feedback while hero content is being fetched.
                `,
            },
        },
    },
    decorators: [
        (Story: React.ComponentType) => (
            <ActionLogger>
                <Story />
            </ActionLogger>
        ),
    ],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
    parameters: {
        docs: {
            description: {
                story: `
Default hero skeleton showing:
- Full-width background skeleton
- Dark overlay gradient
- Content skeleton with title, subtitle, and CTA button
- Navigation dots skeleton
- Navigation buttons skeleton

This is the standard loading state for hero sections.
                `,
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);

        // Verify skeleton structure is present
        const skeleton = canvasElement.querySelector('.animate-pulse');
        await expect(skeleton).toBeInTheDocument();

        // Verify background skeleton is present
        const background = canvasElement.querySelector('.bg-muted');
        await expect(background).toBeInTheDocument();

        // Verify navigation dots are present
        const dotsContainer = canvasElement.querySelector('.absolute.bottom-6');
        await expect(dotsContainer).toBeInTheDocument();
    },
};

export const MobileLayout: Story = {
    parameters: {
        docs: {
            description: {
                story: `
Hero skeleton optimized for mobile devices. Shows:
- Mobile-optimized layout
- Touch-friendly spacing
- Responsive skeleton elements

The component automatically adapts for mobile screens.
                `,
            },
        },
    },
    globals: {
        viewport: 'mobile2',
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);

        // Verify skeleton structure is present
        const skeleton = canvasElement.querySelector('.animate-pulse');
        await expect(skeleton).toBeInTheDocument();
    },
};

export const DesktopLayout: Story = {
    parameters: {
        docs: {
            description: {
                story: `
Hero skeleton for desktop devices. Shows:
- Desktop-optimized layout
- Proper spacing and sizing
- All skeleton elements clearly visible

The component provides a clean layout for desktop screens.
                `,
            },
        },
    },
    globals: {
        viewport: 'desktop',
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);

        // Verify skeleton structure is present
        const skeleton = canvasElement.querySelector('.animate-pulse');
        await expect(skeleton).toBeInTheDocument();
    },
};
