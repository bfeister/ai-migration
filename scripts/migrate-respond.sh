#!/bin/bash
set -euo pipefail

# migrate-respond.sh - Provide response to intervention request
# Phase 2: Supports worker-id and multi-file intervention pattern

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

INTERVENTION_DIR="${INTERVENTION_DIR:-intervention}"

# Usage
show_usage() {
    echo "Usage: $0 <worker-id> <response>"
    echo ""
    echo "Examples:"
    echo "  $0 worker-1 \"JWT\""
    echo "  $0 home \"Use session-based auth\""
    echo ""
    echo "Available interventions:"
    if [ -d "$INTERVENTION_DIR" ]; then
        local found=false
        for file in "$INTERVENTION_DIR"/needed-*.json; do
            if [ -f "$file" ]; then
                found=true
                local worker_id=$(basename "$file" | sed 's/needed-\(.*\)\.json/\1/')
                local question=$(jq -r '.question // "No question"' "$file" 2>/dev/null)
                echo -e "  ${CYAN}$worker_id${NC}: $question"
            fi
        done
        if [ "$found" = false ]; then
            echo "  (none)"
        fi
    else
        echo "  (intervention directory not found)"
    fi
}

# Check arguments
if [ $# -lt 2 ]; then
    echo -e "${RED}❌ Missing required arguments${NC}"
    echo ""
    show_usage
    exit 1
fi

WORKER_ID="$1"
RESPONSE="$2"

# Validate worker_id (alphanumeric, hyphens, underscores only)
if [[ ! "$WORKER_ID" =~ ^[a-zA-Z0-9_-]+$ ]]; then
    echo -e "${RED}❌ Invalid worker ID${NC}"
    echo "Worker ID must contain only letters, numbers, hyphens, and underscores"
    exit 1
fi

INTERVENTION_FILE="$INTERVENTION_DIR/needed-${WORKER_ID}.json"
RESPONSE_FILE="$INTERVENTION_DIR/response-${WORKER_ID}.json"

# Check if intervention exists
if [ ! -f "$INTERVENTION_FILE" ]; then
    echo -e "${RED}❌ No intervention found for worker: $WORKER_ID${NC}"
    echo "Expected file: $INTERVENTION_FILE"
    echo ""
    show_usage
    exit 1
fi

# Check if response already exists and is processed
if [ -f "$RESPONSE_FILE" ]; then
    IS_PROCESSED=$(jq -r '.processed // false' "$RESPONSE_FILE" 2>/dev/null)
    if [ "$IS_PROCESSED" = "true" ]; then
        echo -e "${YELLOW}⚠️  Warning: This intervention was already processed${NC}"
        echo -e "${YELLOW}Creating new response anyway...${NC}"
        echo ""
    else
        echo -e "${YELLOW}⚠️  Warning: Response file already exists (not yet processed)${NC}"
        echo -e "${YELLOW}Overwriting with new response...${NC}"
        echo ""
    fi
fi

# Get the original question for display and audit
QUESTION=$(jq -r '.question // "No question"' "$INTERVENTION_FILE" 2>/dev/null)
QUESTION_TIMESTAMP=$(jq -r '.timestamp // ""' "$INTERVENTION_FILE" 2>/dev/null)

# Display what we're responding to
echo -e "${CYAN}Question:${NC} $QUESTION"
echo -e "${CYAN}Worker ID:${NC} $WORKER_ID"
echo -e "${CYAN}Your response:${NC} $RESPONSE"
echo ""

# Create response JSON with proper escaping using jq
jq -n \
  --arg timestamp "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" \
  --arg response "$RESPONSE" \
  --arg question_timestamp "$QUESTION_TIMESTAMP" \
  --arg intervention_id "needed-${WORKER_ID}" \
  '{
    timestamp: $timestamp,
    response: $response,
    question_timestamp: $question_timestamp,
    intervention_id: $intervention_id,
    processed: false
  }' > "$RESPONSE_FILE"

echo -e "${GREEN}✅ Response saved to: $RESPONSE_FILE${NC}"
echo ""
echo "The MCP server will:"
echo "  1. Detect this response file"
echo "  2. Return the response to Claude"
echo "  3. Mark as processed: true"
echo ""
echo "Files will persist in intervention/ directory for audit trail."
