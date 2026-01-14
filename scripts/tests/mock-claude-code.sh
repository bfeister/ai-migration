#!/bin/bash
# mock-claude-code.sh - Simulates Claude Code CLI behavior for testing
# This script mimics what the real Claude Code CLI does:
# 1. Starts execution
# 2. Gets "stuck" and needs user input
# 3. Creates an intervention file
# 4. Waits for response
# 5. Reads response and continues

set -euo pipefail

# Colors
GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
NC='\033[0m'

WORKER_ID="${1:-mock-worker}"
INTERVENTION_DIR="${2:-intervention}"

echo -e "${CYAN}🤖 Mock Claude Code: Starting execution (worker: $WORKER_ID)${NC}"
sleep 1

# Simulate some processing
echo -e "${CYAN}🤖 Mock Claude Code: Analyzing codebase...${NC}"
sleep 1

echo -e "${CYAN}🤖 Mock Claude Code: Generating changes...${NC}"
sleep 1

# SIMULATE: Claude Code gets stuck and needs user input
echo -e "${YELLOW}🤖 Mock Claude Code: Need user input! Creating intervention file...${NC}"

TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
INTERVENTION_FILE="$INTERVENTION_DIR/needed-$WORKER_ID.json"

cat > "$INTERVENTION_FILE" <<EOF
{
  "timestamp": "$TIMESTAMP",
  "question": "Mock Claude Question: Should I use TypeScript strict mode?",
  "options": ["Yes", "No", "Ask me later"],
  "context": "This is a simulated intervention from mock Claude Code CLI",
  "worker_id": "$WORKER_ID"
}
EOF

echo -e "${GREEN}🤖 Mock Claude Code: Created intervention file: $INTERVENTION_FILE${NC}"

# SIMULATE: Wait for human response
RESPONSE_FILE="$INTERVENTION_DIR/response-$WORKER_ID.json"
echo -e "${CYAN}🤖 Mock Claude Code: Waiting for response at: $RESPONSE_FILE${NC}"

TIMEOUT=30
ELAPSED=0
while [ ! -f "$RESPONSE_FILE" ] && [ $ELAPSED -lt $TIMEOUT ]; do
  sleep 1
  ELAPSED=$((ELAPSED + 1))
  if [ $((ELAPSED % 5)) -eq 0 ]; then
    echo -e "${CYAN}🤖 Mock Claude Code: Still waiting... (${ELAPSED}s)${NC}"
  fi
done

if [ ! -f "$RESPONSE_FILE" ]; then
  echo -e "${YELLOW}🤖 Mock Claude Code: Timeout waiting for response!${NC}"
  exit 1
fi

# SIMULATE: Read response and continue
echo -e "${GREEN}🤖 Mock Claude Code: Response received! Reading...${NC}"

if command -v jq &> /dev/null; then
  RESPONSE=$(jq -r '.response' "$RESPONSE_FILE" 2>/dev/null || echo "unknown")
  echo -e "${GREEN}🤖 Mock Claude Code: User answered: \"$RESPONSE\"${NC}"
else
  echo -e "${GREEN}🤖 Mock Claude Code: Response file found (jq not available to read)${NC}"
fi

# SIMULATE: Continue execution
sleep 1
echo -e "${CYAN}🤖 Mock Claude Code: Applying user's choice...${NC}"
sleep 1
echo -e "${CYAN}🤖 Mock Claude Code: Making final changes...${NC}"
sleep 1

echo -e "${GREEN}🤖 Mock Claude Code: Execution completed successfully! ✅${NC}"

exit 0
