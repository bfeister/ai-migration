#!/bin/bash
# pre-entrypoint.sh - Runs as root to fix volume mount permissions
# Then switches to node user and executes the main entrypoint

set -euo pipefail

echo "[INIT] Running pre-entrypoint permission fixes as root..."

# Fix volume mount ownership for /node_modules (volume mount at root)
if [ -d "/node_modules" ]; then
    # Fix ownership recursively but preserve structure
    # Only change if not already owned by node
    if [ "$(stat -c '%u' /node_modules 2>/dev/null || stat -f '%u' /node_modules)" != "1000" ]; then
        echo "[INIT] Fixing /node_modules ownership..."
        chown -R node:node /node_modules
        echo "[INIT] Fixed /node_modules ownership"
    else
        echo "[INIT] /node_modules already owned by node"
    fi
fi

# Check standalone storefront project
# Note: node_modules is at /node_modules (volume), not in the project directory
echo "[INIT] Checking standalone storefront project..."

if [ -d "/workspace/storefront-next" ] && [ -f "/workspace/storefront-next/package.json" ]; then
    # Check if dependencies are installed (at /node_modules via upward traversal)
    if [ -d "/node_modules/.bin" ] && [ -f "/node_modules/.bin/sfnext" ]; then
        echo "[INIT] ✓ Standalone storefront project exists with dependencies"
        echo "[INIT] ✓ Dependencies at /node_modules (upward traversal)"
    else
        echo "[INIT] ✗ storefront-next exists but missing dependencies at /node_modules"
        echo "[INIT] Entrypoint will regenerate project and install dependencies"
    fi
else
    echo "[INIT] ✗ No standalone project found at /workspace/storefront-next"
    echo "[INIT] Entrypoint will generate project and install dependencies"
fi

echo "[INIT] Permission fixes complete. Switching to node user..."

# Execute main entrypoint as node user
exec su-exec node /entrypoint.sh
