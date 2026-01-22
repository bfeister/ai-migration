#!/usr/bin/env bash
# reset-migration-state.sh - Clean up migration state for fresh testing
#
# This script resets the migration loop to a clean state by:
# - Stopping and removing Docker containers
# - Cleaning intervention files
# - Optionally resetting migration log
# - Optionally cleaning screenshots
# - Optionally resetting git commits

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKSPACE_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
MIGRATION_LOG="$WORKSPACE_ROOT/migration-log.md"
INTERVENTION_DIR="$WORKSPACE_ROOT/intervention"
SCREENSHOTS_DIR="$WORKSPACE_ROOT/screenshots"

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[✓]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[!]${NC} $1"
}

log_error() {
    echo -e "${RED}[✗]${NC} $1"
}

# Parse command-line options
CLEAN_LOG=false
CLEAN_SCREENSHOTS=false
RESET_GIT=false
FULL_RESET=false

print_usage() {
    cat <<EOF
Usage: $0 [OPTIONS]

Reset migration loop state for fresh testing.

OPTIONS:
    --log               Reset migration-log.md to initial state
    --screenshots       Delete all captured screenshots
    --git               Reset git commits in storefront-next (careful!)
    --full              Full reset (all of the above)
    --help              Show this help message

EXAMPLES:
    $0                  # Just stop containers and clean interventions
    $0 --log            # Also reset migration log
    $0 --full           # Complete reset (nuclear option)
EOF
}

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --log)
            CLEAN_LOG=true
            shift
            ;;
        --screenshots)
            CLEAN_SCREENSHOTS=true
            shift
            ;;
        --git)
            RESET_GIT=true
            shift
            ;;
        --full)
            FULL_RESET=true
            CLEAN_LOG=true
            CLEAN_SCREENSHOTS=true
            RESET_GIT=true
            shift
            ;;
        --help)
            print_usage
            exit 0
            ;;
        *)
            log_error "Unknown option: $1"
            print_usage
            exit 1
            ;;
    esac
done

echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}Migration State Reset${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Confirm if full reset
if [ "$FULL_RESET" = true ]; then
    log_warning "FULL RESET will delete migration log, screenshots, and git commits!"
    read -p "$(echo -e ${RED}Are you sure? [y/N]:${NC} )" -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        log_info "Cancelled"
        exit 0
    fi
    echo ""
fi

# Step 1: Stop and remove Docker containers
log_info "Stopping Docker containers..."

CONTAINERS=$(docker ps -a --filter "name=claude-migration" --format "{{.Names}}" 2>/dev/null || true)

if [ -z "$CONTAINERS" ]; then
    log_success "No migration containers found"
else
    for container in $CONTAINERS; do
        log_info "  → Stopping $container"
        docker stop "$container" >/dev/null 2>&1 || true
        docker rm "$container" >/dev/null 2>&1 || true
    done
    log_success "Containers stopped and removed"
fi

# Step 2: Clean intervention files
log_info "Cleaning intervention files..."

if [ -d "$INTERVENTION_DIR" ]; then
    # Remove needed-*.json files (active requests)
    if ls "$INTERVENTION_DIR"/needed-*.json >/dev/null 2>&1; then
        rm -f "$INTERVENTION_DIR"/needed-*.json
        log_success "  → Removed intervention requests"
    fi

    # Remove response-*.json files (except the documented ones)
    if ls "$INTERVENTION_DIR"/response-*.json >/dev/null 2>&1; then
        # Keep response-micro-iteration-worker.json as documentation
        find "$INTERVENTION_DIR" -name "response-*.json" ! -name "response-micro-iteration-worker.json" -delete 2>/dev/null || true
        log_success "  → Removed intervention responses"
    fi

    # Archive history if it exists
    if [ -d "$INTERVENTION_DIR/history" ] && [ "$(ls -A "$INTERVENTION_DIR/history" 2>/dev/null)" ]; then
        ARCHIVE_COUNT=$(find "$INTERVENTION_DIR/history" -type f | wc -l | tr -d ' ')
        log_info "  → History contains $ARCHIVE_COUNT archived interventions (kept)"
    fi

    log_success "Intervention files cleaned"
else
    log_success "Intervention directory doesn't exist (skipped)"
fi

# Step 3: Reset migration log (optional)
if [ "$CLEAN_LOG" = true ]; then
    log_info "Resetting migration log..."

    if [ -f "$MIGRATION_LOG" ]; then
        # Backup existing log
        BACKUP_NAME="migration-log-backup-$(date +%Y%m%d-%H%M%S).md"
        cp "$MIGRATION_LOG" "$WORKSPACE_ROOT/$BACKUP_NAME"
        log_info "  → Backed up to $BACKUP_NAME"
    fi

    # Create fresh log
    cat > "$MIGRATION_LOG" <<EOF
# Migration Progress Log

**Started:** $(date -u +"%Y-%m-%d %H:%M:%S")
**Status:** 🔄 In Progress
**Completed Micro-Plans:** 0 / 6
**Current Feature:** 01-homepage-content

---
EOF

    log_success "Migration log reset"
fi

# Step 4: Clean screenshots (optional)
if [ "$CLEAN_SCREENSHOTS" = true ]; then
    log_info "Cleaning screenshots..."

    if [ -d "$SCREENSHOTS_DIR" ]; then
        # Count all screenshots
        SCREENSHOT_COUNT=$(find "$SCREENSHOTS_DIR" -name "*.png" -type f 2>/dev/null | wc -l | tr -d ' ')

        if [ "$SCREENSHOT_COUNT" -gt 0 ]; then
            # Remove all screenshots
            find "$SCREENSHOTS_DIR" -name "*.png" -type f -delete 2>/dev/null || true
            log_success "  → Deleted $SCREENSHOT_COUNT screenshots"
        else
            log_success "  → No screenshots to delete"
        fi
    else
        log_success "Screenshots directory doesn't exist (skipped)"
    fi
fi

# Step 5: Reset git commits (optional - DANGEROUS)
if [ "$RESET_GIT" = true ]; then
    log_warning "Resetting git commits in storefront-next..."

    if [ -d "$WORKSPACE_ROOT/storefront-next/.git" ]; then
        cd "$WORKSPACE_ROOT/storefront-next"

        # Show what will be reset
        COMMIT_COUNT=$(git log --oneline | grep -c "subplan-" 2>/dev/null || echo "0")

        if [ "$COMMIT_COUNT" -gt 0 ]; then
            log_warning "  → Found $COMMIT_COUNT migration commits to reset"
            read -p "$(echo -e ${RED}Really reset git commits? [y/N]:${NC} )" -n 1 -r
            echo
            if [[ $REPLY =~ ^[Yy]$ ]]; then
                # Find the commit before first subplan
                FIRST_MIGRATION_COMMIT=$(git log --oneline | grep "subplan-" | tail -1 | cut -d' ' -f1)
                if [ -n "$FIRST_MIGRATION_COMMIT" ]; then
                    RESET_TO=$(git log --oneline "${FIRST_MIGRATION_COMMIT}^" | head -1 | cut -d' ' -f1)
                    if [ -n "$RESET_TO" ]; then
                        git reset --hard "$RESET_TO"
                        log_success "  → Reset to commit $RESET_TO"
                    else
                        log_warning "  → Could not find commit to reset to (skipped)"
                    fi
                fi
            else
                log_info "  → Git reset cancelled"
            fi
        else
            log_success "  → No migration commits found (skipped)"
        fi

        cd "$WORKSPACE_ROOT"
    else
        log_success "storefront-next is not a git repo (skipped)"
    fi
fi

# Summary
echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}Reset Complete${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo "State reset:"
echo "  ✓ Docker containers stopped and removed"
echo "  ✓ Intervention files cleaned"

if [ "$CLEAN_LOG" = true ]; then
    echo "  ✓ Migration log reset"
fi

if [ "$CLEAN_SCREENSHOTS" = true ]; then
    echo "  ✓ Screenshots cleaned"
fi

if [ "$RESET_GIT" = true ]; then
    echo "  ✓ Git commits reset (if confirmed)"
fi

echo ""
log_success "Ready for fresh migration run!"
echo ""
echo "Next steps:"
echo "  1. Run: ./scripts/demo-migration-loop.sh"
echo "  2. Or manually: docker run ... claude code run ..."
echo ""
