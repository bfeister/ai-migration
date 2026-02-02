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

import { type ReactElement, useId } from 'react';
import { useTranslation } from 'react-i18next';
import { useFetcher } from 'react-router';

import { NativeSelect } from '@/components/ui/native-select';
import { useConfig } from '@/config';

export default function LocaleSwitcher(): ReactElement {
    const id = useId();
    const { t, i18n } = useTranslation('localeSwitcher');
    const fetcher = useFetcher();
    const config = useConfig();

    const handleLocaleChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
        const newLocale = e.target.value;
        const formData = new FormData();
        formData.append('locale', newLocale);

        // Change the language in i18next client-side for immediate UX
        await i18n.changeLanguage(newLocale);

        // Set the cookie server-side so it persists across page reloads
        void fetcher.submit(formData, {
            method: 'POST',
            action: '/action/set-locale',
        });
    };

    return (
        <div className="*:not-first:mt-2">
            <NativeSelect
                id={id}
                onChange={(e) => void handleLocaleChange(e)}
                aria-label={t('ariaLabel')}
                value={i18n.language}>
                {config.i18n.supportedLngs.map((locale) => {
                    return (
                        <option key={locale} value={locale}>
                            {t(`locales.${locale}`, { defaultValue: locale })}
                        </option>
                    );
                })}
            </NativeSelect>
        </div>
    );
}
