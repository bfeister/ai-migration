# Migration Control Loop - Micro-Iteration Mode

## Your Mission

You are executing a **micro-iteration migration loop** to migrate SFRA pages to Storefront Next. Each iteration makes ONE atomic code change, captures dual screenshots (SFRA source + Storefront Next target), commits to git, and logs progress.

## Core Workflow (Repeat Until Done)

### 1. Context Loading (Sliding Window)

Read `/workspace/migration-log.md` and extract the **last 5 log entries** to understand:
- What was just completed
- What worked vs what had issues
- Current momentum and patterns
- Any user intervention responses

**If the log file doesn't exist:**
- Don't worry, the `LogMigrationProgress` tool will auto-initialize it on first use
- Simply proceed to execute the first micro-plan
- The tool will create the file with proper header formatting

### 2. Load URL Mapping Configuration

Read `/workspace/url-mappings.json` to get the list of features and their URL mappings.

For the **current feature**, extract:
- `feature_id` (e.g., "01-homepage-hero")
- `sfra_url` (SFRA source URL)
- `target_url` (Storefront Next local dev URL)
- `viewport`, `wait_for_selector`, `scroll_to`, etc.

**Example extraction:**
```bash
# Determine feature from micro-plan path or migration log
# For 01-homepage-content directory, use feature_id "01-homepage-hero" from url-mappings.json
FEATURE_ID="01-homepage-hero"  # Maps to sub-plans/01-homepage-content/
MAPPING=$(jq -r ".mappings[] | select(.feature_id == \"$FEATURE_ID\")" /workspace/url-mappings.json)
SFRA_URL=$(echo "$MAPPING" | jq -r '.sfra_url')
TARGET_URL=$(echo "$MAPPING" | jq -r '.target_url')
```

**Mapping between directory and feature_id:**
- Directory: `01-homepage-content` → feature_id: `01-homepage-hero` (for URL mappings)

### 3. Determine Next Micro-Plan

Based on the migration log:
- Identify the last completed subplan (e.g., "subplan-01-02")
- Load the next sequential micro-plan file: `/workspace/sub-plans/{feature_directory}/subplan-{XX}-{YY}.md`
- If all micro-plans in current feature are complete, move to next feature
- If all features complete, write final summary and exit

**Directory structure:**
```
/workspace/sub-plans/
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

### 4. Execute Micro-Plan

Read the micro-plan file and follow its instructions precisely. Each micro-plan specifies:
- ONE focused code change (edit 1-3 files maximum)
- Specific success criteria
- Whether to use `mcp__intervention__RequestUserIntervention` for user input

**Important:** Make ONLY the changes specified in the micro-plan. Do not add extra features or refactoring.

### 5. Dev Server Startup & Screenshot Capture

**IMPORTANT: Skip production build validation** due to Docker file descriptor limits on Mac. Instead, use `pnpm dev` (development mode) which performs incremental builds and provides sufficient validation for visual migration.

Start the dev server and capture dual screenshots:

```bash
cd /workspace/storefront-next

# Start dev server in background
pnpm dev > /tmp/dev-server.log 2>&1 &
DEV_PID=$!

# Wait for server ready (poll for up to 30 seconds)
for i in {1..30}; do
  # Try to detect port from log
  if grep -q "Local:" /tmp/dev-server.log; then
    PORT=$(grep "Local:" /tmp/dev-server.log | grep -oP "localhost:\K\d+" | head -1)
    PORT=${PORT:-5173}

    # Check if server responds
    if curl -s http://localhost:$PORT > /dev/null 2>&1; then
      echo "Dev server ready on port $PORT"
      break
    fi
  fi
  sleep 1
done

# Generate timestamp and subplan ID for screenshot filenames
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
SUBPLAN_ID="subplan-{XX}-{YY}"  # Replace with actual subplan ID

# Update target URL with detected port
TARGET_URL_WITH_PORT=$(echo "$TARGET_URL" | sed "s/:5173/:$PORT/")

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
tsx /workspace/scripts/capture-screenshots.ts \
  "$SFRA_URL" \
  "/workspace/screenshots/${TIMESTAMP}-${SUBPLAN_ID}-source.png" \
  --mapping "$SOURCE_MAPPING"

# Capture Storefront Next target screenshot with target config
tsx /workspace/scripts/capture-screenshots.ts \
  "$TARGET_URL_WITH_PORT" \
  "/workspace/screenshots/${TIMESTAMP}-${SUBPLAN_ID}-target.png" \
  --mapping "$TARGET_MAPPING"

# Stop dev server
kill $DEV_PID
```

**If dev server fails to start:**
1. Check /tmp/dev-server.log for errors
2. Try killing any existing dev servers: `pkill -f "pnpm dev"`
3. Retry once
4. If still fails, use `mcp__intervention__RequestUserIntervention` to ask for help

**If screenshot fails:**
- Log warning but don't block
- Capture what's available (if one fails, still try the other)
- Continue to commit and log

### 7. Git Commit

Commit all changes with a descriptive message:

```bash
cd /workspace/storefront-next
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

### 8. Progress Logging

**Use the MCP LogMigrationProgress tool** to log this iteration to `/workspace/migration-log.md`.

**For successful iterations:**

Use the `LogMigrationProgress` tool with these parameters:
- `subplan_id`: The subplan identifier (e.g., "01-02" or "subplan-01-02" - will be normalized)
- `status`: "success"
- `summary`: One-sentence description of what was implemented (e.g., "Implemented hero section layout matching SFRA baseline")
- `source_screenshot_url`: The SFRA URL that was captured (from url-mappings.json)
- `target_screenshot_url`: The Storefront Next URL (e.g., "http://localhost:5173")
- `commit_sha`: The git commit hash from step 7
- `duration_seconds`: (Optional) Time spent on this iteration in seconds

**Example:**
```javascript
await mcp__LogMigrationProgress({
  subplan_id: "01-02",
  status: "success",
  summary: "Implemented hero section layout matching SFRA baseline",
  source_screenshot_url: "https://zzrf-001.dx.commercecloud.salesforce.com/s/RefArchGlobal/en_GB/home",
  target_screenshot_url: "http://localhost:5173",
  commit_sha: "a3f2c1b"
});
```

**For failed iterations:**

If dev server failed, compilation errors occurred, or other blocking issues:
- `subplan_id`: The subplan identifier
- `status`: "failed"
- `summary`: Brief description of what was attempted
- `source_screenshot_url`: "" (empty string)
- `target_screenshot_url`: "" (empty string)
- `commit_sha`: "" (empty string)
- `error_message`: Full error message or description of what went wrong

**Example:**
```javascript
await mcp__LogMigrationProgress({
  subplan_id: "01-03",
  status: "failed",
  summary: "Attempted to implement navigation component",
  source_screenshot_url: "",
  target_screenshot_url: "",
  commit_sha: "",
  error_message: "Dev server failed: Cannot find module 'react'. Tried installing dependencies but error persists."
});
```

**Benefits of using this tool:**
- ✅ Auto-initializes migration-log.md if it doesn't exist
- ✅ Automatically formats entries with timestamps
- ✅ Updates header counts (Completed Micro-Plans: X / Y)
- ✅ Normalizes subplan IDs to standard format
- ✅ Looks up subplan titles from actual .md files
- ✅ Consistent formatting for dashboard parsing

### 9. Loop Decision & Continue

After logging, **immediately determine the next action and continue**:
- **If more micro-plans in current feature:** GO BACK TO STEP 1 with the next micro-plan in same directory
- **If current feature complete:** GO BACK TO STEP 1 with the first micro-plan in next feature directory, reload URL mapping
- **If all features complete:** Write final summary to log and exit successfully
- **If error or user intervention needed:** Pause, wait for response, then resume by going back to step 1

**CRITICAL:** Do not stop after completing one micro-plan. You must continue executing micro-plans sequentially until all are complete. After each micro-plan, immediately loop back to step 1 to load context and determine the next micro-plan.

## Critical Rules

1. **One Change at a Time:** Each micro-plan = ONE atomic change. No extra refactoring.
2. **Always Dual Screenshot:** Capture both SFRA source and Storefront Next target, even if change seems invisible.
3. **Always Commit:** Every micro-plan gets a git commit for easy rollback.
4. **Always Log:** Keep migration-log.md in sync with reality immediately after each iteration.
5. **Sliding Window Only:** Load last 5 log entries for context, not entire history.
6. **Dev Server Cleanup:** Always kill dev server before next iteration to avoid port conflicts.
7. **URL Mapping per Feature:** Reload URL mapping when switching to new feature directory.

## Error Handling

### Dev Server Compilation Errors
**Note:** Production builds are skipped. Dev mode (`pnpm dev`) provides incremental compilation.

- Check /tmp/dev-server.log for TypeScript or compilation errors
- If dev server shows errors but still starts:
  - Attempt one fix based on error message
  - Restart dev server to verify fix
- If can't fix in one attempt, use `mcp__intervention__RequestUserIntervention` with:
  - Question: "Dev server showing errors: {error}. How should I fix this?"
  - Context: Full error output and what was attempted
- If errors prevent page from loading, don't proceed to screenshot
- Mark log entry as `❌ Failed` if blocking errors present

### Screenshot Failure
- Log warning in migration-log.md Notes section
- Try to save partial screenshot if possible
- Don't block workflow - proceed to commit and log
- User can debug later by checking log and git history

### Dev Server Startup Failure
- Check /tmp/dev-server.log for errors
- Try alternative port if port conflict detected
- After 3 attempts, log error and request intervention
- Don't proceed without working dev server

### User Intervention
When using `mcp__intervention__RequestUserIntervention`:
1. The tool will create `/workspace/intervention/needed-{worker-id}.json`
2. The process will pause and wait for response
3. User responds via watcher or manual response file
4. Tool returns user's answer and conversation continues
5. Log the intervention in migration-log.md:
   ```markdown
   **Status:** ⏸️ Awaiting Intervention
   **Intervention Request:**
   - Question: "{question}"
   - Options: ["{option1}", "{option2}", ...]
   - Intervention ID: `needed-{worker-id}`
   - Requested at: {timestamp}
   ```
6. After receiving response, log the continuation:
   ```markdown
   **Status:** ✅ Success (resumed)
   **User Response:** "{selected_option}" (responded at {timestamp})
   ```

## Available Tools

You have access to these MCP tools:
- `LogMigrationProgress` - Log iteration progress to migration-log.md (auto-initializes if needed)
- `RequestUserIntervention` - Request user input for decisions

## First Action

1. Read `/workspace/migration-log.md` (tool will auto-initialize if missing)
2. Read `/workspace/url-mappings.json`
3. Determine next micro-plan to execute (start with subplan-01-01 if none completed)
4. Execute the micro-plan (steps 4-8)
5. **IMMEDIATELY loop back to step 1** to execute the next micro-plan
6. Continue looping until all micro-plans in all feature directories are complete

**Important:** This is a continuous loop. Do not stop after completing one micro-plan. Each iteration should:
- Complete a micro-plan
- Log progress
- **Automatically proceed to the next micro-plan** (no user prompt needed)

If no micro-plans exist yet at `/workspace/sub-plans/`, you should:
1. Inform the user that micro-plans directory doesn't exist
2. Suggest creating the first micro-plan for `01-homepage-content`
3. Wait for user to create micro-plan files before starting loop

---

**Ready to begin micro-iteration loop! Remember: Loop continuously until all micro-plans are complete.**
