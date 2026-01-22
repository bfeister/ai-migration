---
name: Dockerized Claude Code Migration Runner
overview: Create a Docker-based execution environment for Claude Code that isolates migration work, supports both local Docker and GitHub Actions CI, provides terminal-based status monitoring, and implements an iterative build-test-commit workflow with Playwright validation.
todos:
    - id: phase0-foundation
      content: 'Phase 0 (COMPLETED): Docker foundation, intervention protocol, TypeScript watcher, comprehensive testing (33 Bats tests), validation scripts, and documentation'
      status: completed
    - id: phase1-claude-code-integration
      content: 'Phase 1 (COMPLETED): Real Claude Code Integration - Execute Claude Code CLI with real Anthropic API calls in Docker, create test plan, capture output, validate execution'
      status: completed
      dependencies:
          - phase0-foundation
    - id: phase1-5-http-interception
      content: 'Phase 1.5 (SKIPPED): HTTP Interception - Not needed; Claude tool call execution is too complex to mock meaningfully. Filesystem simulation in test-dynamic-plans.sh is sufficient for testing orchestration without API costs.'
      status: completed
      dependencies:
          - phase1-claude-code-integration
    - id: phase2-mcp-intervention-server
      content: 'Phase 2 (COMPLETED): MCP Intervention Server - Created MCP server with mcp__intervention__RequestUserIntervention tool for user input requests, filesystem-based polling, persistent audit trail'
      status: completed
      dependencies:
          - phase1-claude-code-integration
    - id: phase3-playwright-demo
      content: 'Phase 3: Playwright Setup & Demo Test Plan - Install Playwright in storefront-next/, create screenshot script, build multi-step test plan that makes visible code changes (homepage styling/content), triggers mcp__intervention__RequestUserIntervention for user decisions, captures before/after screenshots'
      status: pending
      dependencies:
          - phase2-mcp-intervention-server
    - id: phase4-iterative-workflow
      content: 'Phase 4: Iterative Workflow Loop - Implement plan → build (pnpm build) → test (Playwright screenshots) → commit (git) → log (migration-log.md) cycle directly in storefront-next/ with error handling'
      status: pending
      dependencies:
          - phase3-playwright-demo
    - id: phase5-status-management
      content: 'Phase 5: Status Management & Terminal UI - Create migration-status.json schema, status writer, migrate-status.sh CLI with live updates, ANSI formatting, worker status table'
      status: pending
      dependencies:
          - phase4-iterative-workflow
    - id: phase6-worktree-setup
      content: 'Phase 6: Git Worktree System - Initialize 6 worktrees (home, product-details, product-list, navbar, footer, customizations) with migration branches for multi-worker isolation'
      status: pending
      dependencies:
          - phase5-status-management
    - id: phase7-ci-integration
      content: 'Phase 7: CI Integration - Create .github/workflows/migration.yml, configure secrets for API key, test Docker execution in CI, upload artifacts'
      status: pending
      dependencies:
          - phase6-worktree-setup
    - id: phase8-documentation
      content: 'Phase 8: Documentation - Create README for Docker setup, usage guide for CLI commands, troubleshooting guide, CI setup instructions'
      status: pending
      dependencies:
          - phase7-ci-integration
---

# Dockerized Claude Code Migration Runner

## Overview

This plan creates a Docker-based execution environment for running Claude Code migrations in isolation, supporting both local development and GitHub Actions CI. The implementation is phased to **prioritize visible results early**: Phase 3 demonstrates the complete iterative workflow with Playwright screenshots and real code changes to storefront-next before implementing the multi-worker worktree system in Phase 6. The final system will manage multiple Merge Worker threads, each with their own worktree and `output-log.md` file, with terminal-based status monitoring and an iterative build-test-commit workflow.

## Architecture

### Two-Repo Design

This system uses **two separate git repositories** for clean separation of concerns:

**1. Orchestration Repo (`test-storefront/` - top-level directory)**
- **Purpose:** Track migration execution state, infrastructure, and audit trail
- **Git tracked:** `migration-log.md`, `intervention/history/`, Docker config, scripts
- **Benefits:** Resumability after interruptions, complete audit trail, infrastructure versioning

**2. Project Repo (`storefront-next/` - child directory, separate git)**
- **Purpose:** The actual codebase being migrated
- **Git tracked:** All project code changes made by workers
- **Branches:** Workers create `migration/worker-N` branches and push to GitHub
- **Benefits:** Clean project history, normal PR workflow, isolation from orchestration

```
┌────────────────────────────────────────────────────────────────────┐
│                          Host Machine                              │
│                                                                    │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │  Orchestration Repo (test-storefront/)                       │ │
│  │  Git-tracked: migration-log.md, intervention/history/        │ │
│  │  ┌────────────────────────────────────────────────────────┐ │ │
│  │  │  CLI Commands (migrate-status, migrate-run, etc.)      │ │ │
│  │  └────────────────────────────────────────────────────────┘ │ │
│  └──────────────────────────────────────────────────────────────┘ │
│                          │                                         │
│                          │ Docker Socket                           │
│                          ▼                                         │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │   Docker Container (claude-migration) - SINGLE CONTAINER     │ │
│  │  ┌────────────────────────────────────────────────────────┐ │ │
│  │  │  Migration Orchestrator                               │ │ │
│  │  │  - Status Manager (writes status.json)                │ │ │
│  │  │  - Worktree Manager                                   │ │ │
│  │  │  - Claude Code Runner                                 │ │ │
│  │  └────────────────────────────────────────────────────────┘ │ │
│  │                          │                                   │ │
│  │  ┌────────────────────────────────────────────────────────┐ │ │
│  │  │  Worker Processes (parallel, same container)          │ │ │
│  │  │  ┌──────────┐  ┌──────────┐  ┌──────────┐          │ │ │
│  │  │  │ Worker 1 │  │ Worker 2 │  │ Worker N │          │ │ │
│  │  │  │ cd work- │  │ cd work- │  │ cd work- │          │ │ │
│  │  │  │ trees/w1 │  │ trees/w2 │  │ trees/wN │          │ │ │
│  │  │  └──────────┘  └──────────┘  └──────────┘          │ │ │
│  │  └────────────────────────────────────────────────────────┘ │ │
│  │                                                             │ │
│  │  ┌────────────────────────────────────────────────────────┐ │ │
│  │  │  Iterative Workflow Loop (per worker)                 │ │ │
│  │  │  1. Plan (Claude Code)                                │ │ │
│  │  │  2. Build (pnpm build in storefront-next/)           │ │ │
│  │  │  3. Screenshot (Playwright)                           │ │ │
│  │  │  4. Commit (git in storefront-next/)                 │ │ │
│  │  │  5. Push (to GitHub)                                  │ │ │
│  │  │  6. Log (append to migration-log.md in orchestration)│ │ │
│  │  └────────────────────────────────────────────────────────┘ │ │
│  └──────────────────────────────────────────────────────────────┘ │
│                          │                                         │
│                          │ Volume Mount                            │
│                          ▼                                         │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │  Shared Filesystem                                           │ │
│  │  ┌────────────────────────────────────────────────────────┐ │ │
│  │  │  Orchestration Files (test-storefront/ repo)          │ │ │
│  │  │  - intervention/, migration-log.md, scripts/          │ │ │
│  │  └────────────────────────────────────────────────────────┘ │ │
│  │  ┌────────────────────────────────────────────────────────┐ │ │
│  │  │  Project Files (storefront-next/ repo - SEPARATE GIT) │ │ │
│  │  │  - .git/, worktrees/, packages/                       │ │ │
│  │  └────────────────────────────────────────────────────────┘ │ │
│  └──────────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────────┘
```

## Key Components

### 1. Docker Setup

**Files to create:**

-   `docker/Dockerfile` - Base image with Node.js, pnpm, Claude Code CLI, Playwright
-   `docker/docker-compose.yml` - Service definition with volume mounts
-   `docker/.dockerignore` - Exclude node_modules from image build
-   `.env.example` - Template for Claude API key

**Docker Configuration:**

-   Base image: `node:24-alpine` (matches project's Node version)
-   Install: pnpm, Claude Code CLI, Playwright browsers
-   Volume mounts: Entire project (except `node_modules` via `.dockerignore`)
-   Environment: Load `.env` file for `ANTHROPIC_API_KEY`
-   Working directory: `/workspace`

### 2. Status Management

**Status File Structure:**

-   `migration-status.json` - Global status file (read by CLI)
    ```json
    {
      "status": "in_progress" | "awaiting_input" | "completed" | "error",
      "current_phase": "planning" | "building" | "testing" | "committing",
      "workers": [
        {
          "id": "worker-1",
          "worktree": "worktrees/home",
          "status": "in_progress",
          "last_update": "2026-01-13T10:00:00Z",
          "output_log": "worktrees/home/output-log.md"
        }
      ],
      "last_screenshot": "screenshots/2026-01-13T10-00-00.png",
      "last_commit": "abc123",
      "error": null
    }
    ```

**CLI Command: `migrate-status`**

-   Reads `migration-status.json` from container
-   Displays live terminal UI with:
    -   Overall status indicator
    -   Per-worker status table
    -   Recent log entries from `output-log.md` files
    -   Screenshot thumbnails (if terminal supports images)
    -   Auto-refresh every 2 seconds

### 3. Claude Code Integration

**Execution Strategy:**

-   Use Claude Code CLI: `claude code run --dangerously-skip-permissions`
-   Pass plan file as input: `claude code run < plan.md`
-   Capture output to worker-specific `output-log.md`
-   Monitor process and update `migration-status.json`

**MCP Server Integration (Phase 2):**

-   Custom MCP server provides `AskUserQuestion` tool for user interventions
-   Configured via `~/.config/claude-code/mcp.json` in container
-   Built during container initialization in entrypoint
-   Enables Claude to request input for non-obvious decisions
-   Supports asynchronous responses (hours/days later) for background execution

**Adapter Pattern Alignment:**

-   This Docker setup will serve as the execution environment for the Claude Code adapter from the master plan
-   The adapter will be implemented in `packages/migration-framework/adapters/claude-code/`
-   Docker provides isolation and CI compatibility

### 4. Iterative Workflow

**Workflow Loop (per worker):**

1. **Plan Phase**: Run Claude Code with migration plan

    - Input: `migration-plan.md` (from master plan)
    - Output: Code changes in worktree
    - Log: Append to `output-log.md`

2. **Build Phase**: Run `pnpm build` in `template-retail-rsc-app`

    - Command: `cd storefront-next/packages/template-retail-rsc-app && pnpm build`
    - Capture build errors, log to `output-log.md`
    - Update status: `"current_phase": "building"`

3. **Test Phase**: Start dev server + Playwright screenshot

    - Start: `pnpm dev` (background, wait for ready)
    - Screenshot: Playwright captures key pages
    - Save: `screenshots/{timestamp}-{worker-id}-{page}.png`
    - Log: Screenshot paths in `output-log.md`

4. **Commit Phase**: Git commit with progress

    - Stage: All changes in worktree
    - Commit: `git commit -m "Migration progress: {phase} - {summary}"`
    - Log: Commit hash and message to `output-log.md`

5. **Log Phase**: Update `output-log.md`

    - Append: Phase completion, timestamps, errors
    - Format: Markdown for Claude Code readability

### 5. Terminal UI

**Implementation:**

-   Bash script: `scripts/migrate-status.sh`
-   Uses `watch` or custom loop for live updates
-   ANSI colors for status indicators
-   Table formatting for worker status
-   Progress bars/spinners for active operations
-   Reads from container: `docker exec claude-migration cat migration-status.json`

**Display Format:**

```
╔══════════════════════════════════════════════════════════╗
║  Migration Status: IN PROGRESS                          ║
║  Current Phase: Building                                ║
╠══════════════════════════════════════════════════════════╣
║  Workers:                                                ║
║  ┌──────────┬──────────────┬─────────────┬──────────┐ ║
║  │ Worker   │ Worktree     │ Status      │ Progress │ ║
║  ├──────────┼──────────────┼─────────────┼──────────┤ ║
║  │ home     │ worktrees/   │ Building    │ ████░░░░ │ ║
║  │          │ home         │             │          │ ║
║  │ pdp      │ worktrees/   │ Planning    │ ██░░░░░░ │ ║
║  │          │ pdp          │             │          │ ║
║  └──────────┴──────────────┴─────────────┴──────────┘ ║
║                                                          ║
║  Latest Screenshot: screenshots/2026-01-13T10-00-00.png ║
║  Last Commit: abc123 - Migration progress: home page    ║
╚══════════════════════════════════════════════════════════╝
```

### 6. GitHub Actions CI Integration

**Workflow File: `.github/workflows/migration.yml`**

-   Use Docker Compose or direct `docker run`
-   Set `ANTHROPIC_API_KEY` from GitHub Secrets
-   Run migration in CI context
-   Upload artifacts: screenshots, logs, status files
-   Support matrix: Test with multiple Node versions if needed

**CI Considerations:**

-   Claude Code CLI must be installable in CI
-   Docker-in-Docker or GitHub Actions' Docker support
-   Artifact retention for screenshots/logs
-   Timeout handling for long-running migrations

### 7. Local Dev Server Integration

**First Pass Focus:**

-   Target: `storefront-next/packages/template-retail-rsc-app`
-   Dev server: `pnpm dev` (from `vite.config.ts`)
-   Port: Default Vite port (5173) or configurable
-   Proxy: Commerce API proxy configured in `vite.config.ts`
-   Environment: Load `.env` for `PUBLIC__app__commerce__api__shortCode`

**Playwright Configuration:**

-   Capture key pages: `/`, `/products/*`, `/cart`, etc.
-   Wait for dev server ready before capturing
-   Save screenshots with worker ID and timestamp

## File Structure

```
.
├── docker/                                    # Phase 0 ✅
│   ├── Dockerfile                            # Node 24 Alpine + Claude CLI
│   ├── docker-compose.yml                    # Service definition
│   ├── .dockerignore                         # Exclude node_modules
│   └── entrypoint.sh                         # Container initialization
│
├── scripts/                                   # Phase 0 ✅
│   ├── migrate-run.sh                        # Start container
│   ├── migrate-status.sh                     # ASCII status display
│   ├── migrate-watch.sh                      # TypeScript watcher wrapper
│   ├── migrate-watch.ts                      # Interactive file watcher
│   ├── migrate-respond.sh                    # Legacy response script
│   ├── validate-phase0.sh                    # Comprehensive validation
│   ├── test-runner.sh                        # Test orchestrator
│   ├── package.json                          # TypeScript dependencies
│   ├── tsconfig.json                         # TypeScript config
│   ├── TESTING.md                            # Test documentation
│   └── tests/                                # Test suites
│       ├── helpers.bash                      # Shared test utilities
│       ├── intervention-protocol.bats        # 13 protocol tests
│       ├── migrate-scripts.bats              # 20 script tests
│       └── mock-claude-code.sh               # Mock CLI for testing
│
├── intervention/                              # Phase 0 ✅
│   ├── needed-{worker-id}.json               # Per-worker intervention requests
│   ├── response-{worker-id}.json             # Per-worker responses
│   └── history/                              # Timestamped archives
│       ├── {timestamp}_needed-{worker-id}.json
│       └── {timestamp}_response-{worker-id}.json
│
├── mcp-server/                                # Phase 2: MCP Server
│   ├── src/
│   │   └── intervention-server.ts             # MCP server with AskUserQuestion tool
│   ├── dist/                                  # Compiled JavaScript (gitignored)
│   │   └── intervention-server.js
│   ├── package.json                           # MCP SDK dependencies + build scripts
│   ├── tsconfig.json                          # TypeScript config (CommonJS output)
│   └── .gitignore                             # Ignore dist/ and node_modules/
│
├── .env.example                               # Phase 0 ✅ API key template
├── PHASE0-README.md                           # Phase 0 ✅ Complete documentation
├── migration-log.md                           # Phase 0 ✅ Activity log (placeholder)
│
├── migration-status.json                      # Phase 5: Global status (in container)
└── worktrees/                                 # Phase 3: Git worktrees (shared)
    ├── home/
    │   └── output-log.md
    ├── product-details/
    │   └── output-log.md
    ├── product-list/
    │   └── output-log.md
    ├── navbar/
    │   └── output-log.md
    ├── footer/
    │   └── output-log.md
    └── customizations/
        └── output-log.md
```

## Implementation Steps

### Phase 0: Foundation (COMPLETED)

**Docker Environment:**
- ✅ Created Dockerfile with Node.js 24 Alpine, pnpm 10.26.1, Claude Code CLI
- ✅ Set up docker-compose.yml with volume mounts (entire project except node_modules)
- ✅ Configured .dockerignore to exclude node_modules
- ✅ Created entrypoint.sh for container initialization
- ✅ Tested container startup and health

**Intervention Protocol:**
- ✅ Implemented multi-file pattern: `intervention/needed-{worker-id}.json`
- ✅ Response pattern: `intervention/response-{worker-id}.json`
- ✅ Automatic archiving to `intervention/history/` with timestamps
- ✅ Support for concurrent interventions from multiple workers

**TypeScript Interactive Watcher:**
- ✅ Created `migrate-watch.ts` with chokidar for real-time file watching
- ✅ Interactive prompts with arrow key navigation (using prompts package)
- ✅ Queue management for multiple concurrent interventions
- ✅ Automatic response file creation and archiving
- ✅ System notifications (macOS support)
- ✅ TypeScript dependencies in `scripts/package.json`

**CLI Scripts:**
- ✅ `migrate-run.sh` - Container management
- ✅ `migrate-status.sh` - ASCII art status display
- ✅ `migrate-watch.sh` - Wrapper for TypeScript watcher
- ✅ `migrate-respond.sh` - Legacy response script (backwards compatibility)

**Comprehensive Testing (33 Tests):**
- ✅ Bats testing framework with 2 test suites
  - `intervention-protocol.bats` (13 tests) - File creation, JSON validation, special characters
  - `migrate-scripts.bats` (20 tests) - Script existence, permissions, dependencies
- ✅ Test helpers in `helpers.bash` with utilities for file creation, validation, Docker
- ✅ `test-runner.sh` orchestrator with colored output and pass/fail summary
- ✅ Mock Claude Code CLI (`mock-claude-code.sh`) for testing without API calls

**Validation Infrastructure:**
- ✅ `validate-phase0.sh` with 4 validation modes:
  - Standard mode (~3s) - Quick check with Bats tests
  - `--docker` mode (~30s) - Full Docker lifecycle (build, test, teardown)
  - `--integration` mode (~10s) - Live watcher detection test
  - `--with-mock-claude` mode (~15s) - Mock CLI integration test
- ✅ Timestamped test containers to avoid conflicts
- ✅ Proper cleanup and error handling

**Documentation:**
- ✅ PHASE0-README.md - Complete Phase 0 documentation
- ✅ TESTING.md - Test writing guide and infrastructure
- ✅ .env.example - API key template

### Phase 1: Real Claude Code Integration (COMPLETED)

**Claude Code CLI Execution:**
- ✅ Create simple test plan (hello-world style migration task)
- ✅ Execute Claude Code CLI in Docker with real Anthropic API calls
- ✅ Use `claude code run --dangerously-skip-permissions < test-plan.md`
- ✅ Capture CLI output to log file
- ✅ Validate successful execution and output

**Docker Integration:**
- ✅ Ensure ANTHROPIC_API_KEY is properly passed to container
- ✅ Test CLI installation and availability in container
- ✅ Verify volume mounts work for input/output files
- ✅ Basic error handling for API failures

**Output Validation:**
- ✅ Confirm Claude Code makes real API calls
- ✅ Verify file changes are persisted to host
- ✅ Log API responses for inspection
- ✅ Test with simple code modification task

### Phase 1.5: HTTP Interception for Testing (SKIPPED)

**Decision: This phase is not needed**

**Rationale:**
- HTTP mocking would avoid API costs but Claude Code CLI still executes tool calls
- Tool calls (Write, Edit, etc.) create real files regardless of API mocking
- Recording tool call responses for every scenario is too complex
- Filesystem simulation in `test-dynamic-plans.sh` already provides cost-free testing
- Simulated mode tests what matters: orchestration logic and workflow completion

**What we have instead:**
- Real API mode: Validates full end-to-end functionality with actual Claude
- Simulated mode: Creates files directly, tests orchestration without API calls
- This covers both use cases without the complexity of HTTP interception

### Phase 2: MCP Intervention Server (COMPLETED)

**Goal:** Enable Claude Code to request user input for non-obvious decisions during migration work, with support for asynchronous/background execution and full auditability.

**Rationale:**
When running migrations in background/CI contexts, Claude may encounter decisions where the correct path forward is ambiguous (e.g., "Use JWT or session-based auth?"). The system needs a way to:
1. Pause the worker and request user input
2. Allow the user to respond asynchronously (hours/days later)
3. Resume the conversation naturally after receiving the response
4. Maintain full audit trail of all interventions

The MCP server provides an `AskUserQuestion` tool that bridges Claude Code's execution context with the filesystem-based intervention protocol built in Phase 0. The key insight is that **conversation state lives in the Claude Code process memory** - as long as the process stays alive during polling, the Anthropic API conversation continues naturally when the tool call returns.

**MCP Server Implementation:**

Create `mcp-server/intervention-server.ts`:
- Implements MCP server with single tool: `AskUserQuestion`
- Tool parameters: `question`, `options` (array), `context`, `worker_id`
- On tool call: Write `needed-{worker-id}.json`, poll for `response-{worker-id}.json`
- Polling logic: Simple 1-second interval loop, no timeout (supports multi-day pauses)
- Return tool result: Read response, mark as `processed: true`, return answer to Claude
- No complex state management needed - filesystem is source of truth

**File Lifecycle Changes:**

Current behavior (Phase 0): Files archived immediately after response
New behavior (Phase 2): Files persist for audit trail, marked as processed

```json
// intervention/response-{worker-id}.json
{
  "timestamp": "2024-01-14T10:01:30Z",
  "response": "JWT",
  "question_timestamp": "2024-01-14T10:00:00Z",
  "intervention_id": "needed-worker-1",
  "processed": true  // Added by MCP server after returning to Claude
}
```

**Watcher Updates:**

Update `migrate-watch.ts` to skip re-prompting for already-processed interventions:
- Check if `response-{worker-id}.json` exists with `processed: true`
- If yes, skip (already handled)
- If no, prompt user as before
- Don't archive automatically - files persist for audit

**CLI Command: `migrate-respond`**

New script for manual intervention responses (SSH/detached scenarios):
```bash
docker exec claude-migration migrate-respond worker-1 "JWT"
```

Creates response file directly, allowing user to respond without interactive watcher.

**Docker Integration:**

Critical: Claude Code CLI must be explicitly configured to use the MCP server. The tool won't be available unless properly configured.

**MCP Configuration File:**

Create `~/.config/claude-code/mcp.json` in the container:
```json
{
  "mcpServers": {
    "intervention": {
      "command": "node",
      "args": ["/workspace/mcp-server/dist/intervention-server.js"],
      "env": {
        "WORKSPACE_ROOT": "/workspace"
      }
    }
  }
}
```

**Entrypoint Updates (`docker/entrypoint.sh`):**

```bash
#!/bin/bash
set -euo pipefail

# Build MCP server
echo "Building MCP intervention server..."
cd /workspace/mcp-server
pnpm install --silent
pnpm build

# Configure Claude Code CLI to use MCP server
echo "Configuring Claude Code with MCP server..."
mkdir -p ~/.config/claude-code
cat > ~/.config/claude-code/mcp.json <<'EOF'
{
  "mcpServers": {
    "intervention": {
      "command": "node",
      "args": ["/workspace/mcp-server/dist/intervention-server.js"],
      "env": {
        "WORKSPACE_ROOT": "/workspace",
        "INTERVENTION_DIR": "/workspace/intervention"
      }
    }
  }
}
EOF

# Execute original command
exec "$@"
```

**MCP Server Build Configuration:**

Ensure MCP server compiles to CommonJS for Node.js execution:

`mcp-server/tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

`mcp-server/package.json` should include build script:
```json
{
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch"
  }
}
```

**Testing Strategy:**

1. **Validate MCP Tool Registration:**
   ```bash
   # Create test plan that lists available tools
   cat > /workspace/test-mcp-registration.md <<'EOF'
   Please list all tools you have access to. Specifically confirm you have:
   - AskUserQuestion tool

   If you have it, describe its parameters.
   EOF

   claude code run < /workspace/test-mcp-registration.md
   ```

2. **Test Intervention Flow:**
   - Create test plan that calls `AskUserQuestion` tool
   - Run Claude Code CLI in Docker with MCP server configured
   - Verify `needed-{worker-id}.json` created
   - Test response via both watcher and `migrate-respond` command
   - Validate Claude continues execution with user's answer
   - Confirm files persist with `processed: true` flag

3. **Validate Error Handling:**
   - Test with no response (validate polling continues)
   - Test with malformed response file
   - Test with multiple concurrent interventions
   - Verify graceful handling in all cases

**Deliverables:**
- ✅ `mcp-server/src/intervention-server.ts` - MCP server implementation
- ✅ `mcp-server/package.json` - Dependencies (@modelcontextprotocol/sdk) and build scripts
- ✅ `mcp-server/tsconfig.json` - TypeScript configuration for CommonJS output
- ✅ `docker/entrypoint.sh` - Updated to build MCP server and configure Claude Code CLI
- ✅ `scripts/migrate-respond.sh` - Manual response CLI command
- ✅ Updated `scripts/migrate-watch.ts` - Skip processed interventions
- ✅ Test plan validating tool registration (`test-mcp-registration.md`)
- ✅ Test plan demonstrating intervention flow (`test-intervention-flow.md`)
- ✅ Updated documentation in plan file

**Edge Case: Container Restarts**

If container restarts during polling, the process dies and conversation state is lost. For MVP, document as limitation: "Don't restart containers mid-migration." Future enhancement could checkpoint conversation state to filesystem, but adds significant complexity. Validate this is acceptable trade-off before implementing resumability.

### Phase 3: Playwright Setup & Demo Test Plan (PENDING)

**Goal:** Show tangible results quickly by setting up Playwright screenshots and creating a multi-step demonstration that makes visible code changes to storefront-next, uses the MCP intervention tool, and captures visual evidence of progress.

**Rationale:**
Before building the full multi-worker worktree system, validate the iterative workflow by:
1. Making real, visible changes to the storefront-next codebase
2. Demonstrating the MCP intervention flow with actual user decisions
3. Capturing before/after screenshots to show progress
4. Proving the build → test → commit cycle works end-to-end

This provides early validation and visible results that build confidence in the system.

**Playwright Setup:**
- Install Playwright in storefront-next: `cd storefront-next && pnpm add -D @playwright/test`
- Install browsers: `pnpm exec playwright install chromium`
- Create basic screenshot script: `scripts/capture-screenshots.ts`
- Screenshot key pages: homepage, product listing, product detail
- Save screenshots with timestamps: `screenshots/{timestamp}-{page}.png`
- Verify dev server can start and pages load

**Demo Test Plan:**
Create `test-iterative-demo.plan.md` that instructs Claude Code to:
1. **Initial baseline**: Capture "before" screenshots of homepage
2. **Change 1**: Update homepage hero title text (e.g., "Welcome to Our Store" → "Shop the Latest Collection")
3. **Intervention point**: Use `mcp__intervention__RequestUserIntervention` to ask user for color scheme preference (blue vs green theme)
4. **Change 2**: Apply user's color choice to hero section background
5. **Change 3**: Update homepage featured products section heading
6. **Final validation**: Capture "after" screenshots showing all changes
7. **Build verification**: Run `pnpm build` to ensure changes don't break production build
8. **Commit**: Create git commit with descriptive message

**Implementation Steps:**
1. Create Playwright config in storefront-next
2. Implement screenshot capture script with proper wait logic
3. Write the multi-step demo plan in clear, executable markdown
4. Test plan execution: run Claude Code with the demo plan in Docker
5. Verify MCP intervention tool is called and user can respond
6. Validate screenshots show visible before/after differences
7. Confirm git commit captures all changes

**Success Criteria:**
- Screenshots successfully captured at each step
- MCP intervention request appears and user response flows back to Claude
- Code changes are visible in screenshots
- Build completes without errors
- Git commit includes all changes with clear message
- Entire workflow completes without manual intervention (except MCP response)

**Deliverables:**
- `storefront-next/playwright.config.ts` - Playwright configuration
- `scripts/capture-screenshots.ts` - Screenshot utility
- `test-iterative-demo.plan.md` - Multi-step demo plan
- `screenshots/` directory with before/after images
- Git commit in storefront-next with demo changes
- Documentation of workflow execution

### Phase 4: Iterative Workflow Loop (PENDING)

**Goal:** Generalize the demo from Phase 3 into a reusable workflow orchestrator that can run any migration plan through the build → test → commit cycle.

**Build Validation:**
- Implement build step (pnpm build) after Claude Code execution in storefront-next/
- Capture and log build errors to migration-log.md
- Retry logic for build failures (up to 3 attempts)
- Parse build output for actionable error messages

**Playwright Screenshot Integration:**
- Generalize screenshot script from Phase 3 for any plan execution
- Start dev server (`pnpm dev`) in background
- Wait for server ready (poll localhost:5173/health or similar)
- Capture screenshots of configured pages
- Save with worker ID and timestamp for multi-worker support later
- Clean up dev server process after capture

**Git Commit Automation:**
- Stage all changes in storefront-next/
- Generate commit messages based on plan description and changes made
- Include build/test status in commit message
- Push to current branch (supports worktrees in Phase 6)
- Handle git conflicts and provide clear error messages

**Workflow Orchestrator Script:**
Create `scripts/run-migration-workflow.sh`:
```bash
# Usage: ./run-migration-workflow.sh <plan-file> [worker-id]
# 1. Run Claude Code with plan
# 2. Build project
# 3. Capture screenshots
# 4. Commit changes
# 5. Log results to migration-log.md
```

**Error Handling:**
- Detect Claude Code failures (exit code, timeout)
- Detect build failures and log errors
- Detect dev server startup failures
- Provide clear error messages for each failure type
- Support optional retry with `--retry` flag

**Logging:**
- Append all workflow steps to `migration-log.md`
- Include timestamps, plan name, success/failure status
- Link to screenshots and git commits
- Format for both human and machine readability

**Success Criteria:**
- Any plan can be executed through the workflow
- Build errors are caught and logged
- Screenshots work consistently
- Git commits have meaningful messages
- Error recovery works for common failures

### Phase 5: Status Management & Terminal UI (PENDING)

**Status File Implementation:**
- Create `migration-status.json` schema (see section 2)
- Status writer in orchestrator script
- Per-worker status tracking
- Error state management

**Enhanced Terminal UI:**
- Live updates (watch mode)
- Worker status table with progress bars
- Recent log entries display
- Screenshot thumbnails (if supported)

### Phase 6: Git Worktree System (PENDING)

**Worktree Initialization:**
- Create script to initialize 6 worktrees from storefront-next:
  - `home` → `worktrees/home/` (branch: `migration/home`)
  - `product-details` → `worktrees/product-details/` (branch: `migration/product-details`)
  - `product-list` → `worktrees/product-list/` (branch: `migration/product-list`)
  - `navbar` → `worktrees/navbar/` (branch: `migration/navbar`)
  - `footer` → `worktrees/footer/` (branch: `migration/footer`)
  - `customizations` → `worktrees/customizations/` (branch: `migration/customizations`)
- Base all worktrees on `main` branch
- Create migration branches automatically
- Docker configuration updates for worktree paths

**Worktree Management:**
- Cleanup script to remove worktrees
- Status check for worktree health
- Handle conflicts and branch management
- Multi-worker isolation testing

**Integration with Phase 4 Workflow:**
- Adapt workflow orchestrator to support worktree paths
- Run multiple workers in parallel, each in their own worktree
- Coordinate status updates across workers
- Test concurrent execution without conflicts

### Phase 7: CI Integration (PENDING)

**GitHub Actions Workflow:**
- `.github/workflows/migration.yml`
- Docker execution in CI
- Secrets management for API key
- Artifact upload (screenshots, logs)

### Phase 8: Documentation (PENDING)

**User-Facing Documentation:**
- Overall README for system
- Usage guide for all CLI commands
- Troubleshooting guide
- CI setup instructions

## Key Design Decisions

1. **Prioritize Visible Results**: Demonstrate the complete workflow with Playwright screenshots and iterative code changes (Phase 3) before building the multi-worker worktree system (Phase 6). This provides early validation, tangible evidence of progress, and builds confidence in the approach before adding complexity.
2. **Volume Mounts**: Share all files except `node_modules` to avoid Docker filesystem overhead while maintaining isolation
3. **Status File**: JSON file for easy parsing by both container and host CLI
4. **Markdown Logs**: `output-log.md` files are human-readable and Claude Code can modify them
5. **Terminal UI**: Bash-based for portability, uses ANSI codes for formatting
6. **Worktree Isolation**: Each worker gets its own git worktree to avoid conflicts (deferred to Phase 6)
7. **CI-First Design**: Ensure Docker setup works in GitHub Actions from the start
8. **File-Based Protocol**: Filesystem as single source of truth - no databases or complex state management
9. **Multi-File Pattern**: Separate intervention files per worker to support concurrent execution
10. **TypeScript for Interactivity**: Use TypeScript with chokidar for reliable file watching and prompts for better UX
11. **Test-First Approach**: Comprehensive automated testing (33 tests) before feature implementation
12. **MCP for Intervention Requests**: Use MCP server to provide mcp__intervention__RequestUserIntervention tool to Claude, enabling programmatic intervention requests with natural conversation flow. Conversation state lives in process memory, no complex checkpointing needed for MVP.
13. **Persistent Audit Trail**: Intervention and response files persist in filesystem with `processed` flag, providing complete auditability and supporting asynchronous/background execution patterns

## Phase 0 Learnings & Patterns

### Multi-File Intervention Pattern
**Problem:** Single `needed.json` file causes conflicts with concurrent workers.
**Solution:** Pattern `needed-{worker-id}.json` and `response-{worker-id}.json`.
**Benefit:** Each worker operates independently, watcher manages queue.

### TypeScript Watcher Implementation
**Problem:** Bash watcher couldn't detect files in real-time, poor UX for multi-choice prompts.
**Solution:** Rewrote in TypeScript using `chokidar` (file watching) and `prompts` (interactive UI).
**Benefit:**
- Real-time file detection with `awaitWriteFinish` for stability
- Arrow key navigation for better UX
- Queue management for multiple interventions
- System notifications

### Mock Testing Strategy
**Phase 0 (CLI-Level Mocking):**
- Mock the CLI tool itself with bash script (`mock-claude-code.sh`)
- Simulates file-based intervention protocol
- No API calls, fast tests (~15s)

**Phase 1 (Real API Calls):**
- Execute real Claude Code CLI with actual Anthropic API
- Validate end-to-end integration
- Test with real API key in Docker

**Phase 1.5+ (HTTP-Level Mocking):**
- Mock HTTP API calls to Anthropic with mitmproxy
- Use real Claude Code CLI with intercepted requests
- Record/playback for reproducible tests
- Validate error handling and retries

### Docker Lifecycle Testing
**Pattern:** Timestamped container names for parallel test runs
```bash
container_name="claude-migration-test-$(date +%s)"
```
**Benefit:** Avoid conflicts, enable parallel CI jobs, easier debugging

### Validation Modes
**Design:** Progressive validation levels (3s → 10s → 30s)
- Quick feedback for developers (Tier 1-2)
- Comprehensive validation for CI (Tier 3-4)
- Flags for specific scenarios (`--docker`, `--integration`, `--with-mock-claude`)

### File-Based State Management
**Principle:** All state in files, CLI scripts render views
**Files:**
- `intervention/needed-*.json` - Requests
- `intervention/response-*.json` - Responses
- `intervention/history/` - Audit trail
- `migration-log.md` - Activity log (future)

**Benefits:**
- Easy debugging (inspect files directly)
- Simple testing (create files manually)
- No database required
- Same commands work locally and in CI
- Complete audit trail with timestamps

### Test Helper Patterns
**JSON Generation:** Use `jq` for proper escaping instead of heredocs
```bash
jq -n --arg question "$question" '{question: $question}'
```
**Benefit:** Handles special characters, quotes, newlines correctly

**Docker Helpers:** Reusable functions in `helpers.bash`
- `start_test_container` / `stop_test_container`
- `docker_is_running` / `container_exists`
**Benefit:** Consistent Docker testing across test suites

## Dependencies

-   Docker & Docker Compose
-   Claude Code CLI (installable via npm or direct download)
-   Node.js 24+ (matches project requirement)
-   pnpm 10.26.1+ (matches project requirement)
-   Playwright (already in project dependencies)
-   Git (for worktree management)

## Testing Strategy

Phase 0 implements a comprehensive 4-tier testing strategy using Bats (Bash Automated Testing System):

### Tier 1: Unit Tests (Bats)
**Command:** `./scripts/test-runner.sh`
**Duration:** ~3s
**Coverage:** 33 automated tests
- Intervention file creation and validation
- Response file structure
- JSON validation with special characters
- Multi-file intervention support
- Script existence and permissions
- Dependencies and configuration

**Test Suites:**
- `intervention-protocol.bats` (13 tests)
- `migrate-scripts.bats` (20 tests)

### Tier 2: Environment Validation
**Command:** `./scripts/validate-phase0.sh`
**Duration:** ~3s
**Includes:** Tier 1 + environment checks
- Docker configuration validation
- Container health (if running)
- Volume mount verification
- TypeScript dependencies

### Tier 3: Full Docker Integration
**Command:** `./scripts/validate-phase0.sh --docker`
**Duration:** ~30s
**Includes:** Tier 1 + Tier 2 + Docker lifecycle
- Fresh container build
- Run all tests in container
- Automatic teardown (use `--keep-container` to preserve)
- Timestamped containers to avoid conflicts

### Tier 4: Live Integration Testing
**Command:** `./scripts/validate-phase0.sh --integration`
**Duration:** ~10s
**Includes:** All previous tiers + live watcher test
- Start TypeScript watcher in background
- Create intervention files dynamically
- Verify real-time file detection
- Test complete workflow

**Command:** `./scripts/validate-phase0.sh --with-mock-claude`
**Duration:** ~15s
**Mock CLI Testing:**
- Start mock Claude Code CLI (`mock-claude-code.sh`)
- Simulate intervention request
- Verify watcher detects and responds
- Confirm automatic archiving
- Validate complete workflow without API calls

### Phase 3+ Testing Strategy

**Filesystem Simulation (Implemented in Phase 1):**
The `test-dynamic-plans.sh` script supports dual-mode testing:
- **Real API mode**: Full end-to-end validation with actual Claude Code CLI
- **Simulated mode**: Creates output files directly without API calls
- Simulated mode tests orchestration logic without API costs
- No HTTP mocking needed - Claude's tool call execution is too complex to mock meaningfully

**End-to-End Testing:**
- Full workflow loop (plan → build → test → commit)
- Multi-worker concurrent execution
- Error recovery and retry logic
- Playwright screenshot validation

**CI Testing:**
- GitHub Actions workflow execution
- Artifact validation (screenshots, logs)
- Multi-environment matrix testing

## Future Enhancements

-   Web dashboard for status visualization (beyond terminal UI)
-   Support for external SFRA staging URL (mentioned but not first pass)
-   Integration with migration framework's adapter pattern
-   Advanced error recovery and retry logic
-   Parallel worker coordination and conflict detection
