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
import { composeStories } from '@storybook/react-vite';

import * as SwatchStories from './swatch.stories';
import { expect, test, describe, afterEach, vi } from 'vitest';
import { render, cleanup } from '@testing-library/react';

vi.mock('react-router', () => ({
    NavLink: ({
        to,
        children,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        preventScrollReset,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        relative,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        replace,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        state,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        viewTransition,
        ...props
    }: {
        to: string;
        children: React.ReactNode;
        preventScrollReset?: unknown;
        relative?: unknown;
        replace?: unknown;
        state?: unknown;
        viewTransition?: unknown;
        [key: string]: unknown;
    }) => (
        <a href={to} {...props}>
            {children}
        </a>
    ),
}));

const composed = composeStories(SwatchStories);

afterEach(() => {
    cleanup();
});

describe('Swatch stories snapshot', () => {
    for (const [storyName, Story] of Object.entries(composed)) {
        test(`${storyName} story renders and matches snapshot`, () => {
            const { container } = render(<Story />);
            expect(container.firstChild).toMatchSnapshot();
        });
    }
});
