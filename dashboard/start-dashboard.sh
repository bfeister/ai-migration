#!/usr/bin/env bash
# start-dashboard.sh - Start the migration dashboard

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo ""
echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║            Migration Dashboard - Starting...               ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Check if node_modules exists
if [ ! -d "$SCRIPT_DIR/node_modules" ]; then
    echo -e "${YELLOW}Dependencies not installed. Installing now...${NC}"
    echo ""
    cd "$SCRIPT_DIR"
    pnpm install
    echo ""
fi

# Start server
echo -e "${GREEN}Starting dashboard server...${NC}"
echo ""
cd "$SCRIPT_DIR"
node server.js
