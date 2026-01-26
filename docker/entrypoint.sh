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
# Phase 2: MCP Migration Tools Server Setup
# ============================================================================

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

# ============================================================================
# Container Ready
# ============================================================================

log_success "Container initialization complete"
log_info "Ready for Claude Code execution via demo-migration-loop.sh"
log_info "Chromium available: $(command -v chromium-browser &>/dev/null && echo 'Yes' || echo 'No')"

# Keep container running (demo script will exec commands as needed)
tail -f /dev/null
