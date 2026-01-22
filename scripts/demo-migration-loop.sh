#!/usr/bin/env bash
# demo-migration-loop.sh - Automated demonstration of micro-iteration migration loop
#
# This script:
# 1. Starts Docker container with Claude Code + Playwright
# 2. Launches migration loop with migration-main-plan.md
# 3. Monitors progress (logs, screenshots, interventions) in real-time
# 4. Handles intervention requests interactively
# 5. Shows completion summary with statistics

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
MAGENTA='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKSPACE_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DOCKER_IMAGE="claude-migration:latest"
CONTAINER_NAME="claude-migration-demo"
MIGRATION_LOG="$WORKSPACE_ROOT/migration-log.md"
INTERVENTION_DIR="$WORKSPACE_ROOT/intervention"
SCREENSHOTS_DIR="$WORKSPACE_ROOT/screenshots"

# State tracking
LOOP_PID=""
MONITOR_PID=""
START_TIME=$(date +%s)

# Logging functions
log_header() {
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${CYAN}$1${NC}"
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

log_info() {
    echo -e "${BLUE}[INFO]${NC} $(date +'%H:%M:%S') - $1"
}

log_success() {
    echo -e "${GREEN}[✓]${NC} $(date +'%H:%M:%S') - $1"
}

log_warning() {
    echo -e "${YELLOW}[!]${NC} $(date +'%H:%M:%S') - $1"
}

log_error() {
    echo -e "${RED}[✗]${NC} $(date +'%H:%M:%S') - $1"
}

log_intervention() {
    echo -e "${MAGENTA}[?]${NC} $(date +'%H:%M:%S') - $1"
}

# Cleanup function
cleanup() {
    log_info "Cleaning up..."

    # Kill monitoring processes
    if [ -n "$MONITOR_PID" ] && kill -0 "$MONITOR_PID" 2>/dev/null; then
        kill "$MONITOR_PID" 2>/dev/null || true
    fi

    # Stop Docker container
    if docker ps -q -f name="$CONTAINER_NAME" | grep -q .; then
        log_info "Stopping container: $CONTAINER_NAME"
        docker stop "$CONTAINER_NAME" >/dev/null 2>&1 || true
        docker rm "$CONTAINER_NAME" >/dev/null 2>&1 || true
    fi

    # Show summary
    show_summary
}

trap cleanup EXIT INT TERM

# Summary function
show_summary() {
    local end_time=$(date +%s)
    local duration=$((end_time - START_TIME))
    local minutes=$((duration / 60))
    local seconds=$((duration % 60))

    log_header "Migration Loop Summary"

    # Count completed micro-plans
    local completed_count=0
    if [ -f "$MIGRATION_LOG" ]; then
        completed_count=$(grep -c "Status.*✅ Success" "$MIGRATION_LOG" 2>/dev/null || echo "0")
    fi

    # Count screenshots
    local screenshot_count=0
    if [ -d "$SCREENSHOTS_DIR" ]; then
        screenshot_count=$(find "$SCREENSHOTS_DIR" -name "*.png" -type f | wc -l | tr -d ' ')
    fi

    # Count interventions
    local intervention_count=0
    if [ -d "$INTERVENTION_DIR" ]; then
        intervention_count=$(find "$INTERVENTION_DIR" -name "needed-*.json" -type f | wc -l | tr -d ' ')
    fi

    echo ""
    echo -e "${GREEN}Completed Micro-Plans:${NC} $completed_count"
    echo -e "${BLUE}Screenshots Captured:${NC} $screenshot_count"
    echo -e "${MAGENTA}Interventions Requested:${NC} $intervention_count"
    echo -e "${CYAN}Total Duration:${NC} ${minutes}m ${seconds}s"
    echo ""

    if [ -f "$MIGRATION_LOG" ]; then
        log_info "View migration log: $MIGRATION_LOG"
    fi

    if [ -d "$SCREENSHOTS_DIR" ] && [ "$screenshot_count" -gt 0 ]; then
        log_info "View screenshots: $SCREENSHOTS_DIR/"
    fi

    echo ""
}

# Validate workspace and file:// dependencies in monorepo template
validate_file_dependencies() {
    local TEMPLATE_PKG="$MONOREPO_PATH/packages/template-retail-rsc-app/package.json"

    if [ ! -f "$TEMPLATE_PKG" ]; then
        log_error "Template package.json not found at: $TEMPLATE_PKG"
        exit 1
    fi

    log_info "Validating workspace and file:// dependencies..."

    # Extract all workspace:* and file:// dependencies
    local WORKSPACE_DEPS=$(node -e "
        const pkg = require('$TEMPLATE_PKG');
        const deps = {...pkg.dependencies, ...pkg.devDependencies};
        for (const [name, version] of Object.entries(deps)) {
            if (version.startsWith('workspace:') || version.startsWith('file:')) {
                console.log(name + '|' + version);
            }
        }
    " 2>/dev/null)

    if [ -z "$WORKSPACE_DEPS" ]; then
        log_warning "No workspace or file:// dependencies found in template"
        return
    fi

    local all_valid=true
    local dep_count=0

    echo "$WORKSPACE_DEPS" | while IFS='|' read -r name version; do
        dep_count=$((dep_count + 1))

        # For workspace:* deps, look in monorepo packages/
        # For file:// deps, resolve the path
        local PKG_PATH=""

        if [[ "$version" = workspace:* ]]; then
            # Try to find package in monorepo
            # Common pattern: @salesforce/storefront-next-dev → storefront-next-dev
            local pkg_name="${name##*/}"  # Get last part after /
            PKG_PATH="$MONOREPO_PATH/packages/$pkg_name"
        elif [[ "$version" = file:* ]]; then
            local path="${version#file:}"
            local TEMPLATE_DIR="$MONOREPO_PATH/packages/template-retail-rsc-app"

            if [[ "$path" = /* ]]; then
                PKG_PATH="$path"
            else
                PKG_PATH=$(cd "$TEMPLATE_DIR" 2>/dev/null && cd "$path" 2>/dev/null && pwd || echo "NOT_FOUND")
            fi
        fi

        # Check if package directory and package.json exist
        if [ -d "$PKG_PATH" ] && [ -f "$PKG_PATH/package.json" ]; then
            log_success "  ✓ $name ($version) → $PKG_PATH"
        else
            log_error "  ✗ $name ($version) → $PKG_PATH (NOT FOUND)"
            all_valid=false
        fi
    done

    if [ "$all_valid" = false ]; then
        log_error "Some workspace/file dependencies are missing"
        exit 1
    fi

    log_success "All dependencies validated"
}

# Check prerequisites
check_prerequisites() {
    log_header "Checking Prerequisites"

    # Check Docker
    if ! command -v docker &> /dev/null; then
        log_error "Docker not found. Please install Docker."
        exit 1
    fi
    log_success "Docker installed"

    # Check .env file
    if [ ! -f "$WORKSPACE_ROOT/.env" ]; then
        log_error ".env file not found at $WORKSPACE_ROOT/.env"
        log_info "Please create .env with ANTHROPIC_API_KEY or ANTHROPIC_AUTH_TOKEN"
        exit 1
    fi
    log_success ".env file exists"

    # Check migration plan
    if [ ! -f "$WORKSPACE_ROOT/migration-main-plan.md" ]; then
        log_error "migration-main-plan.md not found"
        exit 1
    fi
    log_success "Migration plan found"

    # Check micro-plans
    if [ ! -d "$WORKSPACE_ROOT/sub-plans/01-homepage-content" ]; then
        log_error "Micro-plans not found at sub-plans/01-homepage-content/"
        exit 1
    fi
    local subplan_count=$(find "$WORKSPACE_ROOT/sub-plans/01-homepage-content" -name "*.md" -type f | wc -l | tr -d ' ')
    log_success "Found $subplan_count micro-plans"

    # Check Docker image
    if ! docker image inspect "$DOCKER_IMAGE" &>/dev/null; then
        log_warning "Docker image '$DOCKER_IMAGE' not found"
        log_info "Building Docker image..."
        cd "$WORKSPACE_ROOT"
        docker build -f docker/Dockerfile -t "$DOCKER_IMAGE" . || {
            log_error "Failed to build Docker image"
            exit 1
        }
        log_success "Docker image built"
    else
        log_success "Docker image exists"
    fi

    # Check storefront-next monorepo (for standalone generation)
    MONOREPO_PATH="${STOREFRONT_MONOREPO_PATH:-$HOME/dev/SFCC-Odyssey}"

    if [ -d "$MONOREPO_PATH" ] && [ -d "$MONOREPO_PATH/packages/storefront-next-dev" ]; then
        log_success "Found storefront monorepo at: $MONOREPO_PATH"

        # Validate file:// dependencies exist in monorepo
        validate_file_dependencies

        # Check if standalone project already exists
        if [ -d "$WORKSPACE_ROOT/storefront-next/node_modules" ] && \
           [ -f "$WORKSPACE_ROOT/storefront-next/node_modules/.bin/sfnext" ]; then
            log_success "Standalone storefront project already exists"

            # Verify it has correct architecture (Linux binaries)
            if docker ps -q -f name="$CONTAINER_NAME" | grep -q .; then
                log_info "Verifying native module architecture..."
                local rollup_check=$(docker exec -u node "$CONTAINER_NAME" sh -c \
                    "file /workspace/storefront-next/node_modules/@rollup/rollup-linux-arm64-musl/rollup.linux-arm64-musl.node 2>/dev/null || echo 'NOT_FOUND'" || echo "ERROR")

                if echo "$rollup_check" | grep -q "ELF.*aarch64"; then
                    log_success "Native modules have correct architecture (Linux ARM64)"
                else
                    log_warning "Native modules may have wrong architecture"
                    log_info "Will rebuild in container to ensure correct binaries..."
                    rm -rf "$WORKSPACE_ROOT/storefront-next"
                fi
            fi
        fi

        # Generate standalone project if needed
        if [ ! -d "$WORKSPACE_ROOT/storefront-next/node_modules" ]; then
            log_warning "Standalone project not found"
            log_info "Building monorepo and generating standalone project in container..."
            log_info "(This ensures Linux ARM64 native modules for Docker)"
            echo ""

            # Note: Container must be running for in-container build
            # This will be called after start_container() if needed
            echo ""
        fi
    else
        log_error "Storefront monorepo not found at: $MONOREPO_PATH"
        log_info "Expected location: ~/dev/SFCC-Odyssey"
        log_info "Set STOREFRONT_MONOREPO_PATH env var if in different location"
        exit 1
    fi

    echo ""
}

# Start Docker container
start_container() {
    log_header "Starting Docker Container"

    # Remove existing container if present
    if docker ps -a -q -f name="$CONTAINER_NAME" | grep -q .; then
        log_info "Removing existing container"
        docker rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true
    fi

    # Ensure directories exist
    mkdir -p "$SCREENSHOTS_DIR" "$INTERVENTION_DIR/history"
    chmod 777 "$SCREENSHOTS_DIR" 2>/dev/null || true

    log_info "Starting container: $CONTAINER_NAME"

    # Start container
    # - Mounts workspace directory (includes pre-generated storefront-next/)
    # - Uses network host for VPN access to internal endpoints
    # - Standalone project already generated on host with dependencies
    docker run -d \
        --name "$CONTAINER_NAME" \
        --env-file "$WORKSPACE_ROOT/.env" \
        --network host \
        -v "$WORKSPACE_ROOT:/workspace" \
        -w /workspace \
        "$DOCKER_IMAGE" \
        tail -f /dev/null >/dev/null

    log_success "Container started"

    # Wait for container to be ready
    log_info "Waiting for container initialization..."
    sleep 5

    # Verify container is running
    if ! docker ps -q -f name="$CONTAINER_NAME" | grep -q .; then
        log_error "Container failed to start"
        docker logs "$CONTAINER_NAME" 2>&1 | tail -20
        exit 1
    fi

    log_success "Container ready"
    echo ""

    # Generate standalone project if needed (must happen after container starts)
    if [ ! -d "$WORKSPACE_ROOT/storefront-next/node_modules" ]; then
        log_info "Generating standalone project with in-container build..."
        echo ""

        # Step 1: Build monorepo inside container (Linux binaries)
        if [ -x "$SCRIPT_DIR/build-in-container.sh" ]; then
            "$SCRIPT_DIR/build-in-container.sh" "$CONTAINER_NAME" || {
                log_error "Failed to build monorepo in container"
                exit 1
            }
        else
            log_error "build-in-container.sh not found or not executable"
            exit 1
        fi

        echo ""

        # Step 2: Generate standalone from container-built packages
        if [ -x "$SCRIPT_DIR/generate-standalone-in-container.sh" ]; then
            "$SCRIPT_DIR/generate-standalone-in-container.sh" "$CONTAINER_NAME" || {
                log_error "Failed to generate standalone project in container"
                exit 1
            }
        else
            log_error "generate-standalone-in-container.sh not found or not executable"
            exit 1
        fi

        log_success "Standalone project generated with Linux ARM64 binaries"
        echo ""
    fi
}

# Launch migration loop
launch_migration_loop() {
    log_header "Launching Migration Loop"

    log_info "Starting Claude Code with migration-main-plan.md"
    log_info "Claude will read the plan and begin executing micro-plans..."
    echo ""

    # Launch Claude Code in background
    docker exec -u node "$CONTAINER_NAME" bash -c \
        "cd /workspace && claude code run --dangerously-skip-permissions < migration-main-plan.md 2>&1 | tee /workspace/claude-output.log" &

    LOOP_PID=$!

    sleep 3

    # Verify Claude Code is running
    if ! docker exec -u node "$CONTAINER_NAME" pgrep -f "claude" >/dev/null 2>&1; then
        log_error "Claude Code failed to start"
        docker exec -u node "$CONTAINER_NAME" cat /tmp/migration-loop.log 2>/dev/null || true
        exit 1
    fi

    log_success "Migration loop started (PID: $LOOP_PID)"
    echo ""
}

# Monitor migration log
monitor_migration_log() {
    log_header "Monitoring Migration Progress"
    echo ""

    local last_line_count=0
    local last_screenshot_count=0

    while true; do
        # Check if migration log exists
        if [ ! -f "$MIGRATION_LOG" ]; then
            sleep 2
            continue
        fi

        # Check for new log entries
        local current_line_count=$(wc -l < "$MIGRATION_LOG" 2>/dev/null || echo "0")
        if [ "$current_line_count" -gt "$last_line_count" ]; then
            # Show new lines
            local new_lines=$((current_line_count - last_line_count))
            tail -n "$new_lines" "$MIGRATION_LOG" | while IFS= read -r line; do
                # Colorize status lines
                if echo "$line" | grep -q "✅ Success"; then
                    echo -e "${GREEN}$line${NC}"
                elif echo "$line" | grep -q "⏸️ Awaiting"; then
                    echo -e "${YELLOW}$line${NC}"
                elif echo "$line" | grep -q "❌"; then
                    echo -e "${RED}$line${NC}"
                elif echo "$line" | grep -q "^##"; then
                    echo -e "${CYAN}$line${NC}"
                else
                    echo "$line"
                fi
            done
            last_line_count="$current_line_count"
        fi

        # Check for new screenshots
        local current_screenshot_count=$(find "$SCREENSHOTS_DIR" -name "*.png" -type f 2>/dev/null | wc -l | tr -d ' ')
        if [ "$current_screenshot_count" -gt "$last_screenshot_count" ]; then
            local new_screenshots=$((current_screenshot_count - last_screenshot_count))
            log_success "Captured $new_screenshots new screenshot(s)"
            # List new screenshots
            find "$SCREENSHOTS_DIR" -name "*.png" -type f -mmin -1 2>/dev/null | while read -r screenshot; do
                local filename=$(basename "$screenshot")
                local filesize=$(du -h "$screenshot" | cut -f1)
                log_info "  → $filename ($filesize)"
            done
            last_screenshot_count="$current_screenshot_count"
        fi

        # Check for interventions
        check_interventions

        # Check if Claude Code is still running
        if ! docker exec -u node "$CONTAINER_NAME" pgrep -f "claude" >/dev/null 2>&1; then
            log_info "Migration loop has completed or stopped"
            break
        fi

        sleep 3
    done
}

# Check for intervention requests
check_interventions() {
    # Find intervention files
    local needed_files=$(find "$INTERVENTION_DIR" -maxdepth 1 -name "needed-*.json" -type f 2>/dev/null)

    if [ -z "$needed_files" ]; then
        return
    fi

    for needed_file in $needed_files; do
        local worker_id=$(basename "$needed_file" .json | sed 's/needed-//')
        local response_file="$INTERVENTION_DIR/response-$worker_id.json"

        # Skip if response already exists
        if [ -f "$response_file" ]; then
            continue
        fi

        echo ""
        log_intervention "INTERVENTION REQUIRED"
        echo -e "${MAGENTA}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

        # Parse intervention request
        local question=$(jq -r '.question' "$needed_file" 2>/dev/null || echo "Unknown question")
        echo -e "${YELLOW}Question:${NC} $question"
        echo ""

        # Show options
        local options_count=$(jq -r '.options | length' "$needed_file" 2>/dev/null || echo "0")
        echo -e "${CYAN}Options:${NC}"

        for i in $(seq 0 $((options_count - 1))); do
            local option_id=$(jq -r ".options[$i].id // .options[$i]" "$needed_file" 2>/dev/null)
            local option_label=$(jq -r ".options[$i].label // .options[$i]" "$needed_file" 2>/dev/null)
            local option_desc=$(jq -r ".options[$i].description // \"\"" "$needed_file" 2>/dev/null)

            echo -e "  ${GREEN}[$((i+1))]${NC} $option_label"
            if [ -n "$option_desc" ] && [ "$option_desc" != "null" ]; then
                echo -e "      ${CYAN}$option_desc${NC}"
            fi
        done

        echo ""
        echo -e "${MAGENTA}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

        # Prompt for response
        read -p "$(echo -e ${YELLOW}Select option [1-$options_count]:${NC} )" choice

        # Validate choice
        if ! [[ "$choice" =~ ^[0-9]+$ ]] || [ "$choice" -lt 1 ] || [ "$choice" -gt "$options_count" ]; then
            log_error "Invalid choice. Skipping intervention."
            continue
        fi

        # Get selected option
        local selected_index=$((choice - 1))
        local selected_option=$(jq -r ".options[$selected_index].id // .options[$selected_index]" "$needed_file" 2>/dev/null)

        # Create response file
        cat > "$response_file" <<EOF
{
  "worker_id": "$worker_id",
  "timestamp": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "selected_option": "$selected_option",
  "response": "$selected_option"
}
EOF

        log_success "Response saved: $response_file"
        log_info "Claude will resume execution..."
        echo ""
    done
}

# Main execution
main() {
    log_header "Migration Loop Demo - Automated Execution"
    echo ""
    echo "This script will:"
    echo "  1. Start Docker container with Claude Code + Playwright"
    echo "  2. Launch migration loop with migration-main-plan.md"
    echo "  3. Monitor progress and handle interventions"
    echo "  4. Show summary when complete"
    echo ""
    read -p "Press Enter to continue, or Ctrl+C to cancel..."
    echo ""

    # Execute steps
    check_prerequisites
    start_container
    launch_migration_loop

    # Monitor until completion
    monitor_migration_log

    log_success "Migration loop demo completed!"
}

# Run main
main
