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
import { CHECKOUT_STEPS, type CheckoutStep, type CustomerProfile } from './checkout-context-types';
import type { ClientLoaderFunctionArgs } from 'react-router';
import { getBasket, updateBasket } from '@/middlewares/basket.client';
import { createApiClients } from '@/lib/api-clients';
import { getShippingMethodsForShipment } from '@/lib/api/shipping-methods';
import { isAddressEmpty } from './checkout-addresses';
import type { ShipmentDistribution } from './checkout-distribution';

function hasValidPaymentCard(
    paymentInstrument: ShopperBasketsV2.schemas['OrderPaymentInstrument'] | undefined
): boolean {
    if (!paymentInstrument || paymentInstrument.paymentMethodId !== 'CREDIT_CARD') {
        return false;
    }

    // For saved payment methods, check if customerPaymentInstrumentId exists
    if (paymentInstrument.customerPaymentInstrumentId) {
        return true;
    }

    // For new payment methods, check if all required card fields are present
    const card = paymentInstrument.paymentCard;
    return !!(card?.cardType && card?.expirationMonth && card?.expirationYear && card?.maskedNumber);
}

export function computeFinalStepForReturningCustomer(
    basket: ShopperBasketsV2.schemas['Basket'] | undefined,
    customerProfile: CustomerProfile,
    shipmentDistribution: ShipmentDistribution
): CheckoutStep | null {
    if (!customerProfile?.customer || !basket) {
        return null;
    }

    // For returning registered customers, determine step based on customer profile data
    // since the basket will be prefilled during checkout initialization
    const hasCustomerEmail = customerProfile.customer.login;
    const hasCustomerAddresses = customerProfile.addresses && customerProfile.addresses.length > 0;
    const hasCustomerPaymentMethods =
        customerProfile.paymentInstruments && customerProfile.paymentInstruments.length > 0;
    // allow checkout even if payment section complete even without SPM
    const paymentInstrument = basket.paymentInstruments?.[0];
    const paymentValid = paymentInstrument && hasValidPaymentCard(paymentInstrument);

    // If customer has complete profile (email, addresses, payment methods), go straight to review/place order
    if (hasCustomerEmail && hasCustomerAddresses && (hasCustomerPaymentMethods || paymentValid)) {
        return CHECKOUT_STEPS.REVIEW_ORDER;
    }

    // If customer has email and addresses but no saved payment methods, go to payment step
    if (hasCustomerEmail && hasCustomerAddresses && !hasCustomerPaymentMethods) {
        return CHECKOUT_STEPS.PAYMENT;
    }

    // If customer has email but no addresses, go to shipping address (unless basket already has one)
    if (hasCustomerEmail && !hasCustomerAddresses) {
        return shipmentDistribution.hasUnaddressedDeliveryItems ? CHECKOUT_STEPS.SHIPPING_ADDRESS : null;
    }

    // If customer has no email (shouldn't happen for registered users), go to contact info
    if (!hasCustomerEmail) {
        return CHECKOUT_STEPS.CONTACT_INFO;
    }

    // Fallback to review if we can't determine the step
    return CHECKOUT_STEPS.REVIEW_ORDER;
}

/**
 * Handle navigation to appropriate next checkout step from Pickup.
 * - If there are delivery items + pickup, advance to shipping address.
 * - If no delivery items (pickup only), advance to payment.
 *
 * @param isPickup - basket has at least one pickup shipment
 * @param hasDeliveryItems - basket has at least one delivery shipment/items
 * @param goToStep - callback for advancing step
 * @param STEPS - checkout steps
 * @param t - translation
 * @returns { label, onClick }
 */
export function handlePickupContinueAction(
    isPickup: boolean,
    hasDeliveryItems: boolean,
    goToStep: (step: CheckoutStep) => void,
    STEPS: typeof CHECKOUT_STEPS,
    t: (key: string) => string
): { label: string; onClick: () => void } {
    if (isPickup && hasDeliveryItems) {
        return {
            label: t('checkout.pickUp.continueToShipping'),
            onClick: () => goToStep(STEPS.SHIPPING_ADDRESS as CheckoutStep),
        };
    } else {
        return {
            label: t('checkout.pickUp.continueToPayment'),
            onClick: () => goToStep(STEPS.PAYMENT as CheckoutStep),
        };
    }
}

export function computeStepFromBasket(
    basket: ShopperBasketsV2.schemas['Basket'] | undefined,
    shipmentDistribution: ShipmentDistribution
): CheckoutStep {
    if (!basket) {
        return CHECKOUT_STEPS.CONTACT_INFO;
    }

    if (!basket.customerInfo?.email) {
        return CHECKOUT_STEPS.CONTACT_INFO;
    }

    if (shipmentDistribution.hasDeliveryItems) {
        if (shipmentDistribution.hasUnaddressedDeliveryItems) {
            return CHECKOUT_STEPS.SHIPPING_ADDRESS;
        }

        if (shipmentDistribution.needsShippingMethods) {
            return CHECKOUT_STEPS.SHIPPING_OPTIONS;
        }
    }

    const paymentInstrument = basket.paymentInstruments?.[0];
    if (!paymentInstrument || !hasValidPaymentCard(paymentInstrument)) {
        return CHECKOUT_STEPS.PAYMENT;
    }

    return CHECKOUT_STEPS.REVIEW_ORDER;
}

export function getCompletedSteps(
    basket: ShopperBasketsV2.schemas['Basket'] | undefined,
    shipmentDistribution: ShipmentDistribution,
    currentStep: CheckoutStep
): CheckoutStep[] {
    const completed: CheckoutStep[] = [];

    if (!basket) {
        return completed;
    }

    const hasEmail =
        basket.customerInfo?.email ||
        (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('checkoutEmail'));
    if (hasEmail && currentStep > CHECKOUT_STEPS.CONTACT_INFO) {
        completed.push(CHECKOUT_STEPS.CONTACT_INFO);
    }

    if (shipmentDistribution.hasDeliveryItems) {
        if (!shipmentDistribution.hasUnaddressedDeliveryItems && currentStep > CHECKOUT_STEPS.SHIPPING_ADDRESS) {
            completed.push(CHECKOUT_STEPS.SHIPPING_ADDRESS);
        }

        if (!shipmentDistribution.needsShippingMethods && currentStep > CHECKOUT_STEPS.SHIPPING_OPTIONS) {
            completed.push(CHECKOUT_STEPS.SHIPPING_OPTIONS);
        }
    }

    const paymentInstrument = basket.paymentInstruments?.[0];
    if (paymentInstrument && hasValidPaymentCard(paymentInstrument) && currentStep > CHECKOUT_STEPS.PAYMENT) {
        completed.push(CHECKOUT_STEPS.PAYMENT);
    }

    return completed;
}

export function shouldAutoAdvanceForReturningCustomer(
    isRegisteredCustomer: boolean,
    customerProfile?: CustomerProfile
): boolean {
    if (!isRegisteredCustomer || !customerProfile) {
        return false;
    }

    const hasAddresses = customerProfile.addresses && customerProfile.addresses.length > 0;
    const hasPaymentMethods = customerProfile.paymentInstruments && customerProfile.paymentInstruments.length > 0;

    return hasAddresses && hasPaymentMethods;
}

export function shouldPrefillBasket(
    basket: ShopperBasketsV2.schemas['Basket'] | undefined,
    customerProfile: CustomerProfile
): boolean {
    if (!customerProfile?.customer || !customerProfile?.addresses?.length) {
        return false;
    }

    const missingEmail = !basket?.customerInfo?.email;
    const missingShippingAddress = isAddressEmpty(basket?.shipments?.[0]?.shippingAddress);

    return missingEmail || missingShippingAddress;
}

export async function initializeBasketForReturningCustomer(
    context: ClientLoaderFunctionArgs['context'],
    customerProfile: CustomerProfile
): Promise<ShopperBasketsV2.schemas['Basket'] | null> {
    try {
        const basket = getBasket(context);

        if (!basket?.basketId || !customerProfile?.customer) {
            return null;
        }

        const clients = createApiClients(context);
        let updatedBasket = basket;
        let hasUpdates = false;

        if (!updatedBasket.customerInfo?.email && customerProfile.customer.login) {
            const { data } = await clients.shopperBasketsV2.updateCustomerForBasket({
                params: {
                    path: {
                        basketId: updatedBasket.basketId,
                    },
                },
                body: { email: customerProfile.customer.login },
            });
            updatedBasket = data;
            updateBasket(context, updatedBasket);
            hasUpdates = true;
        }

        const hasShippingAddress = updatedBasket.shipments?.[0]?.shippingAddress;
        if (!hasShippingAddress && customerProfile.addresses?.length > 0) {
            const defaultAddress =
                customerProfile.addresses.find((addr) => addr.preferred) || customerProfile.addresses[0];

            if (defaultAddress) {
                const shippingAddress = {
                    firstName: defaultAddress.firstName,
                    lastName: defaultAddress.lastName,
                    address1: defaultAddress.address1,
                    address2: defaultAddress.address2 || undefined,
                    city: defaultAddress.city,
                    stateCode: defaultAddress.stateCode,
                    postalCode: defaultAddress.postalCode,
                    countryCode: defaultAddress.countryCode || 'US',
                    phone:
                        defaultAddress.phone ||
                        customerProfile.customer.phoneMobile ||
                        customerProfile.customer.phoneHome ||
                        undefined,
                };

                const { data } = await clients.shopperBasketsV2.updateShippingAddressForShipment({
                    params: {
                        path: {
                            basketId: updatedBasket.basketId,
                            shipmentId: updatedBasket.shipments?.[0]?.shipmentId || 'me',
                        },
                    },
                    body: shippingAddress,
                });
                updatedBasket = data;
                updateBasket(context, updatedBasket);
                hasUpdates = true;
            }
        }

        if (!updatedBasket.billingAddress && hasUpdates) {
            const shippingAddr = updatedBasket.shipments?.[0]?.shippingAddress;
            if (shippingAddr) {
                try {
                    const { data } = await clients.shopperBasketsV2.updateBillingAddressForBasket({
                        params: {
                            path: {
                                basketId: updatedBasket.basketId,
                            },
                        },
                        body: {
                            firstName: shippingAddr.firstName,
                            lastName: shippingAddr.lastName,
                            address1: shippingAddr.address1,
                            address2: shippingAddr.address2,
                            city: shippingAddr.city,
                            stateCode: shippingAddr.stateCode,
                            postalCode: shippingAddr.postalCode,
                            countryCode: shippingAddr.countryCode,
                            phone: shippingAddr.phone,
                        },
                    });
                    updatedBasket = data;
                    updateBasket(context, updatedBasket);
                } catch {
                    // Billing address update failed - continue without it (not critical)
                }
            }
        }

        if (
            hasUpdates &&
            updatedBasket.shipments?.[0]?.shippingAddress &&
            !updatedBasket.shipments?.[0]?.shippingMethod
        ) {
            try {
                const shippingMethods = await getShippingMethodsForShipment(context, updatedBasket.basketId as string);
                if (
                    Array.isArray(shippingMethods?.applicableShippingMethods) &&
                    shippingMethods?.applicableShippingMethods?.length > 0
                ) {
                    const defaultMethod = shippingMethods.applicableShippingMethods[0];
                    const { data } = await clients.shopperBasketsV2.updateShippingMethodForShipment({
                        params: {
                            path: {
                                basketId: updatedBasket.basketId,
                                shipmentId: updatedBasket.shipments[0].shipmentId || 'me',
                            },
                        },
                        body: { id: defaultMethod.id },
                    });
                    updatedBasket = data;
                    updateBasket(context, updatedBasket);
                    hasUpdates = true;
                }
            } catch {
                // Shipping method update failed - continue without it (not critical)
            }
        }

        // Add payment instrument if missing and customer has saved payment methods
        if (!updatedBasket.paymentInstruments?.[0] && customerProfile.paymentInstruments?.length > 0) {
            try {
                const { addPaymentInstrumentToBasket } = await import('@/lib/api/basket');
                const { getPaymentMethodsFromCustomer } = await import('@/lib/customer-profile-utils');

                const savedPaymentMethods = getPaymentMethodsFromCustomer(customerProfile);
                if (savedPaymentMethods.length > 0) {
                    const preferredMethod =
                        savedPaymentMethods.find((method) => method.preferred) || savedPaymentMethods[0];

                    const paymentInfo = {
                        paymentMethodId: 'CREDIT_CARD',
                        customerPaymentInstrumentId: preferredMethod.id,
                    };

                    if (updatedBasket.basketId) {
                        updatedBasket = await addPaymentInstrumentToBasket(
                            context,
                            updatedBasket.basketId,
                            paymentInfo
                        );
                        updateBasket(context, updatedBasket);
                        hasUpdates = true;
                    }
                }
            } catch {
                // Payment instrument addition failed - continue without it (not critical)
            }
        }

        return hasUpdates ? updatedBasket : null;
    } catch {
        return null;
    }
}
