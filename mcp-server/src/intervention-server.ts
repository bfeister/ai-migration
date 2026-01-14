#!/usr/bin/env node

/**
 * MCP Intervention Server
 *
 * Provides AskUserQuestion tool to Claude Code for requesting user input
 * during migration work. Uses filesystem-based polling for asynchronous responses.
 *
 * Architecture:
 * - Claude calls AskUserQuestion tool with question + options
 * - Server writes intervention/needed-{worker-id}.json
 * - Server polls for intervention/response-{worker-id}.json (1s interval)
 * - When response found, mark as processed and return to Claude
 * - Conversation continues naturally (state lives in Claude Code process memory)
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import * as fs from 'fs';
import * as path from 'path';

// Environment configuration
const WORKSPACE_ROOT = process.env.WORKSPACE_ROOT || '/workspace';
const INTERVENTION_DIR = process.env.INTERVENTION_DIR || path.join(WORKSPACE_ROOT, 'intervention');

// Ensure intervention directory exists
if (!fs.existsSync(INTERVENTION_DIR)) {
  fs.mkdirSync(INTERVENTION_DIR, { recursive: true });
}

/**
 * Tool definition for RequestUserIntervention
 * Note: Renamed from AskUserQuestion to avoid conflict with Claude Code's built-in tool
 */
const REQUEST_USER_INTERVENTION_TOOL: Tool = {
  name: 'RequestUserIntervention',
  description:
    'Request user input for non-obvious decisions during migration work via filesystem-based intervention protocol. ' +
    'Creates an intervention file (intervention/needed-{worker_id}.json) that the user can respond to asynchronously. ' +
    'Supports multi-hour/multi-day pauses for background execution scenarios. ' +
    'Response will be read from intervention/response-{worker_id}.json.',
  inputSchema: {
    type: 'object',
    properties: {
      worker_id: {
        type: 'string',
        description: 'Worker ID (e.g., "worker-1", "home", "product-details")',
      },
      question: {
        type: 'string',
        description: 'The question to ask the user',
      },
      options: {
        type: 'array',
        items: { type: 'string' },
        description: 'Array of possible answers (2-4 options recommended)',
      },
      context: {
        type: 'string',
        description: 'Additional context about why this decision is needed (optional)',
      },
    },
    required: ['worker_id', 'question', 'options'],
  },
};

/**
 * Write intervention request file
 */
function writeInterventionRequest(
  workerId: string,
  question: string,
  options: string[],
  context?: string
): string {
  const timestamp = new Date().toISOString();
  const interventionFile = path.join(INTERVENTION_DIR, `needed-${workerId}.json`);

  const interventionData = {
    timestamp,
    worker_id: workerId,
    question,
    options,
    context: context || '',
  };

  fs.writeFileSync(interventionFile, JSON.stringify(interventionData, null, 2), 'utf-8');

  console.error(`[MCP] Created intervention request: ${interventionFile}`);
  return interventionFile;
}

/**
 * Poll for response file with infinite patience (no timeout)
 * Supports asynchronous responses hours/days later
 */
async function pollForResponse(workerId: string): Promise<string> {
  const responseFile = path.join(INTERVENTION_DIR, `response-${workerId}.json`);
  const pollInterval = 1000; // 1 second

  console.error(`[MCP] Polling for response: ${responseFile}`);

  return new Promise((resolve, reject) => {
    const checkResponse = () => {
      if (fs.existsSync(responseFile)) {
        try {
          const responseData = JSON.parse(fs.readFileSync(responseFile, 'utf-8'));

          // Check if already processed (to avoid re-reading stale responses)
          if (responseData.processed === true) {
            console.error(`[MCP] Response already processed, continuing to poll...`);
            setTimeout(checkResponse, pollInterval);
            return;
          }

          console.error(`[MCP] Response received: ${responseData.response}`);

          // Mark response as processed
          responseData.processed = true;
          responseData.processed_at = new Date().toISOString();
          fs.writeFileSync(responseFile, JSON.stringify(responseData, null, 2), 'utf-8');

          resolve(responseData.response);
        } catch (error) {
          console.error(`[MCP] Error parsing response file: ${error}`);
          reject(error);
        }
      } else {
        // Keep polling
        setTimeout(checkResponse, pollInterval);
      }
    };

    checkResponse();
  });
}

/**
 * Handle AskUserQuestion tool call
 */
async function handleAskUserQuestion(args: {
  worker_id: string;
  question: string;
  options: string[];
  context?: string;
}): Promise<string> {
  const { worker_id, question, options, context } = args;

  // Validate inputs
  if (!worker_id || !question || !options || options.length === 0) {
    throw new Error('Missing required parameters: worker_id, question, options');
  }

  // Write intervention request
  writeInterventionRequest(worker_id, question, options, context);

  // Poll for response (blocks until response received)
  const response = await pollForResponse(worker_id);

  return response;
}

/**
 * Initialize and run the MCP server
 */
async function main() {
  console.error('[MCP] Starting Intervention Server...');
  console.error(`[MCP] Workspace root: ${WORKSPACE_ROOT}`);
  console.error(`[MCP] Intervention directory: ${INTERVENTION_DIR}`);

  const server = new Server(
    {
      name: 'intervention-server',
      version: '1.0.0',
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // Register tool handlers
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [REQUEST_USER_INTERVENTION_TOOL],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    if (name === 'RequestUserIntervention') {
      try {
        const response = await handleAskUserQuestion(args as any);
        return {
          content: [
            {
              type: 'text',
              text: `User response: ${response}`,
            },
          ],
        };
      } catch (error: any) {
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
    }

    throw new Error(`Unknown tool: ${name}`);
  });

  // Start server with stdio transport
  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error('[MCP] Server started and ready for requests');
}

// Run server
main().catch((error) => {
  console.error('[MCP] Fatal error:', error);
  process.exit(1);
});
