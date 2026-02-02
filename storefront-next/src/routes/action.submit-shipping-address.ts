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
import { createApiClients } from '@/lib/api-clients';
import { ApiError } from '@salesforce/storefront-next-runtime/scapi';
import { extractResponseError } from '@/lib/utils';
import { createShippingAddressSchema, parseShippingAddressFromFormData } from '@/lib/checkout-schemas';
import { getTranslation } from '@/lib/i18next';
// @sfdc-extension-block-start SFDC_EXT_MULTISHIP
import { handleMultiShipShippingAddress } from '@/extensions/multiship/lib/actions/checkout-submit-multi-address';
import { assignProductsToDefaultShipment } from '@/extensions/multiship/lib/api/basket';
// @sfdc-extension-block-end SFDC_EXT_MULTISHIP

// eslint-disable-next-line custom/no-client-actions
export async function clientAction({ request, context }: ActionFunctionArgs) {
    const { t } = getTranslation();

    const formData = await request.formData();

    // Update shipping address in Commerce Cloud (like PWA Kit)
    const basket = getBasket(context);
    if (!basket || !basket.basketId) {
        return Response.json(
            {
                success: false,
                error: t('errors:checkout.noActiveBasket'),
                step: 'shippingAddress',
            },
            { status: 400 }
        );
    }

    // @sfdc-extension-block-start SFDC_EXT_MULTISHIP
    // Check if this is a multi-shipment submission and handle it
    const multiShipResponse = await handleMultiShipShippingAddress(formData, basket, context);
    if (multiShipResponse) {
        return multiShipResponse;
    }
    // @sfdc-extension-block-end SFDC_EXT_MULTISHIP

    // Parse and validate using shared schema
    // This ensures server-side validation matches client-side validation exactly
    const addressData = parseShippingAddressFromFormData(formData);
    const shippingAddressSchema = createShippingAddressSchema(t);
    const result = shippingAddressSchema.safeParse(addressData);

    if (!result.success) {
        return Response.json(
            {
                success: false,
                fieldErrors: result.error.flatten().fieldErrors,
                step: 'shippingAddress',
            },
            { status: 400 }
        );
    }

    // Use validated data and add additional fields not in validation schema
    const validatedAddress = result.data;
    const addressDataWithExtras = {
        ...validatedAddress,
        countryCode: formData.get('countryCode')?.toString() || 'US',
    };

    try {
        const clients = createApiClients(context);
        let { data: updatedBasket } = await clients.shopperBasketsV2.updateShippingAddressForShipment({
            params: {
                path: {
                    basketId: basket.basketId,
                    shipmentId: 'me',
                },
                query: {
                    useAsBilling: false,
                },
            },
            body: {
                address1: addressDataWithExtras.address1,
                address2: addressDataWithExtras.address2,
                city: addressDataWithExtras.city,
                countryCode: addressDataWithExtras.countryCode,
                firstName: addressDataWithExtras.firstName,
                lastName: addressDataWithExtras.lastName,
                phone: addressDataWithExtras.phone,
                postalCode: addressDataWithExtras.postalCode,
                stateCode: addressDataWithExtras.stateCode,
            },
        });

        // sfdc-extension-line SFDC_EXT_MULTISHIP
        updatedBasket = await assignProductsToDefaultShipment(updatedBasket, context);

        // Update local basket state with API response
        // For shipping address updates, the API should preserve existing basket data
        updateBasket(context, updatedBasket);
    } catch (error) {
        let errorMessage = t('errors:checkout.addressValidationFailed');
        if (error instanceof ApiError) {
            try {
                const { responseMessage } = await extractResponseError(error);
                if (responseMessage) {
                    errorMessage = responseMessage;
                }
            } catch {
                // Use default error message if extraction fails
            }
        }
        return Response.json(
            {
                success: false,
                error: errorMessage,
                step: 'shippingAddress',
            },
            { status: 500 }
        );
    }

    // Store address - step progression computed from basket state
    if (typeof sessionStorage !== 'undefined') {
        sessionStorage.setItem('checkoutAddress', JSON.stringify(addressDataWithExtras));
    }

    // Return success data as JSON
    return Response.json({
        success: true,
        step: 'shippingAddress',
        data: { address: addressDataWithExtras },
    });
}
