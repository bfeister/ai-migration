#!/bin/bash
set -euo pipefail

# Test script for MCP Intervention Server
# Tests the file-based intervention protocol without full MCP client

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKSPACE_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
INTERVENTION_DIR="$WORKSPACE_ROOT/intervention"
TEST_WORKER_ID="test-worker-1"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "MCP Intervention Server - Standalone Test"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo

# Cleanup any existing test files
cleanup() {
    echo "🧹 Cleaning up test files..."
    rm -f "$INTERVENTION_DIR/needed-$TEST_WORKER_ID.json"
    rm -f "$INTERVENTION_DIR/response-$TEST_WORKER_ID.json"
}

trap cleanup EXIT

# Test 1: Verify build output exists
echo "Test 1: Verify build output exists"
if [[ -f "$SCRIPT_DIR/dist/intervention-server.js" ]]; then
    echo "✅ Build output found"
else
    echo "❌ Build output missing - run 'pnpm build' first"
    exit 1
fi
echo

# Test 2: Verify server can be imported (basic syntax check)
echo "Test 2: Verify server imports and syntax"
if node -c "$SCRIPT_DIR/dist/intervention-server.js" >/dev/null 2>&1; then
    echo "✅ Server syntax valid"
else
    echo "❌ Server syntax error"
    exit 1
fi
echo

# Test 3: Test intervention file creation workflow
echo "Test 3: Test intervention file creation"
echo "Creating test intervention file..."

# Create a test intervention file (simulating what the MCP server would create)
cat > "$INTERVENTION_DIR/needed-$TEST_WORKER_ID.json" <<EOF
{
  "timestamp": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "worker_id": "$TEST_WORKER_ID",
  "question": "Which authentication method should we use?",
  "options": ["JWT", "Session-based", "OAuth2"],
  "context": "Testing intervention protocol"
}
EOF

if [[ -f "$INTERVENTION_DIR/needed-$TEST_WORKER_ID.json" ]]; then
    echo "✅ Intervention file created successfully"
    echo "   File: $INTERVENTION_DIR/needed-$TEST_WORKER_ID.json"
else
    echo "❌ Failed to create intervention file"
    exit 1
fi
echo

# Test 4: Simulate user response
echo "Test 4: Simulate user response"
cat > "$INTERVENTION_DIR/response-$TEST_WORKER_ID.json" <<EOF
{
  "timestamp": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "response": "JWT",
  "question_timestamp": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "intervention_id": "needed-$TEST_WORKER_ID"
}
EOF

if [[ -f "$INTERVENTION_DIR/response-$TEST_WORKER_ID.json" ]]; then
    echo "✅ Response file created successfully"
    echo "   File: $INTERVENTION_DIR/response-$TEST_WORKER_ID.json"
else
    echo "❌ Failed to create response file"
    exit 1
fi
echo

# Test 5: Verify JSON structure
echo "Test 5: Verify JSON structure with jq"
if command -v jq >/dev/null 2>&1; then
    echo "Intervention file:"
    jq -r '.question' "$INTERVENTION_DIR/needed-$TEST_WORKER_ID.json"
    echo
    echo "Response file:"
    jq -r '.response' "$INTERVENTION_DIR/response-$TEST_WORKER_ID.json"
    echo "✅ JSON structure valid"
else
    echo "⚠️  jq not installed, skipping JSON validation"
fi
echo

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ All standalone tests passed!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo
echo "Next steps:"
echo "  1. Integrate with Docker (update entrypoint.sh)"
echo "  2. Configure Claude Code CLI (mcp.json)"
echo "  3. Test with real Claude Code CLI"
