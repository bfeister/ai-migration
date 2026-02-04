#!/usr/bin/env node

/**
 * MCP Migration Server
 *
 * Extended MCP server providing both intervention and migration tools.
 * Combines intervention-server.ts functionality with new migration automation tools.
 *
 * Tools:
 * - RequestUserIntervention (existing)
 * - LogMigrationProgress (with optional visual_feedback field)
 * - CheckServerHealth (stateless HTTP polling + build log parsing)
 * - CaptureDualScreenshots (with metadata for dashboard)
 * - CommitMigrationProgress
 * - GetNextMicroPlan
 * - ParseURLMapping
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';

// Import tool handlers
import { REQUEST_USER_INTERVENTION_TOOL, handleRequestUserIntervention } from './tools/intervention.js';
import { LOG_MIGRATION_PROGRESS_TOOL, handleLogMigrationProgress } from './tools/logging.js';
import { CHECK_SERVER_HEALTH_TOOL, handleCheckServerHealth } from './tools/health-check.js';
import { CAPTURE_DUAL_SCREENSHOTS_TOOL, handleCaptureDualScreenshots } from './tools/screenshots.js';
import { COMMIT_MIGRATION_PROGRESS_TOOL, handleCommitMigrationProgress } from './tools/git.js';
import { GET_NEXT_MICRO_PLAN_TOOL, handleGetNextMicroPlan } from './tools/navigation.js';
import { PARSE_URL_MAPPING_TOOL, handleParseURLMapping } from './tools/config.js';

/**
 * Initialize and run the MCP server
 */
async function main() {
  console.error('[MCP] Starting Migration Server...');
  console.error(`[MCP] Workspace root: ${process.env.WORKSPACE_ROOT || '/workspace'}`);

  const server = new Server(
    {
      name: 'migration-server',
      version: '2.0.0',
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // Register all tools
  const tools: Tool[] = [
    REQUEST_USER_INTERVENTION_TOOL,
    LOG_MIGRATION_PROGRESS_TOOL,
    CHECK_SERVER_HEALTH_TOOL,
    CAPTURE_DUAL_SCREENSHOTS_TOOL,
    COMMIT_MIGRATION_PROGRESS_TOOL,
    GET_NEXT_MICRO_PLAN_TOOL,
    PARSE_URL_MAPPING_TOOL,
  ];

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools,
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      let result: any;

      switch (name) {
        case 'RequestUserIntervention':
          result = await handleRequestUserIntervention(args as any);
          break;
        case 'LogMigrationProgress':
          result = await handleLogMigrationProgress(args as any);
          break;
        case 'CheckServerHealth':
          result = await handleCheckServerHealth(args as any);
          break;
        case 'CaptureDualScreenshots':
          result = await handleCaptureDualScreenshots(args as any);
          break;
        case 'CommitMigrationProgress':
          result = await handleCommitMigrationProgress(args as any);
          break;
        case 'GetNextMicroPlan':
          result = await handleGetNextMicroPlan(args as any);
          break;
        case 'ParseURLMapping':
          result = await handleParseURLMapping(args as any);
          break;
        default:
          throw new Error(`Unknown tool: ${name}`);
      }

      // Format response
      return {
        content: [
          {
            type: 'text',
            text: typeof result === 'string' ? result : JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (error: any) {
      console.error(`[MCP] Error handling ${name}:`, error);
      return {
        content: [
          {
            type: 'text',
            text: `Error: ${error.message}`,
          },
        ],
        isError: true,
      };
    }
  });

  // Start server with stdio transport
  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error('[MCP] Server started and ready for requests');
  console.error('[MCP] Available tools:', tools.map(t => t.name).join(', '));
}

// Run server
main().catch((error) => {
  console.error('[MCP] Fatal error:', error);
  process.exit(1);
});
