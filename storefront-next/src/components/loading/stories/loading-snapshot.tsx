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
import { vi, expect, test, describe, afterEach } from 'vitest';
import { composeStories } from '@storybook/react-vite';

import * as LoadingStories from './index.stories';
import { render, cleanup } from '@testing-library/react';

const fetcherMock = {
    data: null,
    state: 'idle',

    submit: () => {
        return null;
    },
    Form: (props: React.FormHTMLAttributes<HTMLFormElement> & { children?: React.ReactNode }) => (
        <form {...props}>{props.children}</form>
    ),
};

vi.mock('react-router', () => ({
    createContext: vi.fn().mockImplementation(() => ({})),
    useFetcher: () => fetcherMock,
    useFetchers: () => [],

    useNavigate: () => () => {
        return null;
    },
    useLocation: () => ({ pathname: '/', search: '', hash: '', state: null, key: 'test' }),
    useNavigation: () => ({
        state: 'idle',
        location: { pathname: '/', search: '', hash: '', state: null, key: 'test' },
    }),
    useSearchParams: () => [new URLSearchParams(), vi.fn()],
    Link: (
        props: React.AnchorHTMLAttributes<HTMLAnchorElement> & {
            to?: string;
            href?: string;
            children?: React.ReactNode;
        }
    ) => {
        const { to, href, children, ...rest } = props ?? {};
        return (
            <a href={to ?? href} {...rest}>
                {children}
            </a>
        );
    },
}));
vi.mock('react-router-dom', async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...(actual as object),
        useFetcher: () => fetcherMock,
        useFetchers: () => [],

        useNavigate: () => () => {
            return null;
        },
        useLocation: () => ({ pathname: '/', search: '', hash: '', state: null, key: 'test' }),
        useNavigation: () => ({
            state: 'idle',
            location: { pathname: '/', search: '', hash: '', state: null, key: 'test' },
        }),
        Link: (
            props: React.AnchorHTMLAttributes<HTMLAnchorElement> & {
                to?: string;
                href?: string;
                children?: React.ReactNode;
            }
        ) => {
            const { to, href, children, ...rest } = props ?? {};
            return (
                <a href={to ?? href} {...rest}>
                    {children}
                </a>
            );
        },
    };
});
vi.mock('@/components/toast', () => ({
    useToast: () => ({
        addToast: () => {
            return null;
        },
    }),
}));

const composed = composeStories(LoadingStories);

afterEach(() => {
    cleanup();
});

describe('Loading stories snapshot', () => {
    for (const [storyName, Story] of Object.entries(composed)) {
        test(`${storyName} story renders and matches snapshot`, () => {
            const { container } = render(<Story />);
            expect(container.firstChild).toMatchSnapshot();
        });
    }
});
