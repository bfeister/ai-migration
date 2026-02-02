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
import { localeCookie } from '@/middlewares/i18next.server';

/**
 * Server action to set the locale cookie
 * This ensures the cookie is properly serialized using the same cookie object
 * that the server middleware uses to parse it
 *
 * Note: This MUST be a server action (not clientAction) because we need to set
 * the Set-Cookie HTTP header, which can only be done server-side.
 */
export const action: ActionFunction = async ({ request }) => {
    const formData = await request.formData();
    const locale = formData.get('locale') as string;

    if (!locale) {
        throw new Response('Locale is required', { status: 400 });
    }

    // Set the cookie using the same cookie object that the middleware uses
    const cookieHeader = await localeCookie.serialize(locale);

    // Return success without redirecting (useFetcher expects a response)
    return data(
        { success: true },
        {
            headers: {
                'Set-Cookie': cookieHeader,
            },
        }
    );
};
