#!/bin/bash
set -euo pipefail

# migrate-watch.sh - Monitor for intervention requests

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

INTERVENTION_FILE="intervention/needed.json"

echo -e "${CYAN}Monitoring for intervention requests...${NC}"
echo "Press Ctrl+C to stop"
echo ""

# Track if we've already notified about current intervention
LAST_INTERVENTION=""

while true; do
    if [ -f "$INTERVENTION_FILE" ]; then
        # Get timestamp to detect if this is a new intervention
        CURRENT_INTERVENTION=$(stat -f "%m" "$INTERVENTION_FILE" 2>/dev/null || stat -c "%Y" "$INTERVENTION_FILE" 2>/dev/null)

        # Only notify if this is a new intervention
        if [ "$CURRENT_INTERVENTION" != "$LAST_INTERVENTION" ]; then
            LAST_INTERVENTION="$CURRENT_INTERVENTION"

            # Alert
            echo ""
            echo -e "${YELLOW}╔══════════════════════════════════════════════════════════╗${NC}"
            echo -e "${YELLOW}║  🔔 USER INTERVENTION NEEDED                            ║${NC}"
            echo -e "${YELLOW}╚══════════════════════════════════════════════════════════╝${NC}"
            echo ""

            # Display question
            QUESTION=$(cat "$INTERVENTION_FILE" | jq -r '.question // "No question specified"')
            echo -e "${CYAN}Question:${NC}"
            echo "  $QUESTION"
            echo ""

            # Display context if available
            CONTEXT=$(cat "$INTERVENTION_FILE" | jq -r '.context // ""')
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

            # Show response command
            echo -e "${YELLOW}Respond with:${NC} ./scripts/migrate-respond.sh \"your answer\""
            echo ""
            echo -e "${CYAN}Waiting for response... (checking every 2s)${NC}"

            # Optional: System notification (macOS)
            if command -v osascript &> /dev/null; then
                osascript -e "display notification \"$QUESTION\" with title \"Migration Intervention Needed\""
            fi
        fi

        # While waiting, give periodic feedback
        if [ -n "$LAST_INTERVENTION" ]; then
            # Check if response.json exists
            if [ -f "intervention/response.json" ]; then
                echo -e "${GREEN}  → Response file detected, waiting for container to process...${NC}"
            fi
        fi
    else
        # Clear the last intervention tracking when file is removed
        if [ -n "$LAST_INTERVENTION" ]; then
            echo ""
            echo -e "${GREEN}╔══════════════════════════════════════════════════════════╗${NC}"
            echo -e "${GREEN}║  ✅ Intervention resolved and archived                  ║${NC}"
            echo -e "${GREEN}╚══════════════════════════════════════════════════════════╝${NC}"
            echo ""
            LAST_INTERVENTION=""
        fi
    fi

    sleep 2
done
