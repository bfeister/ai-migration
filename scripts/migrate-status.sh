#!/bin/bash
set -euo pipefail

# migrate-status.sh - Display migration status (reads from filesystem)

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# Files to read (source of truth)
LOG_FILE="migration-log.md"
INTERVENTION_FILE="intervention/needed.json"

# Check if container is running
if ! docker ps -q -f name=claude-migration | grep -q .; then
    echo -e "${RED}❌ Container 'claude-migration' is not running${NC}"
    echo "Start it with: ./scripts/migrate-run.sh"
    exit 1
fi

# Header
clear
echo "╔══════════════════════════════════════════════════════════╗"
echo "║  Claude Code Migration Runner - Status                  ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""

# Container status
echo -e "${BLUE}Container Status:${NC}"
if docker ps -q -f name=claude-migration | grep -q .; then
    echo -e "  ${GREEN}● Running${NC} ($(docker ps -f name=claude-migration --format '{{.Status}}'))"
else
    echo -e "  ${RED}● Stopped${NC}"
fi
echo ""

# Check for intervention needed
if [ -f "$INTERVENTION_FILE" ]; then
    echo -e "${YELLOW}╔══════════════════════════════════════════════════════════╗${NC}"
    echo -e "${YELLOW}║  🔔 USER INTERVENTION NEEDED                            ║${NC}"
    echo -e "${YELLOW}╚══════════════════════════════════════════════════════════╝${NC}"
    echo ""

    # Parse and display intervention details
    QUESTION=$(cat "$INTERVENTION_FILE" | jq -r '.question // "No question specified"')
    CONTEXT=$(cat "$INTERVENTION_FILE" | jq -r '.context // ""')

    echo -e "${CYAN}Question:${NC}"
    echo "  $QUESTION"
    echo ""

    if [ -n "$CONTEXT" ] && [ "$CONTEXT" != "null" ]; then
        echo -e "${CYAN}Context:${NC}"
        echo "  $CONTEXT"
        echo ""
    fi

    # Display options if available
    if cat "$INTERVENTION_FILE" | jq -e '.options' > /dev/null 2>&1; then
        echo -e "${CYAN}Options:${NC}"
        cat "$INTERVENTION_FILE" | jq -r '.options[]' | awk '{print "  " NR ". " $0}'
        echo ""
    fi

    echo -e "${YELLOW}Respond with:${NC} ./scripts/migrate-respond.sh \"your answer\""
    echo ""
else
    echo -e "${GREEN}✅ No intervention needed${NC}"
    echo ""
fi

# Recent log entries (last 10 lines)
echo -e "${BLUE}Recent Activity:${NC}"
if [ -f "$LOG_FILE" ]; then
    echo "────────────────────────────────────────────────────────────"
    tail -n 10 "$LOG_FILE" | while IFS= read -r line; do
        # Color-code log lines based on content
        if [[ $line == *"[ERROR]"* ]]; then
            echo -e "${RED}${line}${NC}"
        elif [[ $line == *"[SUCCESS]"* ]]; then
            echo -e "${GREEN}${line}${NC}"
        elif [[ $line == *"[WARNING]"* ]]; then
            echo -e "${YELLOW}${line}${NC}"
        else
            echo "$line"
        fi
    done
    echo "────────────────────────────────────────────────────────────"
    echo ""
    echo -e "${CYAN}View full log:${NC} tail -f $LOG_FILE"
else
    echo "  No log file found yet"
fi
echo ""

# Intervention history count
if [ -d "intervention/history" ]; then
    HISTORY_COUNT=$(ls -1 intervention/history/*-needed.json 2>/dev/null | wc -l | tr -d ' ')
    echo -e "${BLUE}Interventions Handled:${NC} $HISTORY_COUNT"
fi

echo ""
echo -e "${CYAN}Commands:${NC}"
echo "  Live watch:  watch -n 2 ./scripts/migrate-status.sh"
echo "  Enter shell: docker exec -it claude-migration bash"
echo "  Stop:        docker stop claude-migration"
