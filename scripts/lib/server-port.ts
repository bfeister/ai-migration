/**
 * Port resolution for the storefront-next production server.
 *
 * Reads the `start` script from the project's package.json and parses
 * `-p <port>` or `--port <port>` flags. Falls back to 3000 (sfnext preview default).
 */

import fs from 'fs';
import path from 'path';

const DEFAULT_PORT = 3000;

export function resolveServerPort(projectDir: string): number {
  const pkgPath = path.join(projectDir, 'package.json');

  if (!fs.existsSync(pkgPath)) {
    return DEFAULT_PORT;
  }

  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
  const startScript: string | undefined = pkg?.scripts?.start;

  if (!startScript) {
    return DEFAULT_PORT;
  }

  // Match -p <port> or --port <port>
  const match = startScript.match(/(?:-p|--port)\s+(\d+)/);
  if (match) {
    return parseInt(match[1], 10);
  }

  return DEFAULT_PORT;
}
