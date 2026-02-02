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
import { type ActionFunctionArgs, type ClientActionFunctionArgs, redirect } from 'react-router';
import { destroyAuth as destroyAuthServer, getAuth } from '@/middlewares/auth.server';
import { destroyAuth as destroyAuthClient } from '@/middlewares/auth.client';
import { destroyBasket } from '@/middlewares/basket.client';
import { createApiClients } from '@/lib/api-clients';

/**
 * This server action is required for authentication, because logout must be handled server-side to properly invalidate
 * server-side sessions and integrate with Salesforce Commerce Cloud's authentication system. It operates together with
 * the client action to ensure a smooth logout process.
 */
export async function action({ context }: ActionFunctionArgs) {
    const session = getAuth(context);
    const { access_token, refresh_token } = session;
    if (access_token && refresh_token) {
        try {
            const clients = createApiClients(context);
            await clients.auth.logout({
                accessToken: access_token,
                refreshToken: refresh_token,
            });
        } catch {
            // SLAS logout failed, but continue with redirect
        }
    }
    destroyAuthServer(context);
}

/**
 * This client action operates together with the server action to ensure a smooth logout process. It ensures that the
 * session gets destroyed on both server and client side, clears the basket to prevent customer mismatch errors,
 * and redirects the user to the home page afterward.
 */
// eslint-disable-next-line custom/no-client-actions
export async function clientAction({ context, serverAction }: ClientActionFunctionArgs) {
    await serverAction();
    destroyAuthClient(context);
    destroyBasket(context);

    return redirect('/');
}

clientAction.hydrate = true as const;
