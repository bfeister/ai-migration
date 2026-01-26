# Screenshots Directory

This directory contains screenshots captured during the SFRA to Storefront Next migration process.

## Directory Structure

```
screenshots/                                      # Test screenshots from validation runs
└── {timestamp}-{subplan-id}-{source|target}.png  # Iteration screenshots
```

## Screenshot Types

### 1. Baseline Screenshots

The first micro-plan captures an initial SFRA homepage screenshot that serves as the visual baseline for the migration:

- **sfra-homepage-baseline.png**
  - URL: https://zzrf-001.dx.commercecloud.salesforce.com/s/RefArchGlobal/en_GB/home
  - Captured: During subplan-01-01 execution
  - Viewport: 1920x1080
  - Full page screenshot of SFRA homepage (UK locale)
  - Used as reference for all subsequent homepage content changes

### 2. Iteration Screenshots

During migration, the system captures **dual screenshots** at each micro-iteration:

### Naming Convention:
```
{timestamp}-{subplan-id}-source.png  # SFRA (what we're copying)
{timestamp}-{subplan-id}-target.png  # Storefront Next (our work)
```

### Example:
```
20260120-143022-subplan-01-03-source.png  # SFRA homepage with hero
20260120-143022-subplan-01-03-target.png  # Storefront Next homepage with hero
```

## Purpose

These screenshots enable:

1. **Visual Comparison**: Side-by-side comparison of source (SFRA) and target (Storefront Next)
2. **Progress Tracking**: Time-lapse of the migration showing incremental changes
3. **Audit Trail**: Visual proof of what was migrated and when
4. **Rollback Reference**: If something breaks, screenshots show what it looked like before
5. **Debugging**: Identify exactly which iteration introduced a visual regression

## Git Notes

- **All screenshots are committed to git** for complete audit trail
- This creates a visual history of the migration progress
- Screenshots serve as permanent documentation of the migration process

## URL Mappings

See `/workspace/url-mappings.json` for the mapping between SFRA URLs and Storefront Next URLs for each feature being migrated.

## Permissions

This directory requires world-writable permissions (777) to allow the Docker container's non-root `node` user to write screenshots:

```bash
chmod -R 777 screenshots/
```

This is necessary because the container runs as `USER node` for security (required by Claude Code's `--dangerously-skip-permissions` flag).
