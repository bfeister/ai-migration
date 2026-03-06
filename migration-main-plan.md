# Migration Control Loop - Micro-Iteration Mode

## Your Mission

You are executing a **micro-iteration migration loop** to migrate SFRA pages to Storefront Next. Each iteration makes ONE atomic code change, captures dual screenshots (SFRA source + Storefront Next target), commits to git, and logs progress.

## Core Workflow (Repeat Until Done)

### 1. Context Loading (Sliding Window)

Read `{{WORKSPACE_ROOT}}/migration-log.md` and extract the **last 5 log entries** to understand:
- What was just completed
- What worked vs what had issues
- Current momentum and patterns
- Any user intervention responses

**If the log file doesn't exist:**
- Don't worry, the `log-progress-cli.ts` script will auto-initialize it on first use
- Simply proceed to execute the first micro-plan
- The script will create the file with proper header formatting

### 2. Load URL Mapping Configuration

Read `{{WORKSPACE_ROOT}}/url-mappings.json` to get the list of features and their URL mappings.

For the **current feature**, extract:
- `feature_id` (e.g., "01-homepage-hero")
- `sfra_url` (SFRA source URL)
- `target_url` (Storefront Next production preview URL)
- `viewport`, `wait_for_selector`, `scroll_to`, etc.

**Example extraction:**
```bash
# Determine feature from micro-plan path or migration log
# For 01-homepage-content directory, use feature_id "01-homepage-hero" from url-mappings.json
FEATURE_ID="01-homepage-hero"  # Maps to sub-plans/01-homepage-content/
MAPPING=$(jq -r ".mappings[] | select(.feature_id == \"$FEATURE_ID\")" {{WORKSPACE_ROOT}}/url-mappings.json)
SFRA_URL=$(echo "$MAPPING" | jq -r '.sfra_url')
TARGET_URL=$(echo "$MAPPING" | jq -r '.target_url')
```

**Mapping between directory and feature_id:**
- Directory: `01-homepage-content` → feature_id: `01-homepage-hero` (for URL mappings)

### 3. Dynamic Page Exploration (Optional - First Time Only)

**When to use:** First iteration of a new feature OR when screenshot comparison reveals unexpected elements (modals, carousels, lazy-loaded content).

**Skip this step if:**
- url-mappings.json already has complete configuration for this feature
- You're not on the first micro-plan of a feature
- Previous iterations captured clean screenshots

**Exploration Workflow:**

Use the screenshot capture script to explore the SFRA source page and discover traits:

```bash
# 1. Capture exploratory screenshot of SFRA page (before dismissing consent)
tsx {{WORKSPACE_ROOT}}/scripts/capture-screenshots.ts \
  "$SFRA_URL" \
  "{{WORKSPACE_ROOT}}/screenshots/exploration-${FEATURE_ID}-initial.png" \
  --mapping '{"viewport": {"width": 1280, "height": 800}}'

# 2. Capture with consent modal dismissed
tsx {{WORKSPACE_ROOT}}/scripts/capture-screenshots.ts \
  "$SFRA_URL" \
  "{{WORKSPACE_ROOT}}/screenshots/exploration-${FEATURE_ID}-after-dismiss.png" \
  --mapping '{"viewport": {"width": 1280, "height": 800}, "dismiss_consent": true, "consent_button_selector": "button.affirm"}'

# 3. View the screenshots to identify page structure
# Use the Read tool to load screenshots for visual analysis

# 4. Identify consent modals, carousels, lazy-loaded content
# Look for keywords: "cookie", "consent", "accept", "privacy"
# Common selectors: button.affirm, #onetrust-accept-btn-handler
# Look for: .slick-slider, .carousel, [role="carousel"]
```

**Discovered Traits:**
Document findings for manual update to url-mappings.json:
- Consent modal selector: `button.affirm`
- Carousel state selector: `.slick-active`
- Lazy-load trigger: Scroll to 80% of page height

**Note:** Dynamic trait discovery tool (ExploreSFRAPage) is planned for future enhancement. For now, explore manually and update url-mappings.json.

### 4. Determine Next Micro-Plan

Based on the migration log:
- Identify the last completed subplan (e.g., "subplan-01-02")
- Load the next sequential micro-plan file: `{{WORKSPACE_ROOT}}/sub-plans/{feature_directory}/subplan-{XX}-{YY}.md`
- If all micro-plans in current feature are complete, move to next feature
- If all features complete, write final summary and exit

**Directory structure:**
```
{{WORKSPACE_ROOT}}/sub-plans/
├── 01-homepage-content/        # Feature directory (not feature_id)
│   ├── subplan-01-01.md
│   ├── subplan-01-02.md
│   ├── subplan-01-03.md
│   ├── subplan-01-04.md
│   ├── subplan-01-05.md
│   └── subplan-01-06.md
├── 02-next-feature/
│   └── ...
```

**Note:** Feature directory name may differ from feature_id in url-mappings.json. Use the actual directory name when loading micro-plan files.

### 5. Execute Micro-Plan

Read the micro-plan file and follow its instructions precisely. Each micro-plan specifies:
- ONE focused code change (edit 1-3 files maximum)
- Specific success criteria
- Whether to request user intervention (write JSON to `intervention/needed-{worker-id}.json` and exit)

**Important:** Make ONLY the changes specified in the micro-plan. Do not add extra features or refactoring.

### 6. Production Build & Server Startup for Screenshot Capture

**IMPORTANT: Use production build** instead of dev mode. Dev server's file watching causes Docker file descriptor overflow on Mac bind mounts.

**Step 6.1: Build and start production server**

```bash
tsx {{WORKSPACE_ROOT}}/scripts/prod-server.ts start
```

This builds the project, starts the production server, and verifies it's healthy. Port is auto-detected from `storefront-next/package.json`. Exits 0 if healthy, 1 if unhealthy (errors printed to stderr, details in `prod-server.log`).

If it exits non-zero, write an intervention request and exit:
```bash
cat > {{WORKSPACE_ROOT}}/intervention/needed-migration-worker.json <<EOF
{
  "worker_id": "migration-worker",
  "question": "Build failed with errors. How should I proceed?",
  "options": ["Fix dependencies", "Skip this micro-plan", "Debug manually"],
  "context": "See prod-server.log for details"
}
EOF
```

**Step 6.2: Capture dual screenshots**

```bash
# Generate timestamp and subplan ID for screenshot filenames
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
SUBPLAN_ID="subplan-{XX}-{YY}"  # Replace with actual subplan ID

# Extract source config (SFRA) - merge viewport + source_config
SOURCE_MAPPING=$(echo "$MAPPING" | jq '{
  viewport: .viewport,
  dismiss_consent: .source_config.dismiss_consent,
  consent_button_selector: .source_config.consent_button_selector,
  wait_for_selector: .source_config.wait_for_selector,
  scroll_to_selector: .source_config.scroll_to_selector,
  scroll_to: .source_config.scroll_to,
  crop: .source_config.crop
}')

# Extract target config (Storefront Next) - merge viewport + target_config
TARGET_MAPPING=$(echo "$MAPPING" | jq '{
  viewport: .viewport,
  dismiss_consent: .target_config.dismiss_consent,
  consent_button_selector: .target_config.consent_button_selector,
  wait_for_selector: .target_config.wait_for_selector,
  scroll_to_selector: .target_config.scroll_to_selector,
  scroll_to: .target_config.scroll_to,
  crop: .target_config.crop
}')

# Capture SFRA source screenshot with source config
tsx {{WORKSPACE_ROOT}}/scripts/capture-screenshots.ts \
  "$SFRA_URL" \
  "{{WORKSPACE_ROOT}}/screenshots/${TIMESTAMP}-${SUBPLAN_ID}-source.png" \
  --mapping "$SOURCE_MAPPING"

# Capture Storefront Next target screenshot with target config
tsx {{WORKSPACE_ROOT}}/scripts/capture-screenshots.ts \
  "$SERVER_URL" \
  "{{WORKSPACE_ROOT}}/screenshots/${TIMESTAMP}-${SUBPLAN_ID}-target.png" \
  --mapping "$TARGET_MAPPING"
```

**If screenshot fails:**
- Log warning but don't block
- Capture what's available (if one fails, still try the other)
- Continue to commit and log

### 7. Visual + Log Refinement Loop

After capturing screenshots, run a refinement loop that compares the **SFRA source screenshot** against the **Storefront Next target screenshot** for the specific functional area being migrated (e.g., the hero banner, the product grid — not the whole page), and cross-references `prod-server.log` for runtime context. The goal is to converge the target toward the source within this subplan before committing.

**Important:** Screenshots are scoped to one functional area via the `crop` / `scroll_to_selector` config in `url-mappings.json`. Compare only the region relevant to the current subplan, not the full page.

**Step 7.1: Gather context**

Load both screenshots (source + target) using the Read tool so vision can compare them. Also read `prod-server.log` for any runtime warnings, data-fetch errors, or component fallbacks that might explain visual differences.

**Step 7.2: Compare and diagnose**

With both images and the server log loaded, identify what's different and *why*:
- **Visual differences** — layout, spacing, colors, missing elements, wrong text
- **Log-explained differences** — a missing image might trace to a 404 in the log; a fallback component might trace to a data-fetch error
- Assign a similarity score (0–100) for the functional area

**Step 7.3: Decide — fix, commit, or escalate**

| Condition | Action |
|-----------|--------|
| Score ≥ 70% and no blocking issues | **Proceed to commit** (Step 8) |
| Score < 70% OR visual/log issues are fixable | **Fix and re-verify** (Step 7.4) |
| 3 refinement attempts haven't improved the score | **Escalate to intervention** (Step 7.5) |

**Step 7.4: Fix and re-verify (inner loop)**

When the comparison reveals fixable issues:

1. Make a targeted code change to address the specific difference identified in 7.2
2. Rebuild and re-verify: `tsx {{WORKSPACE_ROOT}}/scripts/prod-server.ts start`
3. Re-capture the target screenshot (Step 6.2 — source screenshot can be reused)
4. Go back to Step 7.1 to re-compare

Cap this inner loop at **3 attempts**. Each attempt should fix a specific issue identified in the previous comparison — do not re-attempt the same fix.

**Step 7.5: Escalate to intervention**

If 3 refinement attempts haven't converged, or the issue is unclear:

```bash
cat > {{WORKSPACE_ROOT}}/intervention/needed-migration-worker.json <<EOF
{
  "worker_id": "migration-worker",
  "question": "Visual refinement stalled after 3 attempts for ${SUBPLAN_ID}. Remaining differences: [list]. How should I proceed?",
  "options": ["Continue with current state", "Skip this subplan", "Debug manually"],
  "context": "See prod-server.log and screenshots/${TIMESTAMP}-${SUBPLAN_ID}-target.png"
}
EOF

# Exit gracefully to allow intervention response
# Session will be resumed after user responds via dashboard
```

**Decision Matrix:**
- **Iterate immediately**: If similarity < 70% OR blocking issues exist
- **Continue to commit**: If similarity ≥ 70% AND no blocking issues
- **Request intervention**: If multiple iterations haven't improved score OR unclear if differences acceptable

### 8. Git Commit

Commit all changes with a descriptive message:

```bash
cd {{WORKSPACE_ROOT}}/storefront-next
git add -A
git commit -m "subplan-{XX}-{YY}: {Brief description}

- {Change 1}
- {Change 2}

Screenshots:
  - Source: screenshots/{timestamp}-{subplan-id}-source.png
  - Target: screenshots/{timestamp}-{subplan-id}-target.png
"
```

**Commit message format:**
- First line: `subplan-{XX}-{YY}: {One-line summary}`
- Blank line
- Bulleted list of specific changes
- Blank line
- Screenshot references

### 9. Progress Logging

**Use the log-progress CLI script** to log this iteration to `{{WORKSPACE_ROOT}}/migration-log.md`.

**For successful iterations:**

```bash
tsx {{WORKSPACE_ROOT}}/scripts/log-progress-cli.ts \
  --subplan-id "01-02" \
  --status "success" \
  --summary "Implemented hero section layout matching SFRA baseline" \
  --source-screenshot-url "https://zzrf-001.dx.commercecloud.salesforce.com/s/RefArchGlobal/en_GB/home" \
  --target-screenshot-url "http://localhost:3000" \
  --commit-sha "a3f2c1b"
```

**For failed iterations:**

If the production server failed, compilation errors occurred, or other blocking issues:

```bash
tsx {{WORKSPACE_ROOT}}/scripts/log-progress-cli.ts \
  --subplan-id "01-03" \
  --status "failed" \
  --summary "Attempted to implement navigation component" \
  --source-screenshot-url "" \
  --target-screenshot-url "" \
  --commit-sha "" \
  --error-message "Production server failed: Cannot find module 'react'. Tried installing dependencies but error persists."
```

### 10. Loop Decision & Continue

After logging, **immediately determine the next action and continue**:
- **If more micro-plans in current feature:** GO BACK TO STEP 1 with the next micro-plan in same directory
- **If current feature complete:** GO BACK TO STEP 1 with the first micro-plan in next feature directory, reload URL mapping
- **If all features complete:** Append completion summary to migration-log.md and exit cleanly. **DO NOT ask user for permission** - just write the summary and exit.
- **If error or user intervention needed:** Write JSON to `intervention/needed-{worker-id}.json` and exit gracefully; session will resume after user responds via dashboard, then go back to step 1

**CRITICAL:**
1. Do not stop after completing one micro-plan. Continue executing sequentially until all are complete.
2. After each micro-plan, immediately loop back to step 1 to load context and determine the next micro-plan.
3. **DO NOT ask the user questions or present checkboxes** unless writing an intervention request (to `intervention/needed-{worker-id}.json`) for actual blockers.
4. When all work is done, write completion summary to migration-log.md and exit - no user confirmation needed.

## Critical Rules

1. **One Change at a Time:** Each micro-plan = ONE atomic change. No extra refactoring.
2. **Always Dual Screenshot:** Capture both SFRA source and Storefront Next target, even if change seems invisible.
3. **Always Commit:** Every micro-plan gets a git commit for easy rollback.
4. **Always Log:** Keep migration-log.md in sync with reality immediately after each iteration.
5. **Sliding Window Only:** Load last 5 log entries for context, not entire history.
6. **Production Server Management:** `tsx scripts/prod-server.ts start|stop|health` handles the full server lifecycle (build, start, health check, stop). Port auto-detected from package.json.
7. **URL Mapping per Feature:** Reload URL mapping when switching to new feature directory.

## File Naming Conventions & Prohibited Files

**✅ ALWAYS use these files/locations:**
- **`migration-log.md`** - Primary continuous log (use `tsx scripts/log-progress-cli.ts`)
- **`intervention/needed-{worker-id}.json`** - For blockers (write JSON file directly)
- **`screenshots/YYYYMMDD-HHMMSS-subplan-XX-YY-{source|target}.png`** - Screenshots

**❌ NEVER create these files:**
- Any ad-hoc markdown files in workspace root - All logs must go through the log-progress CLI script

**When completely blocked:**
1. Log failure to `migration-log.md` using `tsx scripts/log-progress-cli.ts` with `--status "failed"`
2. Write blocker details to `intervention/needed-{worker-id}.json` and exit gracefully
3. DO NOT create `BLOCKER_REPORT.md` or similar files

**When all micro-plans complete:**
1. Append completion summary to `migration-log.md`
2. Optionally create `MIGRATION-COMPLETE-SUMMARY.md` if you want, but don't let it replace continuous logging

## Error Handling

### Production Server Errors

**If `prod-server.ts start` exits 1:**
1. Review error output on stderr
2. If blocking errors (e.g., "Module not found"):
   - Attempt one fix based on error message
   - Re-check with `tsx {{WORKSPACE_ROOT}}/scripts/prod-server.ts health`
3. If three attempts fail to fix, write an intervention request:
   ```bash
   cat > {{WORKSPACE_ROOT}}/intervention/needed-migration-worker.json <<EOF
   {
     "worker_id": "migration-worker",
     "question": "Server unhealthy with build errors. How should I fix this?",
     "options": ["Fix dependencies", "Skip this micro-plan", "Debug manually"],
     "context": "See prod-server.log for build errors"
   }
   EOF
   ```
4. Don't proceed to screenshots without working server
5. Mark log entry as failed if blocking errors prevent implementation

### Screenshot Failure
- Log warning in migration-log.md Notes section
- Try to save partial screenshot if possible
- Don't block workflow - proceed to commit and log
- User can debug later by checking log and git history

### User Intervention
To request user intervention:

1. Write a JSON file to `{{WORKSPACE_ROOT}}/intervention/needed-{worker-id}.json`
2. **IMPORTANT**: After requesting intervention, Claude MUST:
   - Log the intervention request to migration-log.md
   - Exit gracefully to allow external response
   - Session will be auto-resumed after user responds via dashboard

**Example Flow**:
```bash
# Write intervention request JSON
cat > {{WORKSPACE_ROOT}}/intervention/needed-migration-worker.json <<EOF
{
  "worker_id": "migration-worker",
  "question": "Production server failed with errors. How should I proceed?",
  "options": ["Fix manually", "Skip this micro-plan", "Debug manually"],
  "context": "Errors found in prod-server.log"
}
EOF

# Log the intervention to migration-log.md
tsx {{WORKSPACE_ROOT}}/scripts/log-progress-cli.ts \
  --subplan-id "01-03" \
  --status "failed" \
  --summary "Production server failed, awaiting user intervention" \
  --source-screenshot-url "" \
  --target-screenshot-url "" \
  --commit-sha "" \
  --error-message "Intervention needed: migration-worker"

# Exit gracefully - user will respond via dashboard, session will auto-resume
# DO NOT continue execution - return control to allow intervention response
```

**When to Request Intervention**:
- Blocking errors that cannot be auto-fixed after retry attempts
- Unclear requirements needing user decision
- Build/compilation failures that persist after troubleshooting
- Missing dependencies or configuration issues

**After User Responds** (on session resume):
Claude will be resumed automatically and should continue from where it left off. The response file will be available at `intervention/response-{worker-id}.json` if needed for reference.

## Available CLI Scripts & Conventions

The following CLI scripts and conventions replace the former MCP tools:
- **Log progress**: `tsx {{WORKSPACE_ROOT}}/scripts/log-progress-cli.ts <args>` - Log iteration progress to migration-log.md (auto-initializes if needed)
- **Production server**: `tsx {{WORKSPACE_ROOT}}/scripts/prod-server.ts <start|stop|health>` - Manage production server lifecycle. Exits 0 (healthy) or 1 (errors on stderr)
- **Capture screenshots**: `tsx {{WORKSPACE_ROOT}}/scripts/capture-screenshots.ts <url> <output-path> [--mapping '<json>']` - Capture source/target screenshots
- **Git commit**: `git add -A && git commit -m "subplan-XX-YY: description"` - Commit with standardized message
- **Get next micro-plan**: Read `migration-log.md` to find last completed subplan, then read next file from `sub-plans/` directory
- **Parse URL mapping**: `jq '.mappings[] | select(.feature_id == "FEATURE_ID")' {{WORKSPACE_ROOT}}/url-mappings.json`
- **Request user intervention**: Write JSON to `intervention/needed-{worker-id}.json` and exit gracefully

## First Action: Establish Baseline (If Starting Fresh)

**Before executing any micro-plans**, if this is the first time running the migration loop:

1. Read `{{WORKSPACE_ROOT}}/migration-log.md` - if empty or doesn't exist, this is a fresh start
2. **Capture baseline screenshots** to establish the "before" state:
   ```bash
   TIMESTAMP=$(date +%Y%m%d-%H%M%S)
   FEATURE_ID="01-homepage-hero"
   MAPPING=$(jq -r ".mappings[] | select(.feature_id == \"$FEATURE_ID\")" {{WORKSPACE_ROOT}}/url-mappings.json)
   SFRA_URL=$(echo "$MAPPING" | jq -r '.sfra_url')
   SOURCE_MAPPING=$(echo "$MAPPING" | jq '{viewport: .viewport, dismiss_consent: .source_config.dismiss_consent, consent_button_selector: .source_config.consent_button_selector}')
   TARGET_MAPPING=$(echo "$MAPPING" | jq '{viewport: .viewport}')

   # Capture SFRA source baseline
   tsx {{WORKSPACE_ROOT}}/scripts/capture-screenshots.ts \
     "$SFRA_URL" \
     "{{WORKSPACE_ROOT}}/screenshots/${TIMESTAMP}-subplan-00-00-baseline-source.png" \
     --mapping "$SOURCE_MAPPING"

   # Capture Storefront Next target baseline
   tsx {{WORKSPACE_ROOT}}/scripts/capture-screenshots.ts \
     "http://localhost:3000" \
     "{{WORKSPACE_ROOT}}/screenshots/${TIMESTAMP}-subplan-00-00-baseline-target.png" \
     --mapping "$TARGET_MAPPING"
   ```
   This creates:
   - `screenshots/{timestamp}-subplan-00-00-baseline-source.png` (SFRA starting state)
   - `screenshots/{timestamp}-subplan-00-00-baseline-target.png` (Storefront Next starting state)

3. Log the baseline capture (no git commit needed for baseline):
   ```bash
   tsx {{WORKSPACE_ROOT}}/scripts/log-progress-cli.ts \
     --subplan-id "00-00-baseline" \
     --status "success" \
     --summary "Captured baseline screenshots of SFRA and Storefront Next before migration" \
     --source-screenshot-url "$SFRA_URL" \
     --target-screenshot-url "http://localhost:3000" \
     --commit-sha "baseline"
   ```

**Then proceed to normal iteration loop:**

1. Read `{{WORKSPACE_ROOT}}/migration-log.md` (tool will auto-initialize if missing)
2. Read `{{WORKSPACE_ROOT}}/url-mappings.json`
3. Determine next micro-plan to execute (start with subplan-01-01 if completed baseline, or continue from last completed)
4. Execute the micro-plan (steps 4-8)
5. **IMMEDIATELY loop back to step 1** to execute the next micro-plan
6. Continue looping until all micro-plans in all feature directories are complete

**Important:** This is a continuous loop. Do not stop after completing one micro-plan. Each iteration should:
- Complete a micro-plan
- Log progress
- **Automatically proceed to the next micro-plan** (no user prompt needed)

If no micro-plans exist yet at `{{WORKSPACE_ROOT}}/sub-plans/`, you should:
1. Inform the user that micro-plans directory doesn't exist
2. Suggest creating the first micro-plan for `01-homepage-content`
3. Wait for user to create micro-plan files before starting loop

---

**Ready to begin micro-iteration loop! Remember: Loop continuously until all micro-plans are complete.**
