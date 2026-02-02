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

import { type ComponentRef, forwardRef } from 'react';
import { Heart } from 'lucide-react';
import { cn } from '@/lib/utils';

interface HeartIconProps {
    isFilled?: boolean;
    disabled?: boolean;
    size?: 'sm' | 'md' | 'lg';
    className?: string;
    onClick?: () => void;
}

const HeartIcon = forwardRef<ComponentRef<'button'>, HeartIconProps>(
    ({ isFilled = false, disabled = false, size = 'md', className, onClick }, ref) => {
        const sizeClasses = {
            sm: 'w-4 h-4',
            md: 'w-5 h-5',
            lg: 'w-6 h-6',
        };

        return (
            <button
                ref={ref}
                className={cn(
                    'absolute top-2 right-2 z-10 bg-background rounded-full p-1.5 shadow-md',
                    'transition-all duration-200 ease-in-out border-0',
                    'hover:scale-110 hover:shadow-lg',
                    'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
                    'disabled:opacity-60 disabled:cursor-not-allowed',
                    isFilled && 'scale-105',
                    className
                )}
                disabled={disabled}
                onClick={onClick}
                aria-label={isFilled ? 'Remove from wishlist' : 'Add to wishlist'}>
                <Heart
                    className={cn(
                        sizeClasses[size],
                        'transition-all duration-200 ease-in-out',
                        isFilled ? 'text-red-500 fill-red-500 scale-110' : 'text-muted-foreground fill-none scale-100'
                    )}
                />
            </button>
        );
    }
);

HeartIcon.displayName = 'HeartIcon';

export { HeartIcon };
