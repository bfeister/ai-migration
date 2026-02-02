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

import { describe, it, expect } from 'vitest';
import { handleMultiShipShippingAddress } from './checkout-submit-multi-address';
import type { ShopperBasketsV2 } from '@salesforce/storefront-next-runtime/scapi';
import type { ActionFunctionArgs } from 'react-router';

describe('checkout-submit-multi-address', () => {
    const mockBasket = {
        basketId: 'test-basket-123',
    } as ShopperBasketsV2.schemas['Basket'];

    const mockContext = {} as ActionFunctionArgs['context'];

    describe('handleMultiShipShippingAddress', () => {
        it('returns null when formData does not indicate multi-ship', async () => {
            const formData = new FormData();
            formData.append('address1', '123 Main St');
            formData.append('city', 'San Francisco');

            const result = await handleMultiShipShippingAddress(formData, mockBasket, mockContext);

            expect(result).toBeNull();
        });
    });
});
