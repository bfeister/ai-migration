#!/usr/bin/env bash
# detect-claude-state.sh - Detect Claude Code process state
#
# Returns one of:
#   RUNNING         - Claude is actively executing
#   WAITING_INPUT   - Claude is waiting for user intervention
#   WAITING_API     - Claude is waiting for API response
#   IDLE            - Claude is between operations (normal)
#   NOT_RUNNING     - Claude process not found
#   ERROR           - Cannot determine state

set -euo pipefail

CONTAINER_NAME="${1:-claude-migration-demo}"
WORKSPACE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# Check if container is running
if ! docker ps -q -f name="$CONTAINER_NAME" >/dev/null 2>&1; then
    echo "NOT_RUNNING"
    exit 0
fi

# Get Claude PID
CLAUDE_PID=$(docker exec -u node "$CONTAINER_NAME" pgrep -x claude 2>/dev/null || echo "")

if [ -z "$CLAUDE_PID" ]; then
    echo "NOT_RUNNING"
    exit 0
fi

# Get process state from /proc filesystem (most reliable)
PROC_STATE=$(docker exec -u node "$CONTAINER_NAME" sh -c "cat /proc/$CLAUDE_PID/stat 2>/dev/null | cut -d' ' -f3" || echo "")

if [ -z "$PROC_STATE" ]; then
    echo "ERROR"
    exit 1
fi

# Check for intervention files
INTERVENTION_NEEDED=$(docker exec -u node "$CONTAINER_NAME" sh -c "ls /workspace/intervention/needed-*.json 2>/dev/null" || echo "")
INTERVENTION_RESPONSE=$(docker exec -u node "$CONTAINER_NAME" sh -c "ls /workspace/intervention/response-*.json 2>/dev/null" || echo "")

# Check MCP server process
MCP_PID=$(docker exec -u node "$CONTAINER_NAME" pgrep -f "intervention-server" 2>/dev/null || echo "")

# Check last output timestamp (if log exists)
# BusyBox stat uses different format than GNU stat
LAST_OUTPUT_TIME=0
if docker exec -u node "$CONTAINER_NAME" test -f /workspace/claude-output.log 2>/dev/null; then
    # BusyBox stat doesn't have -c, use different approach
    LAST_OUTPUT_TIME=$(docker exec -u node "$CONTAINER_NAME" sh -c "date -r /workspace/claude-output.log +%s 2>/dev/null || stat -c %Y /workspace/claude-output.log 2>/dev/null || echo 0")
fi
CURRENT_TIME=$(date +%s)
IDLE_SECONDS=$((CURRENT_TIME - LAST_OUTPUT_TIME))

# Determine state based on multiple signals

# Signal 1: Intervention file exists without response
if [ -n "$INTERVENTION_NEEDED" ] && [ -z "$INTERVENTION_RESPONSE" ]; then
    echo "WAITING_INPUT"
    if [ "${2:-}" = "--verbose" ]; then
        echo -e "${YELLOW}Claude is waiting for user intervention${NC}" >&2
        echo -e "${CYAN}File: $INTERVENTION_NEEDED${NC}" >&2
        echo -e "${CYAN}Create response: intervention/response-*.json${NC}" >&2
    fi
    exit 0
fi

# Signal 2: Process state is 'D' (uninterruptible sleep = IO/network wait)
if [[ "$PROC_STATE" == "D" ]]; then
    # Likely waiting for API response or disk IO
    echo "WAITING_API"
    if [ "${2:-}" = "--verbose" ]; then
        echo -e "${BLUE}Claude is waiting (likely API call)${NC}" >&2
    fi
    exit 0
fi

# Signal 3: Process state is 'S' (interruptible sleep) and idle > 5 seconds
if [[ "$PROC_STATE" == "S"* ]] && [ "$IDLE_SECONDS" -gt 5 ]; then
    # Check if MCP server is running (indicates waiting for tool call)
    if [ -n "$MCP_PID" ]; then
        # MCP server active but no intervention file - might be stuck
        echo "IDLE"
        if [ "${2:-}" = "--verbose" ]; then
            echo -e "${YELLOW}Claude idle for ${IDLE_SECONDS}s${NC}" >&2
            echo -e "${CYAN}MCP server running (PID: $MCP_PID)${NC}" >&2
        fi
        exit 0
    fi

    echo "IDLE"
    if [ "${2:-}" = "--verbose" ]; then
        echo -e "${GREEN}Claude idle (normal between operations)${NC}" >&2
    fi
    exit 0
fi

# Signal 4: Process state is 'R' (running)
if [[ "$PROC_STATE" == "R"* ]]; then
    echo "RUNNING"
    if [ "${2:-}" = "--verbose" ]; then
        echo -e "${GREEN}Claude is actively running${NC}" >&2
    fi
    exit 0
fi

# Signal 5: Process state is 'S' but recent activity
if [[ "$PROC_STATE" == "S"* ]] && [ "$IDLE_SECONDS" -le 5 ]; then
    echo "RUNNING"
    if [ "${2:-}" = "--verbose" ]; then
        echo -e "${GREEN}Claude is running (recent output)${NC}" >&2
    fi
    exit 0
fi

# Fallback
echo "IDLE"
if [ "${2:-}" = "--verbose" ]; then
    echo -e "${YELLOW}State: $PROC_STATE, Idle: ${IDLE_SECONDS}s${NC}" >&2
fi
exit 0
