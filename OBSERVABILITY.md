# Claude Code Observability & Intervention System

**Created:** 2026-01-22
**Status:** Implemented

---

## The Problem

When Claude Code runs inside a Docker container executing the migration loop:
1. **No visibility** - Can't see what Claude is doing in real-time
2. **No intervention awareness** - Don't know when Claude is blocked waiting for user input
3. **LLM-dependent** - Relying on Claude to recognize when to ask for help (unreliable)

---

## The Solution: Dual-Layer Detection

### Layer 1: Process State Detection (Deterministic)

**Key insight:** Claude Code's process state is observable via Unix process monitoring.

**Detection signals:**
1. **Process state** (`ps` STAT field)
   - `R` = Running (actively working)
   - `S` = Sleeping (waiting for something)
   - `D` = Uninterruptible sleep (IO/API wait)

2. **Intervention files existence**
   - `intervention/needed-*.json` exists → Claude called RequestUserIntervention
   - No matching `response-*.json` → Still waiting

3. **Output timing**
   - Recent output (< 5s ago) → Active
   - Stale output (> 5s) + sleeping → Likely blocked

4. **MCP server process**
   - Running + intervention file → Waiting for user
   - Running + no intervention → Normal operation

**Script:** `scripts/detect-claude-state.sh`

Returns:
- `RUNNING` - Actively executing
- `WAITING_INPUT` - Blocked on user intervention
- `WAITING_API` - Waiting for API response
- `IDLE` - Between operations
- `NOT_RUNNING` - Process not found

### Layer 2: Real-Time Output Stream

**Implementation:** Changed `demo-migration-loop.sh` to write output to shared volume:

```bash
# Before (container-only):
claude code run ... > /tmp/migration-loop.log 2>&1

# After (shared volume):
claude code run ... 2>&1 | tee /workspace/claude-output.log
```

**Benefits:**
- Host can `tail -f claude-output.log` directly
- No Docker exec overhead
- True real-time streaming
- Full output history preserved

---

## Usage

### Option 1: Dashboard Mode (Recommended)

```bash
./scripts/watch-claude-status.sh --watch
```

Shows:
- Current status (RUNNING / WAITING / IDLE)
- Recent output (last 15 lines)
- Auto-detects intervention requests
- Updates every 2 seconds

**When intervention needed:**
- 🚨 Alert displayed with question and options
- Shows exact response file format
- Bell notification

### Option 2: Stream Mode

```bash
./scripts/watch-claude-status.sh --stream
```

Streams Claude's output in real-time (like `tail -f`).

### Option 3: Alert Mode

```bash
./scripts/watch-claude-status.sh --alert
```

Runs silently until intervention needed, then alerts loudly.

### Option 4: Direct Tail (No Scripts)

```bash
tail -f claude-output.log
```

Raw output, no processing.

---

## How Intervention Detection Works

### When Claude Is Blocked:

```
1. Claude Code calls: RequestUserIntervention(...)
   ↓
2. MCP server writes: intervention/needed-{worker-id}.json
   ↓
3. MCP server enters polling loop (checking for response file)
   ↓
4. Claude Code process state: S (sleeping, waiting for MCP tool return)
   ↓
5. detect-claude-state.sh detects:
   - Process state = S (sleeping)
   - Intervention file exists
   - No response file
   → Returns: WAITING_INPUT
   ↓
6. watch-claude-status.sh shows alert to user
   ↓
7. User creates: intervention/response-{worker-id}.json
   ↓
8. MCP server detects response, returns to Claude
   ↓
9. Claude continues execution
```

### Detection Logic (Pseudocode):

```python
def detect_claude_state():
    claude_pid = get_claude_pid()
    proc_state = get_process_state(claude_pid)
    intervention_exists = exists("intervention/needed-*.json")
    response_exists = exists("intervention/response-*.json")
    last_output = time_since_last_output()

    # Deterministic checks:
    if intervention_exists and not response_exists:
        return "WAITING_INPUT"  # 100% certain

    if proc_state == "D":
        return "WAITING_API"  # Uninterruptible IO

    if proc_state == "S" and last_output > 5:
        return "IDLE"  # Sleeping but not blocked

    if proc_state == "R":
        return "RUNNING"  # Active

    if proc_state == "S" and last_output < 5:
        return "RUNNING"  # Recent activity

    return "IDLE"  # Default
```

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│ Host Machine                                                 │
│                                                              │
│  ┌────────────────────────────────────────────────────┐    │
│  │ Terminal 1: watch-claude-status.sh --watch         │    │
│  │  ┌──────────────────────────────────────────────┐  │    │
│  │  │ [Polls detect-claude-state.sh every 2s]     │  │    │
│  │  │ Status: ● RUNNING                            │  │    │
│  │  │ Recent Output:                               │  │    │
│  │  │   > Reading migration-log.md...              │  │    │
│  │  │   > Loading subplan-01-02.md...              │  │    │
│  │  └──────────────────────────────────────────────┘  │    │
│  └────────────────────────────────────────────────────┘    │
│                                                              │
│  ┌────────────────────────────────────────────────────┐    │
│  │ Terminal 2: tail -f claude-output.log              │    │
│  │  [Real-time stream of Claude's stdout/stderr]      │    │
│  └────────────────────────────────────────────────────┘    │
│                                                              │
│  ┌────────────────────────────────────────────────────┐    │
│  │ Shared Volume: /Users/.../test-storefront/         │    │
│  │  - claude-output.log          (output stream)      │    │
│  │  - intervention/needed-*.json (MCP requests)       │    │
│  │  - intervention/response-*.json (user responses)   │    │
│  └────────────────────────────────────────────────────┘    │
└──────────────────────┬───────────────────────────────────────┘
                       │ Volume Mount
┌──────────────────────▼───────────────────────────────────────┐
│ Docker Container: claude-migration-demo                      │
│                                                              │
│  ┌────────────────────────────────────────────────────┐    │
│  │ Claude Code Process (PID: 1234)                    │    │
│  │  - stdout/stderr → tee → /workspace/claude-output.log │
│  │  - State: S (sleeping)                              │    │
│  │  - Waiting for MCP tool call to return              │    │
│  └──────────────────┬─────────────────────────────────┘    │
│                     │ stdio (MCP protocol)                  │
│  ┌──────────────────▼─────────────────────────────────┐    │
│  │ MCP intervention-server.js (PID: 1235)             │    │
│  │  - State: S (sleeping in poll loop)                 │    │
│  │  - Checking for: /workspace/intervention/response-*.json │
│  │  - Every 1 second                                   │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

---

## Responding to Interventions

### Manual Response (Current Method)

When you see:
```
🚨 USER INTERVENTION REQUIRED 🚨

Question: Dev server failed after retry. What should I do?
Options:
  [1] Fix permissions and retry
  [2] Skip dev server validation
  [3] Stop and debug manually
```

**Respond:**
```bash
cat > intervention/response-homepage-migration.json <<EOF
{
  "response": "Skip dev server validation",
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF
```

### Future Enhancement: Interactive UI

Could add:
```bash
# scripts/respond-to-intervention.sh
# Interactive prompt that:
# 1. Detects intervention
# 2. Shows options
# 3. Prompts for selection
# 4. Creates response file automatically
```

---

## Benefits

### Deterministic Detection
- ✅ Don't rely on LLM to recognize blockers
- ✅ Process state is observable fact
- ✅ Intervention files are filesystem state
- ✅ No guessing or heuristics needed

### Real-Time Visibility
- ✅ See Claude's output as it happens
- ✅ No polling delay (direct file tail)
- ✅ Full history preserved
- ✅ Can debug from host without Docker exec

### Better User Experience
- ✅ Dashboard shows status at a glance
- ✅ Auto-alert when input needed
- ✅ Clear instructions for response
- ✅ Bell notification for attention

---

## Technical Details

### Process States (`ps` STAT column)

```
R  - Running or runnable (on run queue)
   Claude is actively executing code or thinking

S  - Interruptible sleep (waiting for an event)
   Claude is waiting for something (could be many things)

D  - Uninterruptible sleep (usually IO)
   Claude is blocked on disk/network (likely API call)

T  - Stopped (job control or debugging)
   Shouldn't happen in normal operation

Z  - Zombie (terminated but not reaped)
   Process died, needs investigation
```

### Why `tee` Instead of Redirect?

```bash
# Option 1: Redirect (what we used before)
command > /tmp/log 2>&1
# - Output goes to file only
# - Can't tail from host (not on shared volume)

# Option 2: Tee (what we use now)
command 2>&1 | tee /workspace/log
# - Output goes to both stdout and file
# - File is on shared volume
# - Host can tail directly
# - Full buffering disabled (real-time)
```

### MCP Server Polling Loop

```javascript
// From mcp-server/src/intervention-server.ts
async function pollForResponse(workerId: string): Promise<string> {
  const responseFile = path.join(INTERVENTION_DIR, `response-${workerId}.json`);
  const pollInterval = 1000; // 1 second

  return new Promise((resolve) => {
    const checkResponse = () => {
      if (fs.existsSync(responseFile)) {
        // Response found, return it
        const data = JSON.parse(fs.readFileSync(responseFile, 'utf-8'));
        resolve(data.response);
      } else {
        // Keep polling
        setTimeout(checkResponse, pollInterval);  // ← Process in S state here
      }
    };
    checkResponse();
  });
}
```

**During this loop:**
- Node.js process state: `S` (sleeping in setTimeout)
- Claude Code state: `S` (blocked waiting for tool return)
- Both processes idle, waiting for filesystem change

---

## Testing

### Test State Detection

```bash
# While migration is running:
./scripts/detect-claude-state.sh
# Should output: RUNNING or IDLE

# Create fake intervention to test detection:
cat > intervention/needed-test.json <<EOF
{"question": "Test?", "options": ["A", "B"]}
EOF

./scripts/detect-claude-state.sh
# Should output: WAITING_INPUT

# Clean up:
rm intervention/needed-test.json
```

### Test Output Streaming

```bash
# Terminal 1: Start migration
./scripts/demo-migration-loop.sh

# Terminal 2: Stream output
tail -f claude-output.log

# Terminal 3: Watch status
./scripts/watch-claude-status.sh --watch
```

---

## Future Enhancements

### 1. Automatic Retry Logic
```bash
# If Claude is IDLE for > 2 minutes, automatically:
# 1. Check for common issues (permissions, missing files)
# 2. Attempt automatic fixes
# 3. Restart Claude if stuck
```

### 2. Interactive Response Helper
```bash
# GUI-style intervention response
./scripts/respond-to-intervention.sh
# → Shows question
# → Number prompts for each option
# → Creates response file automatically
```

### 3. State History Tracking
```bash
# Log state transitions:
# 12:00:00 RUNNING
# 12:00:45 WAITING_API
# 12:01:15 RUNNING
# 12:02:30 WAITING_INPUT  ← Stuck here for 5 minutes!
```

### 4. Metrics & Analytics
```bash
# Track:
# - Time in each state
# - Intervention frequency
# - Average response time
# - Success rate after interventions
```

---

## Troubleshooting

### Detection Not Working

**Check container is running:**
```bash
docker ps -f name=claude-migration-demo
```

**Check detection script:**
```bash
./scripts/detect-claude-state.sh claude-migration-demo --verbose
```

### Output Not Streaming

**Check log file exists:**
```bash
ls -lh claude-output.log
```

**Check demo script was updated:**
```bash
grep "tee /workspace/claude-output.log" scripts/demo-migration-loop.sh
```

### Intervention Not Detected

**Check MCP server is running:**
```bash
docker exec -u node claude-migration-demo pgrep -f intervention-server
```

**Check MCP config:**
```bash
docker exec -u node claude-migration-demo cat ~/.config/claude-code/mcp.json
```

---

## Summary

**Before:**
- ❌ No visibility into Claude's process
- ❌ Don't know when blocked
- ❌ Rely on LLM to ask for help

**After:**
- ✅ Real-time output streaming
- ✅ Deterministic state detection
- ✅ Automatic intervention alerts
- ✅ Process state is observable fact

**Key Scripts:**
1. `scripts/detect-claude-state.sh` - Deterministic state detection
2. `scripts/watch-claude-status.sh` - Real-time monitoring dashboard
3. `scripts/demo-migration-loop.sh` - Updated to stream output

---

**Last Updated:** 2026-01-22
**Status:** Ready for testing
