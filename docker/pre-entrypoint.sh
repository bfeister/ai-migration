#!/bin/bash
# pre-entrypoint.sh - Runs as root to fix volume mount permissions
# Then switches to node user and executes the main entrypoint

set -euo pipefail

echo "[INIT] Running pre-entrypoint permission fixes as root..."

# Fix volume mount ownership for host-mounted directories
# Dependencies installed on host need to be readable/writable by node user
if [ -d "/workspace/storefront-next/node_modules" ]; then
    # Fix ownership recursively but preserve structure
    # Only change if not already owned by node
    if [ "$(stat -c '%u' /workspace/storefront-next/node_modules 2>/dev/null || stat -f '%u' /workspace/storefront-next/node_modules)" != "1000" ]; then
        echo "[INIT] Fixing /workspace/storefront-next/node_modules ownership..."
        chown -R node:node /workspace/storefront-next/node_modules
        echo "[INIT] Fixed /workspace/storefront-next/node_modules ownership"
    else
        echo "[INIT] /workspace/storefront-next/node_modules already owned by node"
    fi
fi

if [ -d "/workspace/mcp-server/node_modules" ]; then
    if [ "$(stat -c '%u' /workspace/mcp-server/node_modules 2>/dev/null || stat -f '%u' /workspace/mcp-server/node_modules)" != "1000" ]; then
        echo "[INIT] Fixing /workspace/mcp-server/node_modules ownership..."
        chown -R node:node /workspace/mcp-server/node_modules
        echo "[INIT] Fixed /workspace/mcp-server/node_modules ownership"
    else
        echo "[INIT] /workspace/mcp-server/node_modules already owned by node"
    fi
fi

# Check standalone storefront project (should be generated on HOST)
echo "[INIT] Checking standalone storefront project..."

if [ -d "/workspace/storefront-next" ] && [ -f "/workspace/storefront-next/package.json" ]; then
    # Check if it's a standalone project (has node_modules with sfnext)
    if [ -d "/workspace/storefront-next/node_modules/.bin" ] && [ -f "/workspace/storefront-next/node_modules/.bin/sfnext" ]; then
        echo "[INIT] ✓ Standalone storefront project exists"

        # Fix ownership if needed
        if [ "$(stat -c '%u' /workspace/storefront-next/node_modules 2>/dev/null || stat -f '%u' /workspace/storefront-next/node_modules)" != "1000" ]; then
            echo "[INIT] Fixing /workspace/storefront-next ownership..."
            chown -R node:node /workspace/storefront-next
            echo "[INIT] ✓ Ownership fixed"
        else
            echo "[INIT] ✓ Ownership already correct"
        fi
    else
        echo "[INIT] ✗ storefront-next exists but missing node_modules or sfnext CLI"
        echo "[INIT] Please run: ./scripts/generate-standalone-project.sh on HOST"
        echo "[INIT] Container will continue, but dev server will not work"
    fi
else
    echo "[INIT] ✗ No standalone project found at /workspace/storefront-next"
    echo "[INIT] Please run: ./scripts/generate-standalone-project.sh on HOST"
    echo "[INIT] This generates the project WITH dependencies to avoid Docker limits"
    echo "[INIT] Container will continue, but dev server will not work"
fi

echo "[INIT] Permission fixes complete. Switching to node user..."

# Execute main entrypoint as node user
exec su-exec node /entrypoint.sh
