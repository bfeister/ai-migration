# Phase 2: MCP Intervention Server - Testing Guide

## Overview

Phase 2 implements the MCP Intervention Server, which provides Claude Code with an `AskUserQuestion` tool for requesting user input during migration work. This enables asynchronous interventions with full audit trail.

## What Was Implemented

### 1. MCP Server (`mcp-server/`)
- **intervention-server.ts**: MCP server providing `AskUserQuestion` tool
- **Functionality**:
  - Writes `intervention/needed-{worker-id}.json` on tool call
  - Polls for `intervention/response-{worker-id}.json` (1s interval, no timeout)
  - Returns response to Claude and marks as `processed: true`
  - Supports multi-hour/multi-day pauses for background execution

### 2. Docker Integration
- **entrypoint.sh**: Builds MCP server and configures Claude Code CLI on container startup
- **~/.config/claude-code/mcp.json**: MCP server configuration for Claude Code CLI
- **Smart building**: Skips build if `dist/` already exists from host

### 3. Interactive Watcher Updates (`migrate-watch.ts`)
- **Processed flag handling**: Skips interventions with `processed: true`
- **Persistent audit trail**: Files remain in intervention/ directory
- **No automatic archiving**: Phase 2 keeps files for audit instead of archiving

### 4. CLI Response Script (`migrate-respond.sh`)
- **Manual responses**: Allows responding without interactive watcher
- **Worker-id support**: Handles multi-file intervention pattern
- **Usage**: `migrate-respond.sh <worker-id> <response>`

## Critical Requirements

Before testing, understand these critical requirements discovered during implementation:

### 1. Docker Exec with Stdin Redirection
**MUST use `bash -c`** when redirecting stdin to commands in the container:
```bash
# ✅ CORRECT
docker exec claude-migration bash -c 'claude code run < /workspace/test.md'

# ❌ WRONG - causes "no such file or directory"
docker exec claude-migration claude code run < /workspace/test.md
```
**Why:** The `<` redirection is processed by the host shell, not inside the container. Using `bash -c` ensures the command runs properly within the container context.

### 2. MCP Configuration Flag Required
**MUST include `--mcp-config` flag** - the config file is NOT auto-loaded:
```bash
# ✅ CORRECT
--mcp-config ~/.config/claude-code/mcp.json

# ❌ WRONG - MCP servers won't load
# (omitting the flag)
```
**Why:** Claude Code CLI requires explicit `--mcp-config` flag to load MCP servers, even when the config file exists at the default location.

### 3. Permissions Flag for Non-Interactive Execution
**MUST include `--dangerously-skip-permissions`** for Docker exec:
```bash
--dangerously-skip-permissions
```
**Why:** Claude Code requires permission approval for MCP tools. Docker exec is non-interactive and can't respond to permission prompts, causing the process to hang.

### 4. MCP Tool Naming
**Tool name is `mcp__intervention__RequestUserIntervention`** (not `AskUserQuestion`):
- Renamed to avoid collision with Claude Code's built-in `AskUserQuestion` tool
- Full MCP tool name includes prefix: `mcp__{server-name}__{tool-name}`
- In test results, look for `mcp__intervention__RequestUserIntervention`

### 5. Watcher Requires Interactive Terminal
**The watcher (`migrate-watch.sh`) must run in an interactive TTY**:
- Arrow key navigation requires raw mode and proper stdin/stdout
- Cannot run via `docker exec` or in pipes/redirects
- Must run directly on host machine in a terminal

## Prerequisites for Testing

### 1. Set API Key

Create `.env` file in project root:
```bash
ANTHROPIC_API_KEY=your_key_here
```

### 2. Restart Container

```bash
docker restart claude-migration
```

Verify MCP setup in logs:
```bash
docker logs claude-migration | grep MCP
```

You should see:
```
[SUCCESS] MCP server already built (found dist/intervention-server.js)
[SUCCESS] Claude Code MCP configuration created
[INFO] MCP server will provide AskUserQuestion tool to Claude
```

## Test 1: Verify MCP Tool Registration

This test confirms Claude Code can see the `RequestUserIntervention` tool from our MCP server.

```bash
docker exec claude-migration bash -c 'claude code run --dangerously-skip-permissions --mcp-config ~/.config/claude-code/mcp.json < /workspace/tests/fixtures/test-mcp-registration.md'
```

**Important Flags:**
- `--mcp-config ~/.config/claude-code/mcp.json` - Required to load MCP servers
- Use `bash -c` to run command inside container (handles redirection correctly)

**Expected output:**
- Claude lists tool named `mcp__intervention__RequestUserIntervention`
- Tool parameters described: `worker_id`, `question`, `options`, `context`
- Tool should be distinct from Claude Code's built-in `AskUserQuestion` tool

**Important:**
- We renamed the tool from `AskUserQuestion` to `RequestUserIntervention` to avoid conflicts
- The full MCP tool name includes prefix: `mcp__intervention__RequestUserIntervention`

## Test 2: Complete Intervention Flow

This test demonstrates the full intervention workflow.

### Step 1: Start Interactive Watcher (Terminal 1)

```bash
./scripts/migrate-watch.sh
```

You should see:
```
Monitoring for intervention requests...
Press Ctrl+C to stop
Watching: /Users/bfeister/dev/test-storefront/intervention/needed-*.json
```

### Step 2: Run Claude Code with Test Plan (Terminal 2)

```bash
docker exec claude-migration bash -c 'claude code run --dangerously-skip-permissions --mcp-config ~/.config/claude-code/mcp.json < /workspace/tests/fixtures/test-intervention-flow.md'
```

**Important Flags:**
- `--dangerously-skip-permissions` - Auto-approve all tool usage (required for non-interactive Docker execution)
- `--mcp-config` - Load the MCP intervention server

### Step 3: Observe the Flow

1. **Claude calls AskUserQuestion tool**
   - Container creates `intervention/needed-test-worker.json`

2. **Watcher detects intervention** (Terminal 1)
   ```
   ╔══════════════════════════════════════════════════════════╗
   ║  🔔 USER INTERVENTION NEEDED                            ║
   ╚══════════════════════════════════════════════════════════╝

   Question:
     Which authentication method should we use for the storefront?

   Options:
     1. JWT
     2. Session-based
     3. OAuth2

   Worker ID: test-worker
   ```

3. **Select your response** (Terminal 1)
   - Use arrow keys to choose an option
   - Watcher creates `intervention/response-test-worker.json` with `processed: false`

4. **MCP server reads response** (Terminal 2)
   - Polls and finds response file
   - Marks as `processed: true` in response file
   - Returns response to Claude

5. **Claude continues execution** (Terminal 2)
   - Acknowledges your choice
   - Explains implications of the authentication method

### Step 4: Verify Audit Trail

```bash
cat intervention/needed-test-worker.json
cat intervention/response-test-worker.json
```

**Expected:**
- Both files exist in `intervention/` directory
- Response file has `"processed": true`
- Files NOT archived (they persist for audit)

## Test 3: Manual Response (No Interactive Watcher)

This test validates the CLI response command.

### Step 1: Create a Test Intervention

```bash
cat > intervention/needed-manual-test.json <<'EOF'
{
  "timestamp": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "worker_id": "manual-test",
  "question": "Test question for manual response",
  "options": ["Option A", "Option B"],
  "context": "Testing manual response script"
}
EOF
```

### Step 2: Respond Using CLI Script

```bash
./scripts/migrate-respond.sh manual-test "Option A"
```

**Expected output:**
```
Question: Test question for manual response
Worker ID: manual-test
Your response: Option A

✅ Response saved to: intervention/response-manual-test.json

The MCP server will:
  1. Detect this response file
  2. Return the response to Claude
  3. Mark as processed: true

Files will persist in intervention/ directory for audit trail.
```

### Step 3: Verify Response File

```bash
cat intervention/response-manual-test.json
```

Should show:
```json
{
  "timestamp": "...",
  "response": "Option A",
  "question_timestamp": "...",
  "intervention_id": "needed-manual-test",
  "processed": false
}
```

## Test 4: Watcher Skips Processed Interventions

This test validates that the watcher doesn't re-prompt for processed interventions.

### Step 1: Mark Test Intervention as Processed

```bash
jq '.processed = true | .processed_at = now | todate' \
  intervention/response-manual-test.json > tmp.json && \
  mv tmp.json intervention/response-manual-test.json
```

### Step 2: Start Watcher

```bash
./scripts/migrate-watch.sh
```

**Expected output:**
```
Detected file: needed-manual-test.json
Skipping already processed intervention: needed-manual-test
```

The watcher should NOT prompt you for this intervention.

## Known Issues & Solutions

During Phase 2 implementation, we encountered and resolved 5 critical issues:

### Issue 1: Docker Exec Stdin Redirection
**Symptom:** "no such file or directory" error when redirecting stdin
**Solution:** Use `bash -c` wrapper (see Critical Requirements #1)

### Issue 2: MCP Tool Name Collision
**Symptom:** Intervention files not created, built-in `AskUserQuestion` used instead
**Solution:** Renamed MCP tool to `RequestUserIntervention` (see Critical Requirements #4)

### Issue 3: MCP Config Not Auto-Loaded
**Symptom:** Claude Code doesn't see MCP tools, only built-in tools available
**Solution:** Explicitly use `--mcp-config` flag (see Critical Requirements #2)

### Issue 4: Permission Prompt Hangs
**Symptom:** Command hangs after MCP tool permission request in Docker exec
**Solution:** Use `--dangerously-skip-permissions` flag (see Critical Requirements #3)

### Issue 5: Interactive Prompt Auto-Selecting
**Symptom:** Watcher prompt auto-selects first option without waiting for keyboard input
**Solution:** Added explicit stdin/stdout config and raw mode in `migrate-watch.ts` (see Critical Requirements #5)

**All issues have been resolved.** The test commands in this guide include all necessary flags and configurations.

## Troubleshooting

### MCP Server Not Built

**Symptom:** Logs show "MCP server directory not found" or build errors

**Solution:**
```bash
cd mcp-server
pnpm install
pnpm build
cd ..
docker restart claude-migration
```

### Claude Can't See AskUserQuestion Tool

**Check MCP configuration:**
```bash
docker exec claude-migration cat ~/.config/claude-code/mcp.json
```

Should show:
```json
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
```

**Rebuild container if missing:**
```bash
docker compose down
docker compose up -d --build
```

### Intervention Files Not Created

**Check MCP server logs** (visible in Claude Code output):
```
[MCP] Starting Intervention Server...
[MCP] Server started and ready for requests
[MCP] Created intervention request: /workspace/intervention/needed-test-worker.json
```

**Check permissions:**
```bash
docker exec claude-migration ls -la /workspace/intervention/
```

### Response Not Detected

**Check polling** - MCP server polls every 1 second. If response appears, it should be detected within 1-2 seconds.

**Manual verification:**
```bash
docker exec claude-migration cat /workspace/intervention/response-test-worker.json
```

## Success Criteria

Phase 2 is complete when:

- [x] MCP server builds successfully in container
- [x] Claude Code CLI configured with MCP server (mcp.json exists)
- [x] Test 1: Claude Code can see AskUserQuestion tool
- [ ] Test 2: Complete intervention flow works end-to-end
- [ ] Test 3: Manual response via migrate-respond.sh works
- [ ] Test 4: Watcher skips processed interventions
- [x] Intervention files persist in intervention/ directory
- [x] Response files marked with processed: true

## Next Steps: Phase 3

Once Phase 2 testing is complete, proceed to Phase 3: Git Worktree System
- Initialize 6 worktrees for multi-worker isolation
- Configure branches for each migration worker
- Test parallel worker execution
