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

import type { ShopperBasketsV2 } from '@salesforce/storefront-next-runtime/scapi';
import type { CustomerProfile } from '@/components/checkout/utils/checkout-context-types';
import { getAddressKey, customerAddressToOrderAddress } from './address-utils';

/**
 * Consolidates addresses from basket shipments and customer profile into a single array.
 * Addresses from shipments come first (in shipment order), followed by customer addresses
 * not used in shipments.
 * Duplicates are removed based on isAddressEqual comparison.
 * All returned addresses include an 'id' field for identification.
 *
 * @param basket - The shopping basket with shipments
 * @param customerProfile - The customer profile with saved addresses
 * @param deliveryShipments - Optional array of delivery shipments to filter by
 * @param savedAddresses - Optional array of saved addresses to filter by from checkout context
 * @returns Array of order addresses with id field, ordered by priority (shipments, then customer)
 */
export function consolidateAddresses({
    basket,
    customerProfile,
    deliveryShipments,
    savedAddresses,
}: {
    basket?: ShopperBasketsV2.schemas['Basket'];
    customerProfile?: CustomerProfile;
    deliveryShipments?: ShopperBasketsV2.schemas['Shipment'][];
    savedAddresses?: ShopperBasketsV2.schemas['OrderAddress'][];
}): (ShopperBasketsV2.schemas['OrderAddress'] & { id: string })[] {
    const result: (ShopperBasketsV2.schemas['OrderAddress'] & { id: string })[] = [];
    const addedAddressKeys = new Set<string>();

    // Precompute Maps for O(1) lookups
    const customerAddressMap = new Map<string, ShopperBasketsV2.schemas['OrderAddress'] & { id: string }>();
    if (customerProfile?.addresses) {
        for (const customerAddr of customerProfile.addresses) {
            const key = getAddressKey(customerAddr as ShopperBasketsV2.schemas['OrderAddress']);
            const orderAddress = customerAddressToOrderAddress(customerAddr);
            customerAddressMap.set(key, {
                ...orderAddress,
                id: customerAddr.addressId || `customer_${key}`,
            });
        }
    }

    const shipmentAddressMap = new Map<string, ShopperBasketsV2.schemas['OrderAddress'] & { id: string }>();
    const shipmentsToProcess = deliveryShipments ?? basket?.shipments;

    if (shipmentsToProcess) {
        for (const shipment of shipmentsToProcess) {
            if (shipment.shippingAddress) {
                const key = getAddressKey(shipment.shippingAddress);
                // Only add if not already in map (preserves first occurrence for duplicates)
                if (!shipmentAddressMap.has(key)) {
                    shipmentAddressMap.set(key, {
                        ...shipment.shippingAddress,
                        id: `shipment_${shipment.shipmentId}`,
                    });
                }
            }
        }
    }

    // Step 1: Add addresses from shipments (in shipment order)
    if (shipmentsToProcess) {
        for (const shipment of shipmentsToProcess) {
            if (!shipment.shippingAddress) continue;

            const addressKey = getAddressKey(shipment.shippingAddress);

            // Skip if we've already added this address
            if (addedAddressKeys.has(addressKey)) continue;

            // Check if this address exists in customer profile (O(1) lookup)
            const matchingCustomerAddress = customerAddressMap.get(addressKey);

            if (matchingCustomerAddress) {
                // Use the customer's saved address with id
                result.push(matchingCustomerAddress);
            } else {
                // Use the shipment address with id
                const shipmentAddress = shipmentAddressMap.get(addressKey);
                if (shipmentAddress) {
                    result.push(shipmentAddress);
                }
            }

            addedAddressKeys.add(addressKey);
        }
    }

    // Step 2: Add remaining customer addresses that weren't used in shipments
    if (customerProfile?.addresses) {
        for (const customerAddress of customerProfile.addresses) {
            const addressKey = getAddressKey(customerAddress as ShopperBasketsV2.schemas['OrderAddress']);

            // Skip if we've already added this address
            if (addedAddressKeys.has(addressKey)) continue;

            const orderAddress = customerAddressToOrderAddress(customerAddress);
            result.push({ ...orderAddress, id: customerAddress.addressId || `customer_${addressKey}` });
            addedAddressKeys.add(addressKey);
        }
    }

    // Step 3: Add addresses from checkout context
    if (savedAddresses) {
        for (const address of savedAddresses) {
            const addressKey = getAddressKey(address);

            // Skip if we've already added this address
            if (addedAddressKeys.has(addressKey)) continue;
            result.push(address as ShopperBasketsV2.schemas['OrderAddress'] & { id: string });
        }
    }

    return result;
}

/**
 * Initializes item addresses by mapping each product item to its shipment address
 * from the consolidated addresses list.
 *
 * @param consolidatedAddresses - Pre-consolidated addresses (output of consolidateAddresses)
 * @param productItems - Optional subset of product items to iterate over
 * @param shipments - Array of shipments to get shipping addresses from
 * @param productItemAddresses - Optional map of product item addresses to add to the map from checkout context
 * @returns Map of itemId to the item's shipment address with id
 */
export function initializeItemAddresses(
    consolidatedAddresses: (ShopperBasketsV2.schemas['OrderAddress'] & { id: string })[],
    productItems?: ShopperBasketsV2.schemas['ProductItem'][],
    shipments?: ShopperBasketsV2.schemas['Shipment'][],
    productItemAddresses?: Map<string, ShopperBasketsV2.schemas['OrderAddress'] & { id: string }>
): Map<string, ShopperBasketsV2.schemas['OrderAddress'] & { id: string }> {
    const map = new Map<string, ShopperBasketsV2.schemas['OrderAddress'] & { id: string }>();

    if (!productItems || !shipments) return map;

    // Build shipmentId -> shipment Map for O(1) lookups
    const shipmentLookup = new Map<string, ShopperBasketsV2.schemas['Shipment']>();
    for (const shipment of shipments) {
        if (shipment.shipmentId) {
            shipmentLookup.set(shipment.shipmentId, shipment);
        }
    }

    // Build addressKey -> consolidated address Map for O(1) lookups
    const addressLookup = new Map<string, ShopperBasketsV2.schemas['OrderAddress'] & { id: string }>();
    for (const addr of consolidatedAddresses) {
        const key = getAddressKey(addr);
        addressLookup.set(key, addr);
    }

    // Map each product item to its shipment address
    for (const item of productItems) {
        if (!item.itemId || !item.shipmentId) continue;

        const shipment = shipmentLookup.get(item.shipmentId);
        if (!shipment?.shippingAddress) continue;

        // Find matching address using O(1) lookup
        const addressKey = getAddressKey(shipment.shippingAddress);
        const matchingAddress = addressLookup.get(addressKey);

        if (matchingAddress) {
            map.set(item.itemId, matchingAddress);
        }
    }

    // Map product item to addresses from checkout context
    if (productItemAddresses) {
        for (const [itemId, itemAddress] of productItemAddresses) {
            map.set(itemId, itemAddress);
        }
    }

    return map;
}

/**
 * Updates consolidated addresses by merging item addresses with initial consolidated addresses.
 * Addresses from itemAddresses come first (prioritized, added as-is), followed by addresses
 * from consolidatedAddresses that aren't duplicates.
 * Duplicates are removed based on address key comparison.
 * All returned addresses include an 'id' field for identification.
 *
 * @param itemAddresses - Optional Map of item addresses to prioritize first (keys are ignored, values are added as-is, must have id)
 * @param consolidatedAddresses - Pre-consolidated addresses (typically output of consolidateAddresses)
 * @returns Array of order addresses with id field, ordered by priority (item addresses first, then initial consolidated addresses)
 */
export function updateItemAddresses({
    itemAddresses,
    consolidatedAddresses,
}: {
    itemAddresses?: Map<string, ShopperBasketsV2.schemas['OrderAddress'] & { id: string }>;
    consolidatedAddresses: (ShopperBasketsV2.schemas['OrderAddress'] & { id: string })[];
}): (ShopperBasketsV2.schemas['OrderAddress'] & { id: string })[] {
    const result: (ShopperBasketsV2.schemas['OrderAddress'] & { id: string })[] = [];
    const addedAddressKeys = new Set<string>();

    // Step 1: Add addresses from itemAddresses (prioritized first, added as-is with id)
    if (itemAddresses) {
        for (const itemAddress of itemAddresses.values()) {
            const addressKey = getAddressKey(itemAddress);

            // Skip if we've already added this address
            if (addedAddressKeys.has(addressKey)) continue;

            // Add item address as-is (assume it has id)
            result.push(itemAddress);
            addedAddressKeys.add(addressKey);
        }
    }

    // Step 2: Add addresses from consolidatedAddresses that weren't already added
    for (const address of consolidatedAddresses) {
        const addressKey = getAddressKey(address);

        // Skip if we've already added this address
        if (addedAddressKeys.has(addressKey)) continue;

        result.push(address);
        addedAddressKeys.add(addressKey);
    }

    return result;
}
