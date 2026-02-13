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

/**
 * Initialize Adapters Tests
 *
 * Tests the ensureAdaptersInitialized function including:
 * - Early exit when adapters are already initialized
 * - Successful initialization
 * - Error handling
 * - Idempotency (multiple calls)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ensureAdaptersInitialized, resetAdaptersInitialization } from './initialize-adapters';
import type { AppConfig } from '@/config';

// Mock dependencies
const mockGetAllAdapters = vi.fn();
const mockInitializeEngagementAdapters = vi.fn();

vi.mock('./adapter-store', () => ({
    getAllAdapters: () => mockGetAllAdapters(),
}));

vi.mock('@/adapters', () => ({
    initializeEngagementAdapters: mockInitializeEngagementAdapters,
}));

const mockAppConfig = {
    engagement: {
        adapters: {
            einstein: {
                enabled: true,
                siteId: 'test-site',
                realm: 'test-realm',
                host: 'https://test.example.com',
            },
        },
    },
} as unknown as AppConfig;

describe('ensureAdaptersInitialized', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // Reset module state - clear the cached initialization promise
        resetAdaptersInitialization();
        // Ensure getAllAdapters returns empty array initially
        mockGetAllAdapters.mockReturnValue([]);
        mockInitializeEngagementAdapters.mockImplementation(() => {});
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('early exit', () => {
        it('should return immediately when adapters are already initialized', async () => {
            // Mock that adapters are already initialized
            const mockAdapter = { name: 'test-adapter', sendEvent: vi.fn() };
            mockGetAllAdapters.mockReturnValue([mockAdapter]);

            await ensureAdaptersInitialized(mockAppConfig);

            // Should not import or call initializeEngagementAdapters
            expect(mockInitializeEngagementAdapters).not.toHaveBeenCalled();
        });
    });

    describe('successful initialization', () => {
        it('should initialize adapters when none are present', async () => {
            mockGetAllAdapters.mockReturnValue([]);
            mockInitializeEngagementAdapters.mockImplementation(() => {});

            await ensureAdaptersInitialized(mockAppConfig);

            expect(mockInitializeEngagementAdapters).toHaveBeenCalledWith(mockAppConfig);
        });

        it('should not call initializeEngagementAdapters when appConfig is undefined', async () => {
            mockGetAllAdapters.mockReturnValue([]);
            mockInitializeEngagementAdapters.mockImplementation(() => {});

            await ensureAdaptersInitialized(undefined as any);

            // The function checks if appConfig exists before calling initializeEngagementAdapters
            expect(mockInitializeEngagementAdapters).not.toHaveBeenCalled();
        });
    });

    describe('concurrent initialization', () => {
        it('should be idempotent - multiple concurrent calls should only initialize once', async () => {
            mockGetAllAdapters.mockReturnValue([]);
            mockInitializeEngagementAdapters.mockImplementation(() => {});

            // Call multiple times concurrently
            await Promise.all([
                ensureAdaptersInitialized(mockAppConfig),
                ensureAdaptersInitialized(mockAppConfig),
                ensureAdaptersInitialized(mockAppConfig),
            ]);

            // Should only initialize once (the promise is shared)
            expect(mockInitializeEngagementAdapters).toHaveBeenCalledTimes(1);
        });
    });

    describe('error handling', () => {
        it('should handle errors gracefully and not throw', async () => {
            mockGetAllAdapters.mockReturnValue([]);

            const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

            // Make initializeEngagementAdapters throw
            const error = new Error('Initialization failed');
            mockInitializeEngagementAdapters.mockImplementation(() => {
                throw error;
            });

            // Should not throw, but should resolve
            await expect(ensureAdaptersInitialized(mockAppConfig)).resolves.toBeUndefined();

            // Should warn in dev mode
            if (import.meta.env.DEV) {
                expect(consoleWarnSpy).toHaveBeenCalledWith('Failed to initialize engagement adapters:', error);
            }

            consoleWarnSpy.mockRestore();
        });
    });

    describe('idempotency', () => {
        it('should exit early when adapters are already initialized', async () => {
            mockGetAllAdapters.mockReturnValue([]);
            mockInitializeEngagementAdapters.mockImplementation(() => {});

            // First initialization
            await ensureAdaptersInitialized(mockAppConfig);
            expect(mockInitializeEngagementAdapters).toHaveBeenCalledTimes(1);

            // Simulate adapters being initialized (early exit path)
            const mockAdapter = { name: 'test-adapter', sendEvent: vi.fn() };
            mockGetAllAdapters.mockReturnValue([mockAdapter]);

            // Should exit early without calling initializeEngagementAdapters again
            await ensureAdaptersInitialized(mockAppConfig);
            expect(mockInitializeEngagementAdapters).toHaveBeenCalledTimes(1);
        });
    });
});
