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

## 📚 Complete Pipeline Overview (From Zero to React)

The migration pipeline consists of **two major phases** that transform SFRA templates into React components:

---

### **Phase 1: Bootstrap** (Automated via `docker/entrypoint.sh`)

Prepares the development environment and tooling. Runs automatically on `docker compose up`.

#### Phase 1.1: Build Monorepo & Generate Standalone Project

-   **What:** Builds the Storefront Next monorepo and generates a standalone React project
-   **Actions:**
    -   Copy monorepo source to `/tmp` (container) or use in-place (host)
    -   Run `pnpm install` and `pnpm -r build` to build all packages
    -   Run `create-storefront` CLI to generate standalone project from template
    -   Convert `workspace:*` dependencies to `file://` references to local packages
    -   Install dependencies with symlinked node_modules (container) or direct (host)
-   **Output:**
    -   Built monorepo at `/tmp/SFCC-Odyssey` (container) or `$MONOREPO_SOURCE` (host)
    -   Standalone project at `storefront-next/` with working `sfnext` CLI
-   **Marker:** `.migration-state/phase1-complete`

#### Phase 1.2: Commit Storefront-Next Baseline

-   **What:** Create initial git commit for the generated React project
-   **Actions:**
    -   Add `storefront-next/` directory to git
    -   Commit with message "chore: add storefront-next baseline after bootstrap"
-   **Output:** Git commit establishing baseline for tracking migration changes
-   **Marker:** `.migration-state/baseline-committed`

#### Phase 1.3: MCP Server Setup

-   **What:** Configure MCP servers for Claude Code automation
-   **Actions:**
    -   Build `mcp-server/` TypeScript project
    -   Generate `~/.config/claude-code/mcp.json` with server configurations:
        -   `migration-tools` - Custom MCP server with intervention, logging, screenshot tools
        -   `playwright` - Microsoft Playwright MCP for browser automation
    -   Install Playwright browsers (Chromium)
-   **Output:**
    -   `mcp-server/dist/migration-server.js`
    -   `~/.config/claude-code/mcp.json`
-   **Marker:** `.migration-state/phase3-complete`

**To run Phase 1 only:**

```bash
# Manual (host)
MONOREPO_SOURCE=/path/to/SFCC-Odyssey ./docker/entrypoint.sh

# Automated (future feature)
docker compose up
```

---

### **Phase 2: Feature Discovery & Sub-Plan Generation** (Scripts in `scripts/`)

Dynamically discovers features from ISML templates and generates atomic migration sub-plans.

**Architecture:** Discovery drives Phase 2. `discover-features-claude.ts` dynamically discovers features from ISML templates and writes them to `migration-plans/{page-id}-features.json`. `url-mappings.json` provides page-level config (URLs, ISML paths, viewport).

See [`scripts/WORKFLOW.md`](./scripts/WORKFLOW.md) for detailed architecture.

#### Step 2.1: Feature Discovery (`discover-features-claude.ts`)

-   **What:** Claude analyzes ISML template to discover migratable features
-   **How:**
    -   Parse ISML for `<isslot>`, `<isinclude>`, and static sections
    -   Resolve slot configurations via `slots.xml`
    -   Capture full-page screenshot + DOM extraction
    -   Invoke Claude CLI with discovery prompt (uses file paths, not inline content)
    -   Claude determines feature boundaries, selectors, priorities
-   **Input:**
    -   ISML template path (e.g., `home/homePage.isml`)
    -   `slots.xml` for slot resolution
    -   SFRA URL for screenshot capture
-   **Output:** `migration-plans/{page-id}-features.json` with:
    -   Feature IDs (e.g., `01-home-hero`, `02-home-categories`)
    -   Feature names and descriptions
    -   CSS selectors for DOM extraction
    -   Slot IDs and ISML line references
    -   Migration priority order

**Run:**

```bash
CLAUDECODE= npx tsx scripts/discover-features-claude.ts --page home
```

**Key Innovation:** Features are **discovered dynamically** by Claude, not hardcoded. Claude reads ISML template files on-demand using the Read tool, avoiding massive prompt context.

#### Step 2.2: Feature-Specific Analysis (`analyze-features.ts`)

-   **What:** Extract DOM structure and capture screenshots for each discovered feature
-   **How:**
    -   Read feature definitions from `migration-plans/{page-id}-features.json`
    -   For each feature, use Claude-determined selector
    -   Extract DOM structure with Playwright
    -   Capture focused screenshot of that section
-   **Output:** For each feature in `analysis/{feature-id}/`:
    -   `dom-extraction.json` - Structural data (headings, colors, fonts, layout)
    -   `screenshot.png` - Visual reference

**Run:**

```bash
npx tsx scripts/analyze-features.ts --features 01-home-hero,02-home-categories
```

#### Step 2.3: Sub-Plan Generation (`generate-subplan-claude.ts`)

-   **What:** Generate atomic migration sub-plans iteratively using Claude CLI
-   **How:**
    -   For each discovered feature, read:
        -   DOM extraction + screenshots from Step 2.2
        -   ISML template content (via file path reference)
        -   Slot configurations (via file path reference)
        -   Previously generated sub-plans (for context)
    -   Invoke Claude CLI with iterative sub-plan prompt
    -   Claude generates ONE sub-plan per invocation
    -   Continue until Claude outputs `<!-- STATUS: COMPLETE -->`
-   **Input:**
    -   Feature discovery results from Step 2.1
    -   Feature analysis from Step 2.2
    -   `prompts/isml-migration/iterative-subplan.hbs` template
-   **Output:** `sub-plans/{feature-id}/subplan-01-01.md`, `subplan-01-02.md`, etc.
    -   Each sub-plan is an atomic unit of work
    -   Ordered by dependency (layout → components → data → styling)

**Run:**

```bash
CLAUDECODE= npx tsx scripts/generate-subplan-claude.ts \
  --features 01-home-hero \
  --max-plans 10
```

**Key Innovation:** Prompts pass **file paths** to Claude, not full file contents. Claude uses Read/Grep tools to explore on-demand, avoiding context overload.

#### Step 2.4: Initialize Migration Log (`init-migration-log.ts`)

-   **What:** Create initial migration log with headers and feature summary
-   **Output:** `migration-log.md` ready for progress tracking

**Run:**

```bash
npx tsx scripts/init-migration-log.ts
```

---

### **Phase 2 Architecture Diagram**

```
┌─────────────────────────────────────────────────────────────┐
│  STEP 2.1: Feature Discovery                                │
│  discover-features-claude.ts                                │
│                                                              │
│  Input:   home/homePage.isml, slots.xml, SFRA URL          │
│  Process: Claude CLI reads ISML + resolves slots           │
│  Output:  migration-plans/home-features.json               │
│           (5 discovered features with selectors)            │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│  STEP 2.2: Feature Analysis                                 │
│  analyze-features.ts                                        │
│                                                              │
│  Input:   Feature definitions from Step 2.1                │
│  Process: Playwright extracts DOM + captures screenshots   │
│  Output:  analysis/{feature-id}/dom-extraction.json        │
│           analysis/{feature-id}/screenshot.png             │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│  STEP 2.3: Sub-Plan Generation                              │
│  generate-subplan-claude.ts                                 │
│                                                              │
│  Input:   Features + Analysis from Steps 2.1-2.2           │
│  Process: Claude CLI generates sub-plans iteratively       │
│  Output:  sub-plans/01-home-hero/subplan-01-01.md         │
│           sub-plans/01-home-hero/subplan-01-02.md         │
│           ... (until COMPLETE)                              │
└─────────────────────────────────────────────────────────────┘
```

---

### **Running the Complete Pipeline**

#### Option 1: Fully Automated (Docker)

```bash
# Clean start - runs both Phase 1 and Phase 2
CLEAN_START=true docker compose up

# What happens:
# 1. Phase 1: Bootstrap (entrypoint.sh phases 1-3)
# 2. Phase 2: Feature discovery + sub-plan generation
#    - discover-features-claude.ts analyzes ISML → migration-plans/*.json
#    - analyze-features.ts extracts DOM + captures screenshots
#    - generate-subplan-claude.ts generates atomic sub-plans
#    - init-migration-log.ts initializes progress tracking
# 3. Phase 3: Claude Code executes sub-plans with MCP tools
```

#### Option 2: Manual (Step-by-Step)

```bash
# Phase 1: Bootstrap
docker compose up  # Or run entrypoint.sh manually

# Phase 2: Feature Discovery & Sub-Plan Generation
cd /workspace  # or your project root

# Step 2.1: Discover features from ISML
CLAUDECODE= npx tsx scripts/discover-features-claude.ts --page home

# Step 2.2: Analyze discovered features
npx tsx scripts/analyze-features.ts --features 01-home-hero,02-home-categories

# Step 2.3: Generate sub-plans
CLAUDECODE= npx tsx scripts/generate-subplan-claude.ts \
  --features 01-home-hero \
  --max-plans 10

# Step 2.4: Initialize log
npx tsx scripts/init-migration-log.ts

# Phase 3: Execute sub-plans with Claude Code
claude code run < migration-main-plan.md
```

---

### **Key Scripts Reference**

| Script                                | Purpose                                  | Phase        | Reads                                      | Writes                           |
| ------------------------------------- | ---------------------------------------- | ------------ | ------------------------------------------ | -------------------------------- |
| `docker/entrypoint.sh`                | Bootstrap: build monorepo, setup MCP     | 1            | -                                          | `.migration-state/phase*`        |
| `scripts/discover-features-claude.ts` | Discover features from ISML (Claude)     | 2.1          | `url-mappings.json` (page config) + ISML   | `migration-plans/*.json`         |
| `scripts/analyze-features.ts`         | Extract DOM + screenshots                | 2.2          | `migration-plans/*.json`                   | `analysis/*/`                    |
| `scripts/generate-subplan-claude.ts`  | Generate atomic sub-plans                | 2.3          | `migration-plans/*.json` + `analysis/`     | `sub-plans/*/subplan-*.md`       |
| `scripts/init-migration-log.ts`       | Initialize migration log                 | 2.4          | `migration-plans/*.json`                   | `migration-log.md`               |
| `scripts/run-setup.ts`               | Run all Phase 2 steps                    | 2 (wrapper)  | -                                          | -                                |

**Note:** `url-mappings.json` provides page-level config (URLs, ISML paths, viewport). Features flow from discovery output (`migration-plans/*.json`) to downstream scripts.

---

### **Key Files & Directories**

| Path                      | Purpose                                   |
| ------------------------- | ----------------------------------------- |
| `docker/entrypoint.sh`    | Phase 1 bootstrap script                  |
| `scripts/`                | Phase 2 TypeScript scripts                |
| `prompts/isml-migration/` | Handlebars prompt templates               |
| `mcp-server/`             | Custom MCP tools server                   |
| `storefront-next/`        | Generated React project                   |
| `migration-plans/`        | Feature discovery output                  |
| `analysis/`               | DOM + screenshot data per feature         |
| `sub-plans/`              | Generated sub-plan markdown files         |
| `screenshots/`            | Screenshot comparisons (source vs target) |
| `migration-log.md`        | Progress log with commits                 |
| `url-mappings.json`       | Page-level config (URLs, ISML paths)      |
| `.migration-state/`       | Phase completion markers                  |

---

### **Critical Implementation Details**

**Why File Paths, Not Inline Content?**

From `PLAN-isml-subplan-generation.md`:

❌ **Before (BAD - caused timeouts):**

````handlebars
## ISML Template ```isml
{{{ismlContent}}}
<!-- 500+ lines injected -->
````

````

✅ **After (GOOD - uses agentic tools):**
```handlebars
## File References

Use the Read tool to examine these files as needed:

### ISML Template
**Path:** `{{ismlTemplatePath}}`
````

**Benefits:**

-   Smaller prompts (only metadata and instructions)
-   Targeted discovery (Claude reads only what it needs)
-   Better context (Claude builds understanding incrementally)
-   Leverages agentic tools (Read, Grep work better than massive context dumps)

---

**For detailed prompt templates, see:**

-   `prompts/isml-migration/README.md` - Template architecture
-   `prompts/isml-migration/INTEGRATION-GUIDE.md` - Integration patterns
-   `PLAN-isml-subplan-generation.md` - Phase 2 implementation details

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
