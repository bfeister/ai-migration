---
name: Dockerized Claude Code Migration Runner
overview: Create a Docker-based execution environment for Claude Code that isolates migration work, supports both local Docker and GitHub Actions CI, provides terminal-based status monitoring, and implements an iterative build-test-commit workflow with Playwright validation.
todos:
    - id: phase0-foundation
      content: 'Phase 0 (COMPLETED): Docker foundation, intervention protocol, TypeScript watcher, comprehensive testing (33 Bats tests), validation scripts, and documentation'
      status: completed
    - id: phase1-worktree-setup
      content: 'Phase 1: Git worktree initialization, worktree-aware Docker configuration, and mock Claude Code CLI integration tests with HTTP API mocking'
      status: pending
      dependencies:
          - phase0-foundation
    - id: status-management
      content: 'Implement status management: Create migration-status.json schema, status writer in orchestrator script, and migrate-status.sh CLI script that reads from container'
      status: pending
      dependencies:
          - phase1-worktree-setup
    - id: claude-code-integration
      content: 'Integrate Claude Code: Create plan execution wrapper that runs claude code run --dangerously-skip-permissions, implement output-log.md writer for each worker, and validate with real CLI'
      status: pending
      dependencies:
          - phase1-worktree-setup
    - id: iterative-workflow
      content: 'Build iterative workflow loop: Implement plan → build (pnpm build) → test (Playwright screenshots) → commit (git) → log (output-log.md) cycle with error handling'
      status: pending
      dependencies:
          - claude-code-integration
          - status-management
    - id: terminal-ui
      content: 'Create terminal-based UI: Build migrate-status.sh with live updates, ANSI formatting, worker status table, and screenshot/commit info display'
      status: pending
      dependencies:
          - status-management
    - id: ci-integration
      content: 'Add GitHub Actions CI support: Create .github/workflows/migration.yml workflow, configure secrets for API key, and test Docker execution in CI'
      status: pending
      dependencies:
          - phase1-worktree-setup
          - iterative-workflow
    - id: dev-server-integration
      content: 'Integrate local dev server: Configure Playwright to start pnpm dev server, wait for ready, capture screenshots of key pages, and save with worker ID/timestamp'
      status: pending
      dependencies:
          - iterative-workflow
    - id: documentation
      content: 'Write documentation: Create README for Docker setup, usage guide for CLI commands, troubleshooting guide, and CI setup instructions'
      status: pending
      dependencies:
          - ci-integration
          - terminal-ui
---

# Dockerized Claude Code Migration Runner

## Overview

This plan creates a Docker-based execution environment for running Claude Code migrations in isolation, supporting both local development and GitHub Actions CI. The system will manage multiple Merge Worker threads, each with their own worktree and `output-log.md` file, with terminal-based status monitoring and an iterative build-test-commit workflow.

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
├── .env.example                               # Phase 0 ✅ API key template
├── PHASE0-README.md                           # Phase 0 ✅ Complete documentation
├── migration-log.md                           # Phase 0 ✅ Activity log (placeholder)
│
├── migration-status.json                      # Phase 1: Global status (in container)
└── worktrees/                                 # Phase 1: Git worktrees (shared)
    ├── home/
    │   └── output-log.md
    ├── pdp/
    │   └── output-log.md
    └── ...
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

### Phase 1: Git Worktree Setup (PENDING)

**Git Worktree Integration:**
- Create worktree initialization script
- Implement worktree-aware Docker configuration
- Support multiple workers with isolated branches
- Worktree cleanup and management

**HTTP API Mocking:**
- Implement HTTP request interception for Claude Code CLI
- Mock Anthropic API responses for testing
- Replace Phase 0's CLI-level mocking with API-level mocking
- Support recording/playback of API interactions

**Integration Testing:**
- Test worktree isolation across workers
- Validate concurrent execution without conflicts
- Test API mocking with real Claude Code CLI

### Phase 2: Iterative Workflow (PENDING)

**Build Validation:**
- Implement build step (pnpm build) after Claude Code execution
- Capture and log build errors
- Retry logic for build failures

**Playwright Screenshot Integration:**
- Start dev server (`pnpm dev`)
- Wait for server ready
- Capture screenshots of key pages
- Save with worker ID and timestamp

**Git Commit Automation:**
- Stage changes in worktree
- Generate commit messages based on phase
- Push to remote branch

**Workflow Loop:**
- Plan → Build → Test → Commit → Log cycle
- Error handling and recovery
- Progress tracking

### Phase 3: Status Management & Terminal UI (PENDING)

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

### Phase 4: CI Integration (PENDING)

**GitHub Actions Workflow:**
- `.github/workflows/migration.yml`
- Docker execution in CI
- Secrets management for API key
- Artifact upload (screenshots, logs)

### Phase 5: Documentation (PENDING)

**User-Facing Documentation:**
- Overall README for system
- Usage guide for all CLI commands
- Troubleshooting guide
- CI setup instructions

## Key Design Decisions

1. **Volume Mounts**: Share all files except `node_modules` to avoid Docker filesystem overhead while maintaining isolation
2. **Status File**: JSON file for easy parsing by both container and host CLI
3. **Markdown Logs**: `output-log.md` files are human-readable and Claude Code can modify them
4. **Terminal UI**: Bash-based for portability, uses ANSI codes for formatting
5. **Worktree Isolation**: Each worker gets its own git worktree to avoid conflicts
6. **CI-First Design**: Ensure Docker setup works in GitHub Actions from the start
7. **File-Based Protocol**: Filesystem as single source of truth - no databases or complex state management
8. **Multi-File Pattern**: Separate intervention files per worker to support concurrent execution
9. **TypeScript for Interactivity**: Use TypeScript with chokidar for reliable file watching and prompts for better UX
10. **Test-First Approach**: Comprehensive automated testing (33 tests) before feature implementation

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
**Short-Term (Phase 0):**
- Mock the CLI tool itself with bash script (`mock-claude-code.sh`)
- Simulates file-based intervention protocol
- No API calls, fast tests (~15s)

**Long-Term (Phase 1+):**
- Mock HTTP API calls to Anthropic
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

### Phase 1+ Testing Strategy

**HTTP API Mocking:**
When the real Claude Code CLI is integrated in Phase 1, replace the Phase 0 CLI-level mock with HTTP-level mocking:
- Use tools like `nock` or `msw` to intercept Anthropic API requests
- Record real API interactions for playback
- Test with actual Claude Code CLI but mocked responses
- Validate API error handling and retry logic

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
