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

import { type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import type { ShopperProducts } from '@salesforce/storefront-next-runtime/scapi';
import PickupOrDelivery from './pickup-or-delivery';
import { useDeliveryOptions } from '@/extensions/bopis/hooks/use-delivery-options';
import { useStoreLocator } from '@/extensions/store-locator/providers/store-locator';
import type { SelectedStoreInfo } from '@/extensions/store-locator/stores/store-locator-store';
import { Typography } from '@/components/typography';

interface DeliveryOptionsProps {
    /** The product to check inventory for */
    product: ShopperProducts.schemas['Product'];
    /** The selected quantity to check inventory against */
    quantity: number;
    /** The pickup store for basket items. When provided, indicates item is in basket with this pickup store. When falsy, item is not in basket. */
    basketPickupStore?: SelectedStoreInfo;
    /** Additional CSS classes */
    className?: string;
}

/**
 * DeliveryOptions component that provides the complete delivery options experience.
 * This includes the pickup/delivery selection based on the store locator selection and any relevant messaging.
 *
 * @param props - The component props
 * @returns A React element representing the delivery options section
 *
 * @example
 * ```tsx
 * <DeliveryOptions
 *   product={productData}
 *   quantity={2}
 * />
 * ```
 */
export default function DeliveryOptions({
    product,
    quantity,
    basketPickupStore,
    className,
}: DeliveryOptionsProps): ReactElement | null {
    const { t } = useTranslation('extBopis');

    // Get store locator state and actions
    const selectedStore = useStoreLocator((state) => state.selectedStoreInfo);

    // Derive isInBasket from basketPickupStore: when truthy, item is in basket
    const isInBasket = !!basketPickupStore;

    // Use basketPickupStore if item is in basket, otherwise use currently selected store from store locator
    const pickupStore = basketPickupStore || selectedStore;

    const { selectedDeliveryOption, isStoreOutOfStock, isSiteOutOfStock, handleDeliveryOptionChange } =
        useDeliveryOptions({ product, quantity, isInBasket, pickupStore });

    return (
        <div className={className}>
            <div className="space-y-4">
                {/* Hide title and radio options when editing from cart */}
                {!isInBasket && (
                    <>
                        <Typography variant="h3" as="p" role="heading" aria-level={3} className="text-lg font-semibold">
                            {t('deliveryOptions.title')}
                        </Typography>

                        <PickupOrDelivery
                            value={selectedDeliveryOption}
                            onChange={handleDeliveryOptionChange}
                            isPickupDisabled={isStoreOutOfStock}
                            pickupStore={pickupStore}
                            isDeliveryDisabled={isSiteOutOfStock}
                        />
                    </>
                )}
            </div>
        </div>
    );
}
