#!/usr/bin/env bash
# setup-storefront-dependencies.sh - Install storefront-next dependencies on host
#
# This script installs dependencies on the HOST machine (macOS) to avoid
# Docker Desktop file descriptor limits. The container will use these
# dependencies via volume mounts.

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
echo -e "${BLUE}Storefront Next Dependencies Setup${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Check if storefront-next directory exists
if [ ! -d "$STOREFRONT_DIR" ]; then
    log_error "storefront-next directory not found at: $STOREFRONT_DIR"
    exit 1
fi

# Check for pnpm
if ! command -v pnpm &> /dev/null; then
    log_error "pnpm not found. Please install pnpm first:"
    echo "  npm install -g pnpm"
    echo "  or: corepack enable && corepack prepare pnpm@latest --activate"
    exit 1
fi

log_success "Found pnpm: $(pnpm --version)"

# Step 1: Setup .env file for template-retail-rsc-app
log_info "Setting up .env file..."

APP_DIR="$STOREFRONT_DIR/packages/template-retail-rsc-app"
if [ -d "$APP_DIR" ]; then
    if [ ! -f "$APP_DIR/.env" ]; then
        if [ -f "$APP_DIR/.env.default" ]; then
            log_info "Creating .env from .env.default..."
            cp "$APP_DIR/.env.default" "$APP_DIR/.env"
            log_success "Created .env file"
        else
            log_warning "No .env.default found - you may need to configure .env manually"
        fi
    else
        log_success ".env file already exists"
    fi
else
    log_error "template-retail-rsc-app directory not found"
    exit 1
fi

# Step 2: Install dependencies (monorepo root)
log_info "Installing monorepo dependencies (this may take 2-5 minutes)..."

cd "$STOREFRONT_DIR"

# Check if node_modules exists and is owned by root (Docker artifact)
if [ -d "node_modules" ]; then
    # Check ownership on Mac
    OWNER=$(stat -f "%Su" node_modules 2>/dev/null || echo "unknown")
    if [ "$OWNER" = "root" ]; then
        log_warning "node_modules owned by root (Docker artifact), removing..."
        sudo rm -rf node_modules
        log_success "Cleaned up root-owned node_modules"
    fi
fi

# Install with frozen lockfile
log_info "  This may take 2-5 minutes and show some warnings (expected)..."
if pnpm install --frozen-lockfile; then
    log_success "Dependencies installed successfully"
    log_info "  Note: Build script warnings are expected and OK for dev mode"
else
    log_error "Failed to install dependencies"
    log_info "Try running manually: cd $STOREFRONT_DIR && pnpm install"
    exit 1
fi

# Step 2.5: Build monorepo packages (required for sfnext CLI and runtime)
log_info "Building monorepo packages (storefront-next-dev, storefront-next-runtime)..."
log_info "  This ensures sfnext CLI and workspace dependencies are available..."

# Check if packages already built
DEV_PKG_BUILT=false
RUNTIME_PKG_BUILT=false

if [ -f "$STOREFRONT_DIR/packages/storefront-next-dev/dist/cli.js" ]; then
    log_success "  ✓ storefront-next-dev already built (sfnext CLI exists)"
    DEV_PKG_BUILT=true
fi

if [ -f "$STOREFRONT_DIR/packages/storefront-next-runtime/dist/scapi.js" ]; then
    log_success "  ✓ storefront-next-runtime already built"
    RUNTIME_PKG_BUILT=true
fi

# Build if needed
if [ "$DEV_PKG_BUILT" = false ] || [ "$RUNTIME_PKG_BUILT" = false ]; then
    log_info "  Running pnpm -r build (this may take 1-2 minutes)..."
    if pnpm -r build; then
        log_success "Monorepo packages built successfully"
    else
        log_error "Failed to build monorepo packages"
        log_info "Try running manually: cd $STOREFRONT_DIR && pnpm -r build"
        exit 1
    fi

    # Verify builds succeeded
    if [ ! -f "$STOREFRONT_DIR/packages/storefront-next-dev/dist/cli.js" ]; then
        log_error "sfnext CLI not found after build"
        log_info "Expected: $STOREFRONT_DIR/packages/storefront-next-dev/dist/cli.js"
        exit 1
    fi
    log_success "sfnext CLI built successfully"
else
    log_success "All monorepo packages already built, skipping build step"
fi

# Step 3: Verify critical packages (using pnpm list)
log_info "Verifying critical packages..."

CRITICAL_PACKAGES=(
    "commander"
    "vite"
    "@remix-run/react"
    "react"
)

ALL_FOUND=true
for pkg in "${CRITICAL_PACKAGES[@]}"; do
    # Use pnpm list to check if package is installed (works with pnpm workspace structure)
    if pnpm list "$pkg" --depth=0 >/dev/null 2>&1 || \
       pnpm list "$pkg" --depth=Infinity >/dev/null 2>&1; then
        log_success "  ✓ $pkg"
    else
        log_error "  ✗ $pkg (not found in workspace)"
        ALL_FOUND=false
    fi
done

if [ "$ALL_FOUND" = false ]; then
    log_error "Some critical packages are missing"
    log_info "This is unusual - pnpm install succeeded but packages not found"
    log_info "Try running: cd $STOREFRONT_DIR && pnpm list | grep -E '(commander|vite|react)'"
    exit 1
fi

# Step 4: Check build artifacts
log_info "Checking build artifacts..."

if [ -d "$APP_DIR/dist" ]; then
    BUILD_SIZE=$(du -sh "$APP_DIR/dist" | cut -f1)
    log_success "Existing build found: $BUILD_SIZE"
    log_info "  (Dev server will use incremental builds from this)"
else
    log_warning "No existing build found"
    log_info "First dev server start will take longer (initial build)"
fi

# Summary
echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}Setup Complete${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo "Storefront Next dependencies installed on host."
echo "Docker container will use these via volume mount."
echo ""
log_success "Ready to run migration loop!"
echo ""
echo "Next steps:"
echo "  1. Run: ./scripts/demo-migration-loop.sh"
echo "  2. Or: docker run ... (see DEMO-QUICKSTART.md)"
echo ""
