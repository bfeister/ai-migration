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
declare module '@/components/__mocks__/mock-data' {
    export const mockCategory: any;
}

declare module '@/components/__mocks__/product-search-hit-data' {
    export const mockProductSearchItem: any;
    export const mockStandardProductHit: any;
    export const mockMasterProductHitWithOneVariant: any;
    export const mockMasterProductHitWithMultipleVariants: any;
    export const mockProductSetHit: any;
}

declare module '@/components/__mocks__/standard-product' {
    export const mockStandardProductOrderable: any;
}

declare module '@/components/__mocks__/empty-basket' {
    const emptyBasket: any;
    export default emptyBasket;
}

declare module '@/components/__mocks__/basket-with-dress' {
    export const basketWithOneItem: any;
    export const inBasketProductDetails: any;
}

declare module '@/components/__mocks__/variant-750518699578M' {
    const mockVariantProduct: any;
    export default mockVariantProduct;
}

declare module '@/components/__mocks__/basket-with-multiple-items' {
    export const basketWithMultipleItems: any;
    export const inBasketProductDetails: any;
}

declare module '@/components/__mocks__/checkout-data' {
    export const checkoutWithMultipleItems: any;
    export const checkoutWithOneItem: any;
}
