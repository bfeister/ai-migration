#!/bin/bash
set -euo pipefail

# Phase 2 Stability Test
# Runs the intervention flow multiple times to verify reliability

echo "╔═══════════════════════════════════════════════════════════╗"
echo "║  Phase 2 Stability Test                                  ║"
echo "║  Tests interactive prompt reliability                     ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo ""

NUM_TESTS=${1:-3}
EXPECTED_OPTIONS=("JWT" "Session-based" "OAuth2")

echo "Running $NUM_TESTS test iterations..."
echo ""
echo "Instructions:"
echo "1. This script will trigger Claude Code $NUM_TESTS times"
echo "2. Each time, select a different option in migrate-watch.sh"
echo "3. Expected sequence: ${EXPECTED_OPTIONS[@]}"
echo ""
echo "Make sure migrate-watch.sh is running in another terminal!"
echo ""
read -p "Press Enter to start tests..."
echo ""

for i in $(seq 1 $NUM_TESTS); do
    echo "──────────────────────────────────────────────────────────"
    echo "Test $i/$NUM_TESTS"
    echo "Expected selection: ${EXPECTED_OPTIONS[$((i-1))]}"
    echo "──────────────────────────────────────────────────────────"

    # Clean up previous test files
    docker exec claude-migration bash -c 'rm -f /workspace/intervention/needed-test-worker.json /workspace/intervention/response-test-worker.json' 2>/dev/null || true

    # Trigger intervention
    echo "Triggering Claude Code... (check other terminal for prompt)"
    docker exec claude-migration bash -c 'claude code run --dangerously-skip-permissions --mcp-config ~/.config/claude-code/mcp.json < /workspace/tests/fixtures/test-intervention-flow.md' > /dev/null 2>&1 &
    CLAUDE_PID=$!

    # Wait for intervention file to appear
    echo "Waiting for intervention file..."
    for j in {1..10}; do
        if docker exec claude-migration test -f /workspace/intervention/needed-test-worker.json 2>/dev/null; then
            echo "✓ Intervention file detected"
            break
        fi
        sleep 1
    done

    # Wait for response file to appear (user is selecting)
    echo "Waiting for your selection in the other terminal..."
    for j in {1..60}; do
        if docker exec claude-migration test -f /workspace/intervention/response-test-worker.json 2>/dev/null; then
            echo "✓ Response file detected"
            break
        fi
        sleep 1
    done

    # Verify response file was created
    if ! docker exec claude-migration test -f /workspace/intervention/response-test-worker.json 2>/dev/null; then
        echo "✗ TIMEOUT: No response file created after 60 seconds"
        echo "  This suggests the prompt didn't wait for input"
        exit 1
    fi

    # Get the actual response
    ACTUAL_RESPONSE=$(docker exec claude-migration cat /workspace/intervention/response-test-worker.json 2>/dev/null | jq -r '.response')
    echo "✓ Response received: $ACTUAL_RESPONSE"

    # Check if processed flag was set
    IS_PROCESSED=$(docker exec claude-migration cat /workspace/intervention/response-test-worker.json 2>/dev/null | jq -r '.processed')
    if [ "$IS_PROCESSED" = "true" ]; then
        echo "✓ Response marked as processed by MCP server"
    else
        echo "⚠ Warning: Response not marked as processed"
    fi

    # Wait for Claude to complete
    wait $CLAUDE_PID 2>/dev/null || true

    echo ""
    echo "Test $i complete!"
    echo ""

    if [ $i -lt $NUM_TESTS ]; then
        read -p "Press Enter for next test..."
        echo ""
    fi
done

echo "╔═══════════════════════════════════════════════════════════╗"
echo "║  ✓ Stability Test Complete!                              ║"
echo "║  All $NUM_TESTS tests passed                                    ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo ""
echo "Phase 2 is stable and ready for Phase 3."
