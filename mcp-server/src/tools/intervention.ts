/**
 * RequestUserIntervention Tool
 *
 * Provides filesystem-based intervention protocol for requesting user input
 * during migration work. Non-blocking - returns immediately after writing
 * intervention file. Claude should exit gracefully and await user response.
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
    'Creates an intervention file (intervention/needed-{worker_id}.json) and returns immediately (non-blocking). ' +
    'Claude should exit gracefully after calling this tool to allow user to respond via dashboard. ' +
    'Session will be resumed after user responds via dashboard.',
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
 * Handle RequestUserIntervention tool call
 *
 * Non-blocking: Returns immediately after writing intervention file.
 * Claude should exit gracefully after calling this tool.
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
  const interventionFile = writeInterventionRequest(worker_id, question, options, context);

  // Return immediately (non-blocking)
  return `Intervention requested for worker "${worker_id}". File created: ${interventionFile}\n\nClaude should now exit gracefully to allow user to respond via dashboard. Session will be resumed after response.`;
}
