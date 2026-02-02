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

// React Router
import { Link } from 'react-router';

// UI Components
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Typography } from '@/components/typography';

// Icons
import { ShoppingCart, User } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface EmptyCartProps {
    isRegistered?: boolean;
}

/**
 * EmptyCart component that displays when the cart has no items
 *
 * This component provides:
 * - Empty cart state display with icon and messaging
 * - Different messages for registered vs guest users
 * - Continue shopping and sign-in action buttons
 * - Responsive design with proper spacing
 *
 * Used by cart-content components to display empty cart state.
 *
 * @param props - Component props
 * @returns JSX element with empty cart display
 *
 * @see {@link CartContent} - Cart component that uses this for empty state
 */
export default function EmptyCart({ isRegistered = false }: EmptyCartProps): ReactElement {
    const { t } = useTranslation('cart');

    return (
        <div className="bg-muted flex-1 min-w-full w-full" data-testid="sf-cart-empty">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 lg:py-14">
                <Card className="max-w-md mx-auto">
                    <CardContent className="p-8 text-center">
                        <div className="space-y-6">
                            {/* Empty Cart Icon */}
                            <div className="mx-auto w-16 h-16 bg-muted rounded-full flex items-center justify-center">
                                <ShoppingCart className="w-8 h-8 text-muted-foreground" />
                            </div>

                            {/* Empty Cart Message */}
                            <div className="space-y-2">
                                <Typography
                                    variant="h2"
                                    as="h2"
                                    className="text-xl text-center font-semibold text-foreground">
                                    {t('empty.title')}
                                </Typography>
                                <p className="text-muted-foreground">
                                    {isRegistered ? t('empty.registeredMessage') : t('empty.guestMessage')}
                                </p>
                            </div>

                            {/* Action Buttons */}
                            <div className="space-y-3">
                                <Button asChild className="w-full">
                                    <Link to="/">{t('empty.continueShopping')}</Link>
                                </Button>

                                {!isRegistered && (
                                    <Button asChild variant="outline" className="w-full">
                                        <Link to="/account" className="flex items-center justify-center gap-2">
                                            <User className="w-4 h-4" />
                                            {t('empty.signIn')}
                                        </Link>
                                    </Button>
                                )}
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
