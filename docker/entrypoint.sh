#!/bin/bash
set -euo pipefail

# entrypoint.sh - Migration worker entrypoint
# This script runs Claude Code and monitors for intervention requests

# Configuration
INTERVENTION_DIR="/workspace/intervention"
LOG_FILE="/workspace/migration-log.md"
PLAN_FILE="${PLAN_FILE:-/workspace/migration-plan.md}"
STATE_DIR="/workspace/.migration-state"
KEEPALIVE="${KEEPALIVE:-false}"

# Colors for logging
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $(date -u +"%Y-%m-%dT%H:%M:%SZ") - $1" | tee -a "$LOG_FILE"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $(date -u +"%Y-%m-%dT%H:%M:%SZ") - $1" | tee -a "$LOG_FILE"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $(date -u +"%Y-%m-%dT%H:%M:%SZ") - $1" | tee -a "$LOG_FILE"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $(date -u +"%Y-%m-%dT%H:%M:%SZ") - $1" | tee -a "$LOG_FILE"
}

# Exit helper - respects KEEPALIVE flag
exit_or_keepalive() {
    local exit_code=$1
    local message="${2:-Container would exit with code $exit_code}"

    if [ "$KEEPALIVE" = "true" ]; then
        log_warning "$message"
        log_info "KEEPALIVE=true - container will stay running for inspection"
        log_info "Attach with: docker compose exec claude-migration bash"
        tail -f /dev/null
    else
        exit $exit_code
    fi
}

# ============================================================================
# Clean Start Handling
# ============================================================================

if [ "${CLEAN_START:-false}" = "true" ]; then
    echo -e "${YELLOW}[CLEAN]${NC} $(date -u +"%Y-%m-%dT%H:%M:%SZ") - Clean start requested"
    echo -e "${YELLOW}[CLEAN]${NC} Removing workspace artifacts..."

    # Remove session file
    if [ -f /workspace/.claude-session-id ]; then
        rm -f /workspace/.claude-session-id
        echo -e "${GREEN}[CLEAN]${NC}   ✓ Removed .claude-session-id"
    fi

    # Remove state tracking
    if [ -d "$STATE_DIR" ]; then
        rm -rf "$STATE_DIR"
        echo -e "${GREEN}[CLEAN]${NC}   ✓ Removed stage completion markers"
    fi

    # Remove intervention files
    if [ -d "$INTERVENTION_DIR" ]; then
        rm -f "$INTERVENTION_DIR"/needed-*.json "$INTERVENTION_DIR"/response-*.json 2>/dev/null || true
        echo -e "${GREEN}[CLEAN]${NC}   ✓ Removed intervention files"
    fi

    # Remove logs
    if [ -f /workspace/claude-output.log ]; then
        rm -f /workspace/claude-output.log
        echo -e "${GREEN}[CLEAN]${NC}   ✓ Removed claude-output.log"
    fi

    # Optionally backup migration-log.md instead of deleting
    if [ -f "$LOG_FILE" ]; then
        backup_log="/workspace/migration-log-backup-$(date -u +"%Y%m%d-%H%M%S").md"
        mv "$LOG_FILE" "$backup_log"
        echo -e "${GREEN}[CLEAN]${NC}   ✓ Backed up migration-log.md to $(basename "$backup_log")"
    fi

    echo -e "${GREEN}[CLEAN]${NC} Workspace cleaned, starting fresh"
    echo ""
fi

# Create state directory
mkdir -p "$STATE_DIR"

# Initialize log file
echo "# Migration Log - $(date -u +"%Y-%m-%dT%H:%M:%SZ")" > "$LOG_FILE"
echo "" >> "$LOG_FILE"

log_info "Migration worker starting..."
log_info "Intervention directory: $INTERVENTION_DIR"
log_info "Plan file: $PLAN_FILE"

# Ensure intervention directories exist
mkdir -p "$INTERVENTION_DIR/history"

# Check for API key or auth token (warning only - container stays running)
if [ -z "${ANTHROPIC_API_KEY:-}" ] && [ -z "${ANTHROPIC_AUTH_TOKEN:-}" ]; then
    log_warning "Neither ANTHROPIC_API_KEY nor ANTHROPIC_AUTH_TOKEN set"
    log_warning "Claude Code execution will fail without authentication"
    log_warning "Set one in .env file and restart container"
else
    if [ -n "${ANTHROPIC_AUTH_TOKEN:-}" ]; then
        log_success "Authentication configured (Bedrock)"
    else
        log_success "Authentication configured (API key)"
    fi
fi

log_success "Environment validated - container ready"

# ============================================================================
# Phase 1: Build Monorepo and Generate Standalone Project
# ============================================================================

MONOREPO_SOURCE="/monorepo-source"
MONOREPO_BUILD="/tmp/SFCC-Odyssey"
STANDALONE_PROJECT="/workspace/storefront-next"
STANDALONE_BUILD="/tmp/storefront-next-built"  # Build in container-only filesystem to avoid FD exhaustion

# Check if Phase 1 already complete
if [ -f "$STATE_DIR/phase1-complete" ] && \
   [ -L "$STANDALONE_PROJECT/node_modules" ] && \
   [ -f "$STANDALONE_BUILD/node_modules/.bin/sfnext" ] && \
   [ -f "$MONOREPO_BUILD/packages/storefront-next-dev/dist/cli.js" ]; then
    log_success "Phase 1 already complete (built: $(cat "$STATE_DIR/phase1-complete"))"
    log_info "  Monorepo: $MONOREPO_BUILD"
    log_info "  Standalone: $STANDALONE_PROJECT"
    log_info "  node_modules: $STANDALONE_BUILD/node_modules (symlinked)"
    log_info "Skipping to Phase 2..."
else
    log_info "Running Phase 1: Build Monorepo and Generate Standalone Project"

# Step 1: Check if monorepo needs to be built
if [ -f "$MONOREPO_BUILD/packages/storefront-next-dev/dist/cli.js" ]; then
    log_success "Monorepo already built at $MONOREPO_BUILD"
else
    log_info "Building monorepo in container..."

    # Check if monorepo source is mounted
    if [ ! -d "$MONOREPO_SOURCE" ]; then
        log_error "Monorepo source not mounted at $MONOREPO_SOURCE"
        log_error "Add volume: - \$STOREFRONT_MONOREPO_PATH:/monorepo-source:ro"
        log_warning "Skipping monorepo build - container will not be fully functional"
    else
        log_info "Copying monorepo from $MONOREPO_SOURCE to $MONOREPO_BUILD..."

        # Remove old build
        rm -rf "$MONOREPO_BUILD"
        mkdir -p "$MONOREPO_BUILD"

        # Copy monorepo excluding build artifacts and node_modules
        # Use tar streaming (no temp files) to avoid file descriptor exhaustion
        log_info "Copying source files via tar streaming (excluding node_modules, dist, .git)..."
        tar -C "$MONOREPO_SOURCE" \
            --exclude='node_modules' \
            --exclude='.pnpm-store' \
            --exclude='.git' \
            --exclude='dist' \
            --exclude='build' \
            --exclude='.next' \
            --exclude='coverage' \
            --exclude='.nyc_output' \
            --exclude='test-results' \
            --exclude='playwright-report' \
            -czf - . | tar -C "$MONOREPO_BUILD" -xzf -

        log_success "Monorepo copied to $MONOREPO_BUILD"

        # Build monorepo
        log_info "Installing monorepo dependencies (this may take 2-3 minutes)..."
        cd "$MONOREPO_BUILD"

        if < /dev/null pnpm install --frozen-lockfile 2>&1; then
            log_success "Monorepo dependencies installed"
        else
            log_warning "Install with frozen lockfile failed, trying without..."
            if < /dev/null pnpm install 2>&1; then
                log_success "Monorepo dependencies installed"
            else
                log_error "Failed to install monorepo dependencies"
                log_error "Cannot continue without monorepo packages"
                cd /workspace
                exit_or_keepalive 1 "Monorepo dependency installation failed"
            fi
        fi

        log_info "Building monorepo packages..."
        if < /dev/null pnpm -r build 2>&1; then
            log_success "Monorepo built successfully"

            # Verify key packages
            if [ -f "packages/storefront-next-dev/dist/cli.js" ]; then
                log_success "  ✓ storefront-next-dev"
            else
                log_error "  ✗ storefront-next-dev build missing"
                exit 1
            fi
            if [ -f "packages/storefront-next-runtime/dist/scapi.js" ]; then
                log_success "  ✓ storefront-next-runtime"
            else
                log_error "  ✗ storefront-next-runtime build missing"
                exit 1
            fi
        else
            log_error "Monorepo build failed"
            log_error "Cannot continue without built packages"
            cd /workspace
            exit_or_keepalive 1 "Monorepo build failed"
        fi

        cd /workspace
    fi
fi

# Step 2: Check if standalone project needs to be generated (idempotent check)
if [ -f "$STANDALONE_PROJECT/package.json" ] && \
   [ -L "$STANDALONE_PROJECT/node_modules" ] && \
   [ -f "$STANDALONE_BUILD/node_modules/.bin/sfnext" ]; then
    log_success "Standalone project already complete - skipping generation"

    # Verify it doesn't have workspace:* dependencies (from old runs)
    if grep -q '"workspace:' "$STANDALONE_PROJECT/package.json" 2>/dev/null; then
        log_warning "Found workspace:* dependencies in existing project"
        log_info "Re-converting to file:// references..."

        cd "$STANDALONE_PROJECT"
        node -e "
            const fs = require('fs');
            const path = require('path');
            const pkg = require('./package.json');
            const monorepoPackages = '$MONOREPO_BUILD/packages';
            let converted = 0;

            ['dependencies', 'devDependencies'].forEach(depType => {
                if (pkg[depType]) {
                    Object.keys(pkg[depType]).forEach(name => {
                        if (pkg[depType][name].startsWith('workspace:')) {
                            const pkgName = name.split('/').pop();
                            const pkgPath = path.join(monorepoPackages, pkgName);
                            pkg[depType][name] = 'file://' + pkgPath;
                            converted++;
                        }
                    });
                }
            });

            if (converted > 0) {
                fs.writeFileSync('./package.json', JSON.stringify(pkg, null, 2) + '\n');
                console.log('Converted ' + converted + ' workspace:* dependencies');
            }
        "

        # Install in /tmp to avoid bind mount FD exhaustion
        log_info "Copying to /tmp for dependency update..."
        mkdir -p "$STANDALONE_BUILD"
        rsync -a --exclude='node_modules' "$STANDALONE_PROJECT/" "$STANDALONE_BUILD/"

        cd "$STANDALONE_BUILD"
        log_info "Running pnpm install in container filesystem..."
        CI=true pnpm install --no-frozen-lockfile 2>&1 | tail -10

        # Sync back and recreate symlink
        rsync -a --exclude='node_modules' "$STANDALONE_BUILD/" "$STANDALONE_PROJECT/"
        rm -rf "$STANDALONE_PROJECT/node_modules"
        ln -s "$STANDALONE_BUILD/node_modules" "$STANDALONE_PROJECT/node_modules"

        log_success "Project updated with file:// references"
    fi
else
    log_info "Standalone project incomplete or missing - regenerating..."

    # Check if monorepo is built
    if [ ! -f "$MONOREPO_BUILD/packages/storefront-next-dev/dist/cli.js" ]; then
        log_error "Cannot generate standalone project: monorepo not built"
        log_warning "Container will not be fully functional"
    else
        # Create clean template with git history (required by create-storefront)
        log_info "Preparing template..."
        cd /tmp
        rm -rf template-clean

        rsync -a --exclude='node_modules' --exclude='.git' \
            "$MONOREPO_BUILD/packages/template-retail-rsc-app/" \
            template-clean/

        cd template-clean

        # Configure git for this repo (required for commit)
        git init
        git config user.email "migration@example.com"
        git config user.name "Migration Bot"
        git add .
        git commit -m "Initial template"
        log_success "Template prepared"

        cd /workspace

        # Check if project already exists
        if [ -d "$STANDALONE_PROJECT" ]; then
            log_success "Standalone project already exists, skipping generation"
        else
            log_info "Running create-storefront..."
            log_info "  Template: /tmp/template-clean"
            log_info "  Local packages: $MONOREPO_BUILD/packages"

            # Run create-storefront with --local-packages-dir to create file:// symlinks
            # Pipe newlines to accept default paths for workspace dependencies (non-interactive)
            echo -e "\n\n" | npx "$MONOREPO_BUILD/packages/storefront-next-dev/dist/cli.js" create-storefront \
                --name storefront-next \
                --template "file:///tmp/template-clean" \
                --local-packages-dir "$MONOREPO_BUILD/packages"

            if [ $? -eq 0 ]; then
                log_success "Standalone project created"
            else
                log_error "Failed to create standalone project"
                log_error "Cannot continue without valid project structure"
                exit_or_keepalive 1 "Failed to create standalone project"
            fi
        fi

        # Convert workspace:* dependencies to file:// references
        # This creates symlinks from /workspace (shared mount) to /tmp (container-only)
        # Avoids file descriptor exhaustion on host OS
        if [ -d "$STANDALONE_PROJECT" ]; then
            cd "$STANDALONE_PROJECT"

            log_info "Converting workspace:* dependencies to file:// references..."

            # Convert workspace:* to file:// in package.json
            node -e "
                const fs = require('fs');
                const path = require('path');
                const pkg = require('./package.json');

                const monorepoPackages = '$MONOREPO_BUILD/packages';
                let converted = 0;

                // Convert dependencies
                if (pkg.dependencies) {
                    Object.keys(pkg.dependencies).forEach(name => {
                        if (pkg.dependencies[name].startsWith('workspace:')) {
                            // Extract package name (e.g., @salesforce/foo → foo)
                            const pkgName = name.split('/').pop();
                            const pkgPath = path.join(monorepoPackages, pkgName);

                            // Convert to file:// reference (symlink target in /tmp)
                            pkg.dependencies[name] = 'file://' + pkgPath;
                            converted++;
                            console.error('  ✓ ' + name + ' → file://' + pkgPath);
                        }
                    });
                }

                // Convert devDependencies
                if (pkg.devDependencies) {
                    Object.keys(pkg.devDependencies).forEach(name => {
                        if (pkg.devDependencies[name].startsWith('workspace:')) {
                            // Extract package name (e.g., @salesforce/foo → foo)
                            const pkgName = name.split('/').pop();
                            const pkgPath = path.join(monorepoPackages, pkgName);

                            // Convert to file:// reference (symlink target in /tmp)
                            pkg.devDependencies[name] = 'file://' + pkgPath;
                            converted++;
                            console.error('  ✓ ' + name + ' → file://' + pkgPath);
                        }
                    });
                }

                if (converted > 0) {
                    fs.writeFileSync('./package.json', JSON.stringify(pkg, null, 2) + '\n');
                    console.error('');
                    console.error('Converted ' + converted + ' workspace:* dependencies to file:// references');
                } else {
                    console.error('No workspace:* dependencies found');
                }
            "

            if [ $? -ne 0 ]; then
                log_error "Failed to convert workspace dependencies"
                exit_or_keepalive 1 "Failed to convert workspace dependencies"
            fi

            # Install dependencies in container-only filesystem to avoid FD exhaustion
            log_info "Copying project to /tmp for installation..."
            mkdir -p "$STANDALONE_BUILD"
            rsync -a --exclude='node_modules' "$STANDALONE_PROJECT/" "$STANDALONE_BUILD/"

            cd "$STANDALONE_BUILD"
            log_info "Installing dependencies in container filesystem (avoids bind mount FD limits)..."

            # Use --no-frozen-lockfile since we modified package.json
            # Set CI=true to run pnpm in non-interactive mode (no prompts)
            if CI=true pnpm install --no-frozen-lockfile 2>&1 | tail -20; then
                log_success "Dependencies installed in $STANDALONE_BUILD"
            else
                log_error "Failed to install dependencies"
                log_error "Cannot continue without dependencies"
                exit_or_keepalive 1 "Failed to install dependencies"
            fi

            # Copy structure back to workspace (excluding node_modules)
            log_info "Syncing project structure back to workspace..."
            rsync -a --exclude='node_modules' "$STANDALONE_BUILD/" "$STANDALONE_PROJECT/"

            # Remove any existing node_modules (directory or symlink) before creating new symlink
            log_info "Creating symlink for node_modules..."
            rm -rf "$STANDALONE_PROJECT/node_modules"
            ln -s "$STANDALONE_BUILD/node_modules" "$STANDALONE_PROJECT/node_modules"

            # Verify symlink and binaries
            if [ -L "$STANDALONE_PROJECT/node_modules" ]; then
                log_success "  ✓ node_modules symlinked to $(readlink $STANDALONE_PROJECT/node_modules)"
            else
                log_error "  ✗ Failed to create node_modules symlink"
                exit 1
            fi

            if [ -f "$STANDALONE_BUILD/node_modules/.bin/sfnext" ]; then
                log_success "  ✓ sfnext CLI available at $STANDALONE_BUILD/node_modules/.bin/sfnext"
                # Verify it's accessible via symlink
                if [ -f "$STANDALONE_PROJECT/node_modules/.bin/sfnext" ]; then
                    log_success "  ✓ sfnext accessible via workspace symlink"
                fi
            else
                log_error "  ✗ sfnext CLI not found at $STANDALONE_BUILD/node_modules/.bin/sfnext"

                # Debug: Check if package was installed
                log_info "Debugging: Checking for @salesforce/storefront-next-dev package..."
                if [ -d "$STANDALONE_BUILD/node_modules/@salesforce/storefront-next-dev" ]; then
                    log_info "  Package directory exists"
                    log_info "  Checking package.json bin entry..."
                    if [ -f "$STANDALONE_BUILD/node_modules/@salesforce/storefront-next-dev/package.json" ]; then
                        grep -A2 '"bin"' "$STANDALONE_BUILD/node_modules/@salesforce/storefront-next-dev/package.json" || log_warning "  No bin entry found"
                    fi
                    log_info "  Listing .bin directory:"
                    ls -la "$STANDALONE_BUILD/node_modules/.bin/" | head -10 || log_warning "  .bin directory missing"
                else
                    log_error "  @salesforce/storefront-next-dev package not installed"
                    log_info "  Checking package.json dependencies..."
                    grep -A5 '"dependencies"' "$STANDALONE_BUILD/package.json" | head -20
                fi

                log_error "Project setup failed - cannot continue"
                log_warning "Container will stay running for investigation"
                sleep infinity
            fi

            # Create .env if needed
            if [ ! -f .env ] && [ -f .env.default ]; then
                cp .env.default .env
                log_success "  ✓ Created .env from .env.default"
            fi

            cd /workspace
        fi
    fi
fi

# Mark Phase 1 complete
echo "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" > "$STATE_DIR/phase1-complete"
log_success "Phase 1 complete: Monorepo built and standalone project ready"
fi  # End Phase 1 skip check

# ============================================================================
# Phase 2: MCP Migration Tools Server Setup
# ============================================================================

# Check if Phase 2 already complete
if [ -f "$STATE_DIR/phase2-complete" ] && \
   [ -f ~/.config/claude-code/mcp.json ]; then
    log_success "Phase 2 already complete (setup: $(cat "$STATE_DIR/phase2-complete"))"
    log_info "Skipping to Phase 3..."
else
    log_info "Running Phase 2: MCP Migration Tools Server Setup"

log_info "Setting up MCP Migration Tools Server..."

# Build MCP server
if [ -d "/workspace/mcp-server" ]; then
    # Check if already built (dist/ exists from host build via volume mount)
    if [ -f "/workspace/mcp-server/dist/migration-server.js" ]; then
        log_success "MCP server already built (found dist/migration-server.js)"
    else
        log_info "Building MCP server in container..."
        cd /workspace/mcp-server

        # Note: node_modules permissions are fixed by pre-entrypoint.sh
        # Note: node_modules is excluded from volume mount, so we need to install
        log_info "Installing MCP server dependencies..."
        if < /dev/null pnpm install; then
            log_success "Dependencies installed"
        else
            log_error "Failed to install dependencies"
            cd /workspace
            log_warning "Claude Code will run without intervention tool"
            # Skip build and continue
            return 0 2>/dev/null || exit 0
        fi

        # Build the server
        if < /dev/null pnpm build; then
            log_success "MCP server built successfully"
        else
            log_error "MCP server build failed"
            log_warning "Claude Code will run without intervention tool"
        fi

        cd /workspace
    fi
else
    log_warning "MCP server directory not found at /workspace/mcp-server"
    log_warning "Claude Code will run without intervention tool"
fi

# Configure Claude Code CLI to use MCP server
log_info "Configuring Claude Code with MCP server..."
mkdir -p ~/.config/claude-code

cat > ~/.config/claude-code/mcp.json <<'EOF'
{
  "mcpServers": {
    "migration-tools": {
      "command": "node",
      "args": ["/workspace/mcp-server/dist/migration-server.js"],
      "env": {
        "WORKSPACE_ROOT": "/workspace",
        "INTERVENTION_DIR": "/workspace/intervention"
      }
    }
  }
}
EOF

if [ -f ~/.config/claude-code/mcp.json ]; then
    log_success "Claude Code MCP configuration created"
    log_info "MCP server will provide migration tools to Claude:"
    log_info "  - RequestUserIntervention (interventions)"
    log_info "  - LogMigrationProgress (logging)"
    log_info "  - ValidateDevServer (Phase 2)"
    log_info "  - CaptureDualScreenshots (Phase 3)"
    log_info "  - CommitMigrationProgress (Phase 4)"
    log_info "  - GetNextMicroPlan (Phase 4)"
    log_info "  - ParseURLMapping (Phase 3)"
else
    log_error "Failed to create MCP configuration"
fi

# ============================================================================
# End Phase 2 Setup
# ============================================================================

# Mark Phase 2 complete
echo "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" > "$STATE_DIR/phase2-complete"
log_success "Phase 2 complete: MCP server configured"
fi  # End Phase 2 skip check

log_success "Container initialization complete"
log_info "Chromium available: $(command -v chromium-browser &>/dev/null && echo 'Yes' || echo 'No')"

# ============================================================================
# Phase 3: Execute Migration
# ============================================================================

# Configuration from environment
MIGRATION_PLAN="${MIGRATION_PLAN:-/workspace/migration-main-plan.md}"
AUTO_START="${AUTO_START:-true}"

if [ "$AUTO_START" != "true" ]; then
    log_info "AUTO_START disabled, keeping container running for manual execution"
    log_info "To run manually: docker exec -it -u node $HOSTNAME bash"
    tail -f /dev/null
    exit 0
fi

# Check for existing Claude session to resume
if [ -f "/workspace/.claude-session-id" ]; then
    SESSION_ID=$(cat /workspace/.claude-session-id | tr -d '\r\n')

    if [ -n "$SESSION_ID" ]; then
        log_info "Found existing Claude session: $SESSION_ID"

        # Check if there are pending interventions without responses
        pending_interventions=0
        if [ -d "$INTERVENTION_DIR" ]; then
            for needed_file in "$INTERVENTION_DIR"/needed-*.json; do
                [ -f "$needed_file" ] || continue
                worker_id=$(basename "$needed_file" .json | sed 's/needed-//')
                response_file="$INTERVENTION_DIR/response-$worker_id.json"

                if [ ! -f "$response_file" ]; then
                    pending_interventions=$((pending_interventions + 1))
                    log_warning "Pending intervention detected: $worker_id"
                fi
            done
        fi

        if [ $pending_interventions -gt 0 ]; then
            log_error "Cannot resume: $pending_interventions pending intervention(s) require response"
            log_info "Please respond via dashboard: http://localhost:3030"
            log_info "Then restart container: docker compose up"
            exit_or_keepalive 42 "Pending interventions block container startup"
        fi

        log_info "No pending interventions, attempting to resume session..."
        cd /workspace

        # Resume existing session (output to log file only)
        claude -r "$SESSION_ID" > /workspace/claude-output.log 2>&1
        CLAUDE_EXIT_CODE=$?
        log_info "Claude Code exited with code $CLAUDE_EXIT_CODE"

        # Check if resume failed (e.g., session not found, invalid, or stale)
        if [ $CLAUDE_EXIT_CODE -ne 0 ]; then
            if grep -q "Session not found\|No such session\|Invalid session\|session.*expired\|not.*found" /workspace/claude-output.log 2>/dev/null; then
                log_warning "Session not found or invalid, removing stale session file"
                rm -f /workspace/.claude-session-id
                log_info "Starting new session instead"
                SESSION_ID=""
            else
                log_error "Claude Code failed to resume (exit code: $CLAUDE_EXIT_CODE)"
                log_info "Check /workspace/claude-output.log for details"
                log_info "Session may be corrupted. Remove .claude-session-id to start fresh."
                exit_or_keepalive $CLAUDE_EXIT_CODE "Claude Code resume failed"
            fi
        fi
    else
        log_warning "Session ID file exists but is empty, starting new session"
        SESSION_ID=""
    fi
else
    SESSION_ID=""
fi

# No existing session - start new one
if [ -z "$SESSION_ID" ]; then
    # Check if plan file exists
    if [ ! -f "$MIGRATION_PLAN" ]; then
        log_error "Migration plan not found: $MIGRATION_PLAN"
        log_info "Container will stay running - attach with: docker compose exec claude-migration bash"
        tail -f /dev/null
        exit 0
    fi

    # Generate session ID (UUID v4 using /dev/urandom)
    SESSION_ID=$(cat /proc/sys/kernel/random/uuid 2>/dev/null || \
                 printf "%s-%s-%s-%s-%s\n" \
                    $(head -c 4 /dev/urandom | xxd -p) \
                    $(head -c 2 /dev/urandom | xxd -p) \
                    $(head -c 2 /dev/urandom | xxd -p) \
                    $(head -c 2 /dev/urandom | xxd -p) \
                    $(head -c 6 /dev/urandom | xxd -p))

    echo "$SESSION_ID" > /workspace/.claude-session-id
    log_info "Starting new Claude Code session: $SESSION_ID"
    log_info "Migration plan: $MIGRATION_PLAN"
    cd /workspace

    # Execute Claude Code directly (not in background)
    # Output written to log file only (not streamed to stdout)
    # Use 'docker exec cat /workspace/claude-output.log' or dashboard to monitor
    claude code run \
        --session-id "$SESSION_ID" \
        --dangerously-skip-permissions \
        < "$MIGRATION_PLAN" > /workspace/claude-output.log 2>&1

    CLAUDE_EXIT_CODE=$?
    log_info "Claude Code exited with code $CLAUDE_EXIT_CODE"
fi

# ============================================================================
# Phase 4: Exit Handling
# ============================================================================

check_exit_reason() {
    log_info "Checking exit reason..."

    # Check for pending interventions
    local pending_count=0

    if [ -d "$INTERVENTION_DIR" ]; then
        for needed_file in "$INTERVENTION_DIR"/needed-*.json; do
            [ -f "$needed_file" ] || continue

            local worker_id=$(basename "$needed_file" .json | sed 's/needed-//')
            local response_file="$INTERVENTION_DIR/response-$worker_id.json"

            if [ ! -f "$response_file" ]; then
                pending_count=$((pending_count + 1))

                local question=$(jq -r '.question' "$needed_file" 2>/dev/null || echo "Unknown")
                log_info "Pending intervention: $worker_id"
                log_info "  Question: $question"
            fi
        done
    fi

    if [ $pending_count -gt 0 ]; then
        log_warning "Claude paused with $pending_count pending intervention(s)"
        log_info "Next steps:"
        log_info "  1. Open dashboard: http://localhost:3030"
        log_info "  2. Go to 'Interventions' tab"
        log_info "  3. Submit your responses"
        log_info "  4. Resume: cd docker && docker compose up"
        log_info ""
        log_info "The container will automatically resume session: $SESSION_ID"

        # Exit with special code to indicate intervention needed
        exit_or_keepalive 42 "Intervention required - check dashboard"
    fi

    # Show summary
    log_info "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    log_info "Migration Summary"
    log_info "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

    # Count artifacts
    local completed_plans=0
    if [ -f "$LOG_FILE" ]; then
        completed_plans=$(grep -c "Status.*✅ Success" "$LOG_FILE" 2>/dev/null || echo "0")
    fi

    local screenshot_count=0
    if [ -d "/workspace/screenshots" ]; then
        screenshot_count=$(find /workspace/screenshots -name "*.png" -type f 2>/dev/null | wc -l | tr -d ' ')
    fi

    log_info "Completed micro-plans: $completed_plans"
    log_info "Screenshots captured: $screenshot_count"
    log_info "Session ID: $SESSION_ID"
    log_info ""
    log_info "View migration log: /workspace/migration-log.md"
    log_info "View dashboard: http://localhost:3030"

    if [ $CLAUDE_EXIT_CODE -eq 0 ]; then
        log_success "Migration completed successfully!"
        exit_or_keepalive 0 "Migration complete"
    else
        log_error "Migration exited with error code $CLAUDE_EXIT_CODE"
        log_info "Check logs above for details"
        exit_or_keepalive $CLAUDE_EXIT_CODE "Migration failed with exit code $CLAUDE_EXIT_CODE"
    fi
}

check_exit_reason
