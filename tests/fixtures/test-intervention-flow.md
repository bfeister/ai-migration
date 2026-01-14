# Test: MCP Intervention Flow

This test demonstrates the complete intervention workflow with the MCP server.

## Task

You are helping migrate a storefront application. During this migration, you need to make a decision about authentication.

Please use the `mcp__intervention__RequestUserIntervention` tool (the full MCP tool name with prefix) to ask the user which authentication method should be used.

**Tool parameters:**
- worker_id: "test-worker"
- question: "Which authentication method should we use for the storefront?"
- options: ["JWT", "Session-based", "OAuth2"]
- context: "This is a test of the MCP intervention protocol. The choice will affect how user sessions are managed."

After calling the tool and receiving the user's response, please acknowledge it and explain what that choice means for the implementation.

## Expected Flow

1. You call the `mcp__intervention__RequestUserIntervention` tool with the parameters above
2. MCP server creates `intervention/needed-test-worker.json`
3. User responds (either via migrate-watch.ts or migrate-respond.sh)
4. MCP server reads response, marks as processed, returns to you
5. You continue with the user's choice

This validates the complete Phase 2 implementation.

**Important:** Use the full MCP tool name `mcp__intervention__RequestUserIntervention`, not the built-in `AskUserQuestion` tool.
