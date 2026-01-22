# Storefront Next Monorepo Dependencies

**Created:** 2026-01-22 @ 00:15:00
**Issue:** Missing sfnext CLI causing dev server startup failure

---

## Overview

The `storefront-next` project is a **pnpm monorepo** with workspace dependencies that must be **pre-compiled** before the dev server can start.

---

## Monorepo Structure

```
storefront-next/
├── package.json                           # Root workspace config
│   └── "build": "pnpm -r build"          # Builds all packages recursively
│
└── packages/
    ├── storefront-next-dev/               # Dev tools & CLI
    │   ├── package.json
    │   │   ├── "bin": { "sfnext": "./dist/cli.js" }
    │   │   ├── "prepare": "pnpm build"    # Auto-builds on install
    │   │   └── "build": "tsdown"          # TypeScript → JavaScript
    │   ├── src/                           # TypeScript source
    │   └── dist/                          # Built artifacts (needs build)
    │       └── cli.js                     # The sfnext CLI binary
    │
    ├── storefront-next-runtime/           # Runtime libraries
    │   ├── package.json
    │   │   ├── "prepare": "pnpm build"
    │   │   └── "build": "tsdown && shx cp ..."
    │   ├── src/                           # TypeScript source
    │   └── dist/                          # Built artifacts (needs build)
    │       ├── scapi.js
    │       ├── design.js
    │       └── events.js
    │
    ├── odyssey-mcp/                       # MCP server
    │   ├── package.json
    │   │   └── "build": "tsc && npm run copy-assets"
    │   ├── src/                           # TypeScript source
    │   └── dist/                          # Built artifacts (needs build)
    │
    └── template-retail-rsc-app/           # The application we run
        ├── package.json
        │   ├── "dev": "pnpm locales:aggregate-extensions && sfnext dev"
        │   ├── dependencies:
        │   │   ├── "@salesforce/storefront-next-dev": "workspace:*"
        │   │   └── "@salesforce/storefront-next-runtime": "workspace:*"
        └── src/
```

---

## Filepath Dependencies Explained

### 1. template-retail-rsc-app (The App)

**Location:** `storefront-next/packages/template-retail-rsc-app/`

**Dependencies:**
```json
{
  "dependencies": {
    "@salesforce/storefront-next-dev": "workspace:*",
    "@salesforce/storefront-next-runtime": "workspace:*"
  }
}
```

**Dev Server Command:**
```bash
pnpm dev
# Expands to:
pnpm locales:aggregate-extensions && sfnext dev
```

**What it needs:**
- The `sfnext` CLI binary from `storefront-next-dev/dist/cli.js`
- Runtime libraries from `storefront-next-runtime/dist/*`

---

### 2. storefront-next-dev (Dev Tools & CLI)

**Location:** `storefront-next/packages/storefront-next-dev/`

**Provides:**
- The `sfnext` CLI command used by `pnpm dev`
- Build tools and Vite plugins
- Deployment utilities

**Build Process:**
```bash
# package.json
"prepare": "pnpm build",     # Auto-runs on pnpm install
"build": "tsdown"            # Transpiles TypeScript → JavaScript
```

**Critical Files:**
- **Source:** `src/cli.ts` (TypeScript)
- **Built:** `dist/cli.js` (JavaScript executable)
- **Binary:** `"bin": { "sfnext": "./dist/cli.js" }`

**Why it's missing:**
- `pnpm install` should trigger `prepare` script → `pnpm build`
- In Docker, build fails silently due to file descriptor limits
- Result: `dist/` directory never created, `sfnext` command unavailable

---

### 3. storefront-next-runtime (Runtime Libraries)

**Location:** `storefront-next/packages/storefront-next-runtime/`

**Provides:**
- Commerce API client (`scapi.js`)
- Design system utilities (`design.js`)
- Event tracking (`events.js`)

**Build Process:**
```bash
"prepare": "pnpm build",
"build": "tsdown && shx cp src/design/styles/base.css dist/design-styles.css"
```

**Exports:**
```json
{
  "exports": {
    "./scapi": "./dist/scapi.js",
    "./design": "./dist/design.js",
    "./events": "./dist/events.js"
  }
}
```

**Why it's needed:**
- `template-retail-rsc-app` imports these runtime libraries
- Must be built before app can run

---

## Why Builds Fail in Docker

### The Problem Chain:

1. **pnpm install in Docker**
   - Triggers `prepare` scripts for each package
   - Attempts to run `tsdown` (TypeScript build tool)

2. **Docker Desktop Mac File Limits**
   - Max ~4096 file descriptors
   - `tsdown` opens thousands of files during TypeScript compilation

3. **Silent Failure**
   - Build fails with `ENFILE: file table overflow`
   - pnpm continues installation
   - Result: Dependencies installed, but `dist/` directories empty

4. **Dev Server Fails**
   - Runs `sfnext dev` command
   - Command not found: `dist/cli.js` doesn't exist
   - Error: "missing sfnext CLI, dependency issues"

---

## Solution: Pre-Build on Host

### Why Pre-Build Works:

1. **Host machines don't have Docker file limits**
   - macOS/Linux can handle thousands of open files
   - Build succeeds and creates `dist/` directories

2. **Volume mounts preserve built artifacts**
   - Host: `/Users/bfeister/dev/test-storefront/storefront-next/`
   - Container: `/workspace/storefront-next/`
   - Built `dist/` directories accessible in container

3. **Container uses pre-built packages**
   - No need to rebuild in Docker
   - Dev server finds `sfnext` CLI at expected path
   - Runtime libraries available for import

---

## Build Process

### Manual Build (Host):

```bash
cd /Users/bfeister/dev/test-storefront/storefront-next

# Build all packages recursively
pnpm -r build

# Verify builds
ls packages/storefront-next-dev/dist/cli.js        # sfnext CLI
ls packages/storefront-next-runtime/dist/scapi.js  # Runtime libs
ls packages/odyssey-mcp/dist/server.js             # MCP server
```

### Automated Build (Setup Script):

The `setup-storefront-dependencies.sh` script now includes:

```bash
# Step 1: Install dependencies
pnpm install --frozen-lockfile

# Step 2: Build monorepo packages (NEW!)
pnpm -r build

# Step 3: Verify critical files
if [ ! -f "packages/storefront-next-dev/dist/cli.js" ]; then
    echo "ERROR: sfnext CLI not built"
    exit 1
fi
```

---

## Verification Commands

### Check if packages are built:

```bash
# From workspace root
cd /Users/bfeister/dev/test-storefront/storefront-next

# Check storefront-next-dev (sfnext CLI)
test -f packages/storefront-next-dev/dist/cli.js && echo "✅ sfnext CLI" || echo "❌ sfnext CLI missing"

# Check storefront-next-runtime
test -f packages/storefront-next-runtime/dist/scapi.js && echo "✅ Runtime libs" || echo "❌ Runtime libs missing"

# Check odyssey-mcp
test -f packages/odyssey-mcp/dist/server.js && echo "✅ MCP server" || echo "❌ MCP server missing"

# Verify sfnext command is executable
packages/storefront-next-dev/dist/cli.js --help
```

### Check in Docker container:

```bash
# Once container is running
docker exec -u node claude-migration-demo bash -c "
  cd /workspace/storefront-next && \
  ls -la packages/storefront-next-dev/dist/cli.js && \
  which sfnext || echo 'sfnext not in PATH (expected - uses pnpm bin)'
"
```

---

## Updated Workflow

### Before (Broken):

```
1. pnpm install (host)
2. Start Docker container
3. Container attempts pnpm install → builds fail
4. Run pnpm dev → sfnext not found ❌
```

### After (Fixed):

```
1. pnpm install (host)          ← Installs dependencies
2. pnpm -r build (host)         ← NEW: Builds all packages
3. Start Docker container       ← Mounts pre-built artifacts
4. Run pnpm dev → sfnext works ✅
```

---

## Next Steps

1. **Clean state**
   ```bash
   ./scripts/reset-migration-state.sh --log
   ```

2. **Run setup with pre-build**
   ```bash
   ./scripts/setup-storefront-dependencies.sh
   # This now runs: pnpm install + pnpm -r build
   ```

3. **Verify builds**
   ```bash
   ls storefront-next/packages/storefront-next-dev/dist/cli.js
   ls storefront-next/packages/storefront-next-runtime/dist/scapi.js
   ```

4. **Rebuild Docker image**
   ```bash
   docker build -f docker/Dockerfile -t claude-migration:latest .
   ```

5. **Run migration**
   ```bash
   ./scripts/demo-migration-loop.sh
   ```

---

## Key Takeaways

1. **storefront-next is a pnpm monorepo** with workspace dependencies
2. **template-retail-rsc-app depends on workspace packages** that must be built
3. **sfnext CLI comes from storefront-next-dev/dist/cli.js** (built from TypeScript)
4. **Docker file limits prevent in-container builds** on Mac
5. **Solution: Pre-build on host** before starting Docker container
6. **setup-storefront-dependencies.sh now handles this** automatically

---

**Status:** Ready to test with pre-built monorepo packages
