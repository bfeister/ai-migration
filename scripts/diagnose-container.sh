#!/usr/bin/env bash
# diagnose-container.sh - Diagnose container process state

set -euo pipefail

CONTAINER_NAME="${1:-claude-migration-demo}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${CYAN}Container Process Diagnostics: $CONTAINER_NAME${NC}"
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Check if container is running
if ! docker ps -q -f name="$CONTAINER_NAME" | grep -q .; then
    echo -e "${RED}Container is not running${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Container is running${NC}"
echo ""

# 1. Show all relevant processes
echo -e "${BLUE}=== Running Processes ===${NC}"
docker exec -u node "$CONTAINER_NAME" ps aux | grep -E "PID|npx|node|pnpm|claude|entrypoint" | grep -v "grep" || echo "No processes found"
echo ""

# 2. Find the main work process (if any)
echo -e "${BLUE}=== Main Work Process ===${NC}"
WORK_PID=$(docker exec -u node "$CONTAINER_NAME" ps aux | grep -E "create-storefront|pnpm install|pnpm build|claude code" | grep -v grep | head -1 | awk '{print $1}' || echo "")

if [ -z "$WORK_PID" ]; then
    echo -e "${YELLOW}No active work process found${NC}"
    echo ""
else
    echo -e "${GREEN}Found work process: PID $WORK_PID${NC}"
    echo ""
    
    # 3. Check process state
    echo -e "${BLUE}=== Process State (PID $WORK_PID) ===${NC}"
    docker exec -u node "$CONTAINER_NAME" bash -c "cat /proc/$WORK_PID/status | grep -E 'State|Threads|VmSize|VmRSS'" 2>/dev/null || echo "Cannot read process status"
    echo ""
    
    # 4. Check file descriptors (especially stdin)
    echo -e "${BLUE}=== File Descriptors (PID $WORK_PID) ===${NC}"
    echo "Checking stdin/stdout/stderr connections..."
    docker exec -u node "$CONTAINER_NAME" bash -c "ls -l /proc/$WORK_PID/fd 2>/dev/null | head -10" || echo "Cannot read file descriptors"
    echo ""
    
    # Highlight if stdin is connected to terminal
    if docker exec -u node "$CONTAINER_NAME" bash -c "ls -l /proc/$WORK_PID/fd/0 2>/dev/null | grep -q '/dev/pts'"; then
        echo -e "${YELLOW}⚠ WARNING: stdin (fd 0) is connected to terminal - process may wait for input!${NC}"
        echo ""
    fi
    
    # 5. Check command line
    echo -e "${BLUE}=== Command Line (PID $WORK_PID) ===${NC}"
    docker exec -u node "$CONTAINER_NAME" bash -c "cat /proc/$WORK_PID/cmdline 2>/dev/null | tr '\\0' ' '" || echo "Cannot read command line"
    echo ""
    echo ""
fi

# 6. Check recent file activity
echo -e "${BLUE}=== Recent File Activity ===${NC}"
echo "Files modified in last 1 minute:"
WORKSPACE_COUNT=$(docker exec -u node "$CONTAINER_NAME" bash -c "find /workspace/storefront-next -type f -mmin -1 2>/dev/null | wc -l" || echo "0")
NODE_MODULES_COUNT=$(docker exec -u node "$CONTAINER_NAME" bash -c "find /node_modules -maxdepth 2 -type f -mmin -1 2>/dev/null | wc -l" || echo "0")
echo -e "  /workspace/storefront-next: ${GREEN}$WORKSPACE_COUNT files${NC}"
echo -e "  /node_modules: ${GREEN}$NODE_MODULES_COUNT files${NC}"

if [ "$WORKSPACE_COUNT" -eq 0 ] && [ "$NODE_MODULES_COUNT" -eq 0 ]; then
    echo -e "${YELLOW}⚠ No recent file activity - process may be hung${NC}"
fi
echo ""

# 7. Show last few log lines
echo -e "${BLUE}=== Recent Container Logs (last 10 lines) ===${NC}"
docker logs "$CONTAINER_NAME" 2>&1 | tail -10
echo ""

echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${CYAN}Diagnostics Complete${NC}"
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Suggestions
if [ -n "$WORK_PID" ]; then
    echo -e "${BLUE}Useful commands:${NC}"
    echo "  Kill hung process:   docker exec -u node $CONTAINER_NAME kill -9 $WORK_PID"
    echo "  Follow live logs:    docker logs -f $CONTAINER_NAME"
    echo "  Shell access:        docker exec -it -u node $CONTAINER_NAME bash"
fi
