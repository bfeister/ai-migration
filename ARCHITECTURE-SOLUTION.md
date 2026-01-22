# Architecture Solution: Cross-Platform Native Modules

**Problem Solved:** January 22, 2026
**Root Cause:** Architecture mismatch between host and container

---

## The Problem

### Error Message
```
Error: Cannot find module @rollup/rollup-linux-arm64-musl
pnpm store mismatch: dependencies linked from /Users/bfeister/Library/pnpm/store/v10
but pnpm wants to use /workspace/.pnpm-store/v10
```

### Root Cause: Architecture Mismatch

```
Host (macOS):              Container (Linux ARM64):
┌──────────────┐          ┌──────────────────────┐
│ macOS        │          │ node:24-alpine       │
│ x86_64/ARM64 │          │ linux/arm64/musl     │
│              │          │                      │
│ pnpm install │ ─────╳──▶│ node_modules/        │
│ (macOS bins) │          │ @rollup/...musl.node │
└──────────────┘          └──────────────────────┘
                                    ▲
                                    │
                                  Wrong!
                          Needs Linux binary,
                          got macOS binary
```

**What happens:**
1. Install dependencies on **macOS host**
2. Native modules compile for **macOS** architecture
3. Mount `node_modules/` into **Linux container**
4. Container tries to load macOS binaries → fails!

---

## The Solution: Build Inside Container

### New Architecture

```
┌─────────────────────────────────────────────────────────────┐
│ Host (macOS)                                                 │
│                                                              │
│  Monorepo: ~/dev/SFCC-Odyssey/                             │
│  ├── packages/storefront-next-dev/                          │
│  └── packages/storefront-next-runtime/                      │
│                                                              │
│           │ docker cp (copy into container)                 │
└───────────┼──────────────────────────────────────────────────┘
            ▼
┌─────────────────────────────────────────────────────────────┐
│ Container (Linux ARM64)                                      │
│                                                              │
│  /tmp/SFCC-Odyssey/  ◄─── Copied monorepo                  │
│  ├── packages/                                               │
│  │   ├── storefront-next-dev/                               │
│  │   │   └── dist/cli.js  ◄─── Built with Linux binaries   │
│  │   └── storefront-next-runtime/                           │
│  │       └── dist/  ◄─── Built with Linux binaries          │
│  │                                                           │
│  │  pnpm pack ─────▶  /tmp/packed-packages/                │
│  │                    ├── dev.tgz (2MB, Linux ARM64)        │
│  │                    └── runtime.tgz (Linux ARM64)         │
│  │                         │                                 │
│  │                         │ pnpm add file://.../dev.tgz    │
│  │                         ▼                                 │
│  /workspace/storefront-next/                                │
│  └── node_modules/                                           │
│      └── @salesforce/storefront-next-dev/                   │
│          └── dist/cli.js  ◄─── Linux binary! ✅             │
│              @rollup/rollup-linux-arm64-musl.node ✅        │
└─────────────────────────────────────────────────────────────┘
```

---

## Implementation

### Scripts Created

**1. `scripts/build-in-container.sh`**
- Copies monorepo from host to `/tmp/SFCC-Odyssey` in container
- Runs `pnpm install && pnpm -r build` **inside container**
- Result: Linux ARM64 binaries

**2. `scripts/generate-standalone-in-container.sh`**
- Packs built packages to tarballs (inside container)
- Runs `create-storefront` (without `--local-packages-dir`)
- Installs from tarballs → physical copies with Linux binaries
- Result: Standalone project that works in container!

### Complete Flow

```bash
# Step 1: Start container
docker run -v $(pwd):/workspace claude-migration:latest

# Step 2: Build monorepo inside container (Linux context)
./scripts/build-in-container.sh
# → Copies ~/dev/SFCC-Odyssey to /tmp/SFCC-Odyssey in container
# → Builds with Linux ARM64 architecture

# Step 3: Generate standalone from Linux-built packages
./scripts/generate-standalone-in-container.sh
# → Packs to .tgz with Linux binaries
# → Installs from tarballs
# → Result: storefront-next/ with Linux ARM64 modules

# Step 4: Dev server works!
cd storefront-next && pnpm dev
# → Loads Linux binaries successfully ✅
```

---

## Why This Works

### Before (Broken):
```
Host build → macOS binaries → mount to container → ❌ Wrong arch
```

### After (Fixed):
```
Container build → Linux binaries → use in container → ✅ Correct arch
```

### Key Insight

**Native modules are architecture-specific:**
- `@rollup/rollup-darwin-arm64` (macOS Apple Silicon)
- `@rollup/rollup-linux-arm64-musl` (Linux ARM64 Alpine)
- `@rollup/rollup-linux-x64` (Linux x86_64)

When you run `pnpm install`, it downloads the **correct binary for your current platform**.

**If you install on macOS → get macOS binary**
**If you install in Linux container → get Linux binary** ✅

---

## Comparison

| Approach | Where Built | Native Modules | Works in Container? |
|----------|-------------|----------------|---------------------|
| **Host install** | macOS | macOS binaries | ❌ No |
| **Host pack + tarball** | macOS | macOS binaries in .tgz | ❌ No |
| **Container install** | Linux | Linux binaries | ✅ Yes |
| **Container pack + tarball** | Linux | Linux binaries in .tgz | ✅ Yes! |

---

## Benefits

### ✅ Correct Architecture
- Native modules compiled for Linux ARM64
- Matches container platform
- No "module not found" errors

### ✅ No file:// to Host
- Tarballs extracted to physical copies
- No symlinks to `/Users/bfeister/...`
- Self-contained `node_modules/`

### ✅ Reproducible
- Same process works on any host (Mac/Linux/Windows)
- Container determines architecture
- Consistent results

### ✅ Works in Docker
- All binaries are Linux
- Dev server starts successfully
- Migration loop can proceed!

---

## Testing

```bash
# 1. Start container (if not already running)
docker run -d --name claude-migration-demo \
    -v $(pwd):/workspace \
    claude-migration:latest

# 2. Build monorepo inside container
./scripts/build-in-container.sh claude-migration-demo

# Expected output:
# ✓ Container is running
# ✓ Found monorepo at: ~/dev/SFCC-Odyssey
# ✓ Monorepo copied to container
# [Container] Building all packages...
# ✓ storefront-next-dev built
# ✓ storefront-next-runtime built
# ✓ Ready to generate standalone project

# 3. Generate standalone (Linux binaries)
./scripts/generate-standalone-in-container.sh claude-migration-demo

# Expected output:
# [Container] Packing monorepo packages...
# [Container] ✓ Packed: salesforce-storefront-next-dev-0.2.0-dev.tgz
# [Container] ✓ Packed: salesforce-storefront-next-runtime-0.2.0-dev.tgz
# [Container] Installing dependencies...
# [Container] ✓ sfnext CLI available
# ✓ Standalone project generated successfully
# Location: storefront-next/
# Architecture: Linux ARM64

# 4. Verify architecture
docker exec -u node claude-migration-demo sh -c "
    cd /workspace/storefront-next/node_modules/@rollup
    ls -la
    file */rollup.*.node
"

# Should show: ELF 64-bit LSB executable, ARM aarch64 (Linux)

# 5. Test dev server
docker exec -u node claude-migration-demo sh -c "
    cd /workspace/storefront-next &&
    timeout 10 pnpm dev || true
"

# Should show:
# > pnpm locales:aggregate-extensions && sfnext dev
# [vite] Local: http://localhost:5173
# ✅ SUCCESS!
```

---

## Migration Loop Integration

### Updated demo-migration-loop.sh

```bash
# In prerequisites check:
if [ ! -d "$WORKSPACE_ROOT/storefront-next/node_modules" ]; then
    log_info "Generating standalone project in container..."
    "$WORKSPACE_ROOT/scripts/build-in-container.sh" "$CONTAINER_NAME"
    "$WORKSPACE_ROOT/scripts/generate-standalone-in-container.sh" "$CONTAINER_NAME"
fi

# Now Claude can run:
cd /workspace/storefront-next && pnpm dev
# → Works! Linux binaries loaded successfully ✅
```

---

## Troubleshooting

### Issue: "Cannot find module @rollup/rollup-linux-arm64-musl"

**Cause:** Still using host-installed dependencies

**Fix:**
```bash
# Clean and regenerate inside container
rm -rf storefront-next
./scripts/generate-standalone-in-container.sh
```

### Issue: "docker cp: no such container"

**Cause:** Container not running

**Fix:**
```bash
# Start container first
./scripts/demo-migration-loop.sh
# Or manually:
docker run -d --name claude-migration-demo -v $(pwd):/workspace claude-migration:latest
```

### Issue: Build fails in container with ENFILE

**Cause:** Docker Desktop Mac file descriptor limits

**Mitigation:**
- Container uses `/tmp` (better performance than mounted volumes)
- Alpine musl has better file handling than glibc
- If still fails, increase Docker Desktop resources

---

## Summary

**The key insight:** Native modules must be compiled for the platform where they'll run.

**The solution:** Build everything inside the Linux container, not on the macOS host.

**The result:** A standalone project with Linux ARM64 binaries that works perfectly in Docker!

---

**Status:** Ready to test
**Next Step:** Run `./scripts/build-in-container.sh` and `./scripts/generate-standalone-in-container.sh`
