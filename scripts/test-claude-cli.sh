#!/bin/bash
# Test Claude Code CLI execution with real API calls
# Phase 1: Real Claude Code Integration

set -euo pipefail

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}╔══════════════════════════════════════════════════════════╗${NC}"
echo -e "${YELLOW}║  Phase 1: Testing Real Claude Code CLI Integration      ║${NC}"
echo -e "${YELLOW}╚══════════════════════════════════════════════════════════╝${NC}"
echo ""

# Configuration
PLAN_FILE="/workspace/tests/fixtures/test-plan.md"
OUTPUT_LOG="claude-cli-test-output.log"
TIMESTAMP=$(date +%Y-%m-%d-%H-%M-%S)

echo -e "${YELLOW}[1/4] Checking prerequisites...${NC}"

# Check if container is running
if ! docker ps --format '{{.Names}}' | grep -q '^claude-migration$'; then
    echo -e "${RED}✗ Container 'claude-migration' is not running${NC}"
    echo "  Run: docker-compose -f docker/docker-compose.yml up -d"
    exit 1
fi
echo -e "${GREEN}✓ Container is running${NC}"

# Check if test plan exists
if ! docker exec claude-migration test -f "$PLAN_FILE"; then
    echo -e "${RED}✗ Test plan not found: $PLAN_FILE${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Test plan exists${NC}"

# Check if API key is set (either standard or Bedrock)
if docker exec claude-migration sh -c '[ -n "$ANTHROPIC_API_KEY" ] || [ -n "$ANTHROPIC_AUTH_TOKEN" ]'; then
    if docker exec claude-migration sh -c '[ -n "$ANTHROPIC_AUTH_TOKEN" ]'; then
        echo -e "${GREEN}✓ API key is configured (Bedrock mode)${NC}"
    else
        echo -e "${GREEN}✓ API key is configured (Standard mode)${NC}"
    fi
else
    echo -e "${RED}✗ Neither ANTHROPIC_API_KEY nor ANTHROPIC_AUTH_TOKEN is set${NC}"
    exit 1
fi

echo ""
echo -e "${YELLOW}[2/4] Executing Claude Code CLI...${NC}"
echo "  Plan: $PLAN_FILE"
echo "  Output: $OUTPUT_LOG"
echo ""

# Execute Claude Code CLI with test plan
# Note: Using --dangerously-skip-permissions for non-interactive execution
# Claude Code stays in interactive mode, so we need to monitor and send 'exit' when done
echo "Starting Claude Code CLI (this may take 30-60 seconds)..."

# Start Claude in background with a named pipe for input
docker exec -d claude-migration sh -c "cd /workspace && (cat $PLAN_FILE; echo 'exit') | claude code run --dangerously-skip-permissions > /tmp/claude-output.log 2>&1"

# Wait for output file to be created (max 90 seconds)
TIMEOUT=90
ELAPSED=0
echo -n "Waiting for task completion"
while [ $ELAPSED -lt $TIMEOUT ]; do
    if docker exec claude-migration test -f /workspace/test-output.txt; then
        echo ""
        echo -e "${GREEN}✓ Task completed!${NC}"
        # Give it a moment to finish writing
        sleep 2
        break
    fi
    echo -n "."
    sleep 2
    ELAPSED=$((ELAPSED + 2))
done

echo ""
echo -e "${YELLOW}[3/4] Checking execution results...${NC}"

if [ $ELAPSED -ge $TIMEOUT ]; then
    echo -e "${YELLOW}⚠ Timeout reached, checking what was completed...${NC}"
fi

# Capture the output log from container
docker exec claude-migration cat /tmp/claude-output.log > "$OUTPUT_LOG" 2>/dev/null || echo "No output captured yet"

# Show tail of output for debugging
if [ -f "$OUTPUT_LOG" ]; then
    echo ""
    echo "Last 10 lines of Claude output:"
    tail -10 "$OUTPUT_LOG"
    echo ""
fi

# Check if output file was created
if docker exec claude-migration test -f /workspace/test-output.txt; then
    echo -e "${GREEN}✓ Output file was created${NC}"

    echo ""
    echo -e "${YELLOW}[4/4] Output file contents:${NC}"
    echo "----------------------------------------"
    docker exec claude-migration cat /workspace/test-output.txt
    echo "----------------------------------------"
else
    echo -e "${RED}✗ Output file was not created${NC}"
    exit 1
fi

# Check if file exists on host (volume mount validation)
if [ -f "/Users/bfeister/dev/test-storefront/test-output.txt" ]; then
    echo -e "${GREEN}✓ File persisted to host filesystem${NC}"
else
    echo -e "${YELLOW}⚠ File not found on host (volume mount issue?)${NC}"
fi

echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║  Phase 1 Test: PASSED ✓                                 ║${NC}"
echo -e "${GREEN}║  Real API integration validated successfully!           ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════════════╝${NC}"
echo ""
echo "Test completed at: $(date)"
echo "Log saved to: $OUTPUT_LOG"
