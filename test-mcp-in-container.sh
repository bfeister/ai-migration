#!/usr/bin/env bash
# test-mcp-in-container.sh - Test MCP LogMigrationProgress tool inside Docker container

set -euo pipefail

CONTAINER_NAME="${CONTAINER_NAME:-claude-migration-demo}"
WORKSPACE_ROOT="/workspace"

echo "========================================"
echo "Testing MCP Tools Inside Container"
echo "========================================"
echo ""

# Check if container is running
if ! docker ps -q -f name="$CONTAINER_NAME" | grep -q .; then
    echo "❌ Error: Container '$CONTAINER_NAME' is not running"
    echo ""
    echo "Start the container first:"
    echo "  ./scripts/demo-migration-loop.sh"
    echo ""
    echo "Or just start the container without running the loop:"
    echo "  docker run -d --name $CONTAINER_NAME \\"
    echo "    --env-file .env \\"
    echo "    --network host \\"
    echo "    -v \"\$(pwd):/workspace\" \\"
    echo "    claude-migration:latest \\"
    echo "    tail -f /dev/null"
    exit 1
fi

echo "✅ Container is running: $CONTAINER_NAME"
echo ""

# Backup migration log inside container
echo "📁 Backing up migration-log.md..."
docker exec -u node "$CONTAINER_NAME" bash -c "
    if [ -f $WORKSPACE_ROOT/migration-log.md ]; then
        cp $WORKSPACE_ROOT/migration-log.md $WORKSPACE_ROOT/migration-log-backup-test-\$(date +%Y%m%d-%H%M%S).md
        echo 'Backup created'
    else
        echo 'No existing log to backup'
    fi
"
echo ""

# Check if MCP server is built
echo "🔍 Checking MCP server..."
if docker exec -u node "$CONTAINER_NAME" test -f "$WORKSPACE_ROOT/mcp-server/dist/migration-server.js"; then
    echo "✅ MCP server built"
else
    echo "⚠️  MCP server not built, building now..."
    docker exec -u node "$CONTAINER_NAME" bash -c "
        cd $WORKSPACE_ROOT/mcp-server && \
        npm install && \
        npm run build
    "
    if [ $? -eq 0 ]; then
        echo "✅ MCP server built successfully"
    else
        echo "❌ Failed to build MCP server"
        exit 1
    fi
fi
echo ""

# Check MCP configuration
echo "🔍 Checking MCP configuration..."
if docker exec -u node "$CONTAINER_NAME" test -f /home/node/.config/claude-code/mcp.json; then
    echo "✅ MCP config exists"
    echo ""
    echo "Configuration:"
    docker exec -u node "$CONTAINER_NAME" cat /home/node/.config/claude-code/mcp.json | head -20
else
    echo "⚠️  MCP config not found at /home/node/.config/claude-code/mcp.json"
    echo "   This should have been created by entrypoint.sh"
    echo ""
    echo "Creating configuration now..."
    docker exec -u node "$CONTAINER_NAME" bash -c "
        mkdir -p ~/.config/claude-code
        cat > ~/.config/claude-code/mcp.json <<'EOF'
{
  \"mcpServers\": {
    \"migration-tools\": {
      \"command\": \"node\",
      \"args\": [\"$WORKSPACE_ROOT/mcp-server/dist/migration-server.js\"],
      \"env\": {
        \"WORKSPACE_ROOT\": \"$WORKSPACE_ROOT\",
        \"INTERVENTION_DIR\": \"$WORKSPACE_ROOT/intervention\"
      }
    }
  }
}
EOF
    "
    echo "✅ MCP config created"
fi
echo ""

# Run test script inside container
echo "🧪 Running LogMigrationProgress test..."
echo ""

docker exec -u node "$CONTAINER_NAME" bash -c "
cd $WORKSPACE_ROOT

# Create test script inline
cat > /tmp/test-logging.js <<'EOF'
#!/usr/bin/env node

// Set WORKSPACE_ROOT for the test
process.env.WORKSPACE_ROOT = '/workspace';

import { handleLogMigrationProgress } from '/workspace/mcp-server/dist/tools/logging.js';

async function testLogging() {
  console.log('='.repeat(60));
  console.log('Testing LogMigrationProgress Tool (Inside Container)');
  console.log('='.repeat(60));
  console.log('');

  // Test: Log a successful iteration
  console.log('Test: Logging a successful iteration...');
  try {
    const result = await handleLogMigrationProgress({
      subplan_id: '01-02',
      status: 'success',
      summary: 'Test entry from inside container',
      source_screenshot_url: 'https://zzrf-001.dx.commercecloud.salesforce.com/s/RefArchGlobal/en_GB/home',
      target_screenshot_url: 'http://localhost:5173',
      commit_sha: 'test-' + Date.now(),
      duration_seconds: 120,
    });

    console.log('Result:', JSON.stringify(result, null, 2));

    if (result.success) {
      console.log('✅ Test PASSED');
      console.log('');
      console.log('Check migration-log.md to see the generated entry.');
    } else {
      console.log('❌ Test FAILED:', result.error);
      process.exit(1);
    }
  } catch (error) {
    console.error('❌ Test ERROR:', error.message);
    console.error(error.stack);
    process.exit(1);
  }

  console.log('');
  console.log('='.repeat(60));
}

testLogging().catch(console.error);
EOF

# Run the test
node /tmp/test-logging.js
"

TEST_EXIT_CODE=$?
echo ""

if [ $TEST_EXIT_CODE -eq 0 ]; then
    echo "✅ Test completed successfully"
    echo ""

    # Show the generated log entry
    echo "📄 Generated log entry:"
    echo "----------------------------------------"
    docker exec -u node "$CONTAINER_NAME" tail -20 "$WORKSPACE_ROOT/migration-log.md"
    echo "----------------------------------------"
    echo ""

    echo "✅ All checks passed!"
    echo ""
    echo "The LogMigrationProgress tool is working inside the container."
    echo ""
    echo "Next steps:"
    echo "  1. Run full migration loop: ./scripts/demo-migration-loop.sh"
    echo "  2. Watch for tool calls in Claude output"
    echo "  3. Verify migration-log.md gets updated"
else
    echo "❌ Test failed with exit code: $TEST_EXIT_CODE"
    exit 1
fi

echo "========================================"
