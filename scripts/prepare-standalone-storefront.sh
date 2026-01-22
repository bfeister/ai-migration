#!/usr/bin/env bash
# prepare-standalone-storefront.sh - Prepare for standalone storefront generation
#
# This script:
# 1. Backs up the existing storefront-next directory (if it's a monorepo)
# 2. Clears it so the container can generate a fresh standalone project
# 3. Verifies the source monorepo exists

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKSPACE_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
STOREFRONT_DIR="$WORKSPACE_ROOT/storefront-next"
MONOREPO_PATH="${STOREFRONT_MONOREPO_PATH:-$HOME/dev/SFCC-Odyssey}"

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

echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}Prepare for Standalone Storefront Generation${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Step 1: Verify source monorepo
log_info "Checking source monorepo..."

if [ ! -d "$MONOREPO_PATH" ]; then
    log_error "Storefront monorepo not found at: $MONOREPO_PATH"
    log_info "Expected location: ~/dev/SFCC-Odyssey"
    log_info "Set STOREFRONT_MONOREPO_PATH env var if in different location"
    exit 1
fi

if [ ! -d "$MONOREPO_PATH/packages/storefront-next-dev" ]; then
    log_error "Invalid monorepo structure (missing packages/storefront-next-dev)"
    log_info "Path: $MONOREPO_PATH"
    exit 1
fi

log_success "Found storefront monorepo at: $MONOREPO_PATH"

# Step 2: Check existing storefront-next directory
if [ -d "$STOREFRONT_DIR" ]; then
    log_warning "Existing storefront-next directory found"

    # Check if it's a monorepo or standalone
    if [ -d "$STOREFRONT_DIR/packages" ]; then
        log_info "This appears to be a monorepo setup (has packages/ directory)"
        log_warning "This will be backed up and removed"

        # Create backup
        BACKUP_NAME="storefront-next-backup-$(date +%Y%m%d-%H%M%S)"
        log_info "Creating backup: $BACKUP_NAME"

        mv "$STOREFRONT_DIR" "$WORKSPACE_ROOT/$BACKUP_NAME"
        log_success "Backed up to: $BACKUP_NAME"

    elif [ -d "$STOREFRONT_DIR/node_modules" ] && [ -f "$STOREFRONT_DIR/node_modules/.bin/sfnext" ]; then
        log_success "Existing standalone project detected (has sfnext in node_modules)"
        log_info "Keeping existing standalone project"
        echo ""
        echo "If you want to regenerate, run:"
        echo "  rm -rf $STOREFRONT_DIR"
        echo "  ./scripts/demo-migration-loop.sh"
        exit 0

    else
        log_warning "Unknown storefront-next structure"
        log_info "Has package.json but unclear if monorepo or standalone"

        read -p "Remove this directory? [y/N] " -r
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            BACKUP_NAME="storefront-next-backup-$(date +%Y%m%d-%H%M%S)"
            mv "$STOREFRONT_DIR" "$WORKSPACE_ROOT/$BACKUP_NAME"
            log_success "Backed up to: $BACKUP_NAME"
        else
            log_info "Keeping existing directory"
            exit 0
        fi
    fi
else
    log_info "No existing storefront-next directory"
fi

# Step 3: Summary
echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}Ready for Standalone Generation${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo "Source monorepo: $MONOREPO_PATH"
echo "Target location: $STOREFRONT_DIR"
echo ""
log_success "When you run demo-migration-loop.sh, the container will:"
echo "  1. Mount the monorepo at: /workspace-host/dev/SFCC-Odyssey"
echo "  2. Generate standalone project at: /workspace/storefront-next"
echo "  3. Use prebuilt modules from the monorepo (no build needed)"
echo ""
log_info "Next steps:"
echo "  1. Rebuild Docker image: docker build -f docker/Dockerfile -t claude-migration:latest ."
echo "  2. Run migration: ./scripts/demo-migration-loop.sh"
echo ""
