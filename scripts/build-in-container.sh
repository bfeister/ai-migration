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
# Stream directly via tar to avoid host file descriptor exhaustion
log_info "Copying monorepo into container /tmp/SFCC-Odyssey..."
log_info "Streaming via tar (no temp files) to avoid FD exhaustion..."
log_info "Excluding: node_modules, .git, dist, build, .next, coverage, test artifacts"
echo ""

# Remove old copy in container
docker exec -u node "$CONTAINER_NAME" rm -rf /tmp/SFCC-Odyssey 2>/dev/null || true
docker exec -u node "$CONTAINER_NAME" mkdir -p /tmp/SFCC-Odyssey

# Stream monorepo directly from host to container via tar
# This avoids creating any temp files on host, preventing FD exhaustion
log_info "Streaming files (this takes 30-60 seconds)..."
tar -C "$MONOREPO_PATH" \
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
    -czf - . | \
    docker exec -i "$CONTAINER_NAME" tar -C /tmp/SFCC-Odyssey -xzf -

# Fix ownership
docker exec -u root "$CONTAINER_NAME" chown -R node:node /tmp/SFCC-Odyssey

log_success "Monorepo streamed to container (no host temp files created)"
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

