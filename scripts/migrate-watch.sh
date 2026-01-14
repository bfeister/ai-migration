#!/bin/bash
set -euo pipefail

# migrate-watch.sh - Monitor for intervention requests
# This is a wrapper that calls the TypeScript implementation

# Get the directory where this script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# Check if pnpm and dependencies are installed
if [ ! -d "$SCRIPT_DIR/node_modules" ]; then
    echo "Installing dependencies..."
    cd "$SCRIPT_DIR" && pnpm install
fi

# Run the TypeScript watch script using tsx
cd "$SCRIPT_DIR" && pnpm exec tsx migrate-watch.ts
