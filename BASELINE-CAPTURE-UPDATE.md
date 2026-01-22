# Baseline Screenshot Capture Update

**Date:** January 22, 2026
**Status:** Complete
**Change:** Removed assumption of pre-existing baseline screenshot directory

---

## Summary

Updated all documentation and scripts to reflect that the baseline SFRA homepage screenshot is captured during the first micro-plan (subplan-01-01) execution, rather than being a pre-existing file in a `baseline/` directory.

## Why This Change?

**Before:** The project assumed a baseline screenshot existed in `screenshots/baseline/` before starting the migration loop.

**After:** The first micro-plan captures the baseline screenshot dynamically at runtime, making the process more automated and easier to restart from scratch.

## Benefits

1. **Easier fresh starts:** No need to manually capture or preserve baseline screenshots
2. **More automated:** First task captures what it needs
3. **Cleaner directory structure:** No nested `baseline/` subdirectory
4. **Self-documenting:** Subplan-01-01 clearly shows it captures the baseline
5. **Simpler reset:** `--screenshots` flag deletes everything without special cases

---

## Files Modified

### 1. **scripts/reset-migration-state.sh**
**Changes:**
- Removed logic that excluded `baseline/` directory from deletion
- `--screenshots` flag now deletes **all** screenshots
- Updated help text to reflect this behavior

**Before:**
```bash
find "$SCREENSHOTS_DIR" -name "*.png" ! -path "*/baseline/*" -type f -delete
log_success "Deleted $SCREENSHOT_COUNT screenshots (kept baseline)"
```

**After:**
```bash
find "$SCREENSHOTS_DIR" -name "*.png" -type f -delete
log_success "Deleted $SCREENSHOT_COUNT screenshots"
```

### 2. **sub-plans/01-homepage-content/subplan-01-01.md**
**Changes:**
- Title changed from "Analyze SFRA Homepage Baseline" to "Capture and Analyze SFRA Homepage"
- Added Task 1: Capture SFRA homepage screenshot using Playwright
- Added Task 2: Analyze the captured screenshot
- Updated validation criteria to include screenshot capture
- Removed assumption of pre-existing baseline file

**New Tasks:**
1. **Capture Screenshot** - Use Playwright to visit SFRA homepage and save `screenshots/sfra-homepage-baseline.png`
2. **Analyze Screenshot** - Document hero section, featured products, layout details

**Expected Duration:** Increased from ~2-3 minutes to ~3-5 minutes (includes capture time)

### 3. **screenshots/README.md**
**Changes:**
- Updated directory structure diagram (removed `baseline/` subdirectory)
- Changed "Baseline Screenshots" section to explain capture happens during subplan-01-01
- Updated file location from `baseline/sfra-homepage-baseline.png` to `sfra-homepage-baseline.png`

**Directory Structure:**
```
screenshots/
├── sfra-homepage-baseline.png                    # Captured during subplan-01-01
├── test/                                         # Test screenshots
└── {timestamp}-{subplan-id}-{source|target}.png  # Iteration screenshots
```

### 4. **DEMO-QUICKSTART.md**
**Changes:**
- Updated `--screenshots` flag description
- Removed mention of preserving baseline directory

**Before:** `--screenshots` - Deletes captured screenshots (preserves baseline/)

**After:** `--screenshots` - Deletes all captured screenshots

### 5. **PHASE3-README.md**
**Changes:**
- Section 5 "Baseline Screenshots" updated to show capture happens during first micro-plan
- Directory structure diagram updated (removed `baseline/` subdirectory)
- Files created list updated to show direct path
- Success metrics updated to clarify baseline capture is enabled, not pre-captured
- Updated `.gitignore` description

**Key Updates:**
- Directory: `screenshots/` (not `screenshots/baseline/`)
- File: `sfra-homepage-baseline.png` - Captured during subplan-01-01 execution
- Success metric: "Enable baseline SFRA screenshot capture (happens in subplan-01-01)"

---

## Migration Flow

### Before This Change:
```
1. Manually capture baseline screenshot
   └─ Save to screenshots/baseline/sfra-homepage-baseline.png

2. Run migration loop
   └─ subplan-01-01: Read existing baseline screenshot
   └─ subplan-01-02: Capture first iteration screenshots
   └─ ...
```

### After This Change:
```
1. Run migration loop
   └─ subplan-01-01: Capture SFRA homepage → sfra-homepage-baseline.png
                    Then analyze what was captured
   └─ subplan-01-02: Capture first iteration screenshots
   └─ ...
```

---

## Screenshot Locations

### Baseline Screenshot
- **Path:** `screenshots/sfra-homepage-baseline.png` (root of screenshots directory)
- **Created:** During subplan-01-01 execution
- **Size:** ~2.0-2.8 MB
- **Purpose:** Visual reference for all homepage content changes

### Iteration Screenshots
- **Pattern:** `screenshots/{timestamp}-{subplan-id}-{source|target}.png`
- **Example:** `screenshots/20260121-224748-subplan-01-02-source.png`
- **Created:** During each subsequent micro-plan execution

---

## Reset Behavior

### Before (Preserved Baseline):
```bash
./scripts/reset-migration-state.sh --screenshots
# Deleted 15 screenshots (kept baseline)
```

### After (Delete Everything):
```bash
./scripts/reset-migration-state.sh --screenshots
# Deleted 16 screenshots
```

**Rationale:** If you're resetting screenshots, you likely want a completely fresh start. The first micro-plan will recapture the baseline automatically.

---

## Testing the Changes

### 1. Clean Slate Test
```bash
# Remove all screenshots
rm -rf screenshots/*.png

# Run first micro-plan
./scripts/demo-migration-loop.sh

# Expected: subplan-01-01 captures sfra-homepage-baseline.png
```

### 2. Reset Test
```bash
# After migration has run
./scripts/reset-migration-state.sh --screenshots

# Expected: All screenshots deleted (including baseline)
# Next run will recapture baseline automatically
```

### 3. Standalone Capture Test
```bash
# Test screenshot capture directly
docker exec -u node claude-migration-demo \
  node /workspace/scripts/capture-screenshots.ts \
  --feature-id 01-homepage-content \
  --subplan-id subplan-01-01 \
  --capture-source

# Expected: screenshots/sfra-homepage-baseline.png created
```

---

## Documentation References Updated

All references to `baseline/` directory removed or updated in:
- ✅ `scripts/reset-migration-state.sh` - No special baseline handling
- ✅ `sub-plans/01-homepage-content/subplan-01-01.md` - Capture task added
- ✅ `screenshots/README.md` - Directory structure updated
- ✅ `DEMO-QUICKSTART.md` - Flag descriptions updated
- ✅ `PHASE3-README.md` - Multiple sections updated

**Note:** Backup files (`migration-log-backup-*.md`) and historical documentation (`docs/design/*.md`) intentionally left unchanged as they represent historical artifacts.

---

## First Micro-Plan Changes

### subplan-01-01.md - Before:
```markdown
## Scope
Single task: Analyze the SFRA homepage baseline screenshot...

## Reference Screenshot
`screenshots/baseline/sfra-homepage-baseline.png`

## Specific Change
**No code changes in this step.** This is an analysis-only task.
Read the baseline screenshot and document:
```

### subplan-01-01.md - After:
```markdown
## Scope
Single task: Capture a screenshot of the SFRA homepage and analyze its content structure...

## Tasks

### 1. Capture SFRA Homepage Screenshot
Use Playwright to capture a full-page screenshot of the SFRA homepage:
- URL: https://zzrf-001.dx.commercecloud.salesforce.com/s/RefArchGlobal/en_GB/home
- Save to: `screenshots/sfra-homepage-baseline.png`
- Handle any consent modals (dismiss if present)

### 2. Analyze the Screenshot
After capturing, document:
```

---

## Impact on Migration Loop

### No Breaking Changes
- Existing screenshots (if present) are still valid
- Migration loop continues to work the same way
- Screenshot capture script unchanged (already supported this)
- Only the documentation and expectations changed

### Improved User Experience
- ✅ One less manual step before starting migration
- ✅ Clearer what subplan-01-01 does (capture + analyze)
- ✅ Easier to restart from clean slate
- ✅ More consistent with automated approach

---

## Summary

**What Changed:** Removed assumption of pre-existing `screenshots/baseline/` directory

**Why:** Make the process more automated and easier to restart

**Impact:** First micro-plan now captures baseline screenshot instead of reading pre-existing file

**Testing:** Ready to test with clean slate (no screenshots) to verify capture works

**Status:** ✅ All documentation and scripts updated
