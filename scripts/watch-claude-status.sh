#!/usr/bin/env bash
# watch-claude-status.sh - Continuous monitoring with intervention alerts
#
# Usage:
#   ./scripts/watch-claude-status.sh              # Watch with dashboard
#   ./scripts/watch-claude-status.sh --stream     # Stream output only
#   ./scripts/watch-claude-status.sh --alert      # Alert on intervention needed

set -euo pipefail

MODE="${1:-watch}"
CONTAINER_NAME="claude-migration-demo"
WORKSPACE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

# Track previous state to detect changes
PREV_STATE=""

show_intervention() {
    local intervention_file="$1"

    echo ""
    echo -e "${BOLD}${RED}╔═══════════════════════════════════════════════════════╗${NC}"
    echo -e "${BOLD}${RED}║         🚨 USER INTERVENTION REQUIRED 🚨            ║${NC}"
    echo -e "${BOLD}${RED}╚═══════════════════════════════════════════════════════╝${NC}"
    echo ""

    # Read intervention file
    local question=$(jq -r '.question' "$intervention_file" 2>/dev/null || echo "Unknown")
    local options=$(jq -r '.options[]' "$intervention_file" 2>/dev/null || echo "")
    local context=$(jq -r '.context // "No context provided"' "$intervention_file" 2>/dev/null)
    local worker_id=$(jq -r '.worker_id' "$intervention_file" 2>/dev/null || echo "unknown")

    echo -e "${CYAN}Question:${NC} $question"
    echo ""
    echo -e "${CYAN}Context:${NC} $context"
    echo ""
    echo -e "${CYAN}Options:${NC}"

    local i=1
    while IFS= read -r option; do
        echo -e "  ${YELLOW}[$i]${NC} $option"
        ((i++))
    done <<< "$options"

    echo ""
    echo -e "${BOLD}To respond, create:${NC}"
    echo -e "${GREEN}intervention/response-${worker_id}.json${NC}"
    echo ""
    echo -e "${CYAN}Example:${NC}"
    echo -e "cat > intervention/response-${worker_id}.json <<EOF"
    echo -e "{"
    echo -e '  "response": "your choice here",'
    echo -e "  \"timestamp\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\""
    echo -e "}"
    echo -e "EOF"
    echo ""

    # Bell notification
    echo -e "\a"
}

stream_mode() {
    echo -e "${BLUE}Streaming Claude Code output (Ctrl+C to stop)...${NC}"
    echo ""

    if [ -f "$WORKSPACE_ROOT/claude-output.log" ]; then
        tail -f "$WORKSPACE_ROOT/claude-output.log"
    else
        echo -e "${YELLOW}Waiting for claude-output.log to be created...${NC}"
        while [ ! -f "$WORKSPACE_ROOT/claude-output.log" ]; do
            sleep 1
        done
        tail -f "$WORKSPACE_ROOT/claude-output.log"
    fi
}

watch_mode() {
    echo -e "${BLUE}${BOLD}Claude Code Status Monitor${NC}"
    echo -e "${BLUE}Press Ctrl+C to stop${NC}"
    echo ""

    while true; do
        clear

        echo -e "${BLUE}${BOLD}╔═══════════════════════════════════════════════════════╗${NC}"
        echo -e "${BLUE}${BOLD}║          Claude Code Status Monitor                 ║${NC}"
        echo -e "${BLUE}${BOLD}╚═══════════════════════════════════════════════════════╝${NC}"
        echo ""

        # Get current state
        STATE=$("$WORKSPACE_ROOT/scripts/detect-claude-state.sh" "$CONTAINER_NAME" 2>/dev/null || echo "ERROR")

        # Show state with icon
        echo -n "Status: "
        case "$STATE" in
            RUNNING)
                echo -e "${GREEN}● RUNNING${NC} - Claude is actively working"
                ;;
            WAITING_INPUT)
                echo -e "${RED}⏸ WAITING FOR USER INPUT${NC}"
                ;;
            WAITING_API)
                echo -e "${YELLOW}⏳ WAITING FOR API${NC} - Claude is thinking"
                ;;
            IDLE)
                echo -e "${CYAN}○ IDLE${NC} - Between operations"
                ;;
            NOT_RUNNING)
                echo -e "${RED}✗ NOT RUNNING${NC}"
                ;;
            ERROR)
                echo -e "${RED}✗ ERROR${NC} - Cannot determine state"
                ;;
        esac

        echo ""

        # Check for intervention if state changed to WAITING_INPUT
        if [ "$STATE" = "WAITING_INPUT" ] && [ "$PREV_STATE" != "WAITING_INPUT" ]; then
            # Find intervention file
            INTERVENTION_FILE=$(find "$WORKSPACE_ROOT/intervention" -name "needed-*.json" -type f 2>/dev/null | head -1)
            if [ -n "$INTERVENTION_FILE" ]; then
                show_intervention "$INTERVENTION_FILE"
            fi
        fi

        PREV_STATE="$STATE"

        # Show recent output (last 15 lines)
        echo -e "${CYAN}Recent Output:${NC}"
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        if [ -f "$WORKSPACE_ROOT/claude-output.log" ]; then
            tail -15 "$WORKSPACE_ROOT/claude-output.log" 2>/dev/null || echo "(no output yet)"
        else
            echo "(log file not created yet)"
        fi
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

        echo ""
        echo -e "${BLUE}[Updating every 2 seconds...]${NC}"

        sleep 2
    done
}

alert_mode() {
    echo -e "${BLUE}Monitoring for intervention requests (Ctrl+C to stop)...${NC}"
    echo ""

    ALERTED=false

    while true; do
        STATE=$("$WORKSPACE_ROOT/scripts/detect-claude-state.sh" "$CONTAINER_NAME" 2>/dev/null || echo "ERROR")

        if [ "$STATE" = "WAITING_INPUT" ] && [ "$ALERTED" = false ]; then
            # Find intervention file
            INTERVENTION_FILE=$(find "$WORKSPACE_ROOT/intervention" -name "needed-*.json" -type f 2>/dev/null | head -1)
            if [ -n "$INTERVENTION_FILE" ]; then
                show_intervention "$INTERVENTION_FILE"
                ALERTED=true
            fi
        elif [ "$STATE" != "WAITING_INPUT" ]; then
            ALERTED=false
        fi

        # Brief status line
        case "$STATE" in
            RUNNING|WAITING_API)
                echo -ne "\r${GREEN}●${NC} Claude is working...  "
                ;;
            IDLE)
                echo -ne "\r${CYAN}○${NC} Claude idle          "
                ;;
            WAITING_INPUT)
                echo -ne "\r${RED}⏸${NC} Waiting for input    "
                ;;
            NOT_RUNNING)
                echo -ne "\r${RED}✗${NC} Not running          "
                ;;
        esac

        sleep 2
    done
}

# Main
case "$MODE" in
    --stream|-s)
        stream_mode
        ;;
    --alert|-a)
        alert_mode
        ;;
    --watch|-w|watch)
        watch_mode
        ;;
    *)
        echo "Usage: $0 [--watch|--stream|--alert]"
        echo ""
        echo "Modes:"
        echo "  --watch   Dashboard with status and recent output (default)"
        echo "  --stream  Stream Claude's output in real-time"
        echo "  --alert   Alert when user intervention is needed"
        exit 1
        ;;
esac
