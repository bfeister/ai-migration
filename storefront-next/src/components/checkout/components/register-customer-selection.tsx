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
import { useState } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { Typography } from '@/components/typography';
import { ToggleCard, ToggleCardEdit, ToggleCardSummary } from '@/components/toggle-card';
import { useTranslation } from 'react-i18next';

interface RegisterCustomerSelectionProps {
    /** Callback when checkbox state changes - receives boolean value */
    onSaved?: (shouldCreateAccount: boolean) => void;
}

export default function RegisterCustomerSelection({ onSaved }: RegisterCustomerSelectionProps) {
    const [shouldCreateAccount, setShouldCreateAccount] = useState(false);
    const { t } = useTranslation('checkout');

    // Just track the user's preference, don't call API yet
    const handleCheckboxChange = (checked: boolean) => {
        setShouldCreateAccount(checked);
        onSaved?.(checked); // Pass the boolean preference to parent
    };

    return (
        <ToggleCard title={t('payment.saveForFutureUse')} editing={true} disableEdit={true}>
            <ToggleCardEdit>
                <div className="flex items-start space-x-3">
                    <Checkbox
                        id="create-account-checkbox"
                        checked={shouldCreateAccount}
                        onCheckedChange={handleCheckboxChange}
                        className="mt-0.5"
                        aria-label={t('payment.createAccountForFasterCheckout')}
                    />
                    <div className="space-y-1">
                        <label
                            htmlFor="create-account-checkbox"
                            className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer">
                            <Typography variant="small" className="font-medium">
                                {t('payment.createAccountForFasterCheckout')}
                            </Typography>
                        </label>
                    </div>
                </div>
            </ToggleCardEdit>

            <ToggleCardSummary>
                <div className="space-y-2">
                    <Typography variant="small" className="text-muted-foreground">
                        Account Creation
                    </Typography>
                    <Typography variant="p" className="font-medium">
                        {shouldCreateAccount ? 'Account will be created' : 'Continue as guest'}
                    </Typography>
                </div>
            </ToggleCardSummary>
        </ToggleCard>
    );
}
