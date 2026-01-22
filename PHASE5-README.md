# Phase 5: Dependency Resolution & Dev Server Fixes

**Status:** 🟡 In Progress
**Date:** January 21-22, 2026

## Overview

Phase 5 addresses critical issues that blocked the migration loop from running: Docker file descriptor limits preventing builds, missing dependencies, and dev server startup failures. This phase evolved through multiple iterations to find a working solution.

---

## The Problem: Docker File Descriptor Limits

### Initial Symptom (Jan 21, ~16:00)
```
Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'commander'
```

Dev server couldn't start because dependencies were missing.

### Root Cause Discovery

**Issue 1: Docker `pnpm install` failures**
- Docker Desktop Mac has ~4096 file descriptor limit
- pnpm monorepo install opens 10,000+ files simultaneously
- Result: `ENFILE: file table overflow, scandir '/workspace/storefront-next/.pnpm-store'`

**Issue 2: Silent build failures**
- Monorepo packages have `"prepare": "pnpm build"` hooks
- Builds fail due to file limits during install
- pnpm continues, leaving `dist/` directories empty
- Missing `dist/cli.js` → sfnext CLI unavailable

**Issue 3: Missing dependencies in container**
- Host-installed dependencies have wrong ownership
- Container sees root-owned files → permission denied
- Dev server can't write to `.pnpm` cache

---

## Solutions Attempted & Results

### Attempt 1: Install Dependencies in Docker ❌

**Approach:** Let container run `pnpm install` during startup

**Result:** Failed - hit ENFILE errors, incomplete installs

**Duration:** ~2 hours debugging

---

### Attempt 2: Install on Host, Mount via Volume ⚠️

**Approach:**
1. Run `pnpm install` on host (macOS)
2. Mount `storefront-next/` into container
3. Use host-installed dependencies

**Issues:**
- Host dependencies owned by user (e.g., `bfeister`)
- Docker maps host user → root in container
- node user (uid=1000) can't write to root-owned `node_modules/.pnpm`

**Partial fix:** Pre-entrypoint script fixes ownership
```bash
if [ "$(stat -c '%u' /workspace/storefront-next/node_modules 2>/dev/null)" != "1000" ]; then
    chown -R 1000:1000 /workspace/storefront-next/node_modules
fi
```

**Result:** Improved, but still unreliable

**Duration:** ~3 hours, multiple iterations

---

### Attempt 3: Pre-Build Monorepo Packages ⚠️

**Approach:**
1. Run `pnpm -r build` on host (build all workspace packages)
2. Mount pre-built `dist/` directories
3. Container uses existing build artifacts

**Script created:** `scripts/setup-storefront-dependencies.sh`

**What it does:**
```bash
# Install dependencies (host)
pnpm install --frozen-lockfile

# Build all packages (host)
pnpm -r build

# Verify critical files
test -f packages/storefront-next-dev/dist/cli.js  # sfnext CLI
test -f packages/storefront-next-runtime/dist/scapi.js  # Runtime libs
```

**Issues:**
- Monorepo structure complex (workspace dependencies)
- `file://` paths in package.json point to host locations
- Container can't resolve `file:///Users/bfeister/...` paths

**Result:** Build works, but dependency resolution broken in container

**Duration:** ~4 hours

---

### Attempt 4: Standalone Project Generation ✅ (Current Solution)

**Approach:** Generate a standalone (non-monorepo) project from the monorepo

**How it works:**
1. Mount existing monorepo at `~/dev/SFCC-Odyssey` (read-only)
2. Use monorepo's `create-storefront` CLI (PR #696)
3. Generate standalone project with self-contained dependencies
4. Standalone project has normal npm dependencies (not `workspace:*`)
5. Dev server works immediately

**Implementation:**

**Script:** `scripts/generate-standalone-project.sh`
```bash
# Non-interactive generation
echo -e "A different template...\nfile://$MONOREPO_PATH/packages/template-retail-rsc-app" | \
    npx $MONOREPO_PATH/packages/storefront-next-dev create-storefront \
        --name storefront-next \
        --output /workspace/storefront-next
```

**Pre-entrypoint integration:**
```bash
# Check if standalone project exists
if [ ! -d "/workspace/storefront-next/node_modules/.bin/sfnext" ]; then
    echo "[INIT] Generating standalone storefront project..."
    /workspace/scripts/generate-standalone-project.sh
fi
```

**Result:** ✅ Works! Dev server starts successfully

**Duration:** ~2 hours to implement and test

---

## Current Architecture

### Monorepo vs Standalone

| Aspect | Monorepo | Standalone |
|--------|----------|------------|
| **Location** | `~/dev/SFCC-Odyssey` | `test-storefront/storefront-next/` |
| **Structure** | `packages/*` workspaces | Single project |
| **Dependencies** | `workspace:*` references | Normal npm versions |
| **node_modules** | Shared via pnpm | Self-contained |
| **sfnext CLI** | `packages/.../dist/cli.js` | `node_modules/.bin/sfnext` |
| **Build required** | Yes (TypeScript → JS) | No (prebuilt) |
| **Docker issues** | File limits on build | None |
| **Usage** | Source of truth | Generated for migration |

### Directory Structure

```
/Users/bfeister/dev/
├── test-storefront/                          # Migration workspace
│   ├── docker/
│   │   ├── Dockerfile
│   │   ├── pre-entrypoint.sh                 # Generates standalone
│   │   └── entrypoint.sh                     # Runs migration loop
│   ├── scripts/
│   │   ├── demo-migration-loop.sh            # Main automation
│   │   ├── generate-standalone-project.sh    # Standalone generator
│   │   ├── setup-storefront-dependencies.sh  # (legacy, optional)
│   │   └── reset-migration-state.sh          # Clean slate
│   ├── storefront-next/                      # Generated standalone
│   │   ├── package.json                      # Normal dependencies
│   │   ├── node_modules/                     # Self-contained
│   │   │   └── .bin/sfnext                   # Ready to use
│   │   └── src/                              # App code
│   ├── migration-main-plan.md
│   ├── migration-log.md                      # Generated by inner loop
│   └── screenshots/                          # Visual artifacts
│
└── SFCC-Odyssey/                             # Your monorepo (source)
    ├── packages/
    │   ├── storefront-next-dev/              # CLI + tools
    │   ├── storefront-next-runtime/          # Runtime libs
    │   └── template-retail-rsc-app/          # Template
    └── node_modules/                         # Monorepo deps
```

**Docker Mounts:**
```bash
-v ~/dev/test-storefront:/workspace                      # Main workspace
-v ~/dev/SFCC-Odyssey:/workspace-host/dev/SFCC-Odyssey   # Monorepo (read-only)
```

---

## What's Working Now

### ✅ Automated Workflow

**Script:** `./scripts/demo-migration-loop.sh`

**Steps:**
1. **Prerequisites check**
   - Docker installed
   - .env file exists
   - Monorepo available at `~/dev/SFCC-Odyssey`
   - Migration plan exists

2. **Monorepo preparation** (if needed)
   - Checks if monorepo packages built
   - Runs `pnpm install && pnpm -r build` if needed
   - Verifies `create-storefront` CLI available

3. **Standalone generation** (if needed)
   - Container pre-entrypoint checks for existing project
   - Generates standalone if missing
   - Fixes ownership to node user

4. **Container startup**
   - Builds Docker image if needed
   - Mounts workspace + monorepo
   - Runs pre-entrypoint as root → switches to node user

5. **Migration loop**
   - Claude Code executes micro-plans
   - Dev server starts successfully
   - Screenshots captured
   - Progress logged

### ✅ Dev Server Startup

```bash
# Inside container
cd /workspace/storefront-next
pnpm dev

# Output:
> template-retail-rsc-app@... dev
> pnpm locales:aggregate-extensions && sfnext dev

✨ Extension locale generation complete!
[vite] Local: http://localhost:5173
```

### ✅ Environment Configuration

**Automatic .env setup** in `docker/entrypoint.sh`:
```bash
if [ ! -f "$APP_DIR/.env" ] && [ -f "$APP_DIR/.env.default" ]; then
    cp "$APP_DIR/.env.default" "$APP_DIR/.env"
fi
```

---

## What's Still Broken

### ❌ Inner Loop Blocker (Current Issue - Jan 22)

**Status:** Migration loop blocked on subplan-01-02

**Error:**
```
EACCES: permission denied, mkdir '/workspace/storefront-next/node_modules/.pnpm'
```

**From migration-log.md:**
```markdown
## [2026-01-22 19:07:15] subplan-01-02: BLOCKED - Dependency Issue
**Status:** ❌ Blocked - Critical dependency/environment issue
**Root Cause:** Dev server fails with: `Cannot find module @rollup/rollup-linux-arm64-musl`
**Environment Issue:** storefront-next/package.json has file:// dependencies pointing to host machine
**Missing Monorepo:** `/workspace-host/dev/SFCC-Odyssey/` does not exist in container
```

**Analysis:**
1. Standalone project may not have been generated properly
2. OR container wasn't started with monorepo volume mount
3. Dev server seeing old package.json with `file://` references

**Resolution needed:**
1. Verify demo-migration-loop.sh mounts monorepo at correct path
2. Ensure pre-entrypoint generates fresh standalone project
3. Test dev server startup before Claude Code execution

### ⚠️ Production Build Validation

**Decision:** Skip production builds entirely for Phase 4-5

**Rationale:**
- `pnpm build` still hits Docker file limits
- Dev mode (`pnpm dev`) provides sufficient validation
- Incremental compilation catches most errors
- Visual screenshots are primary validation method

**Updated migration-main-plan.md:**
```markdown
### 5. Dev Server Startup & Screenshot Capture

**IMPORTANT: Skip production build validation** due to Docker file
descriptor limits on Mac. Instead, use `pnpm dev` (development mode)
which performs incremental builds and provides sufficient validation
for visual migration.
```

---

## Files Created/Modified

### New Files (Phase 5)

**Scripts:**
- `scripts/setup-storefront-dependencies.sh` (245 lines) - Host dependency installer (legacy)
- `scripts/generate-standalone-project.sh` (185 lines) - Standalone project generator
- `scripts/prepare-standalone-storefront.sh` (150 lines) - Cleanup helper
- `scripts/reset-migration-state.sh` (120 lines) - Clean slate for testing
- `scripts/observe-claude.sh` (95 lines) - Real-time monitoring
- `scripts/demo-migration-loop.sh` (425 lines) - Complete automation

**Documentation:**
- `FIX-SUMMARY.md` (227 lines) - Fix documentation (consolidated here)
- `LEARNINGS.md` (288 lines) - Lessons learned (consolidated here)
- `STATUS.md` (449 lines) - Status snapshot (consolidated here)
- `MONOREPO-DEPENDENCIES.md` (326 lines) - Dependency explanation (consolidated here)
- `STANDALONE-GENERATION.md` (315 lines) - Standalone approach (consolidated here)

### Modified Files

**Docker:**
- `docker/Dockerfile` - Added pre-entrypoint, su-exec, Playwright
- `docker/pre-entrypoint.sh` - Permission fixes, standalone generation
- `docker/entrypoint.sh` - .env setup, dependency checks

**Plans:**
- `migration-main-plan.md` - Removed build validation, use dev mode only

**Git:**
- `.gitignore` - Keep screenshots/, track migration-log.md

---

## Lessons Learned

### What Worked Well

1. **Host-based monorepo building** - Avoids Docker file limits
2. **Standalone project generation** - Eliminates workspace dependency complexity
3. **Pre-entrypoint permission fixes** - Elegant multi-user Docker solution
4. **Automated demo script** - One command to run everything
5. **Real-time monitoring** - observe-claude.sh provides good visibility

### What Was Challenging

1. **Docker Desktop Mac constraints** - File descriptor limits hard to diagnose
2. **pnpm workspace complexity** - Monorepo structure unfamiliar territory
3. **Volume mount permissions** - Host user → root mapping confusing
4. **Silent failures** - Builds fail without obvious errors
5. **Iteration time** - Rebuild + restart takes 2-3 minutes per test

### What to Improve

1. **Better pre-flight checks** - Verify monorepo mount before starting loop
2. **Faster iteration** - Cache Docker layers more aggressively
3. **Error messages** - Detect common issues and suggest fixes
4. **Testing on Linux** - Eliminate Docker Desktop Mac limitations
5. **Visual diff automation** - Compare screenshots programmatically

---

## Key Technical Decisions

### Decision 1: Skip Production Builds

**Context:** Docker file limits block `pnpm build`

**Options considered:**
- Build in container (doesn't work)
- Build on host, mount artifacts (complex)
- Skip builds entirely (chosen)

**Rationale:**
- Dev mode incremental builds catch most errors
- Visual screenshots are primary validation
- Can do production build once at end
- Unblocks migration loop progress

### Decision 2: Use Standalone Project

**Context:** Monorepo workspace dependencies don't resolve in container

**Options considered:**
- Fix workspace resolution (too complex)
- Pre-build all packages (still has path issues)
- Generate standalone project (chosen)

**Rationale:**
- Standalone has normal npm dependencies
- Self-contained node_modules
- No workspace path resolution needed
- Generated from same template (code identical)

### Decision 3: Mount Monorepo Read-Only

**Context:** Need monorepo for standalone generation

**Options considered:**
- Copy monorepo into container (slow, large)
- Mount read-write (risky)
- Mount read-only (chosen)

**Rationale:**
- Read-only prevents accidental changes
- Host monorepo remains source of truth
- Fast (no copying)
- Can regenerate standalone anytime

---

## Current Status (Jan 22, 12:00)

### Completed

- ✅ Phase 0-4 infrastructure complete
- ✅ Standalone generation implemented
- ✅ Automated demo script working
- ✅ Subplan-01-01 executed successfully (analysis)
- ✅ Documentation consolidated

### In Progress

- 🟡 Subplan-01-02 blocked (dependency/environment issue)
- 🟡 Debugging container volume mounts
- 🟡 Verifying standalone project generation

### Blocked

- ❌ Can't proceed with remaining micro-plans until dev server works
- ❌ Missing monorepo mount in container
- ❌ OR standalone project not generated properly

---

## Next Steps

### Immediate (Today)

1. **Debug current blocker**
   - Check demo-migration-loop.sh volume mounts
   - Verify monorepo mounted at `/workspace-host/dev/SFCC-Odyssey`
   - Test standalone generation manually
   - Confirm dev server starts

2. **Resume migration loop**
   - Fix blocker
   - Complete subplan-01-02 through 01-06
   - Capture all screenshots
   - Verify git commits

3. **Document completion**
   - Phase 5 completion summary
   - Screenshot comparison analysis
   - Time/cost metrics

### Short-term (Next Week)

1. **Phase 6: Multi-Feature Execution**
   - Create micro-plans for features 02-05
   - Test URL mapping switches
   - Validate screenshot capture across pages

2. **Phase 7: Optimization & Automation**
   - Visual diff automation
   - CI/CD workflow (GitHub Actions)
   - External user testing

### Long-term (Next Month)

1. **Production Readiness**
   - Test on Linux Docker (no Desktop Mac limits)
   - Implement error recovery
   - Add monitoring/metrics
   - Complete documentation

---

## Success Metrics

### Progress

- **Phases complete:** 4.5 / 7 (64%)
- **Micro-plans complete:** 1 / 6 homepage (17%)
- **Time invested:** ~15 hours total
  - Phase 0-2: ~8 hours (Docker, MCP, permissions)
  - Phase 3: ~3 hours (Playwright, screenshots)
  - Phase 4-5: ~4 hours (dependencies, debugging)

### Quality

- **Automation:** 90% automated (one-click demo script)
- **Documentation:** Comprehensive (6 PHASE docs)
- **Reproducibility:** High (reset script works reliably)
- **Reliability:** 60% (inner loop blocked, outer loop stable)

### Performance

- **Setup time:** ~5 minutes (first run, includes monorepo build)
- **Iteration time:** ~2-5 minutes per micro-plan (when working)
- **Screenshot capture:** ~10-15 seconds per dual capture
- **Container startup:** ~30 seconds

---

## Help Needed

### If Current Blocker Persists

**Diagnostic commands:**
```bash
# Check container mounts
docker inspect claude-migration-demo | grep -A 10 Mounts

# Check monorepo accessibility
docker exec -u node claude-migration-demo ls /workspace-host/dev/SFCC-Odyssey

# Check standalone project structure
docker exec -u node claude-migration-demo ls -la /workspace/storefront-next/node_modules/.bin/

# Test dev server manually
docker exec -u node claude-migration-demo bash -c "cd /workspace/storefront-next && pnpm dev"
```

### Alternative Approaches

1. **Skip Docker entirely** - Run migration loop on host (faster for debugging)
2. **Use Linux VM** - Eliminate Docker Desktop Mac limitations
3. **Pre-built container** - Commit working standalone project to image
4. **Simplify validation** - Accept limited testing, validate manually

---

## Resources

### Scripts

- `./scripts/demo-migration-loop.sh` - Full automation
- `./scripts/generate-standalone-project.sh` - Standalone generation
- `./scripts/reset-migration-state.sh` - Clean slate
- `./scripts/observe-claude.sh` - Monitor progress

### Documentation

- `DEMO-QUICKSTART.md` - Quick start guide
- `PHASE0-README.md` through `PHASE4-README.md` - Previous phases
- `migration-main-plan.md` - Inner loop control logic
- `url-mappings.json` - Screenshot configuration

### External

- PR #696: `create-storefront` standalone generation
- Docker Desktop Mac file limits: https://github.com/docker/for-mac/issues/6076
- pnpm monorepo docs: https://pnpm.io/workspaces

---

**Last Updated:** 2026-01-22T12:00:00Z
**Status:** Phase 5 in progress, blocked on dependency resolution
**Next Action:** Debug monorepo mount and standalone generation
**Estimated Resolution:** 1-2 hours
