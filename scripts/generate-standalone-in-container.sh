#!/usr/bin/env bash
# generate-standalone-in-container.sh - Generate standalone project INSIDE container
#
# This script runs create-storefront inside the container using the built monorepo
# at /tmp/SFCC-Odyssey. The generated project will have file:// symlinks to the
# monorepo packages which already contain Linux ARM64 binaries.

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[✓]${NC} $1"; }
log_warning() { echo -e "${YELLOW}[!]${NC} $1"; }
log_error() { echo -e "${RED}[✗]${NC} $1"; }

CONTAINER_NAME="${1:-claude-migration-demo}"

echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}Generate Standalone Project (Inside Container)${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Check if container is running
if ! docker ps -q -f name="$CONTAINER_NAME" >/dev/null 2>&1; then
    log_error "Container not running: $CONTAINER_NAME"
    exit 1
fi

log_success "Container is running"

# Check if monorepo is built in container
if ! docker exec -u node "$CONTAINER_NAME" test -f /tmp/SFCC-Odyssey/packages/storefront-next-dev/dist/cli.js 2>/dev/null; then
    log_warning "Monorepo not built in container yet"
    log_info "Building now (this will take a few minutes)..."
    echo ""

    # Run build script
    SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    "$SCRIPT_DIR/build-in-container.sh" "$CONTAINER_NAME" || exit 1
fi

log_success "Monorepo is built in container"
echo ""

# Generate standalone project inside container
log_info "Generating standalone project inside container..."
log_info "Using file:// symlinks to built monorepo packages"
echo ""

docker exec -u node "$CONTAINER_NAME" bash << 'CONTAINER_SCRIPT'
set -e

echo "[Container] Creating clean template with git history..."
cd /tmp

# Remove old clean template if exists
rm -rf template-clean

# Copy template excluding node_modules (should already be excluded, but be explicit)
rsync -a --exclude='node_modules' --exclude='.git' \
    /tmp/SFCC-Odyssey/packages/template-retail-rsc-app/ \
    template-clean/

# Initialize clean git repository (required by create-storefront)
cd template-clean
git init
git add .
git commit -m "Initial template"

echo "[Container] ✓ Clean template created at /tmp/template-clean"
echo ""

cd /workspace

echo "[Container] Removing old storefront-next if exists..."
rm -rf storefront-next

echo "[Container] Running create-storefront..."
echo "[Container] Template: /tmp/template-clean"
echo "[Container] Local packages: /tmp/SFCC-Odyssey/packages"
echo ""

# Run create-storefront with clean template and local packages dir
# This will convert workspace:* → file:///tmp/SFCC-Odyssey/packages/*
npx /tmp/SFCC-Odyssey/packages/storefront-next-dev/dist/cli.js create-storefront \
    --name storefront-next \
    --template "file:///tmp/template-clean" \
    --local-packages-dir "/tmp/SFCC-Odyssey/packages"

if [ ! -d storefront-next ]; then
    echo "[Container] ERROR: storefront-next directory not created"
    exit 1
fi

echo ""
echo "[Container] Project created with file:// references to monorepo"
echo "[Container] Installing dependencies..."
echo ""

cd storefront-next

# Install dependencies
# The file:// references will symlink to /tmp/SFCC-Odyssey/packages/*
# which already have Linux ARM64 binaries from the build step
pnpm install

echo ""
echo "[Container] Verifying installation..."

# Check for sfnext CLI
if [ -f node_modules/.bin/sfnext ]; then
    echo "[Container] ✓ sfnext CLI available"
    node_modules/.bin/sfnext --version 2>/dev/null || echo "[Container]   (version check skipped)"
else
    echo "[Container] ✗ sfnext CLI not found"
    exit 1
fi

# Verify Linux ARM64 binaries
if [ -f node_modules/@rollup/rollup-linux-arm64-musl/rollup.linux-arm64-musl.node ]; then
    echo "[Container] ✓ Native modules present"
    file node_modules/@rollup/rollup-linux-arm64-musl/rollup.linux-arm64-musl.node 2>/dev/null | head -1 || true
fi

# Create .env if needed
if [ ! -f .env ] && [ -f .env.default ]; then
    cp .env.default .env
    echo "[Container] ✓ Created .env from .env.default"
fi

echo ""
echo "[Container] Generation complete!"
echo "[Container] Project uses file:// symlinks to /tmp/SFCC-Odyssey with Linux binaries"

CONTAINER_SCRIPT

if [ $? -eq 0 ]; then
    log_success "Standalone project generated successfully"
    echo ""
    log_info "Location: storefront-next/"
    log_info "Dependencies: file:// symlinks to /tmp/SFCC-Odyssey (Linux ARM64)"
    log_info "Ready to run: cd storefront-next && pnpm dev"
else
    log_error "Generation failed"
    exit 1
fi

echo ""
