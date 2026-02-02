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

import { useCallback, useMemo } from 'react';
import type { ShopperSearch } from '@salesforce/storefront-next-runtime/scapi';
import { HeartIcon } from '../icons';
import { useWishlist } from '@/hooks/use-wishlist';

interface WishlistButtonProps {
    product: ShopperSearch.schemas['ProductSearchHit'];
    variant?: ShopperSearch.schemas['ProductSearchHit'];
    size?: 'sm' | 'md' | 'lg';
    className?: string;
}

const WishlistButton = ({ product, variant, size = 'md', className }: WishlistButtonProps) => {
    const { isItemInWishlist, toggleWishlist, isLoading } = useWishlist();

    const isInWishlist = useMemo(() => isItemInWishlist(product, variant), [isItemInWishlist, product, variant]);

    const handleWishlistToggle = useCallback(async () => {
        await toggleWishlist(product, variant);
    }, [product, variant, toggleWishlist]);

    return (
        <HeartIcon
            isFilled={isInWishlist}
            disabled={isLoading}
            onClick={() => void handleWishlistToggle()}
            size={size}
            className={className}
        />
    );
};

export { WishlistButton };
