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

import { NativeSelect } from '@/components/ui/native-select';

export default function ThemeSwitcher(): ReactElement {
    const id = useId();
    const { t } = useTranslation('themeSwitcher');
    const handleStyleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const newTheme = e.target.value;
        document.documentElement.classList.toggle('dark', newTheme === 'dark');
    };
    return (
        <div className="*:not-first:mt-2">
            <NativeSelect id={id} onChange={handleStyleChange} aria-label={t('ariaLabel')}>
                <option value="light">{t('lightTheme')}</option>
                <option value="dark">{t('darkTheme')}</option>
            </NativeSelect>
        </div>
    );
}
