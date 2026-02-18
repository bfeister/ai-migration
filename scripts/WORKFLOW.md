# Scripts Workflow & Architecture

**Discovery drives Phase 2.** `discover-features-claude.ts` dynamically discovers features from ISML templates. `url-mappings.json` provides page-level config (URLs, ISML paths, viewport). Features flow from discovery output to downstream scripts.

---

## Step 1: Feature Discovery (Primary Entry Point)

```bash
CLAUDECODE= npx tsx scripts/discover-features-claude.ts --page home
```

**What it does:**
- Claude analyzes ISML template to discover migratable features
- Reads page config from `url-mappings.json` (URLs, ISML paths, viewport)
- **Writes:** `migration-plans/{page}-features.json` (discovery output)

**When to use:**
- Dynamic feature discovery from ISML (the standard path)
- Discovering unknown page structure
- Accurate selector/ISML line references

---

## Optional: Interactive Setup (Override)

```bash
npx tsx scripts/setup-migration.ts
```

**What it does:**
- Interactive prompts for feature selection overrides

**When to use:**
- Manually overriding Claude-discovered features
- Quick setup with known features when discovery isn't needed

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
| `url-mappings.json` | **Page-level config** — URLs, ISML paths, viewport, consent settings. Read by discovery. |
| `migration-plans/*.json` | **Discovery output** — discovered features with selectors, priorities, ISML references. Read by all downstream scripts. |

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
│        "sfra_url": "...",                                      │
│        "isml_template": "home/homePage.isml",                  │
│        "viewport": { ... },                                    │
│        "source_config": { ... }                                │
│      }                                                         │
│    ]                                                           │
│  }                                                             │
└────────────────────────────┬─────────────────────────────────┘
                             │ READ (page config)
                             ▼
┌──────────────────────────────────────────────────────────────┐
│  discover-features-claude.ts                                   │
│                                                                │
│  Reads: url-mappings.json (page config) + ISML templates      │
│  Process: Claude CLI analyzes ISML + resolves slots            │
│  Writes: migration-plans/{page}-features.json                  │
└────────────────────────────┬─────────────────────────────────┘
                             │
                             ▼
┌──────────────────────────────────────────────────────────────┐
│  migration-plans/{page}-features.json (DISCOVERY OUTPUT)       │
│                                                                │
│  {                                                             │
│    "page_id": "home",                                          │
│    "features": [                                               │
│      {                                                         │
│        "feature_id": "01-home-hero",                           │
│        "name": "Hero Banner",                                  │
│        "selector": ".hero",                                    │
│        "isml_source": { ... },                                 │
│        "migration_priority": 1                                 │
│      }                                                         │
│    ]                                                           │
│  }                                                             │
└────────────────────────────┬─────────────────────────────────┘
                             │ READ (features)
                             │
           ┌─────────────────┼─────────────────┐
           │                 │                 │
           ▼                 ▼                 ▼
    ┌────────────┐    ┌────────────┐    ┌────────────┐
    │  analyze-  │    │ generate-  │    │   init-    │
    │ features.ts│    │ subplan... │    │migration...│
    └────────────┘    └────────────┘    └────────────┘
           │                 │                 │
           ▼                 ▼                 ▼
      analysis/        sub-plans/       migration-log.md
```

---

## Summary

- **`url-mappings.json`** — page-level config (URLs, ISML paths, viewport)
- **`discover-features-claude.ts`** — the driver; dynamically discovers features from ISML
- **`migration-plans/*.json`** — discovery output; consumed by all downstream scripts
- **`setup-migration.ts`** — optional interactive override, not a co-equal input method
