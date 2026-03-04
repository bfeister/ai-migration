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
'use client';

import type { ReactElement } from 'react';
import type { ShopperSearch } from '@salesforce/storefront-next-runtime/scapi';
import { Checkbox } from '@/components/ui/checkbox';
import type { RefinementProps } from './types';

export default function DefaultRefinement({
    values,
    attributeId,
    isFilterSelected,
    toggleFilter,
}: RefinementProps): ReactElement {
    return (
        <div className="space-y-0.5 mt-1">
            {values.map((value: ShopperSearch.schemas['ProductSearchRefinementValue'], idx) => {
                const id = `refine-${attributeId}-${idx}`;
                const isSelected = isFilterSelected(attributeId, value.value);

                return (
                    <label
                        key={`${attributeId}:${value.value}`}
                        htmlFor={id}
                        className={`flex items-center py-1.5 px-2 rounded hover:bg-muted/30 cursor-pointer transition-colors ${
                            isSelected ? 'bg-muted/20' : ''
                        }`}>
                        <Checkbox
                            id={id}
                            checked={isSelected}
                            onCheckedChange={() => toggleFilter(attributeId, value.value)}
                            className="size-3.5"
                        />
                        <span className="ml-2.5 text-sm">{value.label || value.value}</span>
                        {value.hitCount !== undefined && (
                            <span className="ml-auto text-xs text-muted-foreground">{value.hitCount}</span>
                        )}
                    </label>
                );
            })}
        </div>
    );
}
