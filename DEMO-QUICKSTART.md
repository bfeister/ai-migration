# Migration Loop Demo - Quick Start Guide

**Purpose:** Run the automated micro-iteration migration loop demo
**Duration:** 20-40 minutes (depending on micro-plan count)
**Prerequisites:** Docker, .env file with API credentials, storefront-next monorepo at ~/dev/SFCC-Odyssey

---

## 🚀 Quick Start (TL;DR)

```bash
cd /Users/bfeister/dev/test-storefront

# Run the automated demo
./scripts/demo-migration-loop.sh
```

That's it! The script will:
1. ✅ Check prerequisites (Docker, .env, monorepo)
2. ✅ Verify/build monorepo packages
3. ✅ Generate standalone storefront project (if needed)
4. ✅ Build Docker image (if needed)
5. ✅ Start container
6. ✅ Launch Claude Code with migration plan
7. ✅ Monitor progress and show updates in real-time
8. ✅ Handle intervention requests interactively
9. ✅ Show summary when complete

---

## 📋 What the Demo Does

### Automated Steps:

1. **Prerequisites Check**
   - Verifies Docker is installed
   - Checks for .env file with API credentials
   - Confirms migration-main-plan.md exists
   - Counts micro-plan files in sub-plans/01-homepage-content/
   - Locates storefront-next monorepo at ~/dev/SFCC-Odyssey

2. **Monorepo Verification & Build**
   - Checks if monorepo packages are built
   - Runs `pnpm install && pnpm -r build` if needed
   - Ensures `create-storefront` CLI is available

3. **Standalone Project Generation** (if not exists)
   - Creates temporary template repo from monorepo
   - Runs `create-storefront` with non-interactive flags:
     ```bash
     npx ~/dev/SFCC-Odyssey/packages/storefront-next-dev create-storefront \
         --name storefront-next \
         --template file:///path/to/temp-template \
         --local-packages-dir ~/dev/SFCC-Odyssey/packages
     ```
   - Installs dependencies on HOST (avoids Docker file limits)
   - Result: `storefront-next/` with own node_modules and sfnext CLI

4. **Container Startup**
   - Builds Docker image if not found
   - Starts container with workspace volume mount
   - Pre-entrypoint fixes permissions (root → node user)
   - Verifies standalone project exists with dependencies
   - Waits for container readiness

5. **Migration Loop Launch**
   - Executes: `claude code run --dangerously-skip-permissions < migration-main-plan.md`
   - Runs as node user (required for --dangerously-skip-permissions)
   - Redirects output to /tmp/migration-loop.log

6. **Real-Time Monitoring**
   - **Tails migration-log.md** - Shows new log entries with color coding
   - **Tracks screenshots** - Notifies when new screenshots are captured
   - **Detects interventions** - Prompts user for input when Claude needs help
   - **Monitors process** - Exits when Claude Code completes

7. **Intervention Handling**
   - Detects `intervention/needed-*.json` files
   - Parses question and options from JSON
   - Prompts user to select an option
   - Creates `intervention/response-*.json` file
   - Claude resumes execution automatically

8. **Cleanup & Summary**
   - Stops Docker container
   - Shows completion statistics:
     - Completed micro-plans count
     - Screenshots captured
     - Interventions requested
     - Total duration

---

## 🎯 Expected Output

### Console Output:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Migration Loop Demo - Automated Execution
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

[INFO] 15:50:01 - Verifying prerequisites...
[✓] 15:50:01 - Docker installed
[✓] 15:50:01 - .env file exists
[✓] 15:50:02 - Migration plan found
[✓] 15:50:02 - Found 6 micro-plans

[INFO] 15:50:05 - Starting container: claude-migration-demo
[✓] 15:50:08 - Container started
[✓] 15:50:13 - Container ready

[INFO] 15:50:15 - Starting Claude Code with migration-main-plan.md
[✓] 15:50:18 - Migration loop started (PID: 12345)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Monitoring Migration Progress
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

## [2026-01-21 15:50:30] subplan-01-01: Analyze SFRA Homepage Baseline
**Status:** ✅ Success

[✓] 15:52:15 - Captured 2 new screenshot(s)
[INFO] 15:52:15 -   → 20260121-155213-subplan-01-02-source.png (2.8M)
[INFO] 15:52:15 -   → 20260121-155213-subplan-01-02-target.png (275K)

[?] 15:55:30 - INTERVENTION REQUIRED
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Question: Build and dependency installation is blocked by a permissions issue...
Options:
  [1] Skip build and use existing artifacts
  [2] Fix permissions and retry
  [3] Rebuild container
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Select option [1-3]: 1

[✓] 15:55:35 - Response saved: intervention/response-build-issue.json
[INFO] 15:55:35 - Claude will resume execution...

[INFO] 16:10:45 - Migration loop has completed or stopped

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Migration Loop Summary
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Completed Micro-Plans: 6
Screenshots Captured: 12
Interventions Requested: 1
Total Duration: 20m 44s

[INFO] View migration log: migration-log.md
[INFO] View screenshots: screenshots/
```

---

## 📁 Files Created/Modified

After running the demo:

```
test-storefront/
├── migration-log.md                    # Detailed progress log
├── screenshots/
│   ├── 20260121-155213-subplan-01-02-source.png
│   ├── 20260121-155213-subplan-01-02-target.png
│   ├── 20260121-155845-subplan-01-03-source.png
│   ├── 20260121-155845-subplan-01-03-target.png
│   └── ...                             # 2 screenshots per micro-plan
├── intervention/
│   ├── needed-build-issue.json         # Intervention requests
│   ├── response-build-issue.json       # Your responses
│   └── history/                        # Archived interventions
└── storefront-next/
    └── .git/                           # Git commits (one per micro-plan)
```

---

## 🎮 Interactive Features

### Intervention Prompts

When Claude needs your input:

1. Script displays the question and options
2. You select an option by number (1, 2, 3, etc.)
3. Script saves response as JSON file
4. Claude reads response and resumes execution

**Example:**
```
[?] INTERVENTION REQUIRED
Question: What color theme for hero background?

Options:
  [1] Blue (matches SFRA baseline)
  [2] Green (modern alternative)
  [3] Purple (brand color)

Select option [1-3]: 1

[✓] Response saved
[INFO] Claude will resume execution...
```

### Monitoring Controls

- **Ctrl+C** - Stop monitoring and cleanup (graceful exit)
- **Background process** - Claude Code runs independently, you can detach
- **Log file** - View detailed output: `docker exec -u node claude-migration-demo cat /tmp/migration-loop.log`

---

## 🔧 Reset & Clean State

Before running the demo, you may want to start with a clean state:

```bash
# Full reset (everything)
./scripts/reset-migration-state.sh --full

# Reset specific items
./scripts/reset-migration-state.sh --log                  # Reset migration log only
./scripts/reset-migration-state.sh --screenshots          # Delete screenshots only
./scripts/reset-migration-state.sh --git                  # Reset git commits only

# Combination
./scripts/reset-migration-state.sh --log --screenshots    # Reset log and screenshots

# Just stop containers (minimal)
./scripts/reset-migration-state.sh                        # No flags = minimal clean
```

**What each flag does:**
- `--log` - Backs up and resets migration-log.md to initial state
- `--screenshots` - Deletes all captured screenshots
- `--git` - Resets git commits in storefront-next/ (asks for confirmation)
- `--full` - All of the above (asks for confirmation)

---

## 🔍 Troubleshooting

### Issue: "Storefront monorepo not found"

**Solution:** Ensure your monorepo exists at `~/dev/SFCC-Odyssey`:
```bash
ls ~/dev/SFCC-Odyssey/packages/storefront-next-dev

# Or set custom location
export STOREFRONT_MONOREPO_PATH=/path/to/your/monorepo
./scripts/demo-migration-loop.sh
```

### Issue: "Monorepo not built"

**Solution:** Build the monorepo (one-time setup):
```bash
cd ~/dev/SFCC-Odyssey
pnpm install --frozen-lockfile
pnpm -r build
```

### Issue: "Standalone project generation failed"

**Solution:** Run generation script manually:
```bash
./scripts/generate-standalone-project.sh
```

Check the log at `/tmp/generate-standalone.log` for errors.

### Issue: "Docker image not found"

**Solution:** Script will automatically build the image. If build fails:
```bash
docker build -f docker/Dockerfile -t claude-migration:latest .
```

### Issue: "ANTHROPIC_API_KEY not set"

**Solution:** Check your .env file:
```bash
cat .env
# Should contain one of:
ANTHROPIC_API_KEY=sk-ant-...
# OR
ANTHROPIC_AUTH_TOKEN=...
ANTHROPIC_BEDROCK_BASE_URL=...
```

### Issue: "Container failed to start"

**Solution:** Check Docker logs:
```bash
docker logs claude-migration-demo
```

### Issue: "Claude Code not starting"

**Solution:** Check Claude Code log:
```bash
docker exec -u node claude-migration-demo cat /tmp/migration-loop.log
```

### Issue: "Dev server fails - commander not found"

**Solution:** Standalone project not properly generated. Regenerate:
```bash
rm -rf storefront-next
./scripts/generate-standalone-project.sh
```

The standalone project should have its own `node_modules/` with all dependencies.

### Issue: "sfnext CLI not found"

**Solution:** Verify standalone project structure:
```bash
# Should exist (standalone)
ls storefront-next/node_modules/.bin/sfnext

# Should NOT exist (that's monorepo structure)
ls storefront-next/packages

# If sfnext missing, regenerate
./scripts/generate-standalone-project.sh
```

---

## 📊 What to Look For

### Success Indicators:

✅ **Migration log grows** - New entries appear every 2-5 minutes
✅ **Screenshots captured** - Dual screenshots (source + target) saved
✅ **Git commits created** - One commit per micro-plan
✅ **Progress visible** - Status changes from "In Progress" to "✅ Success"

### Warning Signs:

⚠️ **Long pauses** - Check if intervention is needed
⚠️ **Repeated errors** - Check migration log for issues
⚠️ **Claude stopped** - Check process with `docker exec -u node claude-migration-demo pgrep claude`

---

## 🎬 After the Demo

### Review Results:

1. **View migration log:**
   ```bash
   cat migration-log.md
   ```

2. **View screenshots:**
   ```bash
   open screenshots/
   # Or: ls -lh screenshots/*.png
   ```

3. **Check git history:**
   ```bash
   cd storefront-next
   git log --oneline
   ```

4. **Compare screenshots:**
   Open source + target side-by-side to see visual progression

### Next Steps:

- Review [LEARNINGS.md](LEARNINGS.md) for analysis
- Read [NEXT-STEPS.md](NEXT-STEPS.md) for roadmap
- Continue to Phase 5 if Phase 4 successful

---

## 🛠️ Advanced Usage

### Manual Control

If you want more control, skip the demo script and run commands manually:

```bash
# 1. Start container
docker run -d \
  --name claude-migration-manual \
  --env-file .env \
  --network host \
  -v "$PWD:/workspace" \
  -v "/workspace/node_modules" \
  -v "/workspace/storefront-next/node_modules" \
  -v "/workspace/mcp-server/node_modules" \
  -w /workspace \
  claude-migration:latest

# 2. Launch Claude Code
docker exec -u node claude-migration-manual bash -c \
  "cd /workspace && claude code run --dangerously-skip-permissions < migration-main-plan.md"

# 3. Monitor progress
tail -f migration-log.md

# 4. Cleanup
docker rm -f claude-migration-manual
```

### Debug Mode

To see detailed Claude Code output:

```bash
docker exec -u node claude-migration-demo tail -f /tmp/migration-loop.log
```

### Intervention Debugging

Check intervention files:

```bash
# List all interventions
ls -la intervention/*.json

# Read intervention request
cat intervention/needed-*.json | jq .

# Manually create response
cat > intervention/response-worker-1.json <<EOF
{
  "worker_id": "worker-1",
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "selected_option": "skip-build-validation",
  "response": "skip-build-validation"
}
EOF
```

---

## ⚡ Quick Reference Commands

```bash
# Full workflow from zero
./scripts/reset-migration-state.sh --full     # Clean slate
./scripts/generate-standalone-project.sh      # Generate standalone project
docker build -f docker/Dockerfile -t claude-migration:latest .
./scripts/demo-migration-loop.sh              # Run migration

# Run demo (assumes standalone project exists)
./scripts/demo-migration-loop.sh

# Generate standalone project
./scripts/generate-standalone-project.sh

# Reset state
./scripts/reset-migration-state.sh --full     # Complete reset
./scripts/reset-migration-state.sh --log      # Just reset log
./scripts/reset-migration-state.sh            # Minimal (containers only)

# Observe migration in real-time
./scripts/observe-claude.sh --watch           # Watch mode
./scripts/observe-claude.sh                   # Single snapshot

# Container management
docker ps --filter name=claude-migration-demo
docker exec -u node -it claude-migration-demo bash
docker logs claude-migration-demo

# View outputs
docker exec -u node claude-migration-demo cat /tmp/migration-loop.log
tail -f migration-log.md
ls -lh screenshots/*.png

# Verify standalone project
ls storefront-next/node_modules/.bin/sfnext   # Should exist
ls storefront-next/packages                   # Should NOT exist (monorepo only)

# Stop/remove container
docker stop claude-migration-demo
docker rm claude-migration-demo
```

---

## 📞 Support

**Issues?** Check [LEARNINGS.md](LEARNINGS.md) for known issues and solutions.

**Questions?** Review [NEXT-STEPS.md](NEXT-STEPS.md) for open questions and decisions.

**Bugs?** Check Docker logs and Claude Code output for error details.

---

**Ready to run?**

```bash
./scripts/demo-migration-loop.sh
```

**Happy migrating! 🚀**
