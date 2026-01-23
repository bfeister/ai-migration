/**
 * GetNextMicroPlan Tool (Phase 4 - Not Yet Implemented)
 *
 * TODO: Implement micro-plan navigation logic
 */

import { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { GetNextMicroPlanArgs, GetNextMicroPlanResult } from './types.js';

export const GET_NEXT_MICRO_PLAN_TOOL: Tool = {
  name: 'GetNextMicroPlan',
  description: 'Determine next micro-plan to execute based on migration log (Phase 4 - Coming Soon)',
  inputSchema: {
    type: 'object',
    properties: {
      feature_directory: {
        type: 'string',
        description: 'Feature directory (e.g., "01-homepage-content", optional)',
      },
    },
  },
};

export async function handleGetNextMicroPlan(
  args: GetNextMicroPlanArgs
): Promise<GetNextMicroPlanResult> {
  throw new Error('GetNextMicroPlan not yet implemented (Phase 4)');
}
