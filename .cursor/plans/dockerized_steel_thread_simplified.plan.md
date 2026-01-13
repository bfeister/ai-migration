# Dockerized Claude Code Migration Runner - Steel Thread

## Overview

This is a **simplified steel thread** implementation focusing on proving core concepts with ONE Docker container and ONE migration worker thread. The goal is to validate the fundamental workflow before adding multi-worker parallelization, sophisticated status UIs, or CI integration.

### Critical Design Requirement: User Intervention

Claude Code may need user input during execution (questions, clarifications, decisions). This plan includes a **file-based intervention protocol** that allows the host to "drill into" the running Docker container and provide feedback when needed.

## Architecture (Simplified)

```
┌──────────────────────────────────────────────────────────┐
│                    Host Machine                          │
│  ┌────────────────────────────────────────────────────┐ │
│  │  CLI Commands                                      │ │
│  │  - migrate-run.sh    (start migration)            │ │
│  │  - migrate-watch.sh  (monitor for intervention)   │ │
│  │  - migrate-respond.sh (provide feedback)          │ │
│  └────────────────────────────────────────────────────┘ │
│                          │                               │
│                          │ Docker Socket + Volumes       │
│                          ▼                               │
│  ┌────────────────────────────────────────────────────┐ │
│  │  Docker Container (claude-migration)               │ │
│  │  ┌──────────────────────────────────────────────┐ │ │
│  │  │  Migration Runner (Single Worker)            │ │ │
│  │  │  - Claude Code CLI execution                 │ │ │
│  │  │  - Intervention detector/responder           │ │ │
│  │  │  - Simple status logger                      │ │ │
│  │  └──────────────────────────────────────────────┘ │ │
│  │                          │                         │ │
│  │  ┌──────────────────────────────────────────────┐ │ │
│  │  │  Workflow Loop                               │ │ │
│  │  │  1. Plan (Claude Code + intervention)       │ │ │
│  │  │  2. Build (pnpm build)                       │ │ │
│  │  │  3. Commit (git)                             │ │ │
│  │  │  4. Log (simple markdown)                    │ │ │
│  │  └──────────────────────────────────────────────┘ │ │
│  └────────────────────────────────────────────────────┘ │
│                          │                               │
│                          │ Volume Mounts                 │
│                          ▼                               │
│  ┌────────────────────────────────────────────────────┐ │
│  │  Shared Filesystem                                 │ │
│  │  - worktree/           (single worktree)          │ │
│  │  - intervention/       (intervention files)        │ │
│  │  - migration-log.md    (simple append-only log)   │ │
│  └────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────┘
```

## Key Simplifications from Original Plan

**What we're KEEPING:**

- Docker isolation for Claude Code execution
- Git worktree for migration work
- Basic build validation (pnpm build)
- Git commit automation
- Simple markdown logging

**What we're DEFERRING:**

- Multiple parallel workers (start with ONE)
- Complex terminal UI with ANSI formatting (simple CLI scripts instead)
- Playwright screenshot validation (not in steel thread)
- GitHub Actions CI integration (local-first)
- Sophisticated status management (JSON-based state machine)

**What we're ADDING:**

- **User intervention protocol** (critical missing piece)

## User Intervention Mechanism

### The Challenge

Claude Code CLI may pause execution to ask questions:

- "Which library should I use for X?"
- "Should I refactor this component?"
- "I found an error, how should I proceed?"

In a Docker container running headless, we need a way to:

1. **Detect** when intervention is needed
2. **Surface** the question to the host
3. **Capture** the user's response
4. **Resume** Claude Code execution with the answer

### File-Based Intervention Protocol

**Design:** Use shared volume with simple JSON files for bidirectional communication.

#### File Structure

```
intervention/
├── needed.json          # Written by Claude Code when input needed
├── response.json        # Written by host with user's answer
└── history/             # Archive of past interventions
    ├── 2026-01-13T10-00-00.json
    └── ...
```

#### Protocol Flow

1. **Claude Code needs input:**
   ```json
   // intervention/needed.json
   {
     "timestamp": "2026-01-13T10:00:00Z",
     "question": "Which state management library should I use?",
     "options": ["Redux", "Zustand", "Context API"],
     "context": "I found 3 approaches in the codebase...",
     "worker_id": "home-page-migration"
   }
   ```

2. **Host CLI detects (migrate-watch.sh polls every 2s):**
   ```bash
   # Terminal output:
   🔔 User intervention needed!
   
   Question: Which state management library should I use?
   Context: I found 3 approaches in the codebase...
   
   Options:
   1. Redux
   2. Zustand
   3. Context API
   
   Run: migrate-respond.sh "your answer"
   ```

3. **User responds via CLI:**
   ```bash
   $ migrate-respond.sh "Zustand"
   ```

4. **Host writes response:**
   ```json
   // intervention/response.json
   {
     "timestamp": "2026-01-13T10:05:00Z",
     "response": "Zustand",
     "question_timestamp": "2026-01-13T10:00:00Z"
   }
   ```

5. **Claude Code reads response and continues:**

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                - Delete `needed.json` (signal consumed)
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                - Move to `history/` for audit trail
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                - Resume execution with user's choice

#### Implementation Details

**Docker Side (entrypoint.sh wrapper):**

```bash
#!/bin/bash
# Wrapper that monitors Claude Code output for intervention signals

# Claude Code will write to intervention/needed.json when it needs input
# We just need to pause and wait for response.json to appear

while true; do
  if [ -f /workspace/intervention/needed.json ]; then
    echo "[INTERVENTION] Waiting for user response..."

    # Wait for response.json to appear
    while [ ! -f /workspace/intervention/response.json ]; do
      sleep 2
    done

    # Response received, log it and continue
    echo "[INTERVENTION] Response received, resuming..."

    # Archive the intervention
    TIMESTAMP=$(date -u +"%Y-%m-%dT%H-%M-%S")
    mv /workspace/intervention/needed.json /workspace/intervention/history/${TIMESTAMP}-needed.json
    mv /workspace/intervention/response.json /workspace/intervention/history/${TIMESTAMP}-response.json
  fi

  sleep 2
done
```

**Host Side (migrate-watch.sh):**

```bash
#!/bin/bash
# Monitor for intervention requests

while true; do
  if [ -f ./intervention/needed.json ]; then
    # Parse and display intervention request
    echo "🔔 User intervention needed!"
    cat ./intervention/needed.json | jq -r '.question'
    echo ""
    echo "Run: migrate-respond.sh \"your answer\""

    # Wait for response before checking again
    while [ -f ./intervention/needed.json ]; do
      sleep 2
    done
  fi

  sleep 2
done
```

**Host Side (migrate-respond.sh):**

```bash
#!/bin/bash
# Provide response to intervention request

RESPONSE="$1"

if [ ! -f ./intervention/needed.json ]; then
  echo "❌ No intervention needed"
  exit 1
fi

# Write response
cat > ./intervention/response.json <<EOF
{
  "timestamp": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "response": "$RESPONSE",
  "question_timestamp": "$(cat ./intervention/needed.json | jq -r '.timestamp')"
}
EOF

echo "✅ Response sent: $RESPONSE"
```

### Architecture: Files as Source of Truth

**Design Principle:** Filesystem is the single source of truth. All presentation layers (CLI, future HTTP server) read from files and render status.

```
┌─────────────────────────────────────────────────────────┐
│  Source of Truth: Filesystem                            │
│  - intervention/needed.json                             │
│  - intervention/response.json                           │
│  - migration-log.md                                     │
│  - worktrees/*/.git                                     │
└─────────────────────────────────────────────────────────┘
                          │
                          │ Read files
                          ▼
┌─────────────────────────────────────────────────────────┐
│  Presentation Layer: ASCII Renderer                     │
│  - Reads files from filesystem                          │
│  - Generates ASCII art status display                   │
│  - Single implementation, multiple interfaces           │
└─────────────────────────────────────────────────────────┘
                          │
              ┌───────────┴───────────┐
              ▼                       ▼
    ┌──────────────────┐    ┌──────────────────┐
    │  Steel Thread:   │    │  Future (Phase3):│
    │  Shell Command   │    │  HTTP Server     │
    │  ./migrate-status│    │  GET /status     │
    └──────────────────┘    └──────────────────┘
```

**Steel Thread (Phase 0-2):**

- Shell commands read files and print ASCII status
- Simple polling loops (every 2s)
- No server, no networking complexity
- Works identically in local and CI environments

**Future Enhancement (Post Steel Thread):**

- HTTP server wraps same rendering logic
- Enables remote monitoring without SSH
- Still reads from filesystem (no database)
- Progressive enhancement, not a requirement

### CI Mode: GitHub Actions + Breakpoint

When running in GitHub Actions, the same shell commands work via SSH:

**Workflow Configuration:**

```yaml
- uses: namespacelabs/breakpoint-action@v0
  with:
    background: true
```

**SSH Access to Runner:**

```bash
# SSH into GitHub Actions runner
$ ssh runner@github-actions-host

# Navigate to workspace
$ cd /workspace

# Run same commands as local development
$ ./scripts/migrate-status.sh   # View status
$ ./scripts/migrate-respond.sh "Zustand"  # Provide response
```

**Key Point:** Same file-based protocol, same shell commands. CI access is just SSH into the runner—no code changes needed.

### Integration with Claude Code

Claude Code needs to be aware of this protocol. Options:

1. **Custom wrapper script** that Claude Code runs through:

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                - Script monitors Claude Code output
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                - When Claude Code uses `AskUserQuestion` tool, wrapper intercepts
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                - Wrapper creates `needed.json` and waits for `response.json`
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                - Wrapper feeds response back to Claude Code

2. **Claude Code instructions** in the plan:

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                - Migration plan includes instructions: "If you need user input, write to intervention/needed.json and wait for response.json"
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                - Claude Code follows instructions naturally

**Steel Thread Choice: Option 2 (instruction-based)**

- Simpler to implement
- No complex process interception
- Claude Code is good at following protocol instructions
- Can iterate on wrapper approach later if needed

## Phase 0: Minimal Docker Runner (1-2 days)

**Goal:** Get Claude Code running in Docker with intervention protocol working.

### Deliverables

1. **Dockerfile**
   ```dockerfile
   FROM node:24-alpine
   
   # Install pnpm
   RUN corepack enable && corepack prepare pnpm@10.26.1 --activate
   
   # Install Claude Code CLI
   RUN npm install -g @anthropic/claude-code
   
   # Install git
   RUN apk add --no-cache git
   
   # Working directory
   WORKDIR /workspace
   
   # Entrypoint
   COPY entrypoint.sh /entrypoint.sh
   RUN chmod +x /entrypoint.sh
   
   CMD ["/entrypoint.sh"]
   ```

2. **docker-compose.yml**
   ```yaml
   version: '3.8'
   
   services:
     claude-migration:
       build:
         context: .
         dockerfile: docker/Dockerfile
       container_name: claude-migration
       volumes:
         - .:/workspace:cached
         - /workspace/node_modules  # Exclude node_modules
       environment:
         - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
       working_dir: /workspace
       stdin_open: true
       tty: true
   ```

3. **entrypoint.sh**

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                - Basic script that runs Claude Code CLI
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                - Monitors for intervention files
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                - Simple logging to `migration-log.md`

4. **CLI Scripts (Shell Commands - No Server)**

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                - `scripts/migrate-run.sh` - Start Docker container
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                - `scripts/migrate-status.sh` - Read files, render ASCII status (simple loop)
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                - `scripts/migrate-watch.sh` - Monitor for interventions
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                - `scripts/migrate-respond.sh` - Provide responses
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                - All scripts read from filesystem (source of truth)
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                - Same commands work locally and in CI (via SSH)

5. **.env.example**
   ```bash
   ANTHROPIC_API_KEY=your_api_key_here
   ```


### Test Plan

1. Start Docker container: `./scripts/migrate-run.sh`
2. Run simple Claude Code plan that requires user input
3. Verify `intervention/needed.json` is created
4. Run `./scripts/migrate-respond.sh "test answer"`
5. Verify Claude Code continues execution
6. Check `migration-log.md` for complete log

### Success Criteria

- ✅ Docker container builds and starts
- ✅ Claude Code CLI runs inside container
- ✅ Intervention protocol works (question → response → resume)
- ✅ Simple logging captures all activity

## Phase 1: Worktree Integration (1-2 days)

**Goal:** Run Claude Code migration in isolated git worktree.

### Why Worktrees?

- Isolates migration work from main working tree
- Allows easy comparison/diff with original code
- Prepares for future multi-worker parallelization
- Enables clean rollback if migration fails

### Deliverables

1. **scripts/migrate-init.sh**
   ```bash
   #!/bin/bash
   # Initialize worktree for migration
   
   WORKTREE_NAME="${1:-migration-worktree}"
   BRANCH_NAME="migration/${WORKTREE_NAME}"
   
   # Create worktree
   git worktree add "worktrees/${WORKTREE_NAME}" -b "${BRANCH_NAME}"
   
   echo "✅ Worktree created: worktrees/${WORKTREE_NAME}"
   echo "Branch: ${BRANCH_NAME}"
   ```

2. **Update docker-compose.yml**

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                - Mount worktree directory into container
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                - Set working directory to worktree

3. **Update entrypoint.sh**

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                - Run Claude Code within worktree context
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                - Ensure git operations use worktree's `.git` file

### Test Plan

1. Initialize worktree: `./scripts/migrate-init.sh home-page`
2. Start Docker: `./scripts/migrate-run.sh`
3. Run migration plan in worktree
4. Verify changes are isolated to worktree
5. Check main working tree is unaffected

### Success Criteria

- ✅ Worktree created and mounted in Docker
- ✅ Claude Code operates within worktree
- ✅ Git commits land on migration branch
- ✅ Main working tree remains clean

## Phase 2: Iterative Loop (1-2 days)

**Goal:** Implement Plan → Build → Commit → Log workflow with error handling.

### Workflow Steps

1. **Plan Phase**

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                - Run Claude Code with migration plan
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                - Handle interventions via protocol
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                - Capture all changes in worktree

2. **Build Phase**

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                - Run `pnpm build` in `storefront-next/packages/template-retail-rsc-app`
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                - Capture build output (stdout + stderr)
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                - Detect build failures

3. **Commit Phase** (only if build succeeds)

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                - Stage all changes: `git add .`
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                - Commit with descriptive message
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                - Include build success confirmation

4. **Log Phase**

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                - Append to `migration-log.md`:
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                - Timestamp
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                - Phase completed
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                - Build output summary
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                - Commit hash
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                - Errors encountered

### Error Handling

- **Build fails:** Log error, create intervention request asking user how to proceed
- **Claude Code errors:** Log error, pause for intervention
- **Git conflicts:** Log error, pause for manual resolution

### Deliverables

1. **entrypoint.sh (enhanced)**

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                - Implement workflow loop
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                - Add error handling
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                - Add build integration
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                - Add git commit automation

2. **migration-log.md format**
   ```markdown
   # Migration Log: Home Page
   
   ## 2026-01-13T10:00:00Z - Plan Phase
   
   **Status:** ✅ Completed
   **Duration:** 45 minutes
   **Interventions:** 2
   - Q: "Which state library?" A: "Zustand"
   - Q: "Refactor component?" A: "Yes"
   
   **Changes:**
   - Modified 12 files
   - Added 3 new components
   - Updated dependencies
   
   ## 2026-01-13T10:45:00Z - Build Phase
   
   **Status:** ✅ Success
   **Command:** `cd storefront-next/packages/template-retail-rsc-app && pnpm build`
   **Duration:** 3m 24s
   
   **Output:**
   ```


vite v5.0.0 building for production...

✓ 1234 modules transformed.

dist/index.html 2.45 kB

...

   ```
   
   ## 2026-01-13T10:48:24Z - Commit Phase
   
   **Status:** ✅ Completed
   **Commit:** `abc123...`
   **Message:** "Migration progress: home page components migrated with Zustand state management"
   
   ## 2026-01-13T10:48:30Z - Iteration Complete
   
   **Next Steps:** Ready for next migration thread or manual review
   ```

3. **CLI Scripts (enhanced)**

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                - `migrate-status.sh` - Simple status display (read from log)
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                - `migrate-logs.sh` - Tail migration-log.md

### Test Plan

1. Run complete workflow with test migration plan
2. Trigger build failure intentionally (syntax error)
3. Verify intervention requested for failure
4. Provide fix via intervention
5. Verify workflow continues and completes
6. Check git history shows proper commits
7. Verify migration-log.md has complete record

### Success Criteria

- ✅ Full workflow loop executes end-to-end
- ✅ Build integration works (success/failure detection)
- ✅ Git commits created after successful builds
- ✅ Error handling triggers interventions appropriately
- ✅ Migration log provides complete audit trail

## File Structure (Steel Thread)

```
.
├── docker/
│   ├── Dockerfile                   # Minimal Node.js + Claude Code
│   ├── docker-compose.yml           # Single service definition
│   └── entrypoint.sh                # Workflow orchestrator
├── scripts/
│   ├── migrate-init.sh              # Initialize worktree
│   ├── migrate-run.sh               # Start Docker container
│   ├── migrate-watch.sh             # Monitor interventions
│   ├── migrate-respond.sh           # Provide responses
│   ├── migrate-status.sh            # Simple status (read log)
│   └── migrate-logs.sh              # Tail migration log
├── intervention/
│   ├── needed.json                  # (created at runtime)
│   ├── response.json                # (created at runtime)
│   └── history/                     # Archived interventions
├── worktrees/
│   └── migration-worktree/          # (created by init script)
│       ├── .git                     # Worktree git link
│       └── ...                      # Migration work happens here
├── migration-log.md                 # Append-only log
├── .env                             # API key (from .env.example)
└── .dockerignore                    # Exclude node_modules
```

## Implementation Steps (Sequential)

### Phase 0: Docker Foundation + Intervention Protocol

1. Create `docker/` directory structure
2. Write Dockerfile (Node.js + pnpm + Claude Code CLI)
3. Write docker-compose.yml (volume mounts, env vars)
4. Create `.dockerignore` (exclude node_modules)
5. Create `.env.example` template
6. Create `intervention/` directory structure
7. Write basic `entrypoint.sh` (Claude Code execution + intervention monitoring)
8. Write `scripts/migrate-run.sh` (Docker startup)
9. Write `scripts/migrate-watch.sh` (intervention monitor)
10. Write `scripts/migrate-respond.sh` (response provider)
11. Test intervention protocol with dummy plan
12. Verify logging to `migration-log.md`

**Checkpoint:** Can run Claude Code in Docker with working intervention protocol

### Phase 1: Worktree Integration

13. Write `scripts/migrate-init.sh` (worktree creation)
14. Update `docker-compose.yml` (mount worktree)
15. Update `entrypoint.sh` (worktree-aware execution)
16. Test worktree isolation (changes only in worktree)
17. Verify git commits on migration branch

**Checkpoint:** Can run migration in isolated worktree

### Phase 2: Iterative Loop

18. Add build phase to `entrypoint.sh` (pnpm build)
19. Add build output capture and parsing
20. Add error handling (build failures → interventions)
21. Add git commit automation (stage + commit)
22. Enhance `migration-log.md` format (structured phases)
23. Write `scripts/migrate-status.sh` (read log, display status)
24. Write `scripts/migrate-logs.sh` (tail log)
25. Test complete workflow end-to-end
26. Test error handling and recovery
27. Document usage in README

**Checkpoint:** Full iterative workflow operational

## Alignment with Master Plan

This steel thread directly supports:

- **Pillar 2: Orchestration** - Proves the execution loop works
- **Pillar 4: Claude Code Adapter** - Docker environment is the adapter's runtime
- **Phase 1.2: Orchestration MVP** - This IS the orchestration for single worker
- **Worker Coordination** - Proves isolation via worktrees (prerequisite for parallelization)

The steel thread intentionally defers:

- **Pillar 6: Validation Harness** (Playwright screenshots)
- **Multi-worker parallelization** (coordination complexity)
- **Sophisticated UI** (terminal ANSI formatting)
- **CI integration** (GitHub Actions)

These can be added **after** the core workflow is proven to work.

## Success Metrics

1. **End-to-End Execution:** Can run complete migration plan without manual intervention (except when Claude Code genuinely needs input)
2. **Intervention Protocol Works:** User can provide feedback within 5 minutes of request
3. **Build Validation:** Build failures are detected and handled gracefully
4. **Git History Clean:** Commits are atomic, descriptive, and on migration branch
5. **Audit Trail:** `migration-log.md` provides complete record of what happened
6. **Reproducible:** Another developer can clone repo, set API key, run migration with same results

## Next Steps After Steel Thread

Once this simplified version works:

1. **Add HTTP server (optional)** - Wrap ASCII renderer in HTTP endpoint for remote monitoring

            - Same rendering logic, just exposed via server instead of shell command
            - Still reads from filesystem (no database)
            - Enables monitoring without SSH access
            - Progressive enhancement, not a requirement

2. **Add second worker thread** (test parallelization + coordination)
3. **Implement Playwright validation** (screenshot capture)
4. **Build enhanced terminal UI** (richer ANSI formatting, live updates)
5. **Add CI workflow** (GitHub Actions integration with breakpoint-action)
6. **Implement status.json** (machine-readable state for programmatic access)
7. **Add worker coordination** (conflict detection, merge strategies)

But for now: **ONE docker, ONE worker, shell commands only, prove the core loop works.**

## Dependencies

- Docker & Docker Compose
- Node.js 24+ (in Docker image)
- pnpm 10.26.1+ (in Docker image)
- Claude Code CLI (installed in Docker image)
- Git (for worktree management)
- API Key: `ANTHROPIC_API_KEY` environment variable

## Estimated Timeline

- **Phase 0:** 1-2 days (Docker foundation + intervention protocol)
- **Phase 1:** 1-2 days (worktree integration)
- **Phase 2:** 1-2 days (iterative loop + error handling)

**Total:** 3-6 days for working steel thread

Then assess: Does this prove the concept? What needs to change before adding complexity?