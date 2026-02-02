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
import type { ReactElement } from 'react';
import type { ShopperSearch } from '@salesforce/storefront-next-runtime/scapi';
import { ProductTile } from '@/components/product-tile';

interface ProductGridProps {
    products: ShopperSearch.schemas['ProductSearchHit'][];
    handleProductClick?: (product: ShopperSearch.schemas['ProductSearchHit']) => void;
}
export default function ProductGrid({ products, handleProductClick }: ProductGridProps): ReactElement {
    return (
        <>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-x-4 gap-y-8">
                {products.map((product) => (
                    <ProductTile key={product.productId} product={product} handleProductClick={handleProductClick} />
                ))}
            </div>

            {/* Show a message when no products are found */}
            {products.length === 0 && (
                <div className="text-center py-12">
                    <p className="text-lg text-muted-foreground">No products found.</p>
                </div>
            )}
        </>
    );
}
