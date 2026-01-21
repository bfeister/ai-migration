#!/bin/bash
# pre-entrypoint.sh - Runs as root to fix volume mount permissions
# Then switches to node user and executes the main entrypoint

set -euo pipefail

echo "[INIT] Running pre-entrypoint permission fixes as root..."

# Fix volume mount ownership for anonymous volumes
# These are created as root by Docker and need to be owned by node user
if [ -d "/workspace/node_modules" ]; then
    chown -R node:node /workspace/node_modules
    echo "[INIT] Fixed /workspace/node_modules ownership"
fi

if [ -d "/workspace/storefront-next/node_modules" ]; then
    chown -R node:node /workspace/storefront-next/node_modules
    echo "[INIT] Fixed /workspace/storefront-next/node_modules ownership"
fi

if [ -d "/workspace/mcp-server/node_modules" ]; then
    chown -R node:node /workspace/mcp-server/node_modules
    echo "[INIT] Fixed /workspace/mcp-server/node_modules ownership"
fi

echo "[INIT] Permission fixes complete. Switching to node user..."

# Execute main entrypoint as node user
exec su-exec node /entrypoint.sh
