# In-Container Build Integration

**Date:** January 22, 2026
**Status:** Ready to test
**Integration:** Complete

---

## Summary

Successfully integrated the in-container build approach into the main `demo-migration-loop.sh` script with dynamic dependency detection and validation.

## Changes Made

### 1. Main Script: `scripts/demo-migration-loop.sh`

#### Added `validate_file_dependencies()` Function (Line 130-198)
- **Purpose:** Validates that all monorepo dependencies exist before attempting to build
- **Features:**
  - Dynamically detects `workspace:*` dependencies (used in monorepo)
  - Dynamically detects `file://` dependencies (if any)
  - Resolves package paths and verifies they exist
  - Fails early with clear error message if packages are missing

```bash
# Example output:
[INFO] Validating workspace and file:// dependencies...
  ✓ @salesforce/storefront-next-dev (workspace:*) → /path/to/packages/storefront-next-dev
  ✓ @salesforce/storefront-next-runtime (workspace:*) → /path/to/packages/storefront-next-runtime
[✓] All dependencies validated
```

#### Updated `check_prerequisites()` Function (Line 178-270)
- Calls `validate_file_dependencies()` to check monorepo integrity
- Removed old host-based build and generation logic
- Added architecture verification check for existing `storefront-next/`
- Detects if existing project has wrong architecture (macOS binaries) and regenerates

#### Updated `start_container()` Function (Line 332-366)
- After container starts, checks if `storefront-next/` needs generation
- Calls `build-in-container.sh` to build monorepo with Linux binaries
- Calls `generate-standalone-in-container.sh` to create standalone project
- Result: Standalone project with correct Linux ARM64 native modules

### 2. Generation Script: `scripts/generate-standalone-in-container.sh`

#### Updated to Handle Both `workspace:*` and `file://` Dependencies
- Detects both dependency types dynamically from `package.json`
- For `workspace:*`: Resolves package name to monorepo packages/ directory
  - Example: `@salesforce/storefront-next-dev` → `/tmp/SFCC-Odyssey/packages/storefront-next-dev`
- For `file://`: Resolves relative path from template directory
- Packs each dependency to tarball with Linux binaries
- Cleans both dependency types from generated project
- Installs from tarballs

### 3. Test Script: `scripts/test-detect-file-deps.sh`

#### Updated to Handle Both Dependency Types
- Shows all dependencies in template
- Highlights which are `workspace:*` or `file://`
- Validates each can be resolved to actual package directory
- Shows package version from resolved `package.json`

---

## How It Works

### Complete Flow

```
1. User runs: ./scripts/demo-migration-loop.sh

2. check_prerequisites():
   ├─ Validate monorepo exists
   ├─ Call validate_file_dependencies()
   │  ├─ Parse template package.json
   │  ├─ Find workspace:* dependencies
   │  ├─ Find file:// dependencies
   │  ├─ Resolve each to actual package path
   │  └─ Verify package.json exists
   └─ Check if standalone project exists

3. start_container():
   ├─ Start Docker container
   ├─ If storefront-next/ doesn't exist:
   │  ├─ Run build-in-container.sh
   │  │  ├─ Copy monorepo to /tmp/SFCC-Odyssey
   │  │  └─ Run pnpm install && pnpm -r build (Linux context!)
   │  └─ Run generate-standalone-in-container.sh
   │     ├─ Detect workspace:* dependencies
   │     ├─ Pack each to .tgz (Linux binaries!)
   │     ├─ Run create-storefront
   │     ├─ Clean workspace:* deps from package.json
   │     └─ Install from tarballs
   └─ Result: storefront-next/ with Linux ARM64 binaries ✅

4. launch_migration_loop():
   └─ Claude can run: cd storefront-next && pnpm dev
      └─ Works! Correct architecture! ✅
```

---

## Key Features

### ✅ Dynamic Detection
- No hardcoded package names
- Automatically discovers all `workspace:*` dependencies
- Automatically discovers all `file://` dependencies
- Adapts to changes in monorepo structure

### ✅ Architecture Validation
- Checks if existing project has correct binaries
- Regenerates if wrong architecture detected
- Ensures Linux ARM64 for Docker environment

### ✅ Early Failure
- Validates dependencies exist before starting container
- Clear error messages if packages missing
- Saves time by catching issues early

### ✅ Self-Documenting
- Test script shows exactly what will be detected
- Colored output for easy visual scanning
- Version information for troubleshooting

---

## Testing

### Test Dependency Detection

```bash
./scripts/test-detect-file-deps.sh
```

Expected output:
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Testing Dynamic workspace:* and file:// Dependency Detection
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✓ Found template: /path/to/monorepo/template-retail-rsc-app/package.json

All dependencies in template:
─────────────────────────────────────────────────────────────
  📁 @salesforce/storefront-next-dev: workspace:*
  📁 @salesforce/storefront-next-runtime: workspace:*
  📦 react: 19.2.3
  📦 react-dom: 19.2.3
  ...

Total: 91 dependencies

Detected workspace:* and file:// dependencies:
─────────────────────────────────────────────────────────────
  ✓ @salesforce/storefront-next-dev
     Version: workspace:*
     Resolved: /path/to/packages/storefront-next-dev
     Package version: 0.2.0-dev

  ✓ @salesforce/storefront-next-runtime
     Version: workspace:*
     Resolved: /path/to/packages/storefront-next-runtime
     Package version: 0.2.0-dev
```

### Test Full Integration

```bash
# Clean slate
rm -rf storefront-next

# Run main script
./scripts/demo-migration-loop.sh
```

Expected behavior:
1. Validates dependencies (should find 2 workspace:* deps)
2. Starts container
3. Detects `storefront-next/` doesn't exist
4. Builds monorepo in container (Linux context)
5. Generates standalone project from Linux-built packages
6. Launches Claude Code migration loop
7. Dev server starts successfully

---

## Differences from Previous Approach

| Aspect | Old Approach | New Approach |
|--------|-------------|--------------|
| **Build location** | Host (macOS) | Container (Linux) |
| **Dependency detection** | Hardcoded package names | Dynamic from package.json |
| **Dependency types** | Only `file://` | Both `workspace:*` and `file://` |
| **Validation** | None | Pre-flight check before starting |
| **Architecture** | macOS binaries → ❌ | Linux binaries → ✅ |
| **Error handling** | Fail during dev server | Fail early with clear message |

---

## Files Modified

1. **scripts/demo-migration-loop.sh**
   - Added `validate_file_dependencies()` function
   - Updated `check_prerequisites()` to use validation
   - Updated `start_container()` to build in container

2. **scripts/generate-standalone-in-container.sh**
   - Updated to detect both `workspace:*` and `file://`
   - Dynamic package resolution
   - Handles both dependency types uniformly

3. **scripts/test-detect-file-deps.sh**
   - Updated to show both dependency types
   - Enhanced output formatting
   - Shows resolved paths and versions

4. **scripts/build-in-container.sh**
   - No changes (already dynamic)

---

## Current Status

**✅ All scripts updated and tested**
**✅ Dynamic detection working correctly**
**✅ Validation finds both workspace:* dependencies**
**⏳ Ready for full integration test with running container**

---

## Next Steps

1. **Clean environment:** `rm -rf storefront-next`
2. **Run integration test:** `./scripts/demo-migration-loop.sh`
3. **Verify:**
   - Dependency validation passes
   - Monorepo builds in container
   - Standalone project generated with Linux binaries
   - Dev server starts without errors
4. **Test migration loop:**
   - Claude can execute micro-plans
   - Screenshots captured successfully
   - Git commits created

---

## Troubleshooting

### Issue: "Template package.json not found"

**Cause:** Monorepo not at expected location

**Fix:**
```bash
export STOREFRONT_MONOREPO_PATH=/path/to/your/SFCC-Odyssey
./scripts/demo-migration-loop.sh
```

### Issue: "Package not found at: NOT_FOUND"

**Cause:** Monorepo package structure changed

**Fix:** Check package name resolution in validation function:
```bash
# For @salesforce/storefront-next-dev, we look in:
# $MONOREPO_PATH/packages/storefront-next-dev
#
# If actual path is different, update logic in validate_file_dependencies()
```

### Issue: "Some workspace/file dependencies are missing"

**Cause:** Monorepo packages not in expected locations

**Fix:** Manually verify packages exist:
```bash
ls -la ~/dev/SFCC-Odyssey/packages/storefront-next-dev
ls -la ~/dev/SFCC-Odyssey/packages/storefront-next-runtime
```

---

## Benefits of This Approach

1. **No manual package list maintenance:** Automatically discovers dependencies
2. **Adapts to monorepo changes:** Works even if packages are added/removed
3. **Catches errors early:** Validates before building anything
4. **Clear feedback:** Shows exactly what was found and where
5. **Correct architecture:** Builds in Linux container for Linux container
6. **Self-contained:** Generated project has all dependencies packaged
7. **Reproducible:** Same process works on any host platform

---

**Ready for testing!** 🚀
