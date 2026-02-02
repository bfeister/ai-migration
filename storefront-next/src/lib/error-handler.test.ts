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
import { describe, it, expect, vi, afterEach } from 'vitest';
import { extractApiErrorDetails, createErrorResponse } from './error-handler';
import { extractResponseError } from '@/lib/utils';

vi.mock('@/lib/utils', async () => {
    const actual = await vi.importActual('@/lib/utils');
    return {
        ...actual,
        extractResponseError: vi.fn(),
    };
});

describe('error-handler', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('extractApiErrorDetails uses extractResponseError result', async () => {
        vi.mocked(extractResponseError).mockResolvedValue({ responseMessage: 'Bad Request' } as any);
        await expect(extractApiErrorDetails(new Error('x'))).resolves.toEqual(
            expect.objectContaining({ responseMessage: 'Bad Request' })
        );
    });

    it('extractApiErrorDetails falls back on extractor failure', async () => {
        vi.mocked(extractResponseError).mockRejectedValue(new Error('error'));
        await expect(extractApiErrorDetails(new Error('Error Message'))).resolves.toEqual(
            expect.objectContaining({ responseMessage: 'Error Message' })
        );
    });

    it('createErrorResponse uses extractor message', async () => {
        vi.mocked(extractResponseError).mockResolvedValue({ responseMessage: 'Error' } as any);
        const res = await createErrorResponse(new Error('x'), 'step', 418);
        const body = await res.json();
        expect(res.status).toBe(418);
        expect(body).toMatchObject({ success: false, error: 'Error', step: 'step' });
    });

    it('createErrorResponse falls back on extractor failure', async () => {
        vi.mocked(extractResponseError).mockRejectedValue(new Error('error'));
        const res = await createErrorResponse(new Error('Error Message'));
        const body = await res.json();
        expect(body).toMatchObject({ success: false, error: 'Error Message' });
    });
});
