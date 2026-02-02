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
import { type RouteConfig, type RouteConfigEntry } from '@react-router/dev/routes';
import { flatRoutes } from '@react-router/fs-routes';
import fs from 'fs';

const pluginRoutes: RouteConfigEntry[] = [];

fs.readdirSync('./src/extensions').forEach((extension: string) => {
    if (fs.existsSync(`./src/extensions/${extension}/routes`)) {
        fs.readdirSync(`./src/extensions/${extension}/routes`).forEach((route: string) => {
            if (
                (route.endsWith('.tsx') || route.endsWith('.ts')) &&
                !route.endsWith('.test.tsx') &&
                !route.endsWith('.test.ts')
            ) {
                const routeName = route.replace('.tsx', '').replace('.ts', '');
                pluginRoutes.push({
                    id: `${extension}-${routeName}`,
                    path: `/${routeName
                        .replace(`./extensions/${extension}/routes/`, '')
                        .replace('.', '/')
                        .replace('$', ':')}`,
                    file: `./extensions/${extension}/routes/${route}`,
                });
            }
        });
    }
});
export default (async () => {
    const fileRoutes = await flatRoutes({ ignoredRouteFiles: ['**/*.test.{ts,tsx}'] });
    return [...pluginRoutes, ...fileRoutes];
})() satisfies RouteConfig;
