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
import type { ActionFunctionArgs } from 'react-router';
import { getBasket, updateBasket } from '@/middlewares/basket.client';
import { createShippingOptionsSchema, parseShippingOptionsFromFormData } from '@/lib/checkout-schemas';
import { createApiClients } from '@/lib/api-clients';
import { ApiError } from '@salesforce/storefront-next-runtime/scapi';
import { extractResponseError } from '@/lib/utils';
import { getTranslation } from '@/lib/i18next';
// @sfdc-extension-line SFDC_EXT_MULTISHIP
import { handleMultiShipShippingOptions } from '@/extensions/multiship/lib/actions/checkout-submit-multi-options';

// eslint-disable-next-line custom/no-client-actions
export async function clientAction({ request, context }: ActionFunctionArgs) {
    const { t } = getTranslation();

    const formData = await request.formData();

    // Update shipping method in Commerce Cloud (like PWA Kit)
    const basket = getBasket(context);
    if (!basket || !basket.basketId) {
        return Response.json(
            {
                success: false,
                error: t('errors:checkout.noActiveBasket'),
                step: 'shippingOptions',
            },
            { status: 400 }
        );
    }

    // @sfdc-extension-block-start SFDC_EXT_MULTISHIP
    // Check if this is a multi-shipment submission and handle it
    const multiShipResponse = await handleMultiShipShippingOptions(formData, basket, context);
    if (multiShipResponse) {
        return multiShipResponse;
    }
    // @sfdc-extension-block-end SFDC_EXT_MULTISHIP

    // Single-shipment mode: use traditional validation and update
    // Parse and validate using shared schema
    // This ensures server-side validation matches client-side validation exactly
    const shippingData = parseShippingOptionsFromFormData(formData);
    const shippingOptionsSchema = createShippingOptionsSchema(t);
    const result = shippingOptionsSchema.safeParse(shippingData);

    if (!result.success) {
        return Response.json(
            {
                success: false,
                fieldErrors: result.error.flatten().fieldErrors,
                step: 'shippingOptions',
            },
            { status: 400 }
        );
    }

    // Use validated data
    const { shippingMethodId } = result.data;

    try {
        const clients = createApiClients(context);
        const { data: updatedBasket } = await clients.shopperBasketsV2.updateShippingMethodForShipment({
            params: {
                path: {
                    basketId: basket.basketId,
                    shipmentId: 'me',
                },
            },
            body: {
                id: shippingMethodId,
            },
        });

        // Update local basket state with API response
        // Check if critical data is preserved in the Commerce API response
        const currentBasket = getBasket(context);

        if (!updatedBasket.customerInfo?.email && currentBasket.customerInfo?.email) {
            // Customer info missing from shipping method API response, merging with current basket
            // Selectively update to preserve existing data
            updateBasket(context, {
                ...currentBasket,
                // Update shipping-related fields from API response
                shipments: updatedBasket.shipments || currentBasket.shipments,
                // Update calculated totals from API response
                orderTotal: updatedBasket.orderTotal || currentBasket.orderTotal,
                productTotal: updatedBasket.productTotal || currentBasket.productTotal,
                shippingTotal: updatedBasket.shippingTotal || currentBasket.shippingTotal,
                merchandizeTotalTax: updatedBasket.merchandizeTotalTax || currentBasket.merchandizeTotalTax,
                taxTotal: updatedBasket.taxTotal || currentBasket.taxTotal,
            });
        } else {
            // API response includes all necessary data, use it directly
            updateBasket(context, updatedBasket);
        }
    } catch (error) {
        let errorMessage = t('errors:api.serverError');
        if (error instanceof ApiError) {
            try {
                const { responseMessage } = await extractResponseError(error);
                if (responseMessage) {
                    errorMessage = responseMessage;
                }
            } catch {
                // Use default error message
            }
        }
        return Response.json(
            {
                success: false,
                error: errorMessage,
                step: 'shippingOptions',
            },
            { status: 500 }
        );
    }

    // Store shipping method - step progression computed from basket state
    if (typeof sessionStorage !== 'undefined') {
        sessionStorage.setItem('checkoutShippingMethod', JSON.stringify({ shippingMethodId }));
    }

    // Return success data as JSON
    return Response.json({
        success: true,
        step: 'shippingOptions',
        data: { shippingMethodId },
    });
}
