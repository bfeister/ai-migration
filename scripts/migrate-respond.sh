#!/bin/bash
set -euo pipefail

# migrate-respond.sh - Provide response to intervention request

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

INTERVENTION_FILE="intervention/needed.json"
RESPONSE_FILE="intervention/response.json"

# Check if intervention is needed
if [ ! -f "$INTERVENTION_FILE" ]; then
    echo -e "${RED}❌ No intervention needed${NC}"
    echo "No intervention/needed.json file found"
    exit 1
fi

# Get response from command line argument
if [ $# -eq 0 ]; then
    echo -e "${RED}❌ No response provided${NC}"
    echo ""
    echo "Usage: $0 \"your response\""
    echo ""
    echo "Current question:"
    cat "$INTERVENTION_FILE" | jq -r '.question'
    exit 1
fi

RESPONSE="$1"

# Get the original question timestamp for audit trail
QUESTION_TIMESTAMP=$(cat "$INTERVENTION_FILE" | jq -r '.timestamp // ""')

# Create response JSON
cat > "$RESPONSE_FILE" <<EOF
{
  "timestamp": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "response": "$RESPONSE",
  "question_timestamp": "$QUESTION_TIMESTAMP"
}
EOF

echo -e "${GREEN}✅ Response sent: \"$RESPONSE\"${NC}"
echo ""
echo "The migration worker will now continue execution."
echo "Monitor with: ./scripts/migrate-status.sh"
