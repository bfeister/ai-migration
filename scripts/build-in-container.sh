#!/usr/bin/env bash
# build-in-container.sh - Build monorepo packages inside Docker for correct architecture
#
# This script copies the monorepo into the container and builds it there,
# ensuring Linux ARM64 binaries are created (not macOS binaries)

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

MONOREPO_PATH="${STOREFRONT_MONOREPO_PATH:-$HOME/dev/SFCC-Odyssey}"
WORKSPACE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONTAINER_NAME="${1:-claude-migration-demo}"

echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}Build Monorepo Inside Container ${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Check if container is running
if ! docker ps -q -f name="$CONTAINER_NAME" >/dev/null 2>&1; then
    log_error "Container not running: $CONTAINER_NAME"
    log_info "Start it first with: ./scripts/demo-migration-loop.sh"
    exit 1
fi

log_success "Container is running"

# Check if monorepo exists on host
if [ ! -d "$MONOREPO_PATH" ]; then
    log_error "Monorepo not found at: $MONOREPO_PATH"
    exit 1
fi

log_success "Found monorepo at: $MONOREPO_PATH"

# Copy monorepo into container (to /tmp for better performance)
# Exclude node_modules to avoid copying hundreds of thousands of files
log_info "Copying monorepo into container /tmp/SFCC-Odyssey..."
log_info "Excluding node_modules directories to speed up copy..."
echo ""

docker exec -u node "$CONTAINER_NAME" rm -rf /tmp/SFCC-Odyssey 2>/dev/null || true

# Create temporary directory and use rsync-style copy (exclude node_modules)
TEMP_COPY="$WORKSPACE_ROOT/.temp-monorepo-copy"
rm -rf "$TEMP_COPY"
mkdir -p "$TEMP_COPY"

# Copy monorepo excluding node_modules and other unnecessary directories
log_info "Creating clean copy of monorepo (excluding node_modules, .pnpm-store, dist, coverage)..."
rsync -a \
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
    "$MONOREPO_PATH/" "$TEMP_COPY/"

# Copy to container
log_info "Transferring to container..."
docker cp "$TEMP_COPY/." "$CONTAINER_NAME:/tmp/SFCC-Odyssey"
docker exec -u root "$CONTAINER_NAME" chown -R node:node /tmp/SFCC-Odyssey

# Clean up temp directory
rm -rf "$TEMP_COPY"

log_success "Monorepo copied to container"
echo ""

# Build inside container
log_info "Building monorepo inside container for Linux ARM64..."
log_info "This will take 2-5 minutes..."
echo ""

docker exec -u node "$CONTAINER_NAME" bash -c '
set -e
cd /tmp/SFCC-Odyssey

echo "[Container] Installing dependencies..."
if ! pnpm install --frozen-lockfile 2>&1 | tail -20; then
    echo "[Container] Install with frozen lockfile failed, trying without..."
    pnpm install 2>&1 | tail -20
fi

echo ""
echo "[Container] Building all packages..."
pnpm -r build 2>&1 | grep -E "Building|Built|Error|FAIL" || tail -20

echo ""
echo "[Container] Verifying builds..."
test -f packages/storefront-next-dev/dist/cli.js && echo "✓ storefront-next-dev built"
test -f packages/storefront-next-runtime/dist/scapi.js && echo "✓ storefront-next-runtime built"

echo ""
echo "[Container] Build complete!"
'

if [ $? -eq 0 ]; then
    log_success "Monorepo built successfully inside container"
    echo ""
    log_info "Built packages location: /tmp/SFCC-Odyssey/packages/"
    log_info "Architecture: $(docker exec -u node "$CONTAINER_NAME" uname -m) (Linux)"
else
    log_error "Build failed inside container"
    exit 1
fi

echo ""
log_success "Ready to generate standalone project from container-built monorepo"
echo ""

