---
name: Dockerized Claude Code Migration Runner
overview: Create a Docker-based execution environment for Claude Code that isolates migration work, supports both local Docker and GitHub Actions CI, provides terminal-based status monitoring, and implements an iterative build-test-commit workflow with Playwright validation.
todos:
    - id: docker-foundation
      content: 'Create Docker foundation: Dockerfile with Node.js/pnpm/Claude Code CLI, docker-compose.yml with volume mounts, .dockerignore to exclude node_modules, and .env.example template'
      status: pending
    - id: status-management
      content: 'Implement status management: Create migration-status.json schema, status writer in orchestrator script, and migrate-status.sh CLI script that reads from container'
      status: pending
      dependencies:
          - docker-foundation
    - id: claude-code-integration
      content: 'Integrate Claude Code: Install CLI in Docker image, create plan execution wrapper that runs claude code run --dangerously-skip-permissions, and implement output-log.md writer for each worker'
      status: pending
      dependencies:
          - docker-foundation
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
          - docker-foundation
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

```
┌─────────────────────────────────────────────────────────────┐
│                    Host Machine                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  CLI Commands (migrate-status, migrate-run, etc.)    │  │
│  └──────────────────────────────────────────────────────┘  │
│                          │                                  │
│                          │ Docker Socket                    │
│                          ▼                                  │
│  ┌──────────────────────────────────────────────────────┐  │
│  │         Docker Container (claude-migration)          │  │
│  │  ┌────────────────────────────────────────────────┐  │  │
│  │  │  Migration Orchestrator                       │  │  │
│  │  │  - Status Manager (writes status.json)        │  │  │
│  │  │  - Worktree Manager                           │  │  │
│  │  │  - Claude Code Runner                         │  │  │
│  │  └────────────────────────────────────────────────┘  │  │
│  │                          │                            │  │
│  │  ┌────────────────────────────────────────────────┐  │  │
│  │  │  Merge Worker Threads (parallel)               │  │  │
│  │  │  ┌──────────┐  ┌──────────┐  ┌──────────┐   │  │  │
│  │  │  │ Worker 1 │  │ Worker 2 │  │ Worker N │   │  │  │
│  │  │  │ worktree │  │ worktree │  │ worktree │   │  │  │
│  │  │  │ output-  │  │ output-  │  │ output-  │   │  │  │
│  │  │  │ log.md   │  │ log.md   │  │ log.md   │   │  │  │
│  │  │  └──────────┘  └──────────┘  └──────────┘   │  │  │
│  │  └────────────────────────────────────────────────┘  │  │
│  │                                                       │  │
│  │  ┌────────────────────────────────────────────────┐  │  │
│  │  │  Iterative Workflow Loop                       │  │  │
│  │  │  1. Plan (Claude Code)                         │  │  │
│  │  │  2. Build (pnpm build)                         │  │  │
│  │  │  3. Screenshot (Playwright)                    │  │  │
│  │  │  4. Commit (git)                                │  │  │
│  │  │  5. Log (output-log.md)                        │  │  │
│  │  └────────────────────────────────────────────────┘  │  │
│  └──────────────────────────────────────────────────────┘  │
│                          │                                  │
│                          │ Volume Mount                     │
│                          ▼                                  │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Shared Filesystem (all files except node_modules)   │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
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
├── docker/
│   ├── Dockerfile
│   ├── docker-compose.yml
│   └── entrypoint.sh
├── scripts/
│   ├── migrate-status.sh          # Terminal UI for status
│   ├── migrate-run.sh              # Start migration
│   └── migrate-init.sh             # Initialize worktrees
├── .env.example                     # API key template
├── .dockerignore                    # Exclude node_modules
├── migration-status.json           # Global status (in container)
└── worktrees/                      # Git worktrees (shared)
    ├── home/
    │   └── output-log.md
    ├── pdp/
    │   └── output-log.md
    └── ...
```

## Implementation Steps

1. **Docker Foundation**

    - Create Dockerfile with Node.js, pnpm, Claude Code CLI
    - Set up docker-compose.yml with volume mounts
    - Configure .dockerignore to exclude node_modules
    - Test basic container startup

2. **Status Management**

    - Create `migration-status.json` schema
    - Implement status writer in orchestrator
    - Create `migrate-status.sh` CLI script
    - Test status reading from container

3. **Claude Code Integration**

    - Install Claude Code CLI in Docker image
    - Create plan execution wrapper
    - Implement output-log.md writer
    - Test Claude Code execution in container

4. **Iterative Workflow**

    - Implement workflow loop (plan → build → test → commit)
    - Integrate Playwright screenshot capture
    - Add git commit automation
    - Test end-to-end workflow

5. **Terminal UI**

    - Build status display script
    - Add live update mechanism
    - Format worker status table
    - Add error handling and graceful degradation

6. **CI Integration**

    - Create GitHub Actions workflow
    - Test in CI environment
    - Document CI usage

7. **Documentation**

    - README for Docker setup
    - Usage guide for CLI commands
    - Troubleshooting guide

## Key Design Decisions

1. **Volume Mounts**: Share all files except `node_modules` to avoid Docker filesystem overhead while maintaining isolation
2. **Status File**: JSON file for easy parsing by both container and host CLI
3. **Markdown Logs**: `output-log.md` files are human-readable and Claude Code can modify them
4. **Terminal UI**: Bash-based for portability, uses ANSI codes for formatting
5. **Worktree Isolation**: Each worker gets its own git worktree to avoid conflicts
6. **CI-First Design**: Ensure Docker setup works in GitHub Actions from the start

## Dependencies

-   Docker & Docker Compose
-   Claude Code CLI (installable via npm or direct download)
-   Node.js 24+ (matches project requirement)
-   pnpm 10.26.1+ (matches project requirement)
-   Playwright (already in project dependencies)
-   Git (for worktree management)

## Testing Strategy

1. **Local Testing**: Run Docker setup locally, verify status updates
2. **Workflow Testing**: Execute full iterative loop, verify commits and logs
3. **CI Testing**: Push to GitHub, verify Actions workflow runs
4. **Integration Testing**: Test with actual migration plan from master plan

## Future Enhancements

-   Web dashboard for status visualization (beyond terminal UI)
-   Support for external SFRA staging URL (mentioned but not first pass)
-   Integration with migration framework's adapter pattern
-   Advanced error recovery and retry logic
-   Parallel worker coordination and conflict detection
