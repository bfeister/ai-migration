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
import { Button } from '@/components/ui/button';
import type { RefinementProps } from './types';

export default function RefineSize({
    values,
    attributeId,
    isFilterSelected,
    toggleFilter,
}: RefinementProps): ReactElement {
    return (
        <div className="flex flex-wrap gap-1.5 mt-1">
            {values.map((value) => {
                const isSelected = isFilterSelected(attributeId, value.value);

                return (
                    <Button
                        key={`${attributeId}:${value.value}`}
                        variant="outline"
                        size="sm"
                        onClick={() => toggleFilter(attributeId, value.value)}
                        aria-pressed={isSelected}
                        className={`h-8 text-xs ${isSelected ? 'border-foreground bg-foreground/5' : ''}`}>
                        {value.label || value.value}
                        {value.hitCount !== undefined && (
                            <span className="ml-1 text-muted-foreground">{value.hitCount}</span>
                        )}
                    </Button>
                );
            })}
        </div>
    );
}
