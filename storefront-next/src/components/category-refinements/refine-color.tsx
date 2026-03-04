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

const mapColorNameToHex = (colorName: string): string | null => {
    const colorMap: Record<string, string> = {
        red: '#dc2626',
        blue: '#2563eb',
        green: '#16a34a',
        yellow: '#ca8a04',
        orange: '#ea580c',
        purple: '#9333ea',
        pink: '#db2777',
        brown: '#a16207',
        black: '#000000',
        white: '#ffffff',
        gray: '#6b7280',
        grey: '#6b7280',
        navy: '#1e3a8a',
        beige: '#f5f5dc',
        tan: '#d2b48c',
        gold: '#ffd700',
        silver: '#c0c0c0',
    };

    const normalized = colorName.toLowerCase().trim();
    return colorMap[normalized] || null;
};

export default function RefineColor({
    values,
    attributeId,
    isFilterSelected,
    toggleFilter,
}: RefinementProps): ReactElement {
    return (
        <div className="grid grid-cols-2 gap-1.5 mt-1">
            {values.map((value) => {
                const color = mapColorNameToHex(value.value) || mapColorNameToHex(value.label || '');
                const isSelected = isFilterSelected(attributeId, value.value);

                return (
                    <Button
                        key={`${attributeId}:${value.value}`}
                        variant="outline"
                        size="sm"
                        onClick={() => toggleFilter(attributeId, value.value)}
                        aria-label={`${value.label || value.value}${isSelected ? ' (selected)' : ''}${value.hitCount !== undefined ? `, ${value.hitCount} items` : ''}`}
                        aria-pressed={isSelected}
                        className={`h-8 justify-start gap-2 ${isSelected ? 'border-foreground bg-foreground/5' : ''}`}>
                        {/* Color Circle */}
                        <div
                            className={`relative size-3.5 rounded-full border flex-shrink-0 ${
                                isSelected ? 'border-foreground/80' : 'border-border'
                            }`}
                            style={{ backgroundColor: color || '#e5e7eb' }}>
                            {isSelected && (
                                <div className="absolute inset-0 flex items-center justify-center">
                                    <div
                                        className={`size-1.5 rounded-full ${
                                            color === '#ffffff' || !color ? 'bg-foreground/20' : 'bg-background'
                                        }`}
                                    />
                                </div>
                            )}
                        </div>

                        {/* Color Name and Hit Count */}
                        <span className="text-xs truncate">{value.label || value.value}</span>
                        {value.hitCount !== undefined && (
                            <span className="ml-auto text-xs text-muted-foreground">
                                {value.hitCount}
                            </span>
                        )}
                    </Button>
                );
            })}
        </div>
    );
}
