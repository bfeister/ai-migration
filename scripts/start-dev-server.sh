#!/usr/bin/env bash
# start-dev-server.sh - Start dev server in monorepo location
#
# This script starts the dev server in the monorepo location where
# all dependencies are properly installed.

set -euo pipefail

MONOREPO_APP="/tmp/SFCC-Odyssey/packages/template-retail-rsc-app"
CLI_PATH="/tmp/SFCC-Odyssey/packages/storefront-next-dev/dist/cli.js"
LOG_FILE="${1:-/tmp/dev-server.log}"
PID_FILE="${2:-/tmp/dev-server.pid}"

# Sync workspace src to monorepo (ensure latest code)
echo "Syncing workspace code to monorepo..."
cp -r /workspace/storefront-next/src/* "$MONOREPO_APP/src/" 2>/dev/null || true

# Kill any existing dev server
pkill -f "storefront-next-dev.*cli.js dev" 2>/dev/null || true
sleep 1

# Start dev server
cd "$MONOREPO_APP"
node "$CLI_PATH" dev > "$LOG_FILE" 2>&1 &
DEV_PID=$!
echo $DEV_PID > "$PID_FILE"

echo "Started dev server with PID: $DEV_PID"
echo "Log file: $LOG_FILE"

# Wait for server to be ready (up to 60 seconds)
for i in {1..60}; do
  if [ ! -d /proc/$DEV_PID ]; then
    echo "ERROR: Dev server process died"
    echo "Last 30 lines of log:"
    tail -30 "$LOG_FILE"
    exit 1
  fi

  # Check if server is responding
  if curl -s http://localhost:5173 > /dev/null 2>&1; then
    echo "✅ Dev server ready on port 5173"
    exit 0
  fi

  sleep 1
done

echo "ERROR: Timeout waiting for dev server"
echo "Last 40 lines of log:"
tail -40 "$LOG_FILE"
exit 1
