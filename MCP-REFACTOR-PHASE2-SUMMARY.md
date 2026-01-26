# Phase 2: ValidateDevServer Tool - Complete ✅

## What Was Built

Implemented the `ValidateDevServer` MCP tool to automate dev server lifecycle management in the migration loop.

### Core Changes

**MCP Server (`mcp-server/`):**
- `src/tools/dev-server.ts` - **ValidateDevServer implementation**
  - `isPortInUse()` - Checks if port is already in use
  - `isServerResponding()` - Validates server responds to HTTP
  - `parseDevServerOutput()` - Extracts errors/warnings from Vite output
  - `startDevServer()` - Spawns pnpm dev, monitors output, detects ready state
  - `handleValidateDevServer()` - Main handler with full lifecycle management

**Migration Plan:**
- `migration-main-plan.md` - Section 5 now uses ValidateDevServer tool
- Updated error handling section for dev server issues
- Changed from manual bash process management to automated tool

**Testing:**
- `test-dev-server-in-container.sh` - Validation script for container testing

## ValidateDevServer Tool

### What It Does

Replaces ~50 lines of error-prone bash commands with a simple tool call:

```javascript
const devServerResult = await mcp__migration_tools__ValidateDevServer({
  app_dir: "/workspace/storefront-next",
  port: 5173,
  timeout_seconds: 60,
  check_endpoints: ["/"]  // Optional
});

if (!devServerResult.success) {
  console.error("Dev server failed:", devServerResult.errors);
}

// Dev server is now running at devServerResult.server_url
```

### Features

- ✅ Checks if dev server already running (reuses if healthy)
- ✅ Kills unresponsive processes and restarts
- ✅ Starts `pnpm dev` if needed with proper process management
- ✅ Monitors output in real-time for errors/warnings
- ✅ Detects server ready state by parsing Vite output
- ✅ Validates server responds to HTTP requests
- ✅ Optionally checks specific endpoints (e.g., ["/", "/search"])
- ✅ Returns structured result with server URL, errors, warnings, startup time
- ✅ Keeps dev server running in background for reuse across iterations

**Result:** Eliminates dev server startup race conditions and improves error reporting

## Testing

### Quick Test (Inside Container)

```bash
# Ensure container is running
docker ps | grep claude-migration-demo

# Run test
./test-dev-server-in-container.sh
```

### What Gets Tested

1. **Test 1:** Start dev server from scratch
   - Spawns `pnpm dev` in storefront-next
   - Monitors output for ready state
   - Validates HTTP endpoint responds
   - Reports startup time and any errors/warnings

2. **Test 2:** Reuse already-running server
   - Calls tool again on same port
   - Should detect existing server and return quickly (< 5 seconds)
   - Validates server still responds

### Expected Output

```
✅ Test 1 PASSED: Dev server started and validated
   Server URL: http://localhost:5173
   Startup time: 15 seconds

✅ Test 2 PASSED: Reused existing dev server
   Server URL: http://localhost:5173
   Check time: 1 seconds (fast = reused)
```

## How It Works

### Port Detection Flow

1. Check if port is in use: `lsof -ti:5173`
2. If in use, check if server responds to HTTP
3. If responds: ✅ Reuse existing server (fast path)
4. If doesn't respond: Kill process and start fresh

### Dev Server Startup Flow

1. Spawn: `pnpm dev` in background (detached process)
2. Monitor: Collect stdout/stderr in real-time
3. Parse: Look for `Local: http://localhost:5173/` pattern
4. Validate: Send HTTP GET request to server URL
5. Return: Structured result with errors, warnings, server URL
6. Background: Process continues running (unref'd) for reuse

### Error Detection

Parses dev server output for common error patterns:
- `ERROR`, `Error:` - General errors
- `error TS` - TypeScript compilation errors
- `Failed to`, `Cannot find`, `Module not found` - Module resolution errors
- `WARNING`, `Warning:`, `warn` - Warnings (non-blocking)

## Integration with Migration Loop

### Before (Manual)

```bash
# ~50 lines of bash code
pnpm dev > /tmp/dev-server.log 2>&1 &
DEV_PID=$!

for i in {1..30}; do
  if grep -q "Local:" /tmp/dev-server.log; then
    PORT=$(grep "Local:" /tmp/dev-server.log | grep -oP "localhost:\K\d+" | head -1)
    if curl -s http://localhost:$PORT > /dev/null 2>&1; then
      echo "Dev server ready"
      break
    fi
  fi
  sleep 1
done

# ... later ...
kill $DEV_PID  # Must remember to clean up
```

**Issues:**
- Race conditions in output parsing
- Manual port detection fragile
- Error handling scattered
- Must manually clean up process
- No structured error reporting
- Can't reuse across iterations

### After (Tool)

```javascript
// Single tool call
const result = await mcp__migration_tools__ValidateDevServer({
  app_dir: "/workspace/storefront-next",
  port: 5173,
  timeout_seconds: 60,
  check_endpoints: ["/"]
});

if (!result.success) {
  // Structured errors available
  console.error("Errors:", result.errors);
  console.error("Warnings:", result.warnings);
}

// Use server URL directly
const SERVER_URL = result.server_url;
```

**Benefits:**
- ✅ Robust output parsing
- ✅ Automatic port detection
- ✅ Centralized error handling
- ✅ Process managed automatically
- ✅ Structured error reporting
- ✅ Reuses server across iterations

## Updated Migration Plan Sections

### Section 5: Dev Server Startup

Now uses ValidateDevServer tool with automatic lifecycle management:
- Detects if already running
- Starts if needed
- Validates errors/warnings
- Returns server URL for screenshots

### Error Handling Section

Updated to reflect automatic error detection:
- Tool parses output for TypeScript/compilation errors
- Returns structured `errors` and `warnings` arrays
- Suggests intervention for blocking errors
- Documents retry strategy

### Iteration Guidelines

Changed rule 6 from "Always kill dev server" to "Dev server reused automatically" since the tool manages this.

## Next Steps

Phase 2 is complete. Ready to implement:

- **Phase 3:** CaptureDualScreenshots + ParseURLMapping tools
- **Phase 4:** CommitMigrationProgress + GetNextMicroPlan tools

When complete: **84% total context reduction**, enabling **5-6x more iterations per session**.

## Documentation

- `MCP-TOOLS-PLAN.md` - Complete implementation plan for all phases
- `migration-main-plan.md` - Updated to use ValidateDevServer (Section 5 + Error Handling)
- This file - Concise Phase 2 summary

---

**Status:** Phase 2 complete and ready for testing.
