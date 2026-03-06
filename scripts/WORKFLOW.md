# Scripts Workflow & Architecture

**Discovery drives Phase 2.** `discover-features-claude.ts` dynamically discovers features from ISML templates. `url-mappings.json` provides page-level config (URLs, ISML paths, viewport, selection state). Features flow from discovery output to downstream scripts.

---

## Step 0: Interactive Page Setup

```bash
npx tsx scripts/setup-migration.ts
```

**What it does:**
- Reads `url-mappings.json` (the seed / single source of truth)
- Prompts to confirm/edit global settings (SFRA base URL, target storefront URL for production preview)
- Prompts to confirm/edit per-page config (SFRA URL, target URL, ISML template, consent selector)
- Presents multiselect for route selection
- Writes updated config back to `url-mappings.json` with `selected` flags

**Important:** The migration workflow should avoid Vite file watching. Set target URLs to the production preview server, typically `http://localhost:3000`, rather than the Vite dev server.

**When to use:**
- Before first discovery run (sets which pages to process)
- When adding new routes or changing SFRA instance URLs
- `--reset` flag cleans downstream artifacts (screenshots, plans, log)

---

## Step 1: Feature Discovery (Primary Entry Point)

```bash
# Discover for a specific page
CLAUDECODE= npx tsx scripts/discover-features-claude.ts --page home

# Discover for all selected pages (reads `selected` field from url-mappings.json)
CLAUDECODE= npx tsx scripts/discover-features-claude.ts
```

**What it does:**
- Claude analyzes ISML template to discover migratable features
- Reads page config from `url-mappings.json` (URLs, ISML paths, viewport)
- When no `--page` flag: processes only pages with `selected: true` (or `selected` not set)
- **Writes:** `migration-plans/{page}-features.json` (discovery output)

**When to use:**
- Dynamic feature discovery from ISML (the standard path)
- Discovering unknown page structure
- Accurate selector/ISML line references

---

## Downstream Scripts (Consumers of Discovery Output)

All scripts below **read from `migration-plans/*.json`** (discovery output):

### Step 2: Analyze Features

```bash
npx tsx scripts/analyze-features.ts --features 01-home-hero,02-home-categories
# OR analyze all discovered features for a page
npx tsx scripts/analyze-features.ts --page home
```

**Reads:** `migration-plans/*.json`
**Writes:** `analysis/{feature-id}/dom-extraction.json`, `analysis/{feature-id}/screenshot.png`

### Step 3: Generate Sub-Plans

```bash
CLAUDECODE= npx tsx scripts/generate-subplan-claude.ts --features 01-home-hero
```

**Reads:** `migration-plans/*.json` + `analysis/{feature-id}/`
**Writes:** `sub-plans/{feature-id}/subplan-*.md`

### Step 4: Initialize Log

```bash
npx tsx scripts/init-migration-log.ts
```

**Reads:** `migration-plans/*.json`
**Writes:** `migration-log.md`

---

## Key Files

| File | Role |
| --- | --- |
| `url-mappings.json` | **Page-level config** — URLs, ISML paths, viewport, consent settings, `selected` flag. Read by setup and discovery. |
| `migration-plans/*.json` | **Discovery output** — discovered features with selectors, priorities, ISML references. Read by all downstream scripts. |

---

## `selected` Field

Each page in `url-mappings.json` has an optional `selected: boolean` field:

- `true` — page will be processed by discovery when no `--page` flag is given
- `false` — page is skipped (still available via explicit `--page <id>`)
- absent — treated as `true` (backwards-compatible)

`setup-migration.ts` manages this field via multiselect prompt.

---

## Entrypoint Phase 4 Flow

When `entrypoint.sh` runs Phase 4:

```
1. Interactive setup (setup-migration.ts) — skipped in non-interactive mode
2. Read selected pages from url-mappings.json
3. Feature discovery per selected page (separate Claude context each)
4. Feature analysis (analyze-features.ts)
5. Sub-plan generation (generate-plans.ts)
6. Migration log initialization (init-migration-log.ts)
```

Each discovery invocation is a separate process, naturally clearing Claude CLI context between routes.

---

## Data Flow

```
┌──────────────────────────────────────────────────────────────┐
│  url-mappings.json (PAGE-LEVEL CONFIG)                        │
│                                                                │
│  {                                                             │
│    "version": "2.0",                                           │
│    "pages": [                                                  │
│      {                                                         │
│        "page_id": "home",                                      │
│        "selected": true,                                       │
│        "sfra_url": "...",                                      │
│        "isml_template": "home/homePage.isml",                  │
│        "viewport": { ... },                                    │
│        "source_config": { ... }                                │
│      }                                                         │
│    ]                                                           │
│  }                                                             │
└────────────────────┬──────────────────┬──────────────────────┘
                     │ READ             │ READ/WRITE
                     │ (page config)    │ (selected flags)
                     ▼                  ▼
┌─────────────────────────┐  ┌──────────────────────────────────┐
│  discover-features-     │  │  setup-migration.ts               │
│  claude.ts              │  │                                    │
│                         │  │  Confirms/edits page config        │
│  Reads: url-mappings    │  │  Sets selected flags               │
│  Process: Claude CLI    │  │  Writes: url-mappings.json         │
│  Writes: migration-     │  └──────────────────────────────────┘
│          plans/*.json   │
└────────────────────┬────┘
                     │
                     ▼
┌──────────────────────────────────────────────────────────────┐
│  migration-plans/{page}-features.json (DISCOVERY OUTPUT)       │
└────────────────────┬─────────────────────────────────────────┘
                     │ READ (features)
                     │
           ┌─────────┼─────────────────┐
           │         │                 │
           ▼         ▼                 ▼
    ┌────────────┐ ┌────────────┐ ┌────────────┐
    │  analyze-  │ │ generate-  │ │   init-    │
    │ features.ts│ │ subplan... │ │migration...│
    └────────────┘ └────────────┘ └────────────┘
           │             │               │
           ▼             ▼               ▼
      analysis/     sub-plans/     migration-log.md
```

---

## Summary

- **`url-mappings.json`** — page-level config (URLs, ISML paths, viewport, `selected` flag)
- **`setup-migration.ts`** — interactive config confirmation and route selection (Step 0)
- **`discover-features-claude.ts`** — the driver; dynamically discovers features from ISML for selected pages
- **`migration-plans/*.json`** — discovery output; consumed by all downstream scripts
