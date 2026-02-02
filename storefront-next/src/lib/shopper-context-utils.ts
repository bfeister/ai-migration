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
import type { RouterContextProvider } from 'react-router';
import { createShopperContext, type ShopperContext } from '@/lib/api/shopper-context';
import {
    SHOPPER_CONTEXT_SEARCH_PARAMS,
    QUALIFIER_MAPPING_PARAM_NAME,
    type QualifierMapping,
    QUALIFIER_MAPPING_API_FIELD_NAME,
    SOURCE_CODE_API_FIELD_NAME,
} from '@/lib/shopper-context-constants';
import { getConfig } from '@/config';
import { getCookie, setNamespacedCookie } from '@/lib/cookies.client';

/**
 * Base cookie names (without USID suffix)
 */
export const SHOPPER_CONTEXT_COOKIE_NAME_BASE = 'storefront-next-context';
export const SOURCE_CODE_COOKIE_NAME_BASE = 'dwsourcecode';

/**
 * Get shopper context cookie name with USID suffix
 * In client or server shopper context middlewares, when usid is empty, the middleware will be skipped by next()
 * It's possible Shopper Context will be used in UI directly later
 */
export function getShopperContextCookieName(usid: string): string {
    return `${SHOPPER_CONTEXT_COOKIE_NAME_BASE}-${usid}`;
}

/**
 * Get source code cookie name with configurable suffix
 * Commerce Cloud pattern: dwsourcecode_{suffix}
 * Suffix comes from config, which defaults to siteId if not overridden
 * TODO : Hash of siteId
 */
export function getSourceCodeCookieName(context: Readonly<RouterContextProvider>): string {
    const config = getConfig(context);
    const _suffix = config.features.shopperContext.dwsourcecodeCookieSuffix;
    // In setNamespacedCookie, cookie name with siteId suffix is already added, so we don't need to add it here
    const suffix = _suffix ? `_${_suffix}` : '';
    return `${SOURCE_CODE_COOKIE_NAME_BASE}${suffix}`;
}

export const SHOPPER_CONTEXT_ACTION_NAME = 'update-shopper-context';

/**
 * Shopper context cookie expiry in seconds (6 hours)
 */
export const SHOPPER_CONTEXT_COOKIE_EXPIRY_SECONDS = 6 * 60 * 60;

/**
 * Source code cookie expiry in seconds (30 days)
 */
export const SOURCE_CODE_COOKIE_EXPIRY_SECONDS = 30 * 24 * 60 * 60;

/**
 * Check if Page Designer edit or preview mode is active
 * @param url - URL object to check for mode parameter
 * @returns true if in Page Designer mode
 */
export function isPageDesignerMode(url: URL): boolean {
    const mode = url.searchParams.get('mode');
    return mode === 'EDIT' || mode === 'PREVIEW';
}

const customQualifiersMapping = SHOPPER_CONTEXT_SEARCH_PARAMS.customQualifiers as Record<string, QualifierMapping>;
const customQualifiersKeys = Object.keys(customQualifiersMapping);
const customQualifiersApiFieldNames = customQualifiersKeys.map(
    (key) => customQualifiersMapping[key][QUALIFIER_MAPPING_API_FIELD_NAME]
);

const assignmentQualifiersMapping = SHOPPER_CONTEXT_SEARCH_PARAMS.assignmentQualifiers as Record<
    string,
    QualifierMapping
>;
const assignmentQualifiersKeys = Object.keys(assignmentQualifiersMapping);
const assignmentQualifiersApiFieldNames = assignmentQualifiersKeys.map(
    (key) => assignmentQualifiersMapping[key][QUALIFIER_MAPPING_API_FIELD_NAME]
);

const couponCodesMapping = SHOPPER_CONTEXT_SEARCH_PARAMS.couponCodes as QualifierMapping;

export const isCustomQualifier = (key: string): boolean => {
    return customQualifiersApiFieldNames.includes(key) || customQualifiersKeys.includes(key);
};

export const isAssignmentQualifier = (key: string): boolean => {
    return assignmentQualifiersApiFieldNames.includes(key) || assignmentQualifiersKeys.includes(key);
};

export const isCouponCode = (key: string): boolean => {
    return (
        couponCodesMapping[QUALIFIER_MAPPING_API_FIELD_NAME] === key ||
        couponCodesMapping[QUALIFIER_MAPPING_PARAM_NAME] === key
    );
};

/**
 * Safely parse JSON from cookie value
 * Returns empty object if parsing fails
 */
export function safeParseCookie(cookieValue: string): Record<string, string> {
    if (!cookieValue) {
        return {};
    }

    try {
        const parsed = JSON.parse(cookieValue);
        // Ensure parsed value is an object
        if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
            return parsed as Record<string, string>;
        }
        // eslint-disable-next-line no-console
        console.warn('Parsed shopper context cookie is not a Record<string, string> object', parsed);
        return {};
    } catch (error) {
        // Invalid JSON in cookie - log warning and return empty object
        // eslint-disable-next-line no-console
        console.warn('Failed to parse shopper context cookie:', error instanceof Error ? error.message : String(error));
        return {};
    }
}

/**
 * Extract qualifiers from URL query parameters into a map
 * Uses SHOPPER_CONTEXT_SEARCH_PARAMS to determine which qualifiers to extract
 */
export function extractQualifiersFromUrl(url: URL): {
    qualifiers: Record<string, string>;
    sourceCodeQualifiers: Record<string, string>;
} {
    const qualifiers: Record<string, string> = {};
    const sourceCodeQualifiers: Record<string, string> = {};

    // For temporary storage of qualifiers with value as string array
    // For example: couponCodes
    const tempQualifiers: Record<string, string[]> = {};

    // Iterate through all URL search params
    for (const [searchParamKey, searchParamValue] of url.searchParams.entries()) {
        if (!searchParamKey) continue;

        const mapping = SHOPPER_CONTEXT_SEARCH_PARAMS[searchParamKey];
        let apiFieldName: string | undefined;
        let qualifierMapping: QualifierMapping | undefined;

        // Check if it's a root-level qualifier (e.g., src)
        if (mapping && QUALIFIER_MAPPING_PARAM_NAME in mapping) {
            qualifierMapping = mapping as QualifierMapping;
        }
        // Check if it's a customQualifier (e.g., customQualifiers.device)
        else if (isCustomQualifier(searchParamKey)) {
            qualifierMapping = customQualifiersMapping[searchParamKey];
        }
        // Check if it's an assignmentQualifier (e.g., assignmentQualifiers.store)
        else if (isAssignmentQualifier(searchParamKey)) {
            qualifierMapping = assignmentQualifiersMapping[searchParamKey];
        }

        if (qualifierMapping && qualifierMapping[QUALIFIER_MAPPING_PARAM_NAME] === searchParamKey) {
            apiFieldName =
                qualifierMapping[QUALIFIER_MAPPING_API_FIELD_NAME] ?? qualifierMapping[QUALIFIER_MAPPING_PARAM_NAME];

            // Separate sourceCode from other qualifiers
            if (apiFieldName === SOURCE_CODE_API_FIELD_NAME) {
                sourceCodeQualifiers[apiFieldName] = searchParamValue;
            } else {
                if (!tempQualifiers[apiFieldName]) {
                    tempQualifiers[apiFieldName] = [];
                }
                // Add to regular qualifiers (for other qualifiers than sourceCode)
                tempQualifiers[apiFieldName].push(searchParamValue);
            }
        }
    }

    // Convert temporary qualifiers with value as string array to qualifiers with value as string
    // As cookies only support string values
    // Will use string.split(',') to get the values as string array in buildShopperContextBody
    // As API call will need payload as string or string array
    for (const key in tempQualifiers) {
        const values = tempQualifiers[key];
        qualifiers[key] = values.join(',');
    }

    return { qualifiers, sourceCodeQualifiers };
}

/**
 * Extract qualifiers from input record into a map
 * Similar to extractQualifiersFromUrl but accepts a Record<string, string> directly
 * Uses SHOPPER_CONTEXT_SEARCH_PARAMS to determine which qualifiers to extract
 *
 * @param input - Record with key-value pairs to extract qualifiers from
 * @returns Object with qualifiers and sourceCodeQualifiers separated
 *
 * @example
 * const input = { src: 'email', device: 'mobile', store: 'store123' };
 * const { qualifiers, sourceCodeQualifiers } = extractQualifiersFromInput(input);
 * // qualifiers: { deviceType: 'mobile', store: 'store123' }
 * // sourceCodeQualifiers: { sourceCode: 'email' }
 */
export function extractQualifiersFromInput(input: Record<string, string>): {
    qualifiers: Record<string, string>;
    sourceCodeQualifiers: Record<string, string>;
} {
    const qualifiers: Record<string, string> = {};
    const sourceCodeQualifiers: Record<string, string> = {};

    // For temporary storage of qualifiers with value as string array
    // For example: couponCodes
    const tempQualifiers: Record<string, string[]> = {};

    // Iterate through all input entries
    for (const [inputKey, inputValue] of Object.entries(input)) {
        if (!inputKey) continue;

        const mapping = SHOPPER_CONTEXT_SEARCH_PARAMS[inputKey];
        let apiFieldName: string | undefined;
        let qualifierMapping: QualifierMapping | undefined;

        // Check if it's a root-level qualifier (e.g., src)
        if (mapping && QUALIFIER_MAPPING_PARAM_NAME in mapping) {
            qualifierMapping = mapping as QualifierMapping;
        }
        // Check if it's a customQualifier (e.g., customQualifiers.device)
        else if (isCustomQualifier(inputKey)) {
            qualifierMapping = customQualifiersMapping[inputKey];
        }
        // Check if it's an assignmentQualifier (e.g., assignmentQualifiers.store)
        else if (isAssignmentQualifier(inputKey)) {
            qualifierMapping = assignmentQualifiersMapping[inputKey];
        }

        if (qualifierMapping && qualifierMapping[QUALIFIER_MAPPING_PARAM_NAME] === inputKey) {
            apiFieldName =
                qualifierMapping[QUALIFIER_MAPPING_API_FIELD_NAME] ?? qualifierMapping[QUALIFIER_MAPPING_PARAM_NAME];

            // Separate sourceCode from other qualifiers
            if (apiFieldName === SOURCE_CODE_API_FIELD_NAME) {
                sourceCodeQualifiers[apiFieldName] = inputValue;
            } else {
                if (!tempQualifiers[apiFieldName]) {
                    tempQualifiers[apiFieldName] = [];
                }
                // Add to regular qualifiers (for other qualifiers than sourceCode)
                tempQualifiers[apiFieldName].push(inputValue);
            }
        }
    }

    // Convert temporary qualifiers with value as string array to qualifiers with value as string
    // As cookies only support string values
    // Will use string.split(',') to get the values as string array in buildShopperContextBody
    // As API call will need payload as string or string array
    for (const key in tempQualifiers) {
        const values = tempQualifiers[key];
        qualifiers[key] = values.join(',');
    }

    return { qualifiers, sourceCodeQualifiers };
}

/**
 * Compute effective source code context
 * Merges new source code state with current source code state from cookie
 *
 * @param newSourceCodeContext - New source code state (e.g., from URL or UI)
 * @param currentSourceCodeContext - Current source code state from cookie
 * @returns Effective source code context (merged state)
 */
export function computeEffectiveSourceCodeContext(
    newSourceCodeContext: Record<string, string>,
    currentSourceCodeContext: Record<string, string>
): Record<string, string> {
    const effectiveSourceCodeContext: Record<string, string> = { ...currentSourceCodeContext };

    // Update sourceCode if present in newSourceCodeContext (allow null, but not undefined)
    if (newSourceCodeContext.sourceCode !== undefined) {
        effectiveSourceCodeContext.sourceCode = newSourceCodeContext.sourceCode;
    }

    return effectiveSourceCodeContext;
}

/**
 * Compute effective shopper context (excluding source code)
 * Merges new shopper context state with current shopper context state from cookie
 * Handles customQualifiers, assignmentQualifiers, and other qualifiers
 *
 * @param newShopperContext - New shopper context state (e.g., from URL or UI)
 * @param currentShopperContext - Current shopper context state from cookie
 * @returns Effective shopper context (merged state)
 */
export function computeEffectiveShopperContext(
    newShopperContext: Record<string, string>,
    currentShopperContext: Record<string, string>
): Record<string, string> {
    const effectiveShopperContext: Record<string, string> = { ...currentShopperContext };

    // Update qualifiers if present in newShopperContext (allow null, but not undefined)
    Object.keys(newShopperContext).forEach((key) => {
        if (newShopperContext[key] !== undefined) {
            effectiveShopperContext[key] = newShopperContext[key];
        }
    });

    return effectiveShopperContext;
}

/**
 * Shared function to update shopper context
 * Used by both middleware and action to avoid code duplication
 *
 * @param params - Parameters for updating shopper context
 * @param params.context - React Router context
 * @param params.usid - Shopper's unique identifier
 * @param params.newQualifiers - New qualifiers to merge (excluding sourceCode)
 * @param params.newSourceCodeQualifiers - New source code qualifiers to merge
 * @returns Promise resolving to void
 */
export async function updateShopperContext({
    context,
    usid,
    newShopperContext,
    newSourceCodeContext,
}: {
    context: Readonly<RouterContextProvider>;
    usid: string;
    newShopperContext: Record<string, string>;
    newSourceCodeContext: Record<string, string>;
}): Promise<void> {
    // Get current context from cookies
    const shopperContextCookieName = getShopperContextCookieName(usid);
    const sourceCodeCookieName = getSourceCodeCookieName(context);
    const shopperContextCookie = getCookie(shopperContextCookieName);
    const sourceCodeCookie = getCookie(sourceCodeCookieName);
    const currentShopperContext = safeParseCookie(shopperContextCookie);
    const currentSourceCodeContext = safeParseCookie(sourceCodeCookie);

    // Compute effective context by merging new with current
    const effectiveShopperContext = computeEffectiveShopperContext(newShopperContext, currentShopperContext);
    const effectiveSourceCodeContext = computeEffectiveSourceCodeContext(
        newSourceCodeContext,
        currentSourceCodeContext
    );

    // Check if there are any updates
    const hasNewContext = Object.keys(newShopperContext).length > 0;
    const hasNewSourceCodeContext = Object.keys(newSourceCodeContext).length > 0;

    // Only call API if there are updates
    if (hasNewContext || hasNewSourceCodeContext) {
        const shopperContextBody = buildShopperContextBody(effectiveShopperContext, effectiveSourceCodeContext);
        await createShopperContext(context, usid, shopperContextBody);
    }

    // Update cookies even if API call failed (graceful degradation)
    // This ensures context is preserved locally even if API is temporarily unavailable
    try {
        if (hasNewSourceCodeContext) {
            setNamespacedCookie(sourceCodeCookieName, JSON.stringify(effectiveSourceCodeContext), {
                expires: new Date(Date.now() + SOURCE_CODE_COOKIE_EXPIRY_SECONDS * 1000),
            });
        }

        if (hasNewContext) {
            // Store the entire effectiveShopperContext object as JSON string, including all qualifiers
            setNamespacedCookie(shopperContextCookieName, JSON.stringify(effectiveShopperContext), {
                expires: new Date(Date.now() + SHOPPER_CONTEXT_COOKIE_EXPIRY_SECONDS * 1000),
            });
        }
    } catch (cookieError) {
        // Cookie setting failed - log but don't throw
        // eslint-disable-next-line no-console
        console.error(
            'Failed to set shopper context cookie at client side:',
            cookieError instanceof Error ? cookieError.message : String(cookieError)
        );
    }
}

/**
 * Build ShopperContext API body
 *
 * @param contextMap - Map of key-value pairs for shopper context (includes both root-level and custom qualifiers)
 * @param sourceCodeContextMap - Map of key-value pairs for source code context
 * @returns ShopperContext body for API call
 */
export function buildShopperContextBody(
    contextMap: Record<string, string>,
    sourceCodeContextMap: Record<string, string>
): Partial<ShopperContext> {
    const body: Partial<ShopperContext> = {};

    // Add sourceCode if present
    if (sourceCodeContextMap.sourceCode) {
        const sourceCodeValue = sourceCodeContextMap.sourceCode.trim();
        if (sourceCodeValue.length > 0) {
            body.sourceCode = sourceCodeValue;
        }
    }

    Object.keys(contextMap).forEach((key) => {
        // Validate key and value
        if (!key || typeof key !== 'string' || key.trim().length === 0) {
            return;
        }

        // Skip sourceCode from contextMap if it's already set from sourceCodeContextMap
        // sourceCodeContextMap takes precedence
        if (key === SOURCE_CODE_API_FIELD_NAME && body.sourceCode) {
            return;
        }

        const rawValue = contextMap[key];

        // Skip if value is not a string
        if (typeof rawValue !== 'string') {
            return;
        }

        const isKeyCustomQualifier = isCustomQualifier(key);
        const isKeyAssignmentQualifier = isAssignmentQualifier(key);
        const isKeyCouponCode = isCouponCode(key);

        const valueArray = rawValue.split(',');
        const value = valueArray.length === 1 ? valueArray[0] : undefined;

        if (isKeyCouponCode && valueArray && Array.isArray(valueArray)) {
            // Only for root-level qualifiers with value as string array
            // For example: couponCodes
            body.couponCodes = valueArray.map((v) => v.trim()).filter((v) => v.length > 0);
        }
        if (value && typeof value === 'string' && value.trim().length > 0 && !isKeyCouponCode) {
            if (isKeyCustomQualifier) {
                // Add custom qualifiers
                body.customQualifiers = {
                    ...body.customQualifiers,
                    [key]: value.trim(),
                };
            } else if (isKeyAssignmentQualifier) {
                // Add assignment qualifiers
                body.assignmentQualifiers = {
                    ...body.assignmentQualifiers,
                    [key]: value.trim(),
                };
            } else {
                // Add root-level qualifiers with value as string
                // For example: src
                (body as Record<string, string>)[key] = value.trim();
            }
        }
    });

    return body;
}
