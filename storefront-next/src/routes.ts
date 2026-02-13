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
import { type RouteConfig } from '@react-router/dev/routes';
import { flatRoutes } from '@react-router/fs-routes';
import fs from 'fs';
import { mergeRoutes } from './routes-merge';

export default (async () => {
    const ignoredRouteFiles = ['**/*.test.{ts,tsx}'];
    const routes = await flatRoutes({ ignoredRouteFiles });

    for (const extension of fs.readdirSync('./src/extensions')) {
        const extensionRoutes = await flatRoutes({
            ignoredRouteFiles,
            rootDirectory: `extensions/${extension}/routes`,
        });
        mergeRoutes(routes, extensionRoutes, `extensions/${extension}/`);
    }

    return routes;
})() satisfies RouteConfig;
