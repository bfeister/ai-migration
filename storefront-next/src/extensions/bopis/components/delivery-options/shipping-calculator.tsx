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

import { type ReactElement, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

// US Postal Code validation (5 digits or 5+4 format)
const US_POSTAL_CODE_REGEX = /^\d{5}(-\d{4})?$/;

interface ShippingCalculatorProps {
    onCalculate: (zipCode: string, deliveryDays: number) => void;
}

export default function ShippingCalculator({ onCalculate }: ShippingCalculatorProps): ReactElement {
    const { t } = useTranslation('extBopis');
    const [inputValue, setInputValue] = useState('');
    const [deliveryDays, setDeliveryDays] = useState<number | null>(null);
    const [showResult, setShowResult] = useState(false);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value.replace(/\D/g, '').slice(0, 5);
        setInputValue(val);
        if (val.length !== 5) {
            setShowResult(false);
        }
    };

    const isValidZip = US_POSTAL_CODE_REGEX.test(inputValue);

    const handleCalculate = () => {
        if (isValidZip) {
            const days = 3;
            setDeliveryDays(days);
            setShowResult(true);
            onCalculate(inputValue, days);
        }
    };

    return (
        <div className="p-4 border border-muted-foreground/20 rounded-lg bg-card">
            <div className="space-y-3">
                <div>
                    <label htmlFor="delivery-zip-input" className="text-sm font-medium text-foreground">
                        {t('deliveryOptions.pickupOrDelivery.calculatorTitle')}
                    </label>
                </div>
                <div className="flex gap-2">
                    <div className="flex-1">
                        <input
                            id="delivery-zip-input"
                            inputMode="numeric"
                            maxLength={5}
                            placeholder={t('deliveryOptions.pickupOrDelivery.zipPlaceholder')}
                            aria-label={t('deliveryOptions.pickupOrDelivery.zipAriaLabel')}
                            aria-invalid={inputValue.length > 0 && !isValidZip}
                            aria-describedby={showResult ? 'delivery-result' : 'delivery-message'}
                            className="w-full px-3 py-2 text-sm border border-muted-foreground/20 rounded-lg transition-colors focus:border-ring focus:ring-ring bg-background focus:outline-none focus:ring-2"
                            type="text"
                            value={inputValue}
                            onChange={handleInputChange}
                        />
                    </div>
                    <button
                        type="button"
                        className={cn(
                            'px-4 py-2 text-sm font-medium rounded-lg transition-colors whitespace-nowrap',
                            isValidZip
                                ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                                : 'bg-muted text-muted-foreground cursor-not-allowed'
                        )}
                        disabled={!isValidZip}
                        onClick={handleCalculate}
                        aria-label={t('deliveryOptions.pickupOrDelivery.calculateAriaLabel')}>
                        {t('deliveryOptions.pickupOrDelivery.calculateButton')}
                    </button>
                </div>

                {!showResult && (
                    <p id="delivery-message" className="text-xs text-muted-foreground">
                        {t('deliveryOptions.pickupOrDelivery.calculatorInstructionMessage')}
                    </p>
                )}

                {showResult && deliveryDays !== null && (
                    <div
                        id="delivery-result"
                        role="status"
                        aria-live="polite"
                        className="bg-success/10 border border-success/20 rounded-lg p-3">
                        <div className="flex items-start gap-2">
                            <svg
                                className="w-4 h-4 text-success mt-0.5 flex-shrink-0"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                            </svg>
                            <div className="flex-1 space-y-1">
                                <p className="text-sm text-success">
                                    {t('deliveryOptions.pickupOrDelivery.estimatedDeliveryInDays', {
                                        days: deliveryDays,
                                    })}
                                </p>
                                <p className="text-sm text-success">
                                    Shipping:{' '}
                                    <span className="font-semibold">{t('deliveryOptions.pickupOrDelivery.free')}</span>
                                    <span className="ml-1.5 text-xs text-success">✓</span>
                                </p>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
