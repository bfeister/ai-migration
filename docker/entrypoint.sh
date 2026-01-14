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
