# URL Mappings v2.0 Schema

## Overview

Version 2.0 of `url-mappings.json` introduces **separate source and target configurations** for screenshot capture. This eliminates fallback chains and makes consent modal handling explicit and deterministic.

## Schema Changes

### Before (v1.0)
```json
{
  "feature_id": "01-homepage-hero",
  "sfra_url": "https://...",
  "target_url": "http://localhost:5173/",
  "viewport": { "width": 1920, "height": 1080 },
  "dismiss_consent": true,
  "consent_button_selector": "button.affirm"
}
```

**Problem:** Same consent selector used for both SFRA and localhost, causing failures or requiring fallback patterns.

### After (v2.0)
```json
{
  "feature_id": "01-homepage-hero",
  "sfra_url": "https://...",
  "target_url": "http://localhost:5173/",
  "viewport": { "width": 1920, "height": 1080 },
  "source_config": {
    "dismiss_consent": true,
    "consent_button_selector": "button.affirm"
  },
  "target_config": {
    "dismiss_consent": true,
    "consent_button_selector": "button:has-text('Accept')"
  }
}
```

**Solution:** Explicit configuration per context (SFRA vs Storefront Next).

## Usage Pattern for Claude

When capturing screenshots, read the appropriate config based on which URL you're capturing:

### Capturing SFRA Source Screenshot

```bash
# 1. Read url-mappings.json for the feature
MAPPING=$(jq '.mappings[] | select(.feature_id == "01-homepage-hero")' url-mappings.json)

# 2. Extract viewport + source_config
SOURCE_MAPPING=$(echo "$MAPPING" | jq '{
  viewport: .viewport,
  dismiss_consent: .source_config.dismiss_consent,
  consent_button_selector: .source_config.consent_button_selector,
  wait_for_selector: .source_config.wait_for_selector,
  scroll_to_selector: .source_config.scroll_to_selector,
  scroll_to: .source_config.scroll_to,
  crop: .source_config.crop
}')

# 3. Capture with source config
tsx scripts/capture-screenshots.ts \
  "https://zzrf-001.dx.commercecloud.salesforce.com/..." \
  "screenshots/${TIMESTAMP}-source.png" \
  --mapping "$SOURCE_MAPPING"
```

### Capturing Storefront Next Target Screenshot

```bash
# 1. Read url-mappings.json for the feature
MAPPING=$(jq '.mappings[] | select(.feature_id == "01-homepage-hero")' url-mappings.json)

# 2. Extract viewport + target_config
TARGET_MAPPING=$(echo "$MAPPING" | jq '{
  viewport: .viewport,
  dismiss_consent: .target_config.dismiss_consent,
  consent_button_selector: .target_config.consent_button_selector,
  wait_for_selector: .target_config.wait_for_selector,
  scroll_to_selector: .target_config.scroll_to_selector,
  scroll_to: .target_config.scroll_to,
  crop: .target_config.crop
}')

# 3. Capture with target config
tsx scripts/capture-screenshots.ts \
  "http://localhost:5173/" \
  "screenshots/${TIMESTAMP}-target.png" \
  --mapping "$TARGET_MAPPING"
```

## Configuration Options

Both `source_config` and `target_config` support:

- `dismiss_consent` (boolean): Whether to dismiss tracking consent modal
- `consent_button_selector` (string): **Required if dismiss_consent=true**. Playwright selector for the consent button
- `wait_for_selector` (string): Wait for element before screenshot
- `scroll_to_selector` (string): Scroll to element before screenshot
- `scroll_to` ("top" | "bottom"): Scroll to position
- `crop` (object): Crop region `{x, y, width, height}`

## Benefits

1. **Explicit over implicit**: No fallback chains, config is clear
2. **Deterministic**: Same input always produces same behavior
3. **Debuggable**: If consent fails, we know exactly which selector was used
4. **Context-aware**: SFRA gets "Yes" button, localhost gets "Accept" button
5. **Maintainable**: Easy to add new site-specific patterns

## Migration Guide

Existing scripts will fail with v2.0 if they pass old-style mappings. The capture script now:
- Requires `consent_button_selector` if `dismiss_consent` is true
- Does NOT fall back to pattern matching
- Warns if config is incomplete

Update any scripts that construct mappings to use the new source_config/target_config pattern.
