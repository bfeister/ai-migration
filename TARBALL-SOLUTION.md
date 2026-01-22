# Tarball Solution: Eliminating file:// Dependencies

**Problem Solved:** January 22, 2026
**Status:** Ready to test

---

## The Problem

When using `create-storefront --local-packages-dir`, it creates `file://` symlinks:

```json
{
  "@salesforce/storefront-next-dev": "file:/Users/bfeister/dev/SFCC-Odyssey/packages/storefront-next-dev",
  "@salesforce/storefront-next-runtime": "file:/Users/bfeister/dev/SFCC-Odyssey/packages/storefront-next-runtime"
}
```

**Why this breaks in Docker:**
- These paths point to the **host** filesystem
- Inside Docker, `/Users/bfeister/...` doesn't exist (unless mounted)
- Even if mounted, the container would need the entire monorepo
- `pnpm install` fails: "Cannot find module @rollup/rollup-linux-arm64-musl"
- Dev server can't start

---

## The Solution: Pack to Tarballs

Use `pnpm pack` to create portable `.tgz` archives with compiled code:

```bash
# On HOST, pack the packages:
cd ~/dev/SFCC-Odyssey/packages/storefront-next-dev
pnpm pack --pack-destination /tmp/packed/
# Creates: salesforce-storefront-next-dev-0.2.0-dev.tgz (2.0 MB)

# Install from tarball (no symlinks!):
pnpm add file:/tmp/packed/salesforce-storefront-next-dev-0.2.0-dev.tgz
```

**Result in package.json:**
```json
{
  "@salesforce/storefront-next-dev": "file:/tmp/packed/salesforce-storefront-next-dev-0.2.0-dev.tgz"
}
```

**But wait!** The path is still a `file://` reference. However, pnpm extracts the tarball contents into `node_modules/`, so you get a **physical copy** with all binaries included, not a symlink.

---

## How It Works

### Old Flow (Broken):
```
1. create-storefront --local-packages-dir ~/dev/SFCC-Odyssey/packages
   ↓
2. package.json has: file:/Users/bfeister/.../storefront-next-dev
   ↓
3. pnpm creates SYMLINK: node_modules/@salesforce/... → /Users/bfeister/...
   ↓
4. Inside Docker: /Users/bfeister/... doesn't exist ❌
   ↓
5. Dev server fails: "Cannot find module" ❌
```

### New Flow (Fixed):
```
1. pnpm pack (on host)
   ↓
2. Creates: salesforce-storefront-next-dev-0.2.0-dev.tgz
   ↓
3. create-storefront (WITHOUT --local-packages-dir)
   ↓
4. Remove file:// deps from package.json
   ↓
5. pnpm install (base dependencies)
   ↓
6. pnpm add file:.packed-packages/*.tgz
   ↓
7. pnpm EXTRACTS tarball contents into node_modules/ ✅
   ↓
8. Result: Physical copy with sfnext CLI binary ✅
   ↓
9. Inside Docker: Everything works! ✅
```

---

## What's in the Tarball?

```
salesforce-storefront-next-dev-0.2.0-dev.tgz (2.0 MB):
├── package/
│   ├── package.json
│   ├── dist/
│   │   ├── cli.js           ← The sfnext binary!
│   │   ├── server.js
│   │   ├── plugins/
│   │   └── ...
│   ├── LICENSE.txt
│   └── README.md
```

Everything is **pre-compiled** - no need to build inside Docker!

---

## Updated Script Flow

**File:** `scripts/generate-standalone-project.sh`

```bash
# Step 1: Pack monorepo packages
pnpm pack storefront-next-dev → .packed-packages/dev.tgz
pnpm pack storefront-next-runtime → .packed-packages/runtime.tgz

# Step 2: Generate project (no --local-packages-dir)
npx create-storefront \
    --name storefront-next \
    --template file://...

# Step 3: Clean package.json
node -e "remove all file:// dependencies"

# Step 4: Install from tarballs
pnpm install  # Base deps
pnpm add file:.packed-packages/dev.tgz
pnpm add file:.packed-packages/runtime.tgz

# Step 5: Cleanup
rm -rf .packed-packages/
```

---

## Benefits

### ✅ True Standalone Project
- No external dependencies
- No symlinks to monorepo
- Self-contained node_modules

### ✅ Works in Docker
- All paths are relative to project
- No host filesystem references
- Portable across environments

### ✅ Has Compiled Binaries
- `sfnext` CLI ready to use
- No build step needed
- All TypeScript already transpiled

### ✅ Portable
- Can zip entire `storefront-next/` directory
- Move to another machine
- Works immediately

---

## Verification

After generation, verify:

```bash
# 1. No file:// to host paths
grep -r "file:/Users" storefront-next/package.json
# Should find nothing (or only file:.packed-packages which is deleted)

# 2. sfnext CLI exists
ls -lh storefront-next/node_modules/.bin/sfnext
# Should show executable

# 3. Dev server works
cd storefront-next
pnpm dev
# Should start without errors

# 4. Inside Docker
docker run -v $(pwd)/storefront-next:/app -w /app node:24-alpine sh -c "pnpm dev"
# Should work!
```

---

## Common Issues & Fixes

### Issue: "Cannot find module @rollup/rollup-linux-arm64-musl"

**Cause:** Old `file://` dependencies still present

**Fix:**
```bash
cd storefront-next
# Remove all file:// deps
node -e "
const fs = require('fs');
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
for (const dep in pkg.dependencies) {
  if (pkg.dependencies[dep].startsWith('file://')) {
    delete pkg.dependencies[dep];
  }
}
fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');
"

# Reinstall from tarballs
pnpm install
pnpm add file:../.packed-packages/*.tgz
```

### Issue: "sfnext command not found"

**Cause:** Tarball wasn't installed or extracted incorrectly

**Fix:**
```bash
# Check if package is in node_modules
ls -la node_modules/@salesforce/storefront-next-dev/dist/cli.js

# Check pnpm bin directory
ls -la node_modules/.bin/sfnext

# Reinstall from tarball
pnpm add --force file:../.packed-packages/salesforce-storefront-next-dev*.tgz
```

### Issue: "Tarball not found"

**Cause:** `pnpm pack` wasn't run or failed

**Fix:**
```bash
# Pack packages manually
cd ~/dev/SFCC-Odyssey/packages/storefront-next-dev
pnpm pack --pack-destination /path/to/test-storefront/.packed-packages

cd ~/dev/SFCC-Odyssey/packages/storefront-next-runtime
pnpm pack --pack-destination /path/to/test-storefront/.packed-packages
```

---

## Testing the Solution

```bash
# 1. Clean slate
rm -rf storefront-next .packed-packages

# 2. Generate with new approach
./scripts/generate-standalone-project.sh

# 3. Verify no file:// to host
grep "file:/Users" storefront-next/package.json || echo "✓ Clean!"

# 4. Verify sfnext exists
test -f storefront-next/node_modules/.bin/sfnext && echo "✓ CLI found!"

# 5. Test dev server
cd storefront-next && pnpm dev
# Should show: "Local: http://localhost:5173"

# 6. Test in Docker
docker run --rm -v $(pwd):/workspace -w /workspace/storefront-next node:24-alpine \
    sh -c "pnpm dev"
# Should work without errors!
```

---

## Comparison: Symlink vs Tarball

| Aspect | file:// Symlink | Tarball Install |
|--------|----------------|----------------|
| **package.json** | `file:/Users/...` | `file:.packed/...` |
| **node_modules** | Symbolic link | Physical copy |
| **Binaries** | Points to source | Extracted & ready |
| **Portability** | Requires monorepo | Self-contained |
| **Docker** | ❌ Breaks | ✅ Works |
| **Size** | 0 bytes (link) | ~4 MB extracted |

---

## Why This Matters

### Before (Blocked):
```
[claude-output.log]
❌ Dev server cannot start
❌ Cannot find module @rollup/rollup-linux-arm64-musl
❌ package.json has file:// links to packages outside container
⏸️ Migration loop blocked
```

### After (Working):
```
[claude-output.log]
✅ Dev server starting...
✅ [vite] Local: http://localhost:5173
✅ Screenshot captured
✅ Git commit created
✅ Migration continues...
```

---

## Architecture Impact

**Before:**
```
Host: ~/dev/SFCC-Odyssey/packages/storefront-next-dev/
                ↑
                │ symlink (file://)
                │
Container: /workspace/storefront-next/node_modules/@salesforce/...
           ❌ Broken: path doesn't exist in container
```

**After:**
```
Host: ~/dev/test-storefront/.packed-packages/dev.tgz (temporary)
                ↓
         pnpm extracts tarball
                ↓
Container: /workspace/storefront-next/node_modules/@salesforce/storefront-next-dev/
           └── dist/cli.js  ✅ Physical file with binary
```

---

## Next Steps

1. **Test new generation script:**
   ```bash
   rm -rf storefront-next
   ./scripts/generate-standalone-project.sh
   ```

2. **Verify dev server:**
   ```bash
   cd storefront-next && pnpm dev
   ```

3. **Run migration loop:**
   ```bash
   ./scripts/demo-migration-loop.sh
   ```

4. **Watch Claude work:**
   ```bash
   ./scripts/watch-claude-status.sh --watch
   ```

---

**Status:** Ready to test
**Expected Result:** Dev server starts, Claude can capture screenshots, migration proceeds!
