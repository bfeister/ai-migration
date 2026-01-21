#!/bin/bash
#
# Test script for Playwright installation in Docker
#
# This script:
# 1. Rebuilds the Docker container with Playwright dependencies
# 2. Validates Chromium is installed
# 3. Tests screenshot capture from SFRA site
# 4. Verifies screenshots are created successfully
#

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Test configuration
CONTAINER_NAME="claude-migration-test-playwright-$$"
TEST_OUTPUT_DIR="$PROJECT_ROOT/screenshots/test"
TEST_URL="https://zzrf-001.dx.commercecloud.salesforce.com/on/demandware.store/Sites-RefArchGlobal-Site"

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

cleanup() {
    log_info "Cleaning up test container..."
    docker rm -f "$CONTAINER_NAME" 2>/dev/null || true
}

# Set up cleanup trap
trap cleanup EXIT

log_info "Starting Playwright setup test..."
log_info "Container name: $CONTAINER_NAME"

# Step 1: Build Docker image
log_info "Step 1: Building Docker image with Playwright..."
cd "$PROJECT_ROOT/docker"
if docker build -t claude-migration:latest .; then
    log_success "Docker image built successfully"
else
    log_error "Failed to build Docker image"
    exit 1
fi

# Step 2: Start container
log_info "Step 2: Starting test container..."
cd "$PROJECT_ROOT"
if docker run -d \
    --name "$CONTAINER_NAME" \
    --env-file .env \
    -v "$PROJECT_ROOT:/workspace" \
    -v "/workspace/node_modules" \
    -v "/workspace/storefront-next/node_modules" \
    -v "/workspace/mcp-server/node_modules" \
    -w /workspace \
    claude-migration:latest \
    tail -f /dev/null; then
    log_success "Container started"
else
    log_error "Failed to start container"
    exit 1
fi

# Wait for container to be ready
sleep 3

# Step 3: Verify Chromium installation
log_info "Step 3: Verifying Chromium installation..."
if docker exec "$CONTAINER_NAME" which chromium-browser > /dev/null; then
    CHROMIUM_VERSION=$(docker exec "$CONTAINER_NAME" chromium-browser --version)
    log_success "Chromium installed: $CHROMIUM_VERSION"
else
    log_error "Chromium not found in container"
    exit 1
fi

# Step 4: Install dependencies
log_info "Step 4: Installing project dependencies..."
if docker exec "$CONTAINER_NAME" bash -c "cd /workspace/scripts && CI=true pnpm install --no-frozen-lockfile"; then
    log_success "Scripts dependencies installed"
else
    log_error "Failed to install scripts dependencies"
    exit 1
fi

# Step 5: Test screenshot capture
log_info "Step 5: Testing screenshot capture from SFRA site..."
mkdir -p "$TEST_OUTPUT_DIR"
TEST_SCREENSHOT="$TEST_OUTPUT_DIR/test-$(date +%Y%m%d-%H%M%S).png"

log_info "Capturing screenshot: $TEST_URL"
log_info "Output file: $TEST_SCREENSHOT"

if docker exec "$CONTAINER_NAME" bash -c "cd /workspace/scripts && pnpm tsx capture-screenshots.ts '$TEST_URL' '$TEST_SCREENSHOT'"; then
    log_success "Screenshot capture completed"
else
    log_error "Screenshot capture failed"
    exit 1
fi

# Step 6: Verify screenshot file exists and has content
log_info "Step 6: Verifying screenshot file..."
if [ -f "$TEST_SCREENSHOT" ]; then
    FILE_SIZE=$(stat -f%z "$TEST_SCREENSHOT" 2>/dev/null || stat -c%s "$TEST_SCREENSHOT" 2>/dev/null || echo "0")
    FILE_SIZE_KB=$((FILE_SIZE / 1024))

    if [ "$FILE_SIZE" -gt 10000 ]; then
        log_success "Screenshot file created: $TEST_SCREENSHOT"
        log_success "File size: ${FILE_SIZE_KB} KB"
    else
        log_error "Screenshot file too small (${FILE_SIZE_KB} KB) - may be corrupted"
        exit 1
    fi
else
    log_error "Screenshot file not found: $TEST_SCREENSHOT"
    exit 1
fi

# Step 7: Test URL mapping configuration
log_info "Step 7: Testing URL mapping with specific configuration..."
MAPPING_JSON='{"viewport":{"width":1920,"height":1080},"wait_for_selector":"body"}'
TEST_SCREENSHOT_WITH_MAPPING="$TEST_OUTPUT_DIR/test-with-mapping-$(date +%Y%m%d-%H%M%S).png"

if docker exec "$CONTAINER_NAME" bash -c "cd /workspace/scripts && pnpm tsx capture-screenshots.ts '$TEST_URL' '$TEST_SCREENSHOT_WITH_MAPPING' --mapping '$MAPPING_JSON'"; then
    log_success "Screenshot with URL mapping captured"
else
    log_error "Screenshot with URL mapping failed"
    exit 1
fi

if [ -f "$TEST_SCREENSHOT_WITH_MAPPING" ]; then
    FILE_SIZE=$(stat -f%z "$TEST_SCREENSHOT_WITH_MAPPING" 2>/dev/null || stat -c%s "$TEST_SCREENSHOT_WITH_MAPPING" 2>/dev/null || echo "0")
    FILE_SIZE_KB=$((FILE_SIZE / 1024))
    log_success "Screenshot with mapping created: ${FILE_SIZE_KB} KB"
else
    log_error "Screenshot with mapping not found"
    exit 1
fi

# Step 8: Verify url-mappings.json can be read
log_info "Step 8: Testing url-mappings.json parsing..."
if docker exec "$CONTAINER_NAME" jq '.mappings[0]' /workspace/url-mappings.json > /dev/null; then
    log_success "url-mappings.json is valid JSON"
else
    log_error "url-mappings.json is invalid or not found"
    exit 1
fi

# Success summary
echo ""
log_success "========================================"
log_success "Playwright Setup Test: ALL TESTS PASSED"
log_success "========================================"
echo ""
log_info "Summary:"
log_info "  ✅ Docker image built with Playwright + Chromium"
log_info "  ✅ Chromium browser installed and accessible"
log_info "  ✅ Screenshot capture from external URL works"
log_info "  ✅ URL mapping configuration works"
log_info "  ✅ url-mappings.json is valid"
echo ""
log_info "Test screenshots saved to: $TEST_OUTPUT_DIR"
log_info "Container name: $CONTAINER_NAME"
log_info "Container will be cleaned up automatically"
echo ""
log_info "Next steps:"
log_info "  1. Review test screenshots: ls -lh $TEST_OUTPUT_DIR"
log_info "  2. Proceed with Phase 4: Create first micro-plans"
log_info "  3. Test full iteration loop"
echo ""
