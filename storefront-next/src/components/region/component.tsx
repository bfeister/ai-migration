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
import { type ReactElement, memo, Suspense } from 'react';
import { registry } from '@/lib/registry';
import { Await } from 'react-router';
import type { ShopperExperience } from '@salesforce/storefront-next-runtime/scapi';
import type { ComponentDesignMetadata } from '@salesforce/storefront-next-runtime/design/react';

export interface ComponentProps {
    page: ShopperExperience.schemas['Page'];
    component: ShopperExperience.schemas['Component'];
    className?: string;
    componentData?: Record<string, Promise<unknown>>;
    regionId: string;
}

export const Component = memo(function Component({
    component,
    componentData,
    className,
    regionId,
    page,
}: ComponentProps): ReactElement {
    const FallbackComponent = registry.getFallback(component.typeId);
    const DynamicComponent = registry.getComponent(component.typeId);
    if (!DynamicComponent) {
        // eslint-disable-next-line @typescript-eslint/only-throw-error
        throw registry.preload(component.typeId);
    }

    // Create a single promise that chains through both levels
    const dataPromise = componentData?.[component.id];

    const designMetadata: ComponentDesignMetadata = {
        name: component.designMetadata?.name,
        isFragment: false,
        isVisible: Boolean(component.visible),
        isLocalized: Boolean(component.localized),
        id: component.id,
    };

    return (
        <Suspense fallback={FallbackComponent ? <FallbackComponent {...(component.data ?? {})} /> : <div />}>
            <Await resolve={dataPromise}>
                {(data) => (
                    <DynamicComponent
                        {...(component.data ?? {})}
                        designMetadata={designMetadata}
                        page={page}
                        componentData={componentData}
                        data={data}
                        className={className}
                        regionId={regionId}
                    />
                )}
            </Await>
        </Suspense>
    );
});
