#!/usr/bin/env bash
# observe-claude.sh - Real-time observation of Claude Code process in container
#
# Usage:
#   ./scripts/observe-claude.sh          # Run once
#   ./scripts/observe-claude.sh --watch  # Continuous updates every 2 seconds
#   ./scripts/observe-claude.sh -w       # Same as --watch

set -euo pipefail

# Check for watch mode
WATCH_MODE=false
if [ "${1:-}" = "--watch" ] || [ "${1:-}" = "-w" ]; then
    WATCH_MODE=true
fi

CONTAINER="claude-migration-demo"
WORKSPACE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

# Main observation function
observe() {
echo -e "${BLUE}=== Container Status ===${NC}"
if docker ps -q -f name=$CONTAINER >/dev/null 2>&1; then
    docker ps -a --filter name=$CONTAINER --format "Status: {{.Status}}"
else
    echo -e "${RED}Container not running${NC}"
    exit 0
fi

echo -e "\n${BLUE}=== Claude Code Process ===${NC}"
if docker exec -u node $CONTAINER sh -c "ps aux | grep claude | grep -v grep" 2>/dev/null; then
    echo -e "${GREEN}Running${NC}"
else
    echo -e "${YELLOW}Not running${NC}"
fi

echo -e "\n${BLUE}=== Recent Log Output (last 20 lines) ===${NC}"
docker exec -u node $CONTAINER tail -20 /tmp/migration-loop.log 2>/dev/null || echo "No log yet"

echo -e "\n${BLUE}=== Open Files ===${NC}"
CLAUDE_PID=$(docker exec -u node $CONTAINER pgrep claude 2>/dev/null || echo "")
if [ -n "$CLAUDE_PID" ]; then
    echo -e "${GREEN}Claude PID: $CLAUDE_PID${NC}"
    docker exec -u node $CONTAINER sh -c "ls -l /proc/$CLAUDE_PID/fd 2>/dev/null" | head -10
else
    echo -e "${YELLOW}Claude not running${NC}"
fi

echo -e "\n${BLUE}=== Migration Log Status ===${NC}"
if [ -f "$WORKSPACE_ROOT/migration-log.md" ]; then
    LAST_MODIFIED=$(stat -f "%Sm" -t "%Y-%m-%d %H:%M:%S" "$WORKSPACE_ROOT/migration-log.md")
    echo "Last updated: $LAST_MODIFIED"
    echo "Last 5 lines:"
    tail -5 "$WORKSPACE_ROOT/migration-log.md"
else
    echo "No migration log yet"
fi

echo -e "\n${BLUE}=== Pending Interventions ===${NC}"
INTERVENTIONS=$(find "$WORKSPACE_ROOT/intervention" -name "needed-*.json" -type f 2>/dev/null || echo "")
if [ -n "$INTERVENTIONS" ]; then
    echo -e "${YELLOW}Intervention files found:${NC}"
    echo "$INTERVENTIONS"
else
    echo -e "${GREEN}None${NC}"
fi

echo -e "\n${BLUE}=== Dev Server Status ===${NC}"
if docker exec -u node $CONTAINER sh -c "curl -s -o /dev/null -w '%{http_code}' http://localhost:5173 2>/dev/null" | grep -q "200\|404"; then
    echo -e "${GREEN}Dev server responding${NC}"
elif docker exec -u node $CONTAINER pgrep -f "vite\|sfnext" >/dev/null 2>&1; then
    echo -e "${YELLOW}Dev server process running (may be starting up)${NC}"
else
    echo -e "${RED}Dev server not running${NC}"
fi
}

# Run in watch mode or once
if [ "$WATCH_MODE" = true ]; then
    echo "Watching Claude Code (press Ctrl+C to stop)..."
    echo ""
    while true; do
        clear
        observe
        echo ""
        echo -e "${BLUE}[Updating every 2 seconds...]${NC}"
        sleep 2
    done
else
    observe
fi
