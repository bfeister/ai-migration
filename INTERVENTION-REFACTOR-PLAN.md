# Non-Blocking Intervention System Redesign Plan

## Problem Statement

The current intervention system causes two critical issues:

1. **Blocking Claude Execution**: `RequestUserIntervention` MCP tool polls indefinitely (1s intervals) for response files, blocking Claude Code from progressing
2. **File Descriptor Exhaustion**: `demo-migration-loop.sh` monitoring loop constantly runs `find`, `grep`, `tail`, `wc` on mounted volumes every 3 seconds, exhausting host file descriptors with "Too many open files in system" errors

## Current Architecture Analysis

### 1. MCP Intervention Tool (`mcp-server/src/tools/intervention.ts`)

**Blocking Pattern** (lines 85-124):

```typescript
async function pollForResponse(workerId: string): Promise<string> {
    const responseFile = path.join(
        INTERVENTION_DIR,
        `response-${workerId}.json`
    );
    const pollInterval = 1000; // 1 second

    return new Promise((resolve, reject) => {
        const checkResponse = () => {
            if (fs.existsSync(responseFile)) {
                // Process response...
                resolve(responseData.response);
            } else {
                // Keep polling forever
                setTimeout(checkResponse, pollInterval);
            }
        };
        checkResponse();
    });
}
```

**Result**: Claude blocks indefinitely waiting for user response.

### 2. Demo Script Monitoring Loop (`scripts/demo-migration-loop.sh`)

**File Descriptor Leaks** (lines 675-748):

-   Runs every 3 seconds in infinite loop
-   `wc -l < "$MIGRATION_LOG"` - opens file on host
-   `find "$SCREENSHOTS_DIR" -name "*.png"` - traverses mounted directory
-   `tail -n "$new_lines" "$MIGRATION_LOG"` - reads through Docker mount
-   Each command exhausts file descriptors on macOS host

**Intervention Handling** (lines 751-823):

-   Monitors `intervention/needed-*.json` files
-   Prompts user interactively in terminal
-   Writes response files manually

### 3. Dashboard (`dashboard/server.js`, `dashboard/public/`)

**Current Capabilities**:

-   ✅ Displays interventions read-only (lines 365-414 in app.js)
-   ✅ Real-time updates via SSE (Server-Sent Events)
-   ✅ File watchers on `intervention/` directory
-   ❌ NO interactive UI for responding
-   ❌ NO POST endpoint for submitting responses
-   ❌ Cannot trigger Claude resume

**Architecture**:

-   Express server with chokidar file watchers
-   SSE broadcasts on `intervention-needed`, `intervention-response` events
-   Frontend listens and updates UI automatically

## Proposed Solution: Option 1 (User's Choice)

### High-Level Design

1. **Make MCP Tool Non-Blocking**: Return immediately after writing intervention file
2. **Claude Exits After Intervention**: Update migration plan to instruct Claude to exit gracefully
3. **Dashboard Handles Responses**: Add interactive UI + POST endpoint
4. **Auto-Resume on Response**: Script or dashboard triggers `claude -r $SESSION_ID`
5. **Eliminate Monitoring Loop**: Replace with simple `wait $LOOP_PID`

### Architecture Flow

```
┌─────────────────────────────────────────────────────────────┐
│ Claude Code (Inside Container)                              │
│   1. Calls RequestUserIntervention                          │
│   2. MCP writes intervention/needed-{worker-id}.json        │
│   3. MCP returns immediately (non-blocking)                 │
│   4. Claude exits gracefully                                │
│   5. Session saved to ~/.claude/projects/{session-id}.jsonl│
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ Dashboard (Node.js Server)                                  │
│   1. File watcher detects needed-*.json                     │
│   2. Broadcasts SSE event: intervention-needed              │
│   3. Frontend displays interactive UI                       │
│   4. User clicks option + submits                           │
│   5. POST /api/interventions/:workerId/respond              │
│   6. Writes intervention/response-{worker-id}.json          │
│   7. Triggers Claude resume via script or exec              │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ demo-migration-loop.sh (Host Script)                        │
│   1. Launches Claude with session ID                        │
│   2. wait $LOOP_PID (blocks until Claude exits)            │
│   3. Detects exit reason:                                   │
│      - Intervention needed? → Resume after response         │
│      - Work complete? → Show summary                        │
│   4. If intervention response exists, resume:               │
│      docker exec -u node claude -r $SESSION_ID              │
│   5. Loop back to wait (step 2)                             │
└─────────────────────────────────────────────────────────────┘
```

## Implementation Plan

### Phase 1: MCP Tool - Non-Blocking Intervention

**File**: `mcp-server/src/tools/intervention.ts`

**Changes**:

1. Remove `pollForResponse()` function entirely (lines 82-124)
2. Update `handleRequestUserIntervention()`:

    ```typescript
    export async function handleRequestUserIntervention(
        args: RequestUserInterventionArgs
    ): Promise<string> {
        const { worker_id, question, options, context } = args;

        // Validate inputs
        if (!worker_id || !question || !options || options.length === 0) {
            throw new Error('Missing required parameters');
        }

        // Write intervention request
        writeInterventionRequest(worker_id, question, options, context);

        // Return immediately (non-blocking)
        return `Intervention requested for ${worker_id}. Claude should exit and await response.`;
    }
    ```

**Testing**:

-   Verify tool writes `needed-{worker-id}.json` correctly
-   Verify tool returns immediately (no blocking)
-   Check that intervention file has correct schema

---

### Phase 2: Migration Plan Instructions

**File**: `migration-main-plan.md`

**Update Section**: "User Intervention" (lines 338-358)

**New Instructions**:

````markdown
### User Intervention

When using `mcp__intervention__RequestUserIntervention`:

1. The tool will create `/workspace/intervention/needed-{worker-id}.json`
2. The tool returns immediately (non-blocking)
3. **IMPORTANT**: After requesting intervention, Claude should:
    - Log the intervention request to migration-log.md
    - Exit gracefully to allow external response
    - Session will be auto-resumed after user responds via dashboard

Example:

```javascript
await mcp__intervention__RequestUserIntervention({
    worker_id: 'migration-worker',
    question: `Dev server failed with errors: ${errors.join(
        ', '
    )}. How should I proceed?`,
    options: ['Fix manually', 'Skip this micro-plan', 'Debug manually'],
    context: JSON.stringify({ app_dir, errors, warnings })
});

// Log intervention in migration-log.md
await LogMigrationProgress({
    subplan_id: '01-03',
    status: 'failed',
    summary: 'Dev server failed, awaiting user intervention',
    error_message: 'Intervention needed: migration-worker'
});

// Exit gracefully - user will respond via dashboard, session will auto-resume
return;
```
````

**When to Request Intervention**:

-   Blocking errors that cannot be auto-fixed
-   Unclear requirements needing user decision
-   Build/compilation failures after retry attempts
-   Missing dependencies or configuration

````

**Remove**: References to Claude polling or waiting for response

---

### Phase 3: Dashboard - Interactive UI & Response Endpoint

#### 3A. Backend - Response Endpoint

**File**: `dashboard/server.js`

**Add after line 126** (after `/api/interventions` GET endpoint):

```javascript
// POST /api/interventions/:workerId/respond - Submit intervention response
app.post('/api/interventions/:workerId/respond', (req, res) => {
  const { workerId } = req.params;
  const { selected_option } = req.body;

  if (!workerId || !selected_option) {
    return res.status(400).json({ error: 'Missing workerId or selected_option' });
  }

  // Check if intervention exists
  const neededFile = path.join(interventionDir, `needed-${workerId}.json`);
  if (!fs.existsSync(neededFile)) {
    return res.status(404).json({ error: `Intervention ${workerId} not found` });
  }

  // Read original intervention to get context
  const interventionData = JSON.parse(fs.readFileSync(neededFile, 'utf-8'));

  // Create response file
  const responseFile = path.join(interventionDir, `response-${workerId}.json`);
  const responseData = {
    worker_id: workerId,
    timestamp: new Date().toISOString(),
    response: selected_option,
    selected_option: selected_option,
    question_timestamp: interventionData.timestamp,
    intervention_id: workerId,
    processed: false
  };

  fs.writeFileSync(responseFile, JSON.stringify(responseData, null, 2), 'utf-8');

  console.log(`[Dashboard] Intervention response created: ${responseFile}`);

  // Broadcast SSE event
  broadcastEvent('intervention-response', {
    worker_id: workerId,
    selected_option: selected_option
  });

  // NOTE: Dashboard does NOT auto-resume Claude
  // User must manually run: ./scripts/resume-migration.sh

  res.json({
    success: true,
    worker_id: workerId,
    selected_option,
    message: 'Response saved. Run: ./scripts/resume-migration.sh'
  });
});
````

#### 3B. Frontend - Interactive UI

**File**: `dashboard/public/app.js`

**Update `renderInterventions()` function** (around lines 365-414):

```javascript
function renderInterventions(interventions) {
    const container = document.getElementById('interventions-list');

    if (!interventions.needed || interventions.needed.length === 0) {
        if (!interventions.responses || interventions.responses.length === 0) {
            container.innerHTML =
                '<p class="empty-state">No interventions requested yet</p>';
            return;
        }
    }

    const items = [];

    // Pending interventions (interactive)
    interventions.needed.forEach((intervention) => {
        const hasResponse = interventions.responses.some(
            (r) => r.worker_id === intervention.worker_id
        );
        if (hasResponse) return; // Skip if already responded

        const optionsHtml = intervention.options
            .map(
                (option, idx) => `
      <div class="intervention-option clickable" data-option="${option}" data-idx="${idx}">
        <input type="radio" name="intervention-${intervention.worker_id}" value="${option}" id="opt-${intervention.worker_id}-${idx}">
        <label for="opt-${intervention.worker_id}-${idx}">${option}</label>
      </div>
    `
            )
            .join('');

        items.push(`
      <div class="intervention-card pending" data-worker-id="${
          intervention.worker_id
      }">
        <div class="intervention-header">
          <span class="intervention-status">❓ Pending Response</span>
          <span class="intervention-time">${formatTimestamp(
              intervention.timestamp
          )}</span>
        </div>
        <div class="intervention-question">${intervention.question}</div>
        ${
            intervention.context
                ? `<div class="intervention-context">${intervention.context}</div>`
                : ''
        }
        <div class="intervention-options" id="options-${
            intervention.worker_id
        }">
          ${optionsHtml}
        </div>
        <button class="btn-respond" data-worker-id="${intervention.worker_id}">
          Submit Response
        </button>
        <div class="intervention-meta">Worker ID: ${
            intervention.worker_id
        }</div>
      </div>
    `);
    });

    // Completed interventions (read-only)
    interventions.responses.forEach((response) => {
        const original = interventions.needed.find(
            (n) => n.worker_id === response.worker_id
        );
        if (!original) return;

        const optionsHtml = original.options
            .map(
                (option) => `
      <div class="intervention-option ${
          option === response.selected_option ? 'selected' : ''
      }">
        ${option}
      </div>
    `
            )
            .join('');

        items.push(`
      <div class="intervention-card completed">
        <div class="intervention-header">
          <span class="intervention-status">✅ Completed</span>
          <span class="intervention-time">${formatTimestamp(
              response.timestamp
          )}</span>
        </div>
        <div class="intervention-question">${original.question}</div>
        <div class="intervention-options">${optionsHtml}</div>
        <div class="intervention-meta">
          Selected: ${response.selected_option} | Worker ID: ${
              response.worker_id
          }
        </div>
      </div>
    `);
    });

    container.innerHTML = items.join('');

    // Attach event listeners to submit buttons
    document.querySelectorAll('.btn-respond').forEach((btn) => {
        btn.addEventListener('click', handleInterventionSubmit);
    });
}

async function handleInterventionSubmit(event) {
    const btn = event.target;
    const workerId = btn.dataset.workerId;
    const selectedRadio = document.querySelector(
        `input[name="intervention-${workerId}"]:checked`
    );

    if (!selectedRadio) {
        alert('Please select an option before submitting');
        return;
    }

    const selectedOption = selectedRadio.value;

    // Disable button during submission
    btn.disabled = true;
    btn.textContent = 'Submitting...';

    try {
        const response = await fetch(`/api/interventions/${workerId}/respond`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ selected_option: selectedOption })
        });

        if (!response.ok) {
            throw new Error(
                `Failed to submit response: ${response.statusText}`
            );
        }

        const data = await response.json();
        console.log('Intervention response submitted:', data);

        // Reload interventions to show updated state
        await loadInterventions();

        // Show success message
        addToFeed(
            'success',
            `Intervention resolved: ${selectedOption}`,
            new Date()
        );
    } catch (error) {
        console.error('Error submitting intervention response:', error);
        alert(`Failed to submit response: ${error.message}`);
        btn.disabled = false;
        btn.textContent = 'Submit Response';
    }
}
```

**File**: `dashboard/public/styles.css`

**Add styles for interactive interventions**:

```css
.intervention-option.clickable {
    cursor: pointer;
    transition: all 0.2s ease;
}

.intervention-option.clickable:hover {
    border-color: var(--color-primary);
    background: rgba(59, 130, 246, 0.05);
}

.intervention-option input[type='radio'] {
    margin-right: 8px;
    cursor: pointer;
}

.intervention-option label {
    cursor: pointer;
    flex: 1;
}

.btn-respond {
    background: var(--color-primary);
    color: white;
    border: none;
    padding: 10px 20px;
    border-radius: var(--radius-sm);
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    margin-top: 12px;
    transition: background 0.2s ease;
}

.btn-respond:hover {
    background: #2563eb;
}

.btn-respond:disabled {
    background: #9ca3af;
    cursor: not-allowed;
}

.intervention-card.pending {
    border-left: 4px solid var(--color-warning);
}

.intervention-card.completed {
    opacity: 0.7;
    border-left: 4px solid var(--color-success);
}
```

---

### Phase 4: Demo Script - Simplify and Exit on Intervention

**File**: `scripts/demo-migration-loop.sh`

**Remove entirely** (lines 667-823):

-   `monitor_migration_log()` function (file polling loop)
-   `check_interventions()` function (terminal prompts)
-   All `find`, `wc`, `tail`, `grep` commands

**Simplify main execution** (lines 880-890):

```bash
# Execute steps
check_prerequisites
start_container
launch_migration_loop

# Simple wait - no monitoring loop
echo ""
log_header "Migration Running"
log_info "View live progress: http://localhost:3030"
log_info "Session ID: $CLAUDE_SESSION_ID"
echo ""
log_info "Waiting for Claude to complete or request intervention..."
echo ""

# Block until Claude exits (could be hours)
wait $LOOP_PID
CLAUDE_EXIT_CODE=$?

log_info "Claude Code has exited with code $CLAUDE_EXIT_CODE"

# Check exit reason
check_exit_reason

# Show summary
show_summary
```

**Replace check_and_resume function with check_exit_reason**:

```bash
# Determine why Claude exited and show appropriate instructions
check_exit_reason() {
    # Check for pending interventions
    local pending_interventions=$(find "$INTERVENTION_DIR" -maxdepth 1 -name "needed-*.json" -type f 2>/dev/null)

    if [ -n "$pending_interventions" ]; then
        echo ""
        log_header "Intervention Required"
        echo ""

        # List all pending interventions
        for needed_file in $pending_interventions; do
            local worker_id=$(basename "$needed_file" .json | sed 's/needed-//')
            local question=$(jq -r '.question' "$needed_file" 2>/dev/null || echo "Unknown")

            log_intervention "Worker ID: $worker_id"
            log_info "Question: $question"
            echo ""
        done

        log_warning "Claude has paused and requires user intervention"
        echo ""
        log_info "Next steps:"
        echo -e "  ${CYAN}1.${NC} Open dashboard: ${YELLOW}http://localhost:3030${NC}"
        echo -e "  ${CYAN}2.${NC} Go to 'Interventions' tab"
        echo -e "  ${CYAN}3.${NC} Select your response and click 'Submit'"
        echo -e "  ${CYAN}4.${NC} Resume migration: ${YELLOW}./scripts/resume-migration.sh${NC}"
        echo ""
        log_info "Session ID saved to: $SESSION_ID_FILE"

        exit 0
    fi

    # No interventions - normal completion or error
    log_info "No interventions detected"

    if [ $CLAUDE_EXIT_CODE -eq 0 ]; then
        log_success "Migration completed successfully!"
    else
        log_error "Migration exited with error code $CLAUDE_EXIT_CODE"
        log_info "Check logs: cat /workspace/claude-output.log"
    fi
}
```

---

### Phase 5: Resume Script

**New File**: `scripts/resume-migration.sh`

```bash
#!/usr/bin/env bash
# resume-migration.sh - Resume Claude Code migration after intervention response
#
# This script:
# 1. Reads session ID from .claude-session-id
# 2. Verifies container is running
# 3. Resumes Claude Code session

set -euo pipefail

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKSPACE_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
CONTAINER_NAME="${CONTAINER_NAME:-claude-migration-demo}"
SESSION_ID_FILE="$WORKSPACE_ROOT/.claude-session-id"

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[✓]${NC} $1"
}

log_error() {
    echo -e "${RED}[✗]${NC} $1"
}

# Check if session ID file exists
if [ ! -f "$SESSION_ID_FILE" ]; then
    log_error "No session ID file found at: $SESSION_ID_FILE"
    log_info "Run ./scripts/demo-migration-loop.sh first to start a migration"
    exit 1
fi

# Read session ID
SESSION_ID=$(cat "$SESSION_ID_FILE" | tr -d '\r\n')

if [ -z "$SESSION_ID" ]; then
    log_error "Session ID file is empty"
    exit 1
fi

log_info "Session ID: $SESSION_ID"

# Check if container is running
if ! docker ps -q -f name="$CONTAINER_NAME" | grep -q .; then
    log_error "Container $CONTAINER_NAME is not running"
    log_info "Start container first: ./scripts/demo-migration-loop.sh"
    exit 1
fi

log_success "Container is running"

# Check for intervention responses
RESPONSE_FILES=$(find "$WORKSPACE_ROOT/intervention" -name "response-*.json" -type f 2>/dev/null | wc -l)

if [ "$RESPONSE_FILES" -eq 0 ]; then
    log_error "No intervention responses found"
    log_info "Respond to interventions via dashboard: http://localhost:3030"
    exit 1
fi

log_success "Found $RESPONSE_FILES intervention response(s)"

# Resume Claude Code session
echo ""
log_info "Resuming Claude Code session..."
echo ""

docker exec -it -u node "$CONTAINER_NAME" bash -c \
    "cd /workspace && claude code run --session-id $SESSION_ID --dangerously-skip-permissions < migration-main-plan.md"

log_success "Claude Code session resumed"
```

**Make executable**:

```bash
chmod +x scripts/resume-migration.sh
```

---

---

### Phase 6: Testing & Validation

#### Test Cases

1. **Basic Intervention Flow**:

    - Start migration loop (`./scripts/demo-migration-loop.sh`)
    - Trigger intervention (e.g., dev server error)
    - Verify Claude exits gracefully
    - Verify script prints dashboard URL and instructions
    - Open dashboard, verify intervention appears in Interventions tab
    - Select option and click "Submit Response"
    - Verify response file created in `intervention/`
    - Run `./scripts/resume-migration.sh`
    - Verify Claude resumes and migration continues

2. **File Descriptor Issue Resolution**:

    - Run migration for extended period (30+ minutes)
    - Monitor host FD usage: `lsof | wc -l`
    - Verify no "Too many open files" errors
    - Check demo script no longer polls filesystem

3. **Dashboard Responsiveness**:

    - Create intervention manually
    - Verify dashboard displays within 1 second (SSE)
    - Click option and submit
    - Verify success message and UI update
    - Verify response file written correctly

4. **Edge Cases**:
    - Dashboard not running when intervention occurs
    - User responds via CLI script instead of dashboard
    - Multiple simultaneous interventions
    - Claude crashes before intervention response
    - Response file corrupted/invalid JSON

#### Manual Testing Steps

```bash
# Terminal 1: Start dashboard
cd dashboard
pnpm start

# Terminal 2: Start migration
cd ..
./scripts/demo-migration-loop.sh --clean

# Terminal 3: Monitor for issues
watch -n 5 'lsof | wc -l'  # Watch FD count
tail -f migration-log.md   # Watch progress

# Trigger intervention
# (Wait for dev server error or manually create intervention file)

# In browser: http://localhost:3030
# - Verify intervention appears in "Interventions" tab
# - Select option and click "Submit Response"
# - Verify Claude resumes automatically

# Verify logs
cat intervention/response-migration-worker.json
tail -f claude-output.log
```

---

## Files Modified

### Critical Changes

1. `mcp-server/src/tools/intervention.ts` - Remove polling loop, return immediately
2. `migration-main-plan.md` - Update intervention instructions (Claude exits after requesting)
3. `scripts/demo-migration-loop.sh` - Remove monitoring loop + terminal prompts, add exit instructions
4. `scripts/resume-migration.sh` - NEW FILE - Resume Claude after intervention response
5. `dashboard/server.js` - Add POST /api/interventions/:workerId/respond endpoint
6. `dashboard/public/app.js` - Add interactive UI + submit handler
7. `dashboard/public/styles.css` - Add button/clickable styles

### Supporting Changes

8. `mcp-server/src/migration-server.ts` - No changes needed (tool definition unchanged)
9. `dashboard/public/index.html` - May need radio inputs (verify existing structure)

---

## Rollout Strategy

1. **Phase 1**: MCP tool changes (non-blocking intervention.ts)
2. **Phase 2**: Migration plan updates (Claude exits after intervention)
3. **Phase 3**: Dashboard backend + frontend (POST endpoint + UI)
4. **Phase 4**: Demo script simplification (remove monitoring/prompts)
5. **Phase 5**: Resume script creation (resume-migration.sh)
6. **Phase 6**: End-to-end testing

Can implement incrementally - each phase builds on previous.

**Recommended Order**:

-   Start with Phase 1 & 2 (MCP + plan) to unblock Claude
-   Then Phase 3 (dashboard) for user interaction
-   Finally Phase 4 & 5 (scripts) for automation

---

## Risk Mitigation

### Risk: Dashboard Not Running

-   **Impact**: User cannot respond to interventions via UI
-   **Mitigation**: Keep `scripts/migrate-respond.sh` CLI tool as documented fallback
-   **Alternative**: Manually create response JSON file and run resume script

### Risk: User Forgets to Run Resume Script

-   **Impact**: Migration stays paused indefinitely
-   **Mitigation**: Demo script prints clear 4-step instructions when exiting
-   **Mitigation**: Dashboard shows success message with resume command
-   **Mitigation**: Session ID persisted to `.claude-session-id` for easy reference

### Risk: Resume Script Fails

-   **Impact**: Cannot automatically resume Claude
-   **Mitigation**: Script validates session ID, container status before executing
-   **Manual Override**: User can run docker command directly:
    ```bash
    docker exec -it -u node claude-migration-demo claude -r $(cat .claude-session-id)
    ```

### Risk: Response File Corruption

-   **Impact**: Resume fails due to invalid JSON
-   **Mitigation**: Dashboard validates JSON structure before writing
-   **Mitigation**: Use try-catch in POST endpoint
-   **Recovery**: User can fix JSON manually or delete and recreate

### Risk: Multiple Simultaneous Interventions

-   **Impact**: Multiple blocking issues at once
-   **Mitigation**: Dashboard UI shows all pending interventions
-   **Behavior**: User responds to all, then single resume handles all responses
-   **Mitigation**: Resume script checks for all response files before proceeding

---

## Success Criteria

✅ Claude no longer blocks waiting for intervention responses
✅ No "Too many open files in system" errors during migration
✅ Dashboard provides full intervention response workflow
✅ Claude auto-resumes after dashboard response submission
✅ Migration loop runs for extended periods without FD exhaustion
✅ Backwards compatible with CLI response tools (`migrate-respond.sh`)
✅ All intervention files persist for audit trail

---

## Implementation Decisions (User Confirmed)

1. **Dashboard Resume**: NO auto-resume - Dashboard only writes response file, demo script handles resume
2. **Terminal Prompts**: REMOVE entirely - Dashboard is required for intervention responses
3. **Script Behavior**: EXIT after showing instructions - Print dashboard URL and manual resume command, then exit cleanly
4. **Manual Resume**: User runs `./scripts/resume-migration.sh` after responding via dashboard

This creates clean separation: Dashboard handles UI/response files, bash script handles process lifecycle.
