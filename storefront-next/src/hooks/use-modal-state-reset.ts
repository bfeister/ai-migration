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

import { useEffect } from 'react';

export type ModalResetTiming = 'open' | 'close' | 'both';

export interface UseModalStateResetOptions {
    /**
     * Whether the modal is currently open
     */
    open: boolean;
    /**
     * Callback to reset state
     */
    onReset: () => void;
    /**
     * When to trigger the reset:
     * - 'open': Reset when modal opens
     * - 'close': Reset when modal closes
     * - 'both': Reset on both open and close
     *
     * @default 'open'
     */
    resetOn?: ModalResetTiming;
}

/**
 * Generic hook for resetting modal state based on open/close events
 *
 * This hook provides a declarative way to reset component state when a modal
 * opens or closes. It's commonly used to:
 * - Clear form inputs when modal opens (fresh start)
 * - Reset refs/flags when modal closes (prepare for next open)
 * - Ensure consistent state across modal sessions
 *
 * Used by:
 * - CartItemEditModal: Resets product/variation state on open
 * - BonusProductModal: Resets processing flags on close
 *
 * @param options - Configuration options for state reset behavior
 *
 */
export function useModalStateReset({ open, onReset, resetOn = 'open' }: UseModalStateResetOptions) {
    useEffect(() => {
        const shouldResetOnOpen = (resetOn === 'open' || resetOn === 'both') && open;
        const shouldResetOnClose = (resetOn === 'close' || resetOn === 'both') && !open;

        if (shouldResetOnOpen || shouldResetOnClose) {
            onReset();
        }
        // onReset is typically a stable callback or inline function
        // We intentionally include it to allow consumers to control when reset happens
    }, [open, onReset, resetOn]);
}
