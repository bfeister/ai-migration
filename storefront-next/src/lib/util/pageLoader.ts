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
import type { LoaderFunctionArgs } from 'react-router';
import { fetchPage, type PageDesignerPageParams } from '@/lib/api/page';
import type { ShopperExperience } from '@salesforce/storefront-next-runtime/scapi';
import { registry } from '@/lib/registry';
import { isDesignModeActive, isPreviewModeActive } from '@salesforce/storefront-next-runtime/design/mode';

type PageParams = Omit<PageDesignerPageParams, 'mode' | 'pdToken'>;
export function fetchPageFromLoader(
    { context, request }: LoaderFunctionArgs,
    params: PageParams
): Promise<ShopperExperience.schemas['Page']> {
    const isPageDesignerActive = isDesignModeActive(request) || isPreviewModeActive(request);
    const url = new URL(request.url);

    if (!isPageDesignerActive) {
        return fetchPage(context, params);
    }

    const pageDesignerParams: Partial<PageDesignerPageParams> = {
        mode: url.searchParams.get('mode') || undefined,
        pdToken: url.searchParams.get('pdToken') || undefined,
        pageId: url.searchParams.get('pageId') || undefined,
    };

    const cleanParams = Object.fromEntries(
        Object.entries(pageDesignerParams).filter(([, value]) => value !== undefined)
    );

    return fetchPage(context, { ...params, ...cleanParams });
}

/**
 * Recursively collect component data promises from regions
 */
function collectFromRegions(
    ctx: LoaderFunctionArgs,
    regions: ShopperExperience.schemas['Region'][] | undefined,
    map: Record<string, Promise<unknown>>
): void {
    if (!regions) return;

    for (const region of regions) {
        for (const comp of region.components || []) {
            // Check if component has a loader before calling it
            const hasLoaders = registry.hasLoaders(comp.typeId);

            if (hasLoaders) {
                map[comp.id] = registry.callLoader(
                    comp.typeId,
                    {
                        componentData: comp,
                        context: ctx.context,
                    },
                    'loader'
                );
            }

            // Recursively process nested regions (components can have their own regions)
            if (comp.regions && comp.regions.length > 0) {
                collectFromRegions(ctx, comp.regions, map);
            }
        }
    }
}

export function collectComponentDataPromises(
    ctx: LoaderFunctionArgs,
    pagePromise: Promise<ShopperExperience.schemas['Page']>
): Promise<Record<string, Promise<unknown>>> {
    // Return a promise that resolves to a map of component data promises
    // This allows the page to load in parallel with other data fetching
    return pagePromise.then((page) => {
        const map: Record<string, Promise<unknown>> = {};

        // Process top-level regions and recursively process nested regions
        collectFromRegions(ctx, page.regions, map);

        return map;
    });
}
