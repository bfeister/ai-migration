#!/usr/bin/env bash
# generate-standalone-in-container.sh - Generate standalone project INSIDE container
#
# This ensures all native modules (like @rollup/rollup-linux-arm64-musl) are
# compiled for the correct architecture (Linux ARM64, not macOS)

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
log_info "Using Linux-built packages"
echo ""

docker exec -u node "$CONTAINER_NAME" bash << 'CONTAINER_SCRIPT'
set -e

echo "[Container] Detecting workspace:* and file:// dependencies from template..."
echo ""

# Find template package.json
TEMPLATE_PKG="/tmp/SFCC-Odyssey/packages/template-retail-rsc-app/package.json"

if [ ! -f "$TEMPLATE_PKG" ]; then
    echo "[Container] ERROR: Template package.json not found"
    exit 1
fi

# Extract all workspace:* and file:// dependency paths
MONOREPO_DEPS=$(node -e "
const pkg = require('$TEMPLATE_PKG');
const deps = {...pkg.dependencies, ...pkg.devDependencies};
for (const [name, version] of Object.entries(deps)) {
  if (version.startsWith('workspace:') || version.startsWith('file:')) {
    console.log(name + '|' + version);
  }
}
")

if [ -z "$MONOREPO_DEPS" ]; then
    echo "[Container] No workspace or file:// dependencies found in template"
else
    echo "[Container] Found monorepo dependencies:"
    echo "$MONOREPO_DEPS" | while IFS='|' read -r name version; do
        echo "[Container]   - $name: $version"
    done
fi

echo ""
echo "[Container] Packing monorepo packages to tarballs (Linux binaries)..."
echo ""

# Pack packages inside container (gets Linux ARM64 binaries!)
PACK_DIR="/tmp/packed-packages"
mkdir -p "$PACK_DIR"

# For each monorepo dependency, resolve and pack it
echo "$MONOREPO_DEPS" | while IFS='|' read -r name version; do
    PKG_PATH=""

    # Resolve package path based on version type
    if [[ "$version" = workspace:* ]]; then
        # workspace:* dependencies - look in monorepo packages/
        # Pattern: @salesforce/storefront-next-dev → storefront-next-dev
        pkg_name="${name##*/}"  # Get last part after /
        PKG_PATH="/tmp/SFCC-Odyssey/packages/$pkg_name"
    elif [[ "$version" = file:* ]]; then
        # file:// dependencies - resolve relative path
        path="${version#file:}"
        TEMPLATE_DIR="/tmp/SFCC-Odyssey/packages/template-retail-rsc-app"

        if [[ "$path" = /* ]]; then
            PKG_PATH="$path"
        else
            PKG_PATH=$(cd "$TEMPLATE_DIR" && cd "$path" && pwd)
        fi
    fi

    if [ -d "$PKG_PATH" ] && [ -f "$PKG_PATH/package.json" ]; then
        echo "[Container] Packing: $name ($version)"
        cd "$PKG_PATH"
        TARBALL=$(pnpm pack --pack-destination "$PACK_DIR" 2>&1 | tail -1)
        echo "[Container]   ✓ Created: $TARBALL"
    else
        echo "[Container]   ✗ Package not found at: $PKG_PATH"
    fi
done

echo ""
echo "[Container] Creating template directory..."

# Create temp template directory
TEMP_TEMPLATE="/tmp/temp-template-$(date +%s)"
mkdir -p "$TEMP_TEMPLATE"
cp -r /tmp/SFCC-Odyssey/packages/template-retail-rsc-app/* "$TEMP_TEMPLATE/"

cd /workspace

echo "[Container] Running create-storefront (without --local-packages-dir)..."
echo "[Container] Template: file://$TEMP_TEMPLATE"
echo ""

# Remove old storefront-next if exists
rm -rf storefront-next

# Run create-storefront WITHOUT --local-packages-dir
npx /tmp/SFCC-Odyssey/packages/storefront-next-dev create-storefront \
    --name storefront-next \
    --template "file://$TEMP_TEMPLATE"

if [ ! -d storefront-next ]; then
    echo "[Container] ERROR: storefront-next directory not created"
    exit 1
fi

echo ""
echo "[Container] Standalone project generated"
echo "[Container] Installing dependencies from tarballs (Linux binaries)..."
echo ""

cd storefront-next

# Remove workspace:* and file:// dependencies from package.json (they'll be installed from tarballs)
echo "[Container] Cleaning workspace:* and file:// dependencies from package.json..."
node -e "
const fs = require('fs');
const pkg = JSON.parse(fs.readFileSync('./package.json', 'utf8'));
let removed = [];

for (const depType of ['dependencies', 'devDependencies']) {
  if (pkg[depType]) {
    for (const [name, version] of Object.entries(pkg[depType])) {
      if (version.startsWith('workspace:') || version.startsWith('file:')) {
        removed.push(name);
        delete pkg[depType][name];
      }
    }
  }
}

fs.writeFileSync('./package.json', JSON.stringify(pkg, null, 2) + '\n');
console.log('[Container] Removed: ' + removed.join(', '));
"

# Install base dependencies
echo "[Container] Installing base dependencies..."
pnpm install

# Install packages from Linux-built tarballs
echo "[Container] Installing packages from tarballs..."
TARBALL_COUNT=0
for tarball in "$PACK_DIR"/*.tgz; do
    if [ -f "$tarball" ]; then
        echo "[Container]   Installing: $(basename $tarball)"
        pnpm add "file:$tarball"
        TARBALL_COUNT=$((TARBALL_COUNT + 1))
    fi
done

if [ $TARBALL_COUNT -eq 0 ]; then
    echo "[Container]   (No tarballs to install)"
fi

# Cleanup
rm -rf "$PACK_DIR"

echo ""
echo "[Container] Verifying sfnext CLI..."
if [ -f node_modules/.bin/sfnext ]; then
    echo "[Container] ✓ sfnext CLI available"
    node_modules/.bin/sfnext --version || echo "[Container] (version check skipped)"
else
    echo "[Container] ✗ sfnext CLI not found"
    exit 1
fi

echo ""
echo "[Container] Checking architecture of native modules..."
file node_modules/@rollup/rollup-linux-arm64-musl/rollup.linux-arm64-musl.node 2>/dev/null | head -1 || echo "[Container] (rollup binary check skipped)"

# Create .env if needed
if [ ! -f .env ] && [ -f .env.default ]; then
    cp .env.default .env
    echo "[Container] ✓ Created .env from .env.default"
fi

# Cleanup temp template
rm -rf "$TEMP_TEMPLATE"

echo ""
echo "[Container] Generation complete!"

CONTAINER_SCRIPT

if [ $? -eq 0 ]; then
    log_success "Standalone project generated successfully"
    echo ""
    log_info "Location: storefront-next/"
    log_info "Architecture: Linux ARM64 (native modules compiled correctly)"
    log_info "Ready to run: cd storefront-next && pnpm dev"
else
    log_error "Generation failed"
    exit 1
fi

echo ""
