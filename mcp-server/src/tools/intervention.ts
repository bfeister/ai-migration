/**
 * RequestUserIntervention Tool
 *
 * Provides filesystem-based intervention protocol for requesting user input
 * during migration work. Uses polling for asynchronous responses.
 */

import { Tool } from '@modelcontextprotocol/sdk/types.js';
import * as fs from 'fs';
import * as path from 'path';
import { getWorkspaceRoot, ensureDirectoryExists } from './utils.js';
import { RequestUserInterventionArgs } from './types.js';

// Get intervention directory path
const INTERVENTION_DIR = process.env.INTERVENTION_DIR || path.join(getWorkspaceRoot(), 'intervention');

// Ensure intervention directory exists
ensureDirectoryExists(INTERVENTION_DIR);

/**
 * Tool definition for RequestUserIntervention
 */
export const REQUEST_USER_INTERVENTION_TOOL: Tool = {
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
 * Handle RequestUserIntervention tool call
 */
export async function handleRequestUserIntervention(
  args: RequestUserInterventionArgs
): Promise<string> {
  const { worker_id, question, options, context } = args;

  // Validate inputs
  if (!worker_id || !question || !options || options.length === 0) {
    throw new Error('Missing required parameters: worker_id, question, options');
  }

  // Write intervention request
  writeInterventionRequest(worker_id, question, options, context);

  // Poll for response (blocks until response received)
  const response = await pollForResponse(worker_id);

  return `User response: ${response}`;
}
