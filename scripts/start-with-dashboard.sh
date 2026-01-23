#!/usr/bin/env bash
# start-with-dashboard.sh - Launch migration loop with dashboard monitoring

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKSPACE_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DASHBOARD_DIR="$WORKSPACE_ROOT/dashboard"

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

echo ""
echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║    Migration Loop with Dashboard Monitoring               ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Check if dashboard dependencies are installed
if [ ! -d "$DASHBOARD_DIR/node_modules" ]; then
    echo -e "${YELLOW}Installing dashboard dependencies...${NC}"
    cd "$DASHBOARD_DIR"
    pnpm install
    echo ""
fi

# Start dashboard in background
echo -e "${GREEN}Starting dashboard server...${NC}"
cd "$DASHBOARD_DIR"
node server.js > "$WORKSPACE_ROOT/dashboard.log" 2>&1 &
DASHBOARD_PID=$!

# Wait for dashboard to start
sleep 2

# Check if dashboard is running
if ! kill -0 $DASHBOARD_PID 2>/dev/null; then
    echo -e "${YELLOW}Dashboard failed to start. Check dashboard.log${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Dashboard started (PID: $DASHBOARD_PID)${NC}"
echo -e "${CYAN}  🌐 Dashboard URL: http://localhost:3030${NC}"
echo -e "${CYAN}  📋 Logs: $WORKSPACE_ROOT/dashboard.log${NC}"
echo ""

# Try to open browser
if command -v open &> /dev/null; then
    echo -e "${BLUE}Opening dashboard in browser...${NC}"
    sleep 1
    open "http://localhost:3030"
    echo ""
elif command -v xdg-open &> /dev/null; then
    echo -e "${BLUE}Opening dashboard in browser...${NC}"
    sleep 1
    xdg-open "http://localhost:3030"
    echo ""
else
    echo -e "${YELLOW}Please open http://localhost:3030 in your browser${NC}"
    echo ""
fi

# Function to cleanup on exit
cleanup() {
    echo ""
    echo -e "${YELLOW}Shutting down dashboard...${NC}"
    if kill -0 $DASHBOARD_PID 2>/dev/null; then
        kill $DASHBOARD_PID 2>/dev/null || true
    fi
    echo -e "${GREEN}Dashboard stopped${NC}"
    exit 0
}

trap cleanup EXIT INT TERM

# Ask user if they want to start migration loop
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo "Options:"
echo "  1. Start migration loop now"
echo "  2. Keep dashboard running (start migration manually later)"
echo ""
read -p "Choose [1/2]: " choice
echo ""

if [ "$choice" = "1" ]; then
    echo -e "${GREEN}Starting migration loop...${NC}"
    echo -e "${CYAN}Monitor progress at: http://localhost:3030${NC}"
    echo ""
    cd "$WORKSPACE_ROOT"
    exec "$SCRIPT_DIR/demo-migration-loop.sh"
else
    echo -e "${GREEN}Dashboard is running at: ${CYAN}http://localhost:3030${NC}"
    echo ""
    echo "To start migration loop, run in another terminal:"
    echo -e "${CYAN}  cd $WORKSPACE_ROOT${NC}"
    echo -e "${CYAN}  ./scripts/demo-migration-loop.sh${NC}"
    echo ""
    echo -e "${YELLOW}Press Ctrl+C to stop dashboard${NC}"
    echo ""

    # Keep dashboard running until user interrupts
    while true; do
        sleep 1
    done
fi
