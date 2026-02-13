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
import { useState, useMemo, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { mockMarketingConsentData, type MarketingConsentSubscription } from './mock-marketing-consent';

function channelLabel(channelId: string): string {
    return channelId.charAt(0).toUpperCase() + channelId.slice(1).toLowerCase();
}

function itemKey(channelId: string, subscriptionId: string): string {
    return `${channelId}:${subscriptionId}`;
}

/**
 * Groups API subscriptions by channel and builds initial toggle state.
 * Each subscription appears under every channel in its `channels` array.
 * Section order follows the order channels first appear in the data.
 *
 * @param subscriptions - Array of subscription objects from the consent API
 * @returns Object with `channelSections` (for UI) and `initialToggles` (Map of channelId:subscriptionId → optedIn)
 *
 * @example
 * buildSectionsAndToggles([{ subscriptionId: 'newsletter', channels: ['email'], ... }])
 * => {
 *   channelSections: [
 *     { channelId: 'email', channelLabel: 'Email', items: [...] }
 *   ],
 *   initialToggles: Map { 'email:newsletter' => false }
 * }
 */
function buildSectionsAndToggles(subscriptions: MarketingConsentSubscription[]) {
    const byChannel = new Map<string, MarketingConsentSubscription[]>();
    const toggles = new Map<string, boolean>();
    for (const sub of subscriptions) {
        const optedIn = sub.defaultStatus === 'opt_in';
        for (const channelId of sub.channels) {
            const list = byChannel.get(channelId) ?? [];
            list.push(sub);
            byChannel.set(channelId, list);
            toggles.set(itemKey(channelId, sub.subscriptionId), optedIn);
        }
    }
    const channelSections = Array.from(byChannel, ([channelId, items]) => ({
        channelId,
        channelLabel: channelLabel(channelId),
        items,
    }));
    return { channelSections, initialToggles: toggles };
}

export function MarketingConsent(): ReactElement {
    const { t } = useTranslation('account');
    const { channelSections, initialToggles } = useMemo(
        () => buildSectionsAndToggles(mockMarketingConsentData.data),
        []
    );

    const [toggles, setToggles] = useState<Map<string, boolean>>(initialToggles);

    const handleToggle = (channelId: string, subscriptionId: string, checked: boolean) => {
        setToggles((prev) => {
            const next = new Map(prev);
            next.set(itemKey(channelId, subscriptionId), checked);
            return next;
        });
    };

    const getChecked = (channelId: string, subscriptionId: string): boolean =>
        toggles.get(itemKey(channelId, subscriptionId)) ?? false;

    return (
        <Card data-section="marketing-consent">
            <CardHeader className="border-b border-muted-foreground/20 pb-3">
                <CardTitle>{t('marketingConsent.title')}</CardTitle>
                <CardAction>
                    <Button
                        variant="outline"
                        size="sm"
                        type="button"
                        aria-label={t('marketingConsent.editA11y')}
                        onClick={() => {
                            /* Edit not implemented */
                        }}>
                        {t('marketingConsent.edit')}
                    </Button>
                </CardAction>
            </CardHeader>
            <CardContent className="pt-3">
                <div className="space-y-3">
                    {channelSections.map((section, sectionIndex) => (
                        <section
                            key={section.channelId}
                            className={sectionIndex > 0 ? 'border-t border-muted-foreground/10 pt-3' : ''}
                            aria-labelledby={`marketing-consent-channel-${section.channelId}`}>
                            <h2
                                id={`marketing-consent-channel-${section.channelId}`}
                                className="text-sm font-semibold text-foreground mb-2">
                                {section.channelLabel}
                            </h2>
                            <ul className="space-y-2 pl-4" role="list">
                                {section.items.map((item) => {
                                    const checked = getChecked(section.channelId, item.subscriptionId);
                                    return (
                                        <li
                                            key={`${section.channelId}-${item.subscriptionId}`}
                                            className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between py-1">
                                            <div className="space-y-1 min-w-0">
                                                <p className="text-sm font-medium text-foreground">{item.title}</p>
                                                <p className="text-sm text-muted-foreground">{item.subtitle}</p>
                                            </div>
                                            <Switch
                                                checked={checked}
                                                onCheckedChange={(value) =>
                                                    handleToggle(section.channelId, item.subscriptionId, value)
                                                }
                                                aria-label={`${item.title}: ${checked ? t('marketingConsent.optedIn') : t('marketingConsent.optedOut')}`}
                                                className="shrink-0 sm:ml-4"
                                            />
                                        </li>
                                    );
                                })}
                            </ul>
                        </section>
                    ))}
                </div>
                <p className="text-sm text-muted-foreground mt-3 pt-3 border-t border-muted-foreground/10">
                    {t('marketingConsent.disclaimer')}
                </p>
            </CardContent>
        </Card>
    );
}

export default MarketingConsent;
