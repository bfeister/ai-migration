# Phase 0: Docker Foundation & Intervention Protocol

## Overview

Phase 0 provides the Docker execution environment for Claude Code migrations with a file-based user intervention protocol. It includes comprehensive automated testing to ensure reliability.

## Quick Start

### 1. Setup Environment

```bash
# Copy environment template
cp .env.example .env

# Edit .env and add your API key (optional for testing)
# ANTHROPIC_API_KEY=sk-ant-...
```

### 2. Install Dependencies

```bash
# Install TypeScript watcher dependencies
cd scripts && pnpm install && cd ..
```

### 3. Validate Installation

```bash
# Quick validation (checks existing setup)
./scripts/validate-phase0.sh

# Full validation with fresh Docker container
./scripts/validate-phase0.sh --docker

# Complete validation with integration tests
./scripts/validate-phase0.sh --docker --integration
```

This runs automated tests to verify:
- 33 Bats unit tests (file structure, JSON validation, etc.)
- Directory structure and permissions
- Docker setup and container health
- Claude Code CLI installation
- TypeScript watcher functionality
- Intervention protocol (file-based queue)
- Volume mounts

## Testing Infrastructure

Phase 0 includes a comprehensive testing suite:

### Test Levels

**Level 1: Unit Tests (Bats)**
```bash
./scripts/test-runner.sh                  # All tests (~3s)
./scripts/test-runner.sh --test intervention-protocol  # Specific suite
./scripts/test-runner.sh -v              # Verbose output
```

- **33 automated tests** covering:
  - Intervention file creation and validation
  - Response file structure
  - JSON validation with special characters
  - Multi-file intervention support
  - Script existence and permissions
  - Dependencies and configuration

**Level 2: Environment Validation**
```bash
./scripts/validate-phase0.sh             # Standard (~3s)
```

- Includes Level 1 tests
- Validates Docker environment
- Checks container health (if running)
- Verifies volume mounts

**Level 3: Full Docker Integration**
```bash
./scripts/validate-phase0.sh --docker    # Full (~30s)
```

- Includes Level 1 + Level 2
- **Builds fresh Docker container**
- Runs all tests in container
- **Tears down container** (use `--keep-container` to preserve)
- Shows duration including setup/teardown

**Level 4: Live Watcher Integration**
```bash
./scripts/validate-phase0.sh --integration  # With live watcher (~10s)
./scripts/validate-phase0.sh --docker --integration  # Complete (~40s)
```

- Includes all previous levels
- Starts TypeScript watcher in background
- Creates intervention files dynamically
- Verifies real-time file detection
- Tests complete workflow

### Test Documentation

See [scripts/TESTING.md](scripts/TESTING.md) for detailed testing documentation including:
- Writing new tests
- Available helper functions
- CI/CD integration
- Troubleshooting tests

## Available Commands

### Container Management

```bash
# Start container
./scripts/migrate-run.sh

# Stop container
docker stop claude-migration

# View container logs
docker logs -f claude-migration

# Enter container shell
docker exec -it claude-migration bash
```

### Status & Monitoring

```bash
# View current status (one-time)
./scripts/migrate-status.sh

# Watch status continuously (updates every 2s)
watch -n 2 ./scripts/migrate-status.sh

# Monitor for intervention requests (TypeScript with interactive prompts)
./scripts/migrate-watch.sh
```

### Intervention Protocol

The intervention protocol uses a **multi-file pattern** to support concurrent worker threads:

**File Naming Convention:**
- Intervention: `intervention/needed-{worker-id}.json`
- Response: `intervention/response-{worker-id}.json`

**Creating Intervention Files:**

```bash
# Single-line format (easy to copy/paste)
echo '{"timestamp":"2026-01-14T00:00:00Z","question":"Which CSS framework?","options":["Tailwind","CSS Modules","Styled Components"],"worker_id":"worker-1"}' > intervention/needed-worker-1.json

# Multiple interventions from different workers
echo '{"timestamp":"2026-01-14T00:00:00Z","question":"State management?","options":["Redux","Zustand","Context API"],"worker_id":"worker-1"}' > intervention/needed-worker-1.json
echo '{"timestamp":"2026-01-14T00:01:00Z","question":"CSS framework?","options":["Tailwind","CSS Modules"],"worker_id":"worker-2"}' > intervention/needed-worker-2.json
```

**Using the Interactive Watcher:**

The TypeScript watcher (`migrate-watch.sh`) provides an interactive interface:

1. **Detects intervention files** automatically (watches `intervention/needed-*.json`)
2. **Interactive selection** if multiple interventions exist
3. **Responds inline** with arrow keys + enter (no separate script needed)
4. **Auto-archives** interventions and responses when complete

```bash
# Start the watcher
./scripts/migrate-watch.sh

# In another terminal, create intervention files
# The watcher will detect them and prompt for response
```

**Legacy Response Script (Optional):**

For backwards compatibility or scripting:

```bash
# Note: This uses the old single-file pattern
./scripts/migrate-respond.sh "your answer here"
```

**View Intervention History:**

```bash
ls -la intervention/history/
# Shows timestamped archives: 2026-01-14T12-00-00Z_needed-worker-1.json
```

## What Phase 0 Includes

✅ **Docker Environment**
- Alpine Linux base with Node.js 24
- pnpm 10.26.1 installed
- Claude Code CLI installed
- Git and essential tools (bash, jq, curl)

✅ **Multi-File Intervention Protocol**
- Pattern: `intervention/needed-{worker-id}.json` for requests
- Pattern: `intervention/response-{worker-id}.json` for responses
- `intervention/history/` - Timestamped archives for audit trail
- Supports concurrent interventions from multiple workers

✅ **TypeScript Interactive Watcher**
- `migrate-watch.ts` - Main TypeScript implementation
- `migrate-watch.sh` - Bash wrapper
- Real-time file watching with chokidar
- Interactive prompts with arrow key navigation
- Queue management for multiple interventions
- Automatic archiving with timestamps
- System notifications (macOS)

✅ **CLI Scripts**
- `migrate-run.sh` - Start container
- `migrate-status.sh` - View status (ASCII art display)
- `migrate-watch.sh` - Interactive TypeScript watcher
- `migrate-respond.sh` - Legacy response script
- `validate-phase0.sh` - Comprehensive validation with multiple modes
- `test-runner.sh` - Automated test orchestrator

✅ **Comprehensive Testing**
- 33 Bats unit tests (intervention protocol + scripts)
- Integration tests (live watcher detection)
- Docker lifecycle tests (build, start, test, teardown)
- Test helpers and utilities
- CI/CD ready

✅ **Logging** (Placeholder)
- `migration-log.md` - Append-only log of all activity
- Color-coded log entries (INFO, SUCCESS, ERROR, WARNING)

✅ **Volume Mounts**
- Entire project mounted at `/workspace` (except node_modules)
- Files created in container visible on host and vice versa

## What Phase 0 Does NOT Include

❌ Git worktree integration (Phase 1)
❌ Build validation (Phase 2)
❌ Git commit automation (Phase 2)
❌ Iterative workflow loop (Phase 2)
❌ Actual migration plan execution (placeholder only)

## Architecture

```
Host Machine
├── scripts/                      # CLI scripts
│   ├── migrate-run.sh           # Container management
│   ├── migrate-status.sh        # Status display
│   ├── migrate-watch.ts         # TypeScript watcher (main)
│   ├── migrate-watch.sh         # Watcher wrapper
│   ├── migrate-respond.sh       # Legacy response script
│   ├── validate-phase0.sh       # Validation orchestrator
│   ├── test-runner.sh           # Test orchestrator
│   ├── package.json             # TypeScript dependencies
│   ├── tsconfig.json            # TypeScript config
│   ├── TESTING.md               # Test documentation
│   └── tests/                   # Bats test suites
│       ├── helpers.bash         # Shared utilities
│       ├── intervention-protocol.bats
│       └── migrate-scripts.bats
│
├── intervention/                 # Intervention protocol (filesystem-based)
│   ├── needed-worker-1.json     # Worker 1 intervention
│   ├── needed-worker-2.json     # Worker 2 intervention
│   ├── response-worker-1.json   # Worker 1 response
│   └── history/                 # Timestamped archives
│       ├── 2026-01-14T12-00-00Z_needed-worker-1.json
│       └── 2026-01-14T12-00-00Z_response-worker-1.json
│
├── migration-log.md             # Append-only activity log
│
└── docker/
    ├── Dockerfile               # Container definition
    ├── docker-compose.yml       # Container orchestration
    └── entrypoint.sh            # Container startup script
             │
             └──> Docker Container (claude-migration)
                  ├── Node.js 24 + pnpm 10.26.1
                  ├── Claude Code CLI (@anthropic-ai/claude-code)
                  ├── Git, bash, jq, curl
                  └── /workspace (volume mount to host)
```

## Multi-File Intervention Pattern

Phase 0 implements a **multi-file pattern** to support concurrent worker threads:

### Why Multi-File?

- **Concurrency**: Multiple worker threads can request interventions simultaneously
- **No Conflicts**: Each worker writes to its own file
- **Queue Management**: Watcher maintains queue of all pending interventions
- **Selective Response**: User can choose which intervention to respond to first

### File Naming Convention

**Intervention Files:**
```
intervention/needed-{worker-id}.json
intervention/needed-{worker-id}-{timestamp}.json  # Alternative with timestamp
```

**Response Files:**
```
intervention/response-{worker-id}.json
```

**Archived Files:**
```
intervention/history/{timestamp}_needed-{worker-id}.json
intervention/history/{timestamp}_response-{worker-id}.json
```

### TypeScript Watcher Features

The `migrate-watch.ts` implementation provides:

1. **Directory Watching**: Monitors `intervention/` for `needed-*.json` files
2. **Queue Management**: Tracks multiple interventions with unique IDs
3. **Interactive Selection**:
   - Single intervention → Shows immediately
   - Multiple interventions → Presents selection menu
4. **Interactive Response**:
   - Multiple choice → Arrow keys + enter
   - Free text → Type response
   - Custom option → Always available for multiple choice
5. **Automatic Archiving**: Timestamps and archives both intervention and response
6. **System Notifications**: Desktop notifications on macOS

## Files as Source of Truth

Phase 0 implements the principle: **Filesystem is the single source of truth**.

All state is stored in files:
- `intervention/needed-*.json` - Intervention requests (one per worker)
- `intervention/response-*.json` - Intervention responses
- `migration-log.md` - Activity log
- `intervention/history/` - Timestamped audit trail

CLI scripts **read** from these files and **render** status. No databases, no complex state management—just files.

This design makes it easy to:
- **Debug**: Inspect files directly with any text editor
- **Test**: Create files manually or with scripts
- **Extend**: Add new file-based signals without code changes
- **Monitor**: Same commands work locally and in CI
- **Audit**: Complete history preserved with timestamps

## Troubleshooting

### Tests Failing

```bash
# Run verbose tests to see details
./scripts/test-runner.sh -v

# Run specific test suite
./scripts/test-runner.sh --test intervention-protocol

# Check if dependencies installed
cd scripts && pnpm install
```

### Container won't start

```bash
# Check Docker is running
docker info

# Check for port conflicts
docker ps -a

# Rebuild from scratch
docker stop claude-migration
docker rm claude-migration
cd docker && docker-compose build --no-cache
docker-compose up -d
```

### API key not working

```bash
# Verify .env file exists
cat .env | grep ANTHROPIC_API_KEY

# Note: API key is optional for testing Phase 0
# Container validation tests work without a real API key

# Restart container to reload environment
docker restart claude-migration
```

### Volume mounts not working

```bash
# Test volume mount
echo "test" > test-file.txt
docker exec claude-migration cat /workspace/test-file.txt
# Should print "test"
rm test-file.txt
```

### Watcher not detecting files

```bash
# Check if watcher is running
ps aux | grep migrate-watch

# Run with visible output to debug
./scripts/migrate-watch.sh

# Check file naming pattern
ls intervention/needed-*.json
# Files must match pattern: needed-*.json
```

### TypeScript errors

```bash
# Reinstall dependencies
cd scripts
rm -rf node_modules
pnpm install
cd ..

# Check TypeScript compilation
cd scripts
npx tsc --noEmit
```

## Validation Modes

The `validate-phase0.sh` script supports multiple modes:

| Mode | Duration | What It Does |
|------|----------|--------------|
| `./scripts/validate-phase0.sh` | ~3s | Quick check, assumes container exists |
| `./scripts/validate-phase0.sh --docker` | ~30s | Full Docker lifecycle (build, test, teardown) |
| `./scripts/validate-phase0.sh --integration` | ~10s | Adds live watcher test |
| `./scripts/validate-phase0.sh --docker --integration` | ~40s | Complete validation |
| `./scripts/validate-phase0.sh --skip-bats` | ~1s | Environment check only |
| `./scripts/validate-phase0.sh --docker --keep-container` | ~30s | Docker test but keeps container |

### Expected Warnings

When running validation, these warnings are **expected and OK**:

- **⚠️ .env exists but API key format unclear**: Container tests don't need a real API key
- **⚠️ Entrypoint process may not be running**: Test containers use `sleep infinity` instead of entrypoint
- **⚠️ Migration log file not created yet**: Log is created during actual migration runs

## Two-Repo Architecture

Phase 0 establishes the foundation for a **two-repository design**:

**1. Orchestration Repo (this directory - `test-storefront/`)**
- Tracks migration execution state: `migration-log.md`, `intervention/history/`
- Contains infrastructure: Docker config, CLI scripts, testing
- Git commits: Orchestration state snapshots for resumability
- Separate from project code changes

**2. Project Repo (`storefront-next/` child directory)**
- The actual codebase being migrated (separate git repository)
- Workers create branches here: `migration/worker-1`, `migration/worker-2`, etc.
- Git commits: Real code changes from migration work
- Push to real GitHub repo for PR workflow

**Key Benefit:** If migration is interrupted, both repos show exact state:
- Orchestration repo: What happened, which workers ran, all interventions
- Project repo: What code changed, what was committed, build status

See the main plan file (`dockerized_claude_code_migration_runner_55f331bd.plan.md`) for full architectural details.

## Next: Phase 1

Once Phase 0 is validated, proceed to Phase 1:
- Git worktree initialization in `storefront-next/` project repo
- Single Docker container with worker process executing in worktree context
- Workers commit to project repo, orchestration logs to orchestration repo
- Git authentication setup for pushing to GitHub from container

## Success Criteria

Run `./scripts/validate-phase0.sh --docker` and verify:

✅ **Automated Tests**: 33 Bats tests passing
✅ **Directory Structure**: All required directories exist
✅ **Required Files**: Scripts and configs present
✅ **Permissions**: Scripts are executable
✅ **Docker**: Container builds and runs
✅ **Container Health**: jq, git, Claude CLI installed
✅ **TypeScript Watcher**: Dependencies installed, syntax valid
✅ **Intervention Protocol**: Files created, detected, archived
✅ **Volume Mounts**: Host files visible in container

**Complete validation output:**
```
✅ Phase 0 Validation: ALL TESTS PASSED

Total Tests: 45
Passed:      45
Failed:      0
Duration:    28s (including Docker setup/teardown)
```

If all tests pass, **Phase 0 is complete!** 🎉

## Quick Reference

### One-Line Test Commands

```bash
# Create single intervention
echo '{"timestamp":"2026-01-14T00:00:00Z","question":"Test question?","options":["A","B","C"],"worker_id":"test-1"}' > intervention/needed-test-1.json

# Create multiple interventions
echo '{"question":"Question 1?","options":["A","B"],"worker_id":"w1"}' > intervention/needed-w1.json && echo '{"question":"Question 2?","worker_id":"w2"}' > intervention/needed-w2.json

# Clean up test files
rm -f intervention/needed-test-*.json intervention/response-test-*.json
```

### Directory Structure Check

```bash
# Verify Phase 0 structure
tree -L 2 -I 'node_modules|storefront-*' .
```

### Quick Docker Commands

```bash
# Full rebuild
docker-compose -f docker/docker-compose.yml down
docker-compose -f docker/docker-compose.yml build --no-cache
docker-compose -f docker/docker-compose.yml up -d

# Container shell
docker exec -it claude-migration /bin/sh

# View logs
docker logs claude-migration --tail 50 -f
```
