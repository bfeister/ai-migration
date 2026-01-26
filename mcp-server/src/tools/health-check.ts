/**
 * CheckServerHealth Tool
 *
 * Stateless HTTP endpoint polling with optional build log parsing.
 * Does NOT manage process lifecycle - bash handles that.
 * Only reads filesystem and checks HTTP endpoints.
 */

import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { readFileSync } from 'fs';
import type {
  CheckServerHealthArgs,
  CheckServerHealthResult,
  BuildStatus,
} from './types.js';

export const CHECK_SERVER_HEALTH_TOOL: Tool = {
  name: 'CheckServerHealth',
  description:
    'Poll HTTP endpoint until healthy or timeout, optionally parse build logs for errors. ' +
    'Stateless tool - does NOT manage process lifecycle. Bash starts/stops dev server. ' +
    'Tool checks if server responds and optionally reads build log from filesystem to detect compilation errors.',
  inputSchema: {
    type: 'object',
    properties: {
      url: {
        type: 'string',
        description: 'Full URL to check (e.g., "http://localhost:5173")',
      },
      path: {
        type: 'string',
        description: 'Optional path to append (default: "/"). E.g., "/api/health"',
      },
      timeout_seconds: {
        type: 'number',
        description: 'Timeout in seconds (default: 30)',
      },
      retry_interval_seconds: {
        type: 'number',
        description: 'Seconds between retries (default: 1)',
      },
      expected_status_codes: {
        type: 'array',
        items: { type: 'number' },
        description: 'Accepted HTTP status codes (default: [200, 201, 204, 301, 302, 304])',
      },
      build_log_file: {
        type: 'string',
        description: 'Optional: Path to build log file to parse for errors (e.g., "/tmp/dev-server.log")',
      },
    },
    required: ['url'],
  },
};

/**
 * Parse build log for errors and warnings
 */
function parseBuildLog(logContent: string): BuildStatus {
  const errors: string[] = [];
  const warnings: string[] = [];

  const lines = logContent.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Detect errors (TypeScript, Vite, etc.)
    if (
      trimmed.includes('ERROR') ||
      trimmed.includes('Error:') ||
      trimmed.includes('error TS') ||
      trimmed.includes('Failed to') ||
      trimmed.includes('Cannot find') ||
      trimmed.includes('Module not found') ||
      /error\s/i.test(trimmed)
    ) {
      errors.push(trimmed);
    }

    // Detect warnings
    if (
      trimmed.includes('WARNING') ||
      trimmed.includes('Warning:') ||
      /\bwarn\b/i.test(trimmed)
    ) {
      warnings.push(trimmed);
    }
  }

  return {
    has_errors: errors.length > 0,
    has_warnings: warnings.length > 0,
    errors,
    warnings,
  };
}

/**
 * Sleep for given milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Handle CheckServerHealth tool call
 */
export async function handleCheckServerHealth(
  args: CheckServerHealthArgs
): Promise<CheckServerHealthResult> {
  const url = args.url;
  const path = args.path || '/';
  const timeoutSeconds = args.timeout_seconds || 30;
  const retryIntervalSeconds = args.retry_interval_seconds || 1;
  const expectedStatusCodes = args.expected_status_codes || [200, 201, 204, 301, 302, 304];
  const buildLogFile = args.build_log_file;

  const fullUrl = `${url}${path}`;
  const startTime = Date.now();
  const timeoutMs = timeoutSeconds * 1000;
  const retryIntervalMs = retryIntervalSeconds * 1000;

  console.error(`[MCP] CheckServerHealth: Checking ${fullUrl}`);
  console.error(`[MCP]   Timeout: ${timeoutSeconds}s, Retry interval: ${retryIntervalSeconds}s`);
  if (buildLogFile) {
    console.error(`[MCP]   Build log: ${buildLogFile}`);
  }

  let attempts = 0;
  let lastError: string | undefined;
  let statusCode: number | undefined;
  let serverResponding = false;

  // Poll HTTP endpoint
  while (Date.now() - startTime < timeoutMs) {
    attempts++;

    try {
      const response = await fetch(fullUrl, {
        method: 'GET',
        signal: AbortSignal.timeout(5000), // 5 second timeout per request
      });

      statusCode = response.status;

      if (expectedStatusCodes.includes(statusCode)) {
        serverResponding = true;
        console.error(`[MCP] ✅ Server responding: ${statusCode} (attempt ${attempts})`);
        break;
      } else {
        lastError = `Unexpected status code: ${statusCode}`;
        console.error(`[MCP] ⚠️  Status ${statusCode} not in expected codes (attempt ${attempts})`);
      }
    } catch (error: any) {
      lastError = error.message || 'HTTP request failed';
      console.error(`[MCP] ⚠️  Request failed: ${lastError} (attempt ${attempts})`);
    }

    // Wait before retry (unless timeout reached)
    if (Date.now() - startTime + retryIntervalMs < timeoutMs) {
      await sleep(retryIntervalMs);
    }
  }

  const responseTimeMs = Date.now() - startTime;

  // Check build log if provided
  let buildStatus: BuildStatus | undefined;
  if (buildLogFile) {
    try {
      console.error(`[MCP] Reading build log: ${buildLogFile}`);
      const logContent = readFileSync(buildLogFile, 'utf-8');
      buildStatus = parseBuildLog(logContent);

      if (buildStatus.has_errors) {
        console.error(`[MCP] ❌ Build errors detected: ${buildStatus.errors.length} error(s)`);
      }
      if (buildStatus.has_warnings) {
        console.error(`[MCP] ⚠️  Build warnings: ${buildStatus.warnings.length} warning(s)`);
      }
    } catch (error: any) {
      console.error(`[MCP] ⚠️  Failed to read build log: ${error.message}`);
      // Don't fail the health check just because log file couldn't be read
      buildStatus = {
        has_errors: false,
        has_warnings: false,
        errors: [],
        warnings: [`Failed to read log file: ${error.message}`],
      };
    }
  }

  // Determine overall health
  // Unhealthy if: server not responding OR build errors detected
  const healthy = serverResponding && (!buildStatus || !buildStatus.has_errors);

  if (!healthy) {
    if (!serverResponding) {
      console.error(`[MCP] ❌ Server not responding after ${attempts} attempts`);
    }
    if (buildStatus?.has_errors) {
      console.error(`[MCP] ❌ Build errors present (even though server may respond)`);
    }
  } else {
    console.error(`[MCP] ✅ Server healthy`);
  }

  return {
    healthy,
    server_responding: serverResponding,
    url_checked: fullUrl,
    response_time_ms: responseTimeMs,
    status_code: statusCode,
    attempts,
    build_status: buildStatus,
    error: healthy ? undefined : (lastError || 'Build errors detected'),
  };
}
