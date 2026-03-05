# Dual-Environment Entrypoint Plan

**Created:** 2026-02-05
**Last Updated:** 2026-02-09
**Status:** Planning Phase (Enhanced with Smart MCP Merge)
**Goal:** Make `docker/entrypoint.sh` work both inside containers AND on host OS

---

## What's New (2026-03-04)

**MCP Server Removed:** The custom `mcp-server/` directory and its `migration-server.js` have been removed in favor of standalone CLI scripts in `scripts/` (e.g., `log-progress-cli.ts`, `capture-screenshots.ts`). Phase 3 MCP setup in entrypoint.sh now only configures the Playwright MCP server; the custom migration-tools MCP server configuration should be removed from the merge logic.

---

## What's New (2026-02-09)

**Major Enhancement: Non-Destructive MCP Configuration**
- Replaced backup/overwrite strategy with **smart merge** using jq
- User's existing MCP servers are now **preserved** when running on host
- Idempotent and safe to run multiple times
- Graceful fallback if jq is not available

**Additional Improvements:**
- ✅ Added prerequisite validation (catches missing tools early)
- ✅ Enhanced git config handling (local fallback on host)
- ✅ Improved Chrome/Chromium detection (better error messages)
- ✅ Added MONOREPO_SOURCE structure validation
- ✅ Answered open questions (MCP lifecycle, stdin redirection)
- ✅ Expanded testing plan with MCP merge scenarios
- ✅ Added optional helper functions (config inspection, cleanup)
- ✅ Added container vs host comparison table

---

## Executive Summary

The `docker/entrypoint.sh` script currently assumes it runs inside a Docker container with specific paths, mounted volumes, and behaviors. We need to add minimal branching logic to support running the same script on the host OS for better debugging visibility and development velocity.

**Key Principle:** Keep ALL existing container logic working. Add conditional branches that adapt behavior when running on host.

---

## Environment Detection Strategy

### Detection Block (Top of Script)

```bash
# ============================================================================
# Environment Detection
# ============================================================================

if [ -f /.dockerenv ] || [ -n "${DOCKER_CONTAINER:-}" ]; then
    IN_CONTAINER=true
else
    IN_CONTAINER=false
fi

# Configure paths based on environment
if [ "$IN_CONTAINER" = "true" ]; then
    WORKSPACE_ROOT="/workspace"
    MONOREPO_SOURCE="/monorepo-source"
    MONOREPO_BUILD="/tmp/SFCC-Odyssey"
    STANDALONE_BUILD="/tmp/storefront-next-built"
    USE_TMP_STRATEGY=true
    CLAUDE_PERMS="--dangerously-skip-permissions"
    CHROMIUM_PATH="/usr/bin/chromium-browser"
    RUNTIME_NAME="container"
    ATTACH_CMD="docker compose exec claude-migration bash"
else
    WORKSPACE_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
    MONOREPO_SOURCE="${MONOREPO_SOURCE:-}"  # Must be set by user
    MONOREPO_BUILD="$MONOREPO_SOURCE"  # Use in-place
    STANDALONE_BUILD="$WORKSPACE_ROOT/storefront-next"  # No /tmp workaround
    USE_TMP_STRATEGY=false
    CLAUDE_PERMS="-p"
    # Detect chromium/chrome on host with better error handling
    if [ "$(uname)" = "Darwin" ]; then
        if [ -f "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" ]; then
            CHROMIUM_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
        elif [ -f "/Applications/Chromium.app/Contents/MacOS/Chromium" ]; then
            CHROMIUM_PATH="/Applications/Chromium.app/Contents/MacOS/Chromium"
        elif command -v chrome >/dev/null 2>&1; then
            CHROMIUM_PATH="$(command -v chrome)"
        else
            log_error "Chrome/Chromium not found on macOS"
            log_info "Install Chrome or Chromium and restart"
            exit_or_keepalive 1 "Browser not found"
        fi
    elif command -v google-chrome >/dev/null 2>&1; then
        CHROMIUM_PATH="$(command -v google-chrome)"
    elif command -v chromium-browser >/dev/null 2>&1; then
        CHROMIUM_PATH="$(command -v chromium-browser)"
    elif command -v chromium >/dev/null 2>&1; then
        CHROMIUM_PATH="$(command -v chromium)"
    else
        log_error "Chrome/Chromium not found"
        log_info "Install with: apt-get install chromium-browser (Debian/Ubuntu)"
        exit_or_keepalive 1 "Browser not found"
    fi
    RUNTIME_NAME="script"
    ATTACH_CMD="tail -f $WORKSPACE_ROOT/migration-log.md"
fi

# Derived paths (work for both environments)
INTERVENTION_DIR="$WORKSPACE_ROOT/intervention"
LOG_FILE="$WORKSPACE_ROOT/migration-log.md"
PLAN_FILE="${PLAN_FILE:-$WORKSPACE_ROOT/migration-main-plan.md}"
STATE_DIR="$WORKSPACE_ROOT/.migration-state"
STANDALONE_PROJECT="$WORKSPACE_ROOT/storefront-next"
```

---

## Prerequisites & Environment Validation

### Early Validation (After Environment Detection)

**Location:** After environment detection block, before Phase 1
**Purpose:** Fail fast with clear error messages if prerequisites missing

```bash
validate_environment() {
    local errors=0
    local warnings=0

    log_info "Validating environment..."

    # Check required commands
    for cmd in node pnpm git; do
        if ! command -v $cmd >/dev/null 2>&1; then
            log_error "Required command not found: $cmd"
            errors=$((errors + 1))
        fi
    done

    # Check optional but recommended commands
    if ! command -v jq >/dev/null 2>&1; then
        log_warning "jq not found - MCP config merge will use fallback mode"
        if [ "$IN_CONTAINER" = "false" ]; then
            log_info "Install jq: brew install jq (macOS) or apt-get install jq (Linux)"
        fi
        warnings=$((warnings + 1))
    fi

    # Check Claude CLI
    if ! command -v claude >/dev/null 2>&1; then
        log_error "Claude CLI not found"
        log_info "Install from: https://github.com/anthropics/claude-code"
        errors=$((errors + 1))
    fi

    if [ $errors -gt 0 ]; then
        exit_or_keepalive 1 "Environment validation failed ($errors errors)"
    fi

    if [ $warnings -gt 0 ]; then
        log_info "Continuing with $warnings warning(s)..."
    else
        log_success "Environment validation passed"
    fi
}

# Call early in script
validate_environment
```

**Container Note:** Add jq to Dockerfile to ensure it's always available:
```dockerfile
RUN apt-get update && apt-get install -y \
    jq \
    # ... other packages
    && rm -rf /var/lib/apt/lists/*
```

---

## Required Branching Points

### 1. Monorepo Path Validation (Before Phase 1)

**Location:** After environment detection, before line 129
**Issue:** Host needs to know where monorepo is located and validate its structure
**Complexity:** Low

```bash
# Validate monorepo source on host
if [ "$IN_CONTAINER" = "false" ]; then
    if [ -z "$MONOREPO_SOURCE" ]; then
        log_error "MONOREPO_SOURCE not set for host execution"
        log_info "Set environment variable: export MONOREPO_SOURCE=/path/to/SFCC-Odyssey"
        exit_or_keepalive 1 "Missing MONOREPO_SOURCE"
    fi

    if [ ! -d "$MONOREPO_SOURCE" ]; then
        log_error "MONOREPO_SOURCE path does not exist: $MONOREPO_SOURCE"
        exit_or_keepalive 1 "Invalid MONOREPO_SOURCE"
    fi

    # Validate it's actually the monorepo
    if [ ! -d "$MONOREPO_SOURCE/packages" ] || \
       [ ! -f "$MONOREPO_SOURCE/package.json" ]; then
        log_error "MONOREPO_SOURCE doesn't look like SFCC-Odyssey monorepo"
        log_info "Expected: packages/ directory and package.json"
        exit_or_keepalive 1 "Invalid monorepo structure"
    fi

    log_info "Using monorepo at: $MONOREPO_SOURCE"
fi
```

---

### 2. Build Strategy - File Descriptor Workaround (Phase 1)

**Location:** Lines ~267-280, 405-430
**Issue:** Container uses /tmp workaround for FD exhaustion; host doesn't need it
**Complexity:** Medium

```bash
# Around line 405-430 (workspace:* conversion)
if [ "$USE_TMP_STRATEGY" = "true" ]; then
    # EXISTING CONTAINER LOGIC - Keep everything as-is
    log_info "Copying project to /tmp for installation..."
    mkdir -p "$STANDALONE_BUILD"
    rsync -a --exclude='node_modules' "$STANDALONE_PROJECT/" "$STANDALONE_BUILD/"

    cd "$STANDALONE_BUILD"
    log_info "Installing dependencies in container filesystem (avoids bind mount FD limits)..."

    if CI=true pnpm install --no-frozen-lockfile 2>&1 | tail -20; then
        log_success "Dependencies installed in $STANDALONE_BUILD"
    else
        log_error "Failed to install dependencies"
        exit_or_keepalive 1 "Failed to install dependencies"
    fi

    # Copy structure back to workspace (excluding node_modules)
    log_info "Syncing project structure back to workspace..."
    rsync -a --exclude='node_modules' "$STANDALONE_BUILD/" "$STANDALONE_PROJECT/"

    # Symlink node_modules
    log_info "Creating symlink for node_modules..."
    rm -rf "$STANDALONE_PROJECT/node_modules"
    ln -s "$STANDALONE_BUILD/node_modules" "$STANDALONE_PROJECT/node_modules"

    # Verify (existing container verification logic)
    # ... lines 433-468 unchanged ...
else
    # NEW HOST LOGIC - Install directly
    cd "$STANDALONE_PROJECT"
    log_info "Installing dependencies directly in project..."

    if CI=true pnpm install --no-frozen-lockfile 2>&1 | tail -20; then
        log_success "Dependencies installed"
    else
        log_error "Failed to install dependencies"
        exit_or_keepalive 1 "Failed to install dependencies"
    fi

    # Verify binaries
    if [ -f "$STANDALONE_PROJECT/node_modules/.bin/sfnext" ]; then
        log_success "  ✓ sfnext CLI available"
    else
        log_error "  ✗ sfnext CLI not found"
        exit_or_keepalive 1 "Project setup failed"
    fi
fi
```

---

### 2b. Container node_modules Cleanup (Phase 1)

**Location:** Early in Phase 1, before build strategy (around line 145-150)
**Issue:** Ensure /tmp symlink strategy takes precedence over any volume-mounted node_modules
**Complexity:** Low
**Critical:** Prevents FD exhaustion by ensuring bind-mounted node_modules doesn't interfere

```bash
# Add this check at the start of Phase 1 (around line 145, before checking if Phase 1 complete)
if [ "$IN_CONTAINER" = "true" ]; then
    # CONTAINER-ONLY CLEANUP
    # Remove any node_modules in workspace to ensure /tmp symlink takes precedence
    # This prevents file descriptor exhaustion on the bind-mounted volume
    if [ -d "$STANDALONE_PROJECT/node_modules" ] || [ -L "$STANDALONE_PROJECT/node_modules" ]; then
        log_info "Cleaning up workspace node_modules to ensure /tmp strategy works..."
        rm -rf "$STANDALONE_PROJECT/node_modules"
        log_success "Workspace node_modules removed - /tmp symlink will take precedence"
    fi
else
    # HOST: No cleanup needed - installing directly in project
    :  # No-op
fi
```

**Rationale:**
- Container: Must delete workspace node_modules to avoid FD exhaustion on bind mount
- Host: No cleanup needed since we install directly without the /tmp workaround
- This ensures the container's /tmp symlink strategy works correctly

---

### 3. Git User Configuration (Phase 1)

**Location:** Lines 302-307
**Issue:** Container sets disposable identity; host should use existing config or set local fallback
**Complexity:** Low

```bash
# Around line 302-307
if [ "$IN_CONTAINER" = "true" ]; then
    # CONTAINER: Use disposable identity (existing logic)
    git config user.email "migration@example.com"
    git config user.name "Migration Bot"
else
    # HOST: Validate and use existing or set local config
    if ! git config user.email >/dev/null 2>&1; then
        log_warning "Git user not configured globally"
        log_info "Setting local repository config for migration..."
        git config --local user.email "migration@example.com"
        git config --local user.name "Migration Bot (Local)"
        log_success "Git configured locally (won't affect global config)"
    else
        log_success "Using git config: $(git config user.name) <$(git config user.email)>"
    fi
fi
```

**Rationale:** Both environments work without user intervention, but host respects existing config.

---

### 4. MCP Configuration (Smart Merge - Phase 3)

> **UPDATE (2026-03-04):** The custom `migration-tools` MCP server has been removed. Phase 3 now only needs to configure the `playwright` MCP server. The `migration_server` JSON block and merge logic below should be updated to remove `migration-tools` references. All migration tooling now uses CLI scripts in `scripts/` instead.

**Location:** Lines 596-621 (config creation)
**Issue:** MCP config must work in both environments AND preserve user's existing servers
**Complexity:** Medium
**Strategy:** Use jq to intelligently merge our servers with existing config

**Key Benefits:**
- Non-destructive: preserves user's existing MCP servers
- Idempotent: safe to run multiple times
- Environment-aware: uses correct paths for container vs host
- Graceful degradation: works without jq (with backup fallback)

#### 4a. Smart Merge Implementation

```bash
# ============================================================================
# MCP Configuration (Smart Merge)
# ============================================================================

merge_mcp_config() {
    local config_file=~/.config/claude-code/mcp.json

    log_info "Configuring Claude Code MCP servers (smart merge)..."
    mkdir -p ~/.config/claude-code

    # Check if jq is available (needed for JSON manipulation)
    if ! command -v jq >/dev/null 2>&1; then
        log_warning "jq not found - falling back to overwrite method"

        if [ -f "$config_file" ]; then
            backup_file="${config_file}.backup-$(date +%Y%m%d-%H%M%S)"
            log_warning "Backing up existing config to: $backup_file"
            cp "$config_file" "$backup_file"
        fi

        # Write fresh config (fallback method)
        write_mcp_config_template > "$config_file"
        log_success "MCP configuration created (fallback mode - existing servers may be lost)"
        return 0
    fi

    # Define our required servers as JSON (using environment-specific paths)
    local migration_server=$(cat <<EOF
{
  "command": "node",
  "args": ["${WORKSPACE_ROOT}/mcp-server/dist/migration-server.js"],
  "env": {
    "WORKSPACE_ROOT": "${WORKSPACE_ROOT}",
    "INTERVENTION_DIR": "${INTERVENTION_DIR}"
  }
}
EOF
)

    local playwright_server=$(cat <<EOF
{
  "command": "npx",
  "args": ["-y", "@playwright/mcp@latest"],
  "env": {
    "PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH": "${CHROMIUM_PATH}"
  }
}
EOF
)

    # Create base config if file doesn't exist
    if [ ! -f "$config_file" ]; then
        echo '{"mcpServers":{}}' > "$config_file"
        log_info "Created new MCP configuration file"
    fi

    # Validate existing JSON
    if ! jq empty "$config_file" 2>/dev/null; then
        log_error "Existing MCP config is invalid JSON"
        backup_file="${config_file}.invalid-$(date +%Y%m%d-%H%M%S)"
        mv "$config_file" "$backup_file"
        log_warning "Moved invalid config to: $backup_file"
        echo '{"mcpServers":{}}' > "$config_file"
    fi

    # Ensure mcpServers key exists
    local temp_config=$(jq '.mcpServers //= {}' "$config_file")
    echo "$temp_config" > "$config_file"

    # Check for existing servers that would be replaced
    local existing_migration=$(jq -r '.mcpServers["migration-tools"] // empty' "$config_file")
    local existing_playwright=$(jq -r '.mcpServers["playwright"] // empty' "$config_file")

    if [ -n "$existing_migration" ]; then
        log_info "Updating existing 'migration-tools' server"
    else
        log_info "Adding 'migration-tools' server"
    fi

    if [ -n "$existing_playwright" ]; then
        log_info "Updating existing 'playwright' server"
    else
        log_info "Adding 'playwright' server"
    fi

    # Merge our servers into config (preserving others)
    local updated_config=$(jq \
        --argjson migration "$migration_server" \
        --argjson playwright "$playwright_server" \
        '.mcpServers["migration-tools"] = $migration | .mcpServers["playwright"] = $playwright' \
        "$config_file")

    # Write back to file
    echo "$updated_config" > "$config_file"

    # Verify the merge succeeded
    if [ $? -eq 0 ] && jq empty "$config_file" 2>/dev/null; then
        log_success "MCP configuration updated successfully"

        # Show what servers are now configured
        local server_count=$(jq '.mcpServers | keys | length' "$config_file")
        local server_list=$(jq -r '.mcpServers | keys | join(", ")' "$config_file")

        log_info "Total MCP servers configured: $server_count"
        log_info "Servers: $server_list"

        # Show details of our servers
        log_info "Migration tools configured:"
        log_info "  - migration-tools: Custom automation (RequestUserIntervention, LogMigrationProgress, etc.)"
        log_info "  - playwright: Dynamic browser automation"
    else
        log_error "Failed to update MCP configuration"
        return 1
    fi
}

# Helper function for fallback template (when jq not available)
write_mcp_config_template() {
    cat <<EOF
{
  "mcpServers": {
    "migration-tools": {
      "command": "node",
      "args": ["${WORKSPACE_ROOT}/mcp-server/dist/migration-server.js"],
      "env": {
        "WORKSPACE_ROOT": "${WORKSPACE_ROOT}",
        "INTERVENTION_DIR": "${INTERVENTION_DIR}"
      }
    },
    "playwright": {
      "command": "npx",
      "args": ["-y", "@playwright/mcp@latest"],
      "env": {
        "PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH": "${CHROMIUM_PATH}"
      }
    }
  }
}
EOF
}

# Call the merge function (replaces the old config creation logic)
merge_mcp_config
```

#### 4b. MCP Server Lifecycle

**Answer:** Claude Code automatically spawns MCP servers defined in `mcp.json` as child processes.
**Action:** No manual process management needed. Claude Code handles the lifecycle.

**Note:** The script doesn't need to start/stop MCP servers. When `claude code run` or `claude code resume` executes, it reads `~/.config/claude-code/mcp.json` and spawns the configured servers as child processes. They terminate when the Claude session ends.

---

### 5. Claude Code Invocation (Phase 4)

**Location:** Lines 720 (resume), 773-776 (new session)
**Issue:** Different permission flags and command syntax
**Complexity:** Low

```bash
# Around line 720 (resume session)
if [ "$IN_CONTAINER" = "true" ]; then
    # EXISTING CONTAINER LOGIC
    claude -r "$SESSION_ID" > "$WORKSPACE_ROOT/claude-output.log" 2>&1
else
    # NEW HOST LOGIC - Use full command
    claude code resume "$SESSION_ID" > "$WORKSPACE_ROOT/claude-output.log" 2>&1
fi

CLAUDE_EXIT_CODE=$?

# Around line 773-776 (new session)
# Change line 775 to use variable:
claude code run \
    --session-id "$SESSION_ID" \
    $CLAUDE_PERMS \
    < "$MIGRATION_PLAN" > "$WORKSPACE_ROOT/claude-output.log" 2>&1
```

---

### 6. Exit Handling & Cleanup (Throughout)

**Location:** Lines 38-51 (function definition)
**Issue:** Container uses tail -f keepalive; host needs cleanup
**Complexity:** Medium

```bash
# Replace exit_or_keepalive function (lines 38-51)
exit_or_keepalive() {
    local exit_code=$1
    local message="${2:-Would exit with code $exit_code}"

    if [ "$KEEPALIVE" = "true" ]; then
        log_warning "$message"

        if [ "$IN_CONTAINER" = "true" ]; then
            # EXISTING CONTAINER LOGIC
            log_info "KEEPALIVE=true - container will stay running for inspection"
            log_info "Attach with: docker compose exec claude-migration bash"
            tail -f /dev/null
        else
            # NEW HOST LOGIC
            log_info "KEEPALIVE=true - script paused"
            log_info "Migration log: $LOG_FILE"
            log_info "MCP server log: $WORKSPACE_ROOT/mcp-server.log"
            read -r -p "Press Enter to exit..."
            # Fall through to cleanup below
        fi
    fi

    # Cleanup for host (only runs if not in infinite tail -f)
    if [ "$IN_CONTAINER" = "false" ]; then
        log_info "Cleaning up host processes..."

        # Note: Claude Code manages MCP server lifecycle
        # We don't need to kill it manually

        # Remove PID file
        rm -f "$STATE_DIR/entrypoint.pid"
    fi

    exit $exit_code
}
```

---

### 7. Log Message Context (Throughout)

**Location:** ~30 log messages referencing "container", "docker"
**Issue:** Cosmetic - messages should be environment-appropriate
**Complexity:** Low (just variable substitution)

```bash
# Use $RUNTIME_NAME and $ATTACH_CMD variables (defined in detection block)
# Examples:

# Line 123
log_success "Environment validated - $RUNTIME_NAME ready"

# Line 669
log_success "$RUNTIME_NAME initialization complete"

# Line 682
log_info "To run manually: $ATTACH_CMD"

# Line 712
log_info "Monitor with: $ATTACH_CMD"

# Line 815
log_info "Resume: cd docker && docker compose up"  # Only show if IN_CONTAINER=true
```

---

## Implementation Checklist

### Phase 0: Prerequisites
- [ ] Add jq to Dockerfile (container environment)
- [ ] Add environment validation function (validate_environment)
- [ ] Test validation with missing dependencies

### Phase 1: Foundation
- [ ] Add environment detection block at top of script
- [ ] Define all environment-specific variables (including improved Chrome detection)
- [ ] Test detection logic in both environments

### Phase 2: Path & Config Validation
- [ ] Add MONOREPO_SOURCE validation for host (with structure check)
- [ ] Adapt git config check for host (with local fallback)
- [ ] Test with host environment variables

### Phase 3: Build Logic
- [ ] Add container node_modules cleanup at start of Phase 1 (critical for FD prevention)
- [ ] Add USE_TMP_STRATEGY conditional in Phase 1 build
- [ ] Test direct install on host (no rsync/symlink)
- [ ] Verify both paths still work

### Phase 4: MCP Smart Merge
- [ ] Implement merge_mcp_config() function
- [ ] Implement write_mcp_config_template() fallback
- [ ] Test with existing user config (preservation)
- [ ] Test with no existing config (creation)
- [ ] Test with invalid JSON (recovery)
- [ ] Test without jq (fallback mode)
- [ ] Verify environment-specific paths work correctly

### Phase 5: Claude Invocation
- [ ] Update Claude resume command for host
- [ ] Update Claude permissions flag (use $CLAUDE_PERMS)
- [ ] Test both invocation methods

### Phase 6: Lifecycle & Cleanup
- [ ] Update exit_or_keepalive function
- [ ] Add host cleanup logic (no MCP manual management needed)
- [ ] Test keepalive behavior in both environments

### Phase 7: Polish
- [ ] Replace hardcoded "container" references with $RUNTIME_NAME
- [ ] Update docker-specific instructions to be conditional
- [ ] Test log output readability

### Phase 8: Documentation
- [ ] Add usage instructions for host execution
- [ ] Document required environment variables
- [ ] Add troubleshooting section
- [ ] Document jq as optional but recommended dependency

---

## Usage Instructions (After Implementation)

### Running in Container (Existing)
```bash
cd docker
docker compose up
```

### Running on Host (New)
```bash
# Set required environment variables
export MONOREPO_SOURCE=/path/to/SFCC-Odyssey

# Run entrypoint directly
cd /path/to/test-storefront
./docker/entrypoint.sh
```

### Environment Variables (Host)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `MONOREPO_SOURCE` | Yes | - | Path to SFCC-Odyssey monorepo |
| `PLAN_FILE` | No | `migration-main-plan.md` | Migration plan file |
| `KEEPALIVE` | No | `false` | Pause instead of exit on errors |
| `CLEAN_START` | No | `false` | Remove state before starting |
| `AUTO_START` | No | `true` | Start Claude Code automatically |

### Comparison: Container vs Host

| Aspect | Container | Host |
|--------|-----------|------|
| **Setup Time** | Slower (image build) | Faster (direct execution) |
| **Isolation** | Full (Docker) | None (uses host tools) |
| **Debugging** | Limited visibility | Full visibility |
| **MCP Config** | Isolated (~/.config in container) | Uses host ~/.config |
| **File Access** | Via bind mounts | Direct filesystem access |
| **Prerequisites** | Bundled in image | Must be installed (node, pnpm, jq, claude) |
| **Best For** | Production, CI/CD, consistency | Development, debugging, iteration |
| **MCP Merge** | Overwrites container config (OK) | Smart merge preserves user's servers |

---

## Resolved Questions

### 1. MCP Server Lifecycle ✅
**Question:** Does Claude Code automatically spawn MCP servers defined in `mcp.json`, or do we need to start them manually?

**Answer:** Claude Code automatically spawns MCP servers as child processes when starting a session. No manual process management needed.
**Action:** No code required - documented in Section 4b.

### 2. Config Merging Strategy ✅
**Question:** Should we overwrite user's `~/.config/claude-code/mcp.json` or use project-local config?

**Answer:** Implemented smart merge using jq (Option B).
**Action:** See Section 4a - merge_mcp_config() function preserves user's existing servers.

### 3. Stdin Redirection ✅
**Question:** Do we need `< /dev/null pnpm install` on host?

**Answer:** Keep it on host too for consistency and to prevent unexpected interactive prompts.
**Reason:** Defensive practice that works well in automation contexts (both container and host).
**Action:** Use `< /dev/null` or `CI=true` for pnpm commands in both environments.

## Open Questions

### 1. Claude CLI Command Syntax
**Question:** Does the container use a shell alias for `claude` commands?

**Current state:** Container uses `claude -r` (line 720), but also uses `claude code run` (line 773).
**Inconsistency:** Plan proposes different commands for container vs host.
**Recommendation:** Use full `claude code` commands in both environments for clarity.
**Action needed:** Verify if there's an alias in container, document it, or standardize on full commands.

### 2. Playwright Browser Path
**Question:** Should we auto-detect or require env var?

**Current proposal:** Auto-detect with fallbacks (improved in detection block)
**Risk:** May not find browser on some systems
**Mitigation:** Fail fast with clear error message and installation instructions

---

## Testing Plan

### Test 1: Container Execution (Regression)
- [ ] Run in container with existing setup
- [ ] Verify all phases complete
- [ ] Verify no behavior changes
- [ ] Verify jq is available in container

### Test 2: Host Execution (New)
- [ ] Set MONOREPO_SOURCE env var
- [ ] Run entrypoint.sh on host
- [ ] Verify Phase 1-3 complete
- [ ] Verify MCP config created/merged
- [ ] Verify Claude Code starts

### Test 3: Path Resolution
- [ ] Test with relative paths
- [ ] Test with absolute paths
- [ ] Test with symlinked directories
- [ ] Test MONOREPO_SOURCE structure validation

### Test 4: Cleanup
- [ ] Test normal exit
- [ ] Test KEEPALIVE=true
- [ ] Test error exit
- [ ] Verify no orphaned processes

### Test 5: MCP Config Merge
- [ ] Test with no existing config (creates new)
- [ ] Test with existing config containing other servers (preserves them)
- [ ] Test with our servers already present (updates them)
- [ ] Test with invalid JSON (backs up and recreates)
- [ ] Test without jq available (uses fallback)
- [ ] Verify paths are correct in both container and host
- [ ] Verify both servers work after merge

### Test 6: Environment Validation
- [ ] Test with missing node (should fail)
- [ ] Test with missing pnpm (should fail)
- [ ] Test with missing git (should fail)
- [ ] Test with missing claude CLI (should fail)
- [ ] Test with missing jq (should warn but continue)

### Test 7: Parallel Execution
- [ ] Run container and host versions simultaneously
- [ ] Verify no resource conflicts
- [ ] Verify no port conflicts (dashboard)

### Test 8: Chrome/Chromium Detection
- [ ] Test on macOS with Chrome installed
- [ ] Test on macOS with Chromium installed
- [ ] Test on Linux with chromium-browser
- [ ] Test with no browser (should fail with clear message)

---

## Success Criteria

- [ ] Script runs successfully in container (no regressions)
- [ ] Script runs successfully on host OS (macOS tested)
- [ ] No more than 6-8 `if [ "$IN_CONTAINER" = ... ]` conditionals added
- [ ] All existing container functionality preserved
- [ ] Host execution provides better debugging visibility
- [ ] Documentation updated with usage examples
- [ ] MCP config smart merge preserves user's existing servers
- [ ] Environment validation catches missing prerequisites early
- [ ] Chrome/Chromium detection works on macOS and Linux

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Breaking container execution | High | Test container after each change; use phased implementation |
| MCP config overwrites user's | Low | ✅ Mitigated: Smart merge preserves existing servers |
| jq not available on host | Low | Graceful fallback to overwrite (with backup) |
| Chromium not found on host | Medium | Fail fast with clear error message and install instructions |
| Invalid monorepo path | Medium | Structure validation before build; clear error messages |
| Process cleanup failures | Low | Use `|| true` for non-critical cleanup |
| Git not configured on host | Low | Use local config as fallback (doesn't affect global) |

---

## Future Enhancements

- Windows support (currently macOS/Linux only)
- Interactive setup wizard for first-time host execution
- Health check endpoint for MCP server
- Parallel execution support (multiple workers)
- MCP config cleanup helper (remove migration servers when done)
- Config inspection command to show current MCP setup

---

## Optional Helper Functions

These utility functions can be added to enhance the script's usability:

### MCP Config Inspection

```bash
show_mcp_config() {
    local config_file=~/.config/claude-code/mcp.json

    if [ ! -f "$config_file" ]; then
        log_warning "No MCP configuration found at $config_file"
        return 1
    fi

    log_info "Current MCP Configuration:"
    log_info "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

    if command -v jq >/dev/null 2>&1; then
        # Pretty print with jq
        jq -r '.mcpServers | to_entries[] | "  [\(.key)]\n    Command: \(.value.command)\n    Args: \(.value.args | join(" "))\n"' "$config_file"
    else
        # Fallback to cat
        cat "$config_file"
    fi

    log_info "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
}
```

### MCP Cleanup (for when migration is done)

```bash
remove_migration_mcp_servers() {
    local config_file=~/.config/claude-code/mcp.json

    if [ ! -f "$config_file" ]; then
        log_info "No MCP configuration to clean up"
        return 0
    fi

    if ! command -v jq >/dev/null 2>&1; then
        log_warning "jq not available - cannot safely remove servers"
        log_info "Manually edit: $config_file"
        return 1
    fi

    log_info "Removing migration MCP servers from configuration..."

    # Remove our servers but keep others
    local updated_config=$(jq 'del(.mcpServers["migration-tools"], .mcpServers["playwright"])' "$config_file")
    echo "$updated_config" > "$config_file"

    log_success "Migration servers removed from MCP configuration"
    log_info "Your other MCP servers are preserved"
}
```

**Usage:** Call `show_mcp_config` after merge to show user what's configured, or add `remove_migration_mcp_servers` to a cleanup script.

---

## Notes

- This plan assumes Claude Code >= v0.x (with MCP support)
- Tested on macOS, should work on Linux
- Windows support requires additional path handling
- All changes should be backward-compatible
- **Critical:** Container cleanup of workspace node_modules (Section 2b) prevents FD exhaustion by ensuring the /tmp symlink strategy works correctly
- **jq dependency:** Required for smart MCP merge; gracefully degrades to fallback if missing
- **MCP lifecycle:** Claude Code manages server processes automatically; no manual management needed
