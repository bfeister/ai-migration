# Standalone Storefront Generation

**Updated:** 2026-01-22 @ 04:00:00
**Solution:** Use PR #696 to generate standalone project with prebuilt modules

---

## Overview

Instead of building the monorepo inside Docker (which hits file descriptor limits), we now **generate a standalone project** from your existing storefront-next monorepo at `~/dev/SFCC-Odyssey`.

## The Problem We Solved

### Previous Approach (Broken):
```
1. Clone/copy storefront-next monorepo into workspace
2. Run pnpm install in Docker → triggers prepare scripts
3. Prepare scripts run pnpm build → hits ENFILE (file limits)
4. sfnext CLI not built → dev server fails
```

### New Approach (Working):
```
1. Mount existing monorepo (~/dev/SFCC-Odyssey) as read-only
2. Use monorepo's create-storefront command (PR #696)
3. Generate standalone project with prebuilt modules
4. Standalone project has its own node_modules with sfnext
5. Dev server works immediately
```

---

## How It Works

### PR #696: Standalone Project Generation

This merged PR adds the ability to generate a standalone storefront project from the monorepo:

```bash
npx /path/to/monorepo/packages/storefront-next-dev create-storefront \
    --output /path/to/new-project
```

When prompted:
1. Choose: "A different template (I will provide the Github URL)"
2. Enter: `file:///path/to/monorepo/packages/template-retail-rsc-app`

This creates a **standalone project** with:
- Its own `package.json` (not a monorepo)
- Its own `node_modules/` with prebuilt packages
- Ready-to-run `sfnext` CLI
- No workspace dependencies

### Docker Integration

The `pre-entrypoint.sh` script now:

1. **Mounts your monorepo** at `/workspace-host/dev/SFCC-Odyssey` (read-only)
2. **Checks for existing standalone project** at `/workspace/storefront-next`
3. **Generates standalone project if missing**:
   ```bash
   echo -e "A different template...\nfile://$MONOREPO_PATH/packages/template-retail-rsc-app" | \
       npx $MONOREPO_PATH/packages/storefront-next-dev create-storefront \
           --output /workspace/storefront-next
   ```
4. **Fixes ownership** to node user (uid=1000)
5. **Ready to run** `pnpm dev`

---

## Directory Structure

```
/Users/bfeister/dev/
├── test-storefront/                          # Migration workspace
│   ├── docker/
│   │   └── pre-entrypoint.sh                 # Generates standalone project
│   ├── scripts/
│   │   ├── demo-migration-loop.sh            # Mounts monorepo, starts container
│   │   └── prepare-standalone-storefront.sh  # Cleanup helper
│   └── storefront-next/                      # Generated standalone project
│       ├── package.json                      # Standalone (not monorepo)
│       ├── node_modules/                     # Has sfnext CLI
│       │   └── .bin/sfnext                   # Ready to use
│       └── src/                              # App code
│
└── SFCC-Odyssey/                             # Your monorepo (source)
    ├── packages/
    │   ├── storefront-next-dev/              # CLI generator
    │   │   └── dist/cli.js                   # create-storefront command
    │   ├── storefront-next-runtime/          # Runtime libs
    │   │   └── dist/                         # Prebuilt
    │   └── template-retail-rsc-app/          # Template source
    └── node_modules/                         # Monorepo deps
```

**In Docker Container:**
```
/workspace-host/dev/SFCC-Odyssey/  → Mounted from ~/dev/SFCC-Odyssey (read-only)
/workspace/                         → Mounted from test-storefront/
/workspace/storefront-next/         → Generated standalone project
```

---

## Setup Steps

### 1. Prepare Environment

```bash
cd /Users/bfeister/dev/test-storefront

# Clean up old monorepo setup (creates backup)
./scripts/prepare-standalone-storefront.sh
```

This script:
- Verifies your monorepo exists at `~/dev/SFCC-Odyssey`
- Backs up existing `storefront-next/` if it's a monorepo
- Leaves standalone projects untouched

### 2. Rebuild Docker Image

```bash
docker build -f docker/Dockerfile -t claude-migration:latest .
```

This includes the updated `pre-entrypoint.sh` that generates standalone projects.

### 3. Run Migration

```bash
./scripts/demo-migration-loop.sh
```

The script will:
- Detect your monorepo at `~/dev/SFCC-Odyssey`
- Mount it read-only at `/workspace-host/dev/SFCC-Odyssey`
- Container pre-entrypoint generates standalone project
- Dev server starts successfully

---

## Environment Variables

### `STOREFRONT_MONOREPO_PATH`

Override the default monorepo location:

```bash
# Default: ~/dev/SFCC-Odyssey
export STOREFRONT_MONOREPO_PATH=/path/to/your/monorepo
./scripts/demo-migration-loop.sh
```

The script will mount this path into the container.

---

## Verification

### Check if Standalone Project Generated:

```bash
# Should NOT have packages/ directory (that's monorepo structure)
ls storefront-next/packages 2>/dev/null && echo "❌ Still a monorepo" || echo "✅ Standalone"

# Should have sfnext CLI in node_modules
ls storefront-next/node_modules/.bin/sfnext && echo "✅ sfnext available" || echo "❌ Missing sfnext"

# Should have package.json without workspace config
grep -q '"workspaces"' storefront-next/package.json && echo "❌ Has workspaces (monorepo)" || echo "✅ Standalone"
```

### Check in Running Container:

```bash
docker exec -u node claude-migration-demo bash -c "
    cd /workspace/storefront-next && \
    which sfnext || echo 'sfnext not in PATH' && \
    ls -la node_modules/.bin/sfnext
"
```

### Test Dev Server:

```bash
docker exec -u node claude-migration-demo bash -c "
    cd /workspace/storefront-next && \
    timeout 10 pnpm dev
"
```

Should see:
```
> template-retail-rsc-app@... dev
> pnpm locales:aggregate-extensions && sfnext dev

✨ Extension locale generation complete!
[vite] Local: http://localhost:5173
```

---

## Troubleshooting

### Monorepo Not Found

```
[INIT] ✗ Monorepo not found at: /workspace-host/dev/SFCC-Odyssey
```

**Fix:**
```bash
# Verify path on host
ls ~/dev/SFCC-Odyssey/packages/storefront-next-dev

# Set correct path
export STOREFRONT_MONOREPO_PATH=~/dev/SFCC-Odyssey
./scripts/demo-migration-loop.sh
```

### Standalone Generation Failed

```
[INIT] ✗ Failed to generate standalone project
```

**Check logs:**
```bash
docker exec -u node claude-migration-demo cat /tmp/standalone-generation.log
```

**Common causes:**
- Monorepo not built (needs `dist/cli.js`)
- Permission issues
- npx not available in container

**Fix:**
```bash
# Build your monorepo first (on host)
cd ~/dev/SFCC-Odyssey
pnpm install
pnpm -r build

# Verify CLI exists
ls packages/storefront-next-dev/dist/cli.js
```

### Commander Module Not Found

```
Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'commander'
```

This means the standalone project wasn't generated properly - it's still pointing to monorepo structure.

**Fix:**
```bash
# Remove broken storefront-next
rm -rf storefront-next/

# Restart container (will regenerate)
docker stop claude-migration-demo
docker rm claude-migration-demo
./scripts/demo-migration-loop.sh
```

---

## Key Differences from Monorepo

| Feature | Monorepo | Standalone |
|---------|----------|------------|
| **Structure** | `packages/*` workspaces | Single project |
| **Dependencies** | `workspace:*` references | Normal npm deps |
| **node_modules** | Shared via symlinks | Self-contained |
| **Build** | Must build workspace packages | Already built |
| **sfnext CLI** | `packages/storefront-next-dev/dist/cli.js` | `node_modules/.bin/sfnext` |
| **Docker** | Hits file limits on build | No build needed |

---

## Benefits

1. **No Docker Build** - Standalone has prebuilt modules
2. **No File Limits** - No compilation in container
3. **Faster Startup** - Ready to run immediately
4. **Isolated** - Own deps, no workspace conflicts
5. **Same Code** - Generated from same template

---

## Next Steps

After successful setup:

1. **Test dev server** manually
2. **Run migration loop** with observation
3. **Verify screenshots** capture correctly
4. **Complete Phase 4** micro-plans

```bash
# Watch the migration in real-time
./scripts/observe-claude.sh --watch

# In another terminal
./scripts/demo-migration-loop.sh
```

---

**Status:** Ready to test standalone generation approach
**Expected:** Dev server starts without commander errors
