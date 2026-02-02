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
import { data, type ActionFunction } from 'react-router';
import { getConfig } from '@/config';
import { updateCurrency } from '@/middlewares/currency.server';

/**
 * Server action to set the currency cookie
 *
 * This action is called when the user manually selects a currency from the currency selector.
 * It validates the currency and sets it in a cookie, which will be read by the root loader.
 *
 * Note: This MUST be a server action (not clientAction) because we need to set
 * the Set-Cookie HTTP header, which can only be done server-side.
 */

export const action: ActionFunction = async ({ request, context }) => {
    const formData = await request.formData();
    const currency = formData.get('currency') as string;

    if (!currency) {
        throw new Response('Currency is required', { status: 400 });
    }

    const config = getConfig(context);
    // this will change when multi site implementation starts, for now we use first site in the list
    const currentSite = config.commerce.sites[0];
    // Validate currency
    if (!currentSite.supportedCurrencies.includes(currency)) {
        throw new Response(`Currency "${currency}" is not supported`, { status: 400 });
    }

    // Update currency storage (like updateAuth pattern)
    updateCurrency(context, currency);

    // Return simple success response
    return data({ success: true });
};
