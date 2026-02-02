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
import { DynamicImage } from '../index';
import { action } from 'storybook/actions';
import { useEffect, useRef, type ReactNode, type ReactElement } from 'react';
import { expect, within } from 'storybook/test';
import { waitForStorybookReady } from '@storybook/test-utils';
import { ConfigProvider } from '@/config/context';
import { mockConfig } from '@/test-utils/config';

function DynamicImageStoryHarness({ children }: { children: ReactNode }): ReactElement {
    const containerRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        const root = containerRef.current;
        if (!root) return;

        const logLoad = action('dynamic-image-load');
        const logError = action('dynamic-image-error');

        const handleLoad = (event: Event) => {
            const img = event.target as HTMLImageElement;
            if (img && root.contains(img)) {
                logLoad({ src: img.src, alt: img.alt });
            }
        };

        const handleError = (event: Event) => {
            const img = event.target as HTMLImageElement;
            if (img && root.contains(img)) {
                logError({ src: img.src });
            }
        };

        root.addEventListener('load', handleLoad, true);
        root.addEventListener('error', handleError, true);
        return () => {
            root.removeEventListener('load', handleLoad, true);
            root.removeEventListener('error', handleError, true);
        };
    }, []);

    return <div ref={containerRef}>{children}</div>;
}

const meta: Meta<typeof DynamicImage> = {
    title: 'COMMON/Dynamic Image',
    component: DynamicImage,
    tags: ['autodocs', 'interaction'],
    parameters: {
        layout: 'centered',
        docs: {
            description: {
                component: `
A responsive image component optimized for Dynamic Imaging Service. Creates picture elements with responsive sources and preloading support.

### Features:
- Responsive image widths
- Picture element with multiple sources
- Preloading for high-priority images
- Lazy loading support
- Customizable image props
                `,
            },
        },
    },
    decorators: [
        (Story) => (
            <ConfigProvider config={mockConfig}>
                <DynamicImageStoryHarness>
                    <Story />
                </DynamicImageStoryHarness>
            </ConfigProvider>
        ),
    ],
};

export default meta;
type Story = StoryObj<typeof DynamicImage>;

export const Default: Story = {
    render: () => (
        <DynamicImage
            src="https://via.placeholder.com/800[?sw={width}&q=60]"
            alt="Example image"
            widths={[400, 800, 1200]}
        />
    ),
    parameters: {
        docs: {
            story: `
Standard dynamic image with responsive widths.

### Features:
- Array of widths
- Responsive picture element
- Lazy loading by default
            `,
        },
    },
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);

        await waitForStorybookReady(canvasElement);

        // Check for image
        const image = await canvas.findByRole('img', { name: /example image/i }, { timeout: 5000 });
        await expect(image).toBeInTheDocument();
    },
};

export const WithObjectWidths: Story = {
    render: () => (
        <DynamicImage
            src="https://via.placeholder.com/800[?sw={width}&q=60]"
            alt="Object widths example"
            widths={{ base: 400, sm: 600, md: 800, lg: 1200 }}
        />
    ),
    parameters: {
        docs: {
            story: `
Dynamic image with object-based width configuration.

### Features:
- Breakpoint-based widths
- Responsive sources
            `,
        },
    },
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);

        await waitForStorybookReady(canvasElement);

        // Check for image
        const image = await canvas.findByRole('img', { name: /object widths/i }, { timeout: 5000 });
        await expect(image).toBeInTheDocument();
    },
};

export const HighPriority: Story = {
    render: () => (
        <DynamicImage
            src="https://via.placeholder.com/800[?sw={width}&q=60]"
            alt="High priority image"
            widths={[400, 800, 1200]}
            priority="high"
            loading="eager"
        />
    ),
    parameters: {
        docs: {
            story: `
Dynamic image with high priority and eager loading.

### Features:
- High priority preloading
- Eager loading
- Optimized for above-the-fold content
            `,
        },
    },
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);

        await waitForStorybookReady(canvasElement);

        // Check for image
        const image = await canvas.findByRole('img', { name: /high priority/i }, { timeout: 5000 });
        await expect(image).toBeInTheDocument();
    },
};

export const WithCustomComponent: Story = {
    render: () => (
        <DynamicImage
            src="https://via.placeholder.com/800[?sw={width}&q=60]"
            alt="Custom component example"
            widths={[400, 800]}
            as="div"
            className="bg-muted rounded-lg p-4"
        />
    ),
    parameters: {
        docs: {
            story: `
Dynamic image using a custom element type.

### Features:
- Custom element (div instead of img)
- Custom className
            `,
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);

        // Check for picture element
        const picture = canvasElement.querySelector('picture');
        await expect(picture).toBeInTheDocument();
    },
};
