/**
 * CaptureDualScreenshots Tool (Phase 3 - Not Yet Implemented)
 *
 * TODO: Implement screenshot capture logic
 */

import { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { CaptureDualScreenshotsArgs, CaptureDualScreenshotsResult } from './types.js';

export const CAPTURE_DUAL_SCREENSHOTS_TOOL: Tool = {
  name: 'CaptureDualScreenshots',
  description: 'Capture source (SFRA) and target (Storefront Next) screenshots with proper naming (Phase 3 - Coming Soon)',
  inputSchema: {
    type: 'object',
    properties: {
      feature_id: {
        type: 'string',
        description: 'Feature ID (e.g., "01-homepage-hero")',
      },
      subplan_id: {
        type: 'string',
        description: 'Subplan ID (e.g., "subplan-01-02")',
      },
      sfra_url: {
        type: 'string',
        description: 'SFRA URL (optional, looked up from url-mappings.json if not provided)',
      },
      target_url: {
        type: 'string',
        description: 'Target URL (optional, defaults to localhost:5173)',
      },
    },
    required: ['feature_id', 'subplan_id'],
  },
};

export async function handleCaptureDualScreenshots(
  args: CaptureDualScreenshotsArgs
): Promise<CaptureDualScreenshotsResult> {
  throw new Error('CaptureDualScreenshots not yet implemented (Phase 3)');
}
