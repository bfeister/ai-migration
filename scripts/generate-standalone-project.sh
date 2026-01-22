#!/usr/bin/env bash
# generate-standalone-project.sh - Generate standalone storefront on HOST
#
# This script generates a standalone storefront project from your monorepo
# ON THE HOST MACHINE (not in Docker) to avoid file descriptor limits.

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
echo -e "${BLUE}Generate Standalone Storefront Project (Host)${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Step 1: Verify monorepo
log_info "Checking monorepo..."

if [ ! -d "$MONOREPO_PATH" ]; then
    log_error "Monorepo not found at: $MONOREPO_PATH"
    log_info "Set STOREFRONT_MONOREPO_PATH env var if in different location"
    exit 1
fi

if [ ! -d "$MONOREPO_PATH/packages/storefront-next-dev" ]; then
    log_error "Invalid monorepo (missing packages/storefront-next-dev)"
    exit 1
fi

log_success "Found monorepo at: $MONOREPO_PATH"

# Step 2: Verify monorepo is built
log_info "Checking if monorepo is built..."

if [ ! -f "$MONOREPO_PATH/packages/storefront-next-dev/dist/cli.js" ]; then
    log_warning "Monorepo not built (missing create-storefront CLI)"
    log_info "Building monorepo (this may take 1-2 minutes)..."
    echo ""

    cd "$MONOREPO_PATH"
    if pnpm install --frozen-lockfile && pnpm -r build; then
        log_success "Monorepo built successfully"
    else
        log_error "Failed to build monorepo"
        exit 1
    fi
    cd "$WORKSPACE_ROOT"
else
    log_success "Monorepo already built"
fi

# Step 3: Check if standalone project already exists
if [ -d "$STOREFRONT_DIR" ]; then
    # Check if it has dependencies
    if [ -d "$STOREFRONT_DIR/node_modules" ] && [ -f "$STOREFRONT_DIR/node_modules/.bin/sfnext" ]; then
        log_warning "Standalone project already exists at: $STOREFRONT_DIR"
        log_success "Existing project appears valid (has sfnext CLI)"
        read -p "Regenerate? This will delete and recreate the project. [y/N] " -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            log_info "Keeping existing project"
            exit 0
        fi

        log_info "Removing existing project..."
        rm -rf "$STOREFRONT_DIR"
    else
        # Directory exists but is empty or incomplete
        log_warning "Directory exists but appears empty or incomplete"
        log_info "Removing and regenerating..."
        rm -rf "$STOREFRONT_DIR"
    fi
fi

# Step 4: Generate standalone project
echo ""
log_info "Generating standalone project..."
log_info "This will:"
log_info "  1. Run create-storefront from monorepo"
log_info "  2. Use template from: packages/template-retail-rsc-app"
log_info "  3. Install dependencies (on host, no Docker limits)"
log_info "  4. Create standalone project at: $STOREFRONT_DIR"
echo ""

# Step 4a: Create temporary template repo
log_info "Creating temporary template git repository..."

TEMP_TEMPLATE_DIR="$HOME/dev/storefront-template-$(date +%s)"

log_info "Copying template from: $MONOREPO_PATH/packages/template-retail-rsc-app"
log_info "To temporary location: $TEMP_TEMPLATE_DIR"

# Ensure parent directory exists
mkdir -p "$(dirname "$TEMP_TEMPLATE_DIR")"

# Copy template directory
if [ ! -d "$MONOREPO_PATH/packages/template-retail-rsc-app" ]; then
    log_error "Template source not found at: $MONOREPO_PATH/packages/template-retail-rsc-app"
    exit 1
fi

cp -r "$MONOREPO_PATH/packages/template-retail-rsc-app" "$TEMP_TEMPLATE_DIR"

if [ ! -d "$TEMP_TEMPLATE_DIR" ]; then
    log_error "Failed to create temporary template directory"
    exit 1
fi

log_success "Template copied successfully"

# Remove any existing .git directory (shouldn't exist, but just in case)
if [ -d "$TEMP_TEMPLATE_DIR/.git" ]; then
    log_info "Removing existing .git directory from template"
    rm -rf "$TEMP_TEMPLATE_DIR/.git"
fi

# Initialize as standalone git repo
cd "$TEMP_TEMPLATE_DIR"
git init -q
git add .
git commit -q -m "Initial template commit"

log_success "Created temporary template repository at: $TEMP_TEMPLATE_DIR"

cd "$WORKSPACE_ROOT"

log_info "Running: npx create-storefront (non-interactive mode)"
log_info "  --name: storefront-next"
log_info "  --template: file://$TEMP_TEMPLATE_DIR"
log_info "  --local-packages-dir: $MONOREPO_PATH/packages"
echo ""

# Generate standalone project using create-storefront with non-interactive flags
npx "$MONOREPO_PATH/packages/storefront-next-dev" create-storefront \
    --name storefront-next \
    --template "file://$TEMP_TEMPLATE_DIR" \
    --local-packages-dir "$MONOREPO_PATH/packages" 2>&1 | tee /tmp/generate-standalone.log

if [ $? -eq 0 ]; then
    log_success "Standalone project generation completed"
else
    log_error "Generation failed (exit code: $?)"
    log_info "Check log: /tmp/generate-standalone.log"
    exit 1
fi

# Cleanup temporary template directory
log_info "Cleaning up temporary template directory..."
rm -rf "$TEMP_TEMPLATE_DIR"

# The create-storefront command creates a directory - find it
if [ -d "$WORKSPACE_ROOT/storefront-next" ]; then
    GENERATED_DIR="$WORKSPACE_ROOT/storefront-next"
elif [ -d "$WORKSPACE_ROOT/template-retail-rsc-app" ]; then
    # Sometimes it uses the template name
    GENERATED_DIR="$WORKSPACE_ROOT/template-retail-rsc-app"
    mv "$GENERATED_DIR" "$STOREFRONT_DIR"
else
    # Find most recently created directory (excluding existing ones)
    GENERATED_DIR=$(find "$WORKSPACE_ROOT" -maxdepth 1 -type d \( -name "template-*" -o -name "storefront-*" \) -newer "$SCRIPT_DIR" 2>/dev/null | head -1)

    if [ -n "$GENERATED_DIR" ] && [ "$GENERATED_DIR" != "$STOREFRONT_DIR" ]; then
        log_info "Moving $GENERATED_DIR to $STOREFRONT_DIR"
        mv "$GENERATED_DIR" "$STOREFRONT_DIR"
    fi
fi

echo ""

# Step 5: Verify generation
log_info "Verifying generated project..."

if [ ! -d "$STOREFRONT_DIR" ]; then
    log_error "Generation failed - directory not created"
    log_info "Check log: /tmp/generate-standalone.log"
    exit 1
fi

if [ ! -f "$STOREFRONT_DIR/package.json" ]; then
    log_error "Generation failed - missing package.json"
    exit 1
fi

# Check for monorepo structure (should NOT have packages/)
if [ -d "$STOREFRONT_DIR/packages" ]; then
    log_error "Generated project is a monorepo (has packages/)"
    log_info "This is not a standalone project"
    exit 1
fi

log_success "Generated standalone project"

# Step 6: Verify dependencies installed
if [ ! -d "$STOREFRONT_DIR/node_modules" ] || [ ! -f "$STOREFRONT_DIR/node_modules/.bin/sfnext" ]; then
    log_warning "Dependencies not installed or incomplete, installing now..."
    cd "$STOREFRONT_DIR"

    # Check if lockfile exists
    if [ -f "pnpm-lock.yaml" ]; then
        log_info "Using frozen lockfile..."
        pnpm install --frozen-lockfile
    else
        log_info "No lockfile found, generating new one..."
        pnpm install
    fi

    cd "$WORKSPACE_ROOT"
fi

# Step 7: Verify sfnext CLI
if [ ! -f "$STOREFRONT_DIR/node_modules/.bin/sfnext" ]; then
    log_error "sfnext CLI not found in node_modules"
    log_info "Dependencies may not have installed correctly"
    exit 1
fi

log_success "sfnext CLI available"

# Step 8: Verify .env file
if [ ! -f "$STOREFRONT_DIR/.env" ]; then
    if [ -f "$STOREFRONT_DIR/.env.default" ]; then
        log_info "Creating .env from .env.default..."
        cp "$STOREFRONT_DIR/.env.default" "$STOREFRONT_DIR/.env"
        log_success "Created .env file"
    else
        log_warning ".env file missing and no .env.default found"
        log_info "You may need to create .env manually"
    fi
else
    log_success ".env file exists"
fi

# Summary
echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}Standalone Project Generated Successfully${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo "Location: $STOREFRONT_DIR"
echo ""
log_success "Project structure:"
echo "  ✓ Standalone (not monorepo)"
echo "  ✓ Has own node_modules with sfnext CLI"
echo "  ✓ Has .env configuration"
echo "  ✓ Ready to run pnpm dev"
echo ""

# Test dev server (optional)
read -p "Test dev server startup? [y/N] " -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    log_info "Testing dev server (will stop after 5 seconds)..."
    cd "$STOREFRONT_DIR"
    timeout 5 pnpm dev || true
    echo ""
    log_success "Dev server test complete"
fi

echo ""
log_success "Ready for migration!"
echo ""
echo "Next steps:"
echo "  1. Rebuild Docker image: docker build -f docker/Dockerfile -t claude-migration:latest ."
echo "  2. Run migration: ./scripts/demo-migration-loop.sh"
echo ""
