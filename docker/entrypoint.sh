#!/bin/bash
set -euo pipefail

# entrypoint.sh - Migration worker entrypoint
# This script runs Claude Code and monitors for intervention requests

# Configuration
INTERVENTION_DIR="/workspace/intervention"
LOG_FILE="/workspace/migration-log.md"
PLAN_FILE="${PLAN_FILE:-/workspace/migration-plan.md}"

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

# Initialize log file
echo "# Migration Log - $(date -u +"%Y-%m-%dT%H:%M:%SZ")" > "$LOG_FILE"
echo "" >> "$LOG_FILE"

log_info "Migration worker starting..."
log_info "Intervention directory: $INTERVENTION_DIR"
log_info "Plan file: $PLAN_FILE"

# Ensure intervention directories exist
mkdir -p "$INTERVENTION_DIR/history"

# Check for API key (warning only for Phase 0 - container stays running)
if [ -z "${ANTHROPIC_API_KEY:-}" ]; then
    log_warning "ANTHROPIC_API_KEY not set - Claude Code execution will fail without it"
    log_warning "Set it in .env file and restart: docker restart claude-migration"
else
    log_success "ANTHROPIC_API_KEY is set"
fi

log_success "Environment validated - container ready"

# ============================================================================
# Phase 2: MCP Intervention Server Setup
# ============================================================================

log_info "Setting up MCP Intervention Server..."

# Build MCP server
if [ -d "/workspace/mcp-server" ]; then
    # Check if already built (dist/ exists from host build via volume mount)
    if [ -f "/workspace/mcp-server/dist/intervention-server.js" ]; then
        log_success "MCP server already built (found dist/intervention-server.js)"
    else
        log_info "Building MCP server in container..."
        cd /workspace/mcp-server

        # Note: node_modules permissions are fixed by pre-entrypoint.sh
        # Note: node_modules is excluded from volume mount, so we need to install
        log_info "Installing MCP server dependencies..."
        if pnpm install; then
            log_success "Dependencies installed"
        else
            log_error "Failed to install dependencies"
            cd /workspace
            log_warning "Claude Code will run without intervention tool"
            # Skip build and continue
            return 0 2>/dev/null || exit 0
        fi

        # Build the server
        if pnpm build; then
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
EOF

if [ -f ~/.config/claude-code/mcp.json ]; then
    log_success "Claude Code MCP configuration created"
    log_info "MCP server will provide AskUserQuestion tool to Claude"
else
    log_error "Failed to create MCP configuration"
fi

# ============================================================================
# End Phase 2 Setup
# ============================================================================

# ============================================================================
# Phase 3: Playwright Setup
# ============================================================================

log_info "Setting up Playwright dependencies..."

# Check storefront-next dependencies
if [ -d "/workspace/storefront-next" ]; then
    cd /workspace/storefront-next

    # Check if dependencies are already installed (from host)
    if [ -d "node_modules" ] && [ -f "node_modules/.modules.yaml" ]; then
        log_success "Storefront Next dependencies already installed (from host)"
    else
        log_warning "Storefront Next dependencies not found"
        log_info "Installing dependencies in container (may hit file limits)..."

        # Note: node_modules permissions are fixed by pre-entrypoint.sh
        # Attempt install, but don't fail if it hits ENFILE error
        if pnpm install --frozen-lockfile 2>&1; then
            log_success "Storefront Next dependencies installed"
        else
            log_error "Failed to install storefront-next dependencies"
            log_warning "Recommendation: Run './scripts/setup-storefront-dependencies.sh' on host"
            log_warning "Screenshot capture may not work properly"
        fi
    fi

    # Configure .env for template-retail-rsc-app if needed
    APP_DIR="/workspace/storefront-next/packages/template-retail-rsc-app"
    if [ -d "$APP_DIR" ]; then
        if [ ! -f "$APP_DIR/.env" ] && [ -f "$APP_DIR/.env.default" ]; then
            log_info "Creating .env from .env.default for template-retail-rsc-app..."
            cp "$APP_DIR/.env.default" "$APP_DIR/.env"
            log_success "Created .env file for dev server"
        elif [ -f "$APP_DIR/.env" ]; then
            log_success ".env file already exists for template-retail-rsc-app"
        else
            log_warning "No .env or .env.default found in template-retail-rsc-app"
        fi
    fi

    cd /workspace
else
    log_warning "storefront-next directory not found"
    log_warning "Screenshot capture will not be available"
fi

# Verify Playwright is available
if command -v chromium-browser > /dev/null; then
    log_success "Chromium browser available at: $(which chromium-browser)"
else
    log_warning "Chromium browser not found - screenshots may fail"
fi

# ============================================================================
# End Phase 3 Setup
# ============================================================================

# Background process to monitor interventions
monitor_interventions() {
    log_info "Starting intervention monitor..."

    while true; do
        if [ -f "$INTERVENTION_DIR/needed.json" ]; then
            log_warning "Intervention needed - waiting for response..."

            # Wait for response.json to appear
            while [ ! -f "$INTERVENTION_DIR/response.json" ]; do
                sleep 2
            done

            log_success "Intervention response received"

            # Archive the intervention (using nanosecond precision for multi-worker support)
            TIMESTAMP=$(date -u +"%Y-%m-%dT%H-%M-%S-%N")
            mv "$INTERVENTION_DIR/needed.json" "$INTERVENTION_DIR/history/${TIMESTAMP}-needed.json"
            mv "$INTERVENTION_DIR/response.json" "$INTERVENTION_DIR/history/${TIMESTAMP}-response.json"

            log_info "Intervention archived to history/"
        fi

        sleep 2
    done
}

# Start intervention monitor in background
monitor_interventions &
MONITOR_PID=$!

log_info "Intervention monitor running (PID: $MONITOR_PID)"

# Main execution
if [ ! -f "$PLAN_FILE" ]; then
    log_warning "Plan file not found: $PLAN_FILE"
    log_info "Container will remain running for manual interaction"
    log_info "Place your migration plan at: $PLAN_FILE"
    log_info "Then run: claude code run --dangerously-skip-permissions < $PLAN_FILE"
else
    log_info "Found plan file, starting Claude Code execution..."

    # Run Claude Code with the plan
    # Note: This is a placeholder - actual execution will be refined in Phase 2
    log_info "Running: claude code run --dangerously-skip-permissions < $PLAN_FILE"

    if claude code run --dangerously-skip-permissions < "$PLAN_FILE"; then
        log_success "Claude Code execution completed successfully"
    else
        log_error "Claude Code execution failed with exit code: $?"
    fi
fi

# Keep container running for debugging/manual intervention
log_info "Container will remain running. Use 'docker exec' to interact."
log_info "To view logs: tail -f $LOG_FILE"
log_info "To check intervention status: cat $INTERVENTION_DIR/needed.json"

# Wait indefinitely (container stays alive)
tail -f /dev/null
