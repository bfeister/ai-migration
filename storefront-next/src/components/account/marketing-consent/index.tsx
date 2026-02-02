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
import { useTranslation } from 'react-i18next';
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export function MarketingConsent(): ReactElement {
    const { t } = useTranslation('account');

    return (
        <Card data-section="marketing-consent">
            <CardHeader className="border-b border-muted-foreground/20 pb-4">
                <CardTitle>{t('marketingConsent.title')}</CardTitle>
                <CardAction>
                    <Button variant="outline" size="sm" type="button">
                        {t('marketingConsent.edit')}
                    </Button>
                </CardAction>
            </CardHeader>
            <CardContent className="pt-6">{/* Content to be added later */}</CardContent>
        </Card>
    );
}

export default MarketingConsent;
