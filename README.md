# Migration Demo - Quick Start

**Purpose:** Run the automated SFRA → storefront-next migration demo
**Duration:** Varies by plan (typically 20-60 minutes)
**Prerequisites:** Docker, .env file with API credentials

---

## 🚀 Quick Start (TL;DR)

```bash
cd /Users/bfeister/dev/test-storefront

cp .env.example .env

# Update needed environment variables depending on workflow

CLEAN_START=true # used for re-initiating the project bootstrap phase (`create-storefront, `pnpm install`, etc)
KEEPALIVE=true # keep the container running instead of exiting
AUTO_START=true # prevent auto-start, keep the container running

# First time or clean start
docker compose up
```

### Environment Flags

-   **`CLEAN_START=true`** - Remove session, state, and intervention files to start fresh
-   **`KEEPALIVE=true`** - Keep container running on errors/exits for inspection (debug mode)
-   **`AUTO_START=false`** - Skip automatic migration execution, keep container running
-   **`MIGRATION_PLAN=<path>`** - Use custom migration plan file

**Combine flags:**

```bash
# Clean start + keep alive on errors
CLEAN_START=true KEEPALIVE=true docker compose up

# Manual execution mode
AUTO_START=false docker compose up
# Then: docker compose exec claude-migration bash
```

---

## 🎯 What Happens

That's it! The container will:

-   ✅ Start Claude Code with the migration plan
-   ✅ Execute micro-plans automatically
-   ✅ Capture screenshots (SFRA source + storefront-next target)
-   ✅ Request intervention when needed
-   ✅ Log all progress to migration-log.md
-   ✅ Create git commits for each completed micro-plan

---

## 🔄 Clean Start vs Resume

### Clean Start (Fresh State)

```bash
CLEAN_START=true docker compose up
```

**Removes:**

-   Claude session ID (starts new session)
-   Stage completion markers
-   Intervention files (needed-_.json, response-_.json)
-   Claude output log

**Preserves:**

-   Migration log (backed up with timestamp)
-   Screenshots
-   Git history in storefront-next/

**Use when:**

-   Starting a new migration from scratch
-   Recovering from a stuck/broken state
-   Testing changes to the migration plan

### Resume Existing Session

```bash
docker compose up
```

**Resumes:**

-   Existing Claude session (if .claude-session-id exists)
-   Continues from last completed stage
-   Checks for pending interventions

**Blocks if:**

-   Pending interventions exist without responses (must respond via dashboard first)

---

## 📋 What Happens

### 1. Container Startup

-   Docker builds/starts the migration container
-   Entrypoint runs permission fixes (root → node user)
-   Verifies storefront-next/ project exists with dependencies

### 2. Migration Execution

-   Launches Claude Code with migration-main-plan.md
-   Claude reads micro-plan files from sub-plans/
-   Executes each micro-plan sequentially
-   Logs progress to migration-log.md

### 3. Screenshot Capture

-   For each micro-plan, Claude:
    -   Starts SFRA reference server (source)
    -   Starts storefront-next dev server (target)
    -   Captures side-by-side screenshots
    -   Saves to screenshots/ directory

### 4. Intervention Handling

-   When Claude needs input, creates intervention/needed-\*.json
-   Dashboard (http://localhost:3030) displays the question
-   User selects an option
-   Dashboard saves intervention/response-\*.json
-   Claude automatically resumes

### 5. Git Commits

-   Each completed micro-plan gets a commit in storefront-next/.git/
-   Commit messages follow format: "subplan-XX-YY: Description"

---

## 🎯 Monitor Progress

### View Logs

```bash
# Watch migration log in real-time
tail -f migration-log.md

# View container logs
docker compose logs -f

# View Claude Code output
docker exec -u node claude-migration-demo cat /tmp/claude-output.log
```

### Dashboard

Open http://localhost:3030 to:

-   View current migration status
-   See recent screenshots
-   Respond to intervention requests
-   View git commit history

### Screenshots

```bash
# List all screenshots
ls -lh screenshots/

# Open screenshots folder
open screenshots/
```

---

## 📁 Files Created/Modified

```
test-storefront/
├── migration-log.md                      # Progress log (grows over time)
├── .claude-session-id                    # Current session ID
├── screenshots/
│   ├── YYYYMMDD-HHMMSS-subplan-XX-YY-source.png
│   └── YYYYMMDD-HHMMSS-subplan-XX-YY-target.png
├── intervention/
│   ├── needed-*.json                     # Requests from Claude
│   ├── response-*.json                   # Your responses
│   └── history/                          # Archived interventions
├── .migration-state/
│   └── completed-stages.json             # Stage tracking
└── storefront-next/
    └── .git/                             # Git commits (one per micro-plan)
```

---

## 🔧 Common Commands

```bash
# Start fresh (clean state)
CLEAN_START=true docker compose up

# Resume existing migration
docker compose up

# Stop migration (keeps state)
docker compose down

# Stop and remove everything
docker compose down -v

# View logs
docker compose logs -f

# Shell into container
docker exec -u node -it claude-migration-demo bash

# Check if Claude is running
docker exec -u node claude-migration-demo pgrep -fa claude

# Read Claude output
docker exec -u node claude-migration-demo cat /tmp/claude-output.log
```

---

## 🎮 Intervention Example

When Claude needs your input, the dashboard will show:

```
INTERVENTION REQUIRED

Question: Build validation failed. How should we proceed?

Options:
  1. Skip build validation and continue
  2. Fix permissions and retry build
  3. Abort migration

Select option [1-3]:
```

**Via Dashboard:**

1. Open http://localhost:3030
2. Click on the intervention
3. Select your option
4. Claude resumes automatically

**Via Manual JSON (advanced):**

```bash
cat > intervention/response-migration-worker.json <<EOF
{
  "worker_id": "migration-worker",
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "selected_option": "skip-build-validation",
  "response": "skip-build-validation"
}
EOF
```

---

## 🔍 Troubleshooting

### Issue: "ANTHROPIC_API_KEY not set"

**Solution:** Check your .env file:

```bash
cat .env
# Should contain:
ANTHROPIC_API_KEY=sk-ant-...
# OR
ANTHROPIC_AUTH_TOKEN=...
ANTHROPIC_BEDROCK_BASE_URL=...
```

### Issue: "storefront-next/ not found"

**Solution:** The project should already exist. If missing:

```bash
# Check if it exists
ls storefront-next/

# If missing, you need to generate it first
# (Contact maintainer for generation instructions)
```

### Issue: "Permission denied" errors

**Solution:** The entrypoint should fix permissions automatically. If issues persist:

```bash
# Fix permissions manually
sudo chown -R $(id -u):$(id -g) .

# Restart
docker compose down
docker compose up
```

### Issue: "Container exits immediately"

**Solution:** Use KEEPALIVE to prevent exit and inspect:

```bash
# Keep container running on errors
KEEPALIVE=true docker compose up

# In another terminal, exec into container
docker compose exec claude-migration bash

# Check logs
cat /workspace/claude-output.log
cat /workspace/migration-log.md

# Or view container logs
docker compose logs
```

### Issue: "Pending intervention blocks startup"

**Solution:** Check for pending interventions:

```bash
# List pending interventions
ls intervention/needed-*.json

# Option 1: Respond via dashboard
# Open http://localhost:3030, respond to interventions
docker compose down
docker compose up

# Option 2: Keep container running to inspect/respond manually
KEEPALIVE=true docker compose up
# Then: docker compose exec claude-migration bash

# Option 3: Clean start (removes all interventions)
CLEAN_START=true docker compose up
```

### Issue: "local: can only be used in a function"

**Solution:** This was a bug in entrypoint.sh that used `local` outside functions. This should now be fixed.

---

## 📊 Success Indicators

✅ **Migration log growing** - New entries every few minutes
✅ **Screenshots captured** - Pairs of source + target images
✅ **Git commits** - One per completed micro-plan
✅ **No stuck processes** - Claude process actively running

### Warning Signs

⚠️ **Long pauses (>10 minutes)** - May need intervention response
⚠️ **Repeated errors in log** - Check migration-log.md for issues
⚠️ **No screenshots** - Dev servers may not be starting
⚠️ **Container exits** - Check docker logs for errors

---

## 🎬 After the Demo

### Review Results

```bash
# View full migration log
cat migration-log.md

# View all screenshots
open screenshots/

# Check git history
cd storefront-next
git log --oneline

# View specific commit
git show HEAD
```

### Compare Side-by-Side

Open screenshot pairs to compare SFRA (source) vs storefront-next (target):

-   `*-source.png` - SFRA reference implementation
-   `*-target.png` - storefront-next migration result

---

## 🛠️ Advanced Usage

### Custom Migration Plan

```bash
# Use a different plan file
MIGRATION_PLAN=/workspace/custom-plan.md docker compose up
```

### Disable Auto-Start

```bash
# Start container but don't run migration automatically
AUTO_START=false docker compose up

# Then manually execute in container
docker exec -u node -it claude-migration-demo bash
claude code run --dangerously-skip-permissions < migration-main-plan.md
```

### Debug Mode

```bash
# Keep container alive on errors for inspection
KEEPALIVE=true docker compose up

# Watch Claude output in real-time
docker exec -u node claude-migration-demo tail -f /tmp/claude-output.log

# Check intervention files
docker exec -u node claude-migration-demo ls -la /workspace/intervention/

# View session ID
docker exec -u node claude-migration-demo cat /workspace/.claude-session-id

# Exec into running container for manual debugging
docker compose exec claude-migration bash
cd /workspace/storefront-next
pnpm dev  # Manually test dev server
```

---

## 📞 Support

**Questions?** Check these docs:

-   [LEARNINGS.md](LEARNINGS.md) - Known issues and solutions
-   [DASHBOARD-GUIDE.md](DASHBOARD-GUIDE.md) - Dashboard usage
-   [MIGRATION-USAGE.md](MIGRATION-USAGE.md) - Migration plan format

**Bugs?** Check Docker logs and claude-output.log for details.

---

**Ready to run?**

```bash
CLEAN_START=true docker compose up
```

**Happy migrating! 🚀**
