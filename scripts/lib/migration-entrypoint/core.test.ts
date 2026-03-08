import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { createDryRunCommandRunner } from './command-runner.js';
import {
  detectPendingInterventions,
  resolveSfnextBinary,
  resolveRuntimeConfig,
  runMigrationEntrypoint,
  updatePackageReferences,
  type EditableEnvValues,
  type PromptAdapter,
  type RuntimeConfig,
} from './core.js';

const tempDirs: string[] = [];

function makeTempDir(prefix: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

function seedWorkspace(workspaceRoot: string): void {
  fs.mkdirSync(path.join(workspaceRoot, 'scripts'), { recursive: true });
  fs.mkdirSync(path.join(workspaceRoot, 'intervention'), { recursive: true });
  fs.mkdirSync(path.join(workspaceRoot, 'storefront-next', 'node_modules', '.bin'), { recursive: true });
  fs.writeFileSync(path.join(workspaceRoot, 'storefront-next', 'node_modules', '.bin', 'sfnext'), '');
  fs.mkdirSync(path.join(workspaceRoot, 'analysis'), { recursive: true });
  fs.mkdirSync(path.join(workspaceRoot, 'sub-plans'), { recursive: true });
  fs.mkdirSync(path.join(workspaceRoot, 'migration-plans'), { recursive: true });
  fs.writeFileSync(path.join(workspaceRoot, 'url-mappings.json'), JSON.stringify({
    version: '2.0',
    pages: [
      { page_id: 'home', selected: true },
    ],
  }));
}

function seedMonorepo(monorepoRoot: string): void {
  fs.mkdirSync(path.join(monorepoRoot, 'packages', 'storefront-next-dev', 'dist'), { recursive: true });
  fs.mkdirSync(path.join(monorepoRoot, 'packages', 'storefront-next-runtime', 'dist'), { recursive: true });
  fs.mkdirSync(path.join(monorepoRoot, 'packages', 'template-retail-rsc-app'), { recursive: true });
  fs.writeFileSync(path.join(monorepoRoot, 'package.json'), '{}');
  fs.writeFileSync(path.join(monorepoRoot, 'packages', 'storefront-next-dev', 'dist', 'cli.js'), '');
  fs.writeFileSync(path.join(monorepoRoot, 'packages', 'storefront-next-runtime', 'dist', 'scapi.js'), '');
}

function staticPromptAdapter(overrides: Partial<EditableEnvValues> = {}): PromptAdapter {
  return {
    async reviewEnvironment(values: EditableEnvValues): Promise<EditableEnvValues> {
      return { ...values, ...overrides };
    },
  };
}

afterEach(() => {
  while (tempDirs.length > 0) {
    fs.rmSync(tempDirs.pop()!, { recursive: true, force: true });
  }
});

describe('core helpers', () => {
  it('rewrites workspace and stale file dependencies', () => {
    const workspaceRoot = makeTempDir('entrypoint-pkg-');
    const packageJsonPath = path.join(workspaceRoot, 'package.json');
    fs.writeFileSync(packageJsonPath, JSON.stringify({
      dependencies: {
        '@salesforce/storefront-next-runtime': 'workspace:*',
      },
      devDependencies: {
        '@salesforce/storefront-next-dev': 'file:///old/packages/storefront-next-dev',
      },
    }));

    const changed = updatePackageReferences(packageJsonPath, '/tmp/SFCC-Odyssey');
    const updated = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));

    expect(changed).toBe(2);
    expect(updated.dependencies['@salesforce/storefront-next-runtime']).toContain('/tmp/SFCC-Odyssey/packages/storefront-next-runtime');
    expect(updated.devDependencies['@salesforce/storefront-next-dev']).toContain('/tmp/SFCC-Odyssey/packages/storefront-next-dev');
  });

  it('rewrites workspace dependencies to Windows file URLs', () => {
    const workspaceRoot = makeTempDir('entrypoint-pkg-win-');
    const packageJsonPath = path.join(workspaceRoot, 'package.json');
    fs.writeFileSync(packageJsonPath, JSON.stringify({
      dependencies: {
        '@salesforce/storefront-next-runtime': 'workspace:*',
      },
      devDependencies: {
        '@salesforce/storefront-next-dev': 'file:///old/packages/storefront-next-dev',
      },
    }));

    const changed = updatePackageReferences(packageJsonPath, 'C:\\Work Folder\\SFCC-Odyssey');
    const updated = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));

    expect(changed).toBe(2);
    expect(updated.dependencies['@salesforce/storefront-next-runtime']).toBe(
      'file:///C:/Work%20Folder/SFCC-Odyssey/packages/storefront-next-runtime'
    );
    expect(updated.devDependencies['@salesforce/storefront-next-dev']).toBe(
      'file:///C:/Work%20Folder/SFCC-Odyssey/packages/storefront-next-dev'
    );
  });

  it('resolves the sfnext Windows shim when only .cmd exists', () => {
    const workspaceRoot = makeTempDir('entrypoint-sfnext-win-');
    const binaryDir = path.join(workspaceRoot, 'node_modules', '.bin');
    fs.mkdirSync(binaryDir, { recursive: true });
    fs.writeFileSync(path.join(binaryDir, 'sfnext.cmd'), '');

    expect(resolveSfnextBinary(workspaceRoot)).toBe(
      path.join(binaryDir, 'sfnext.cmd')
    );
  });

  it('detects pending interventions without responses', () => {
    const workspaceRoot = makeTempDir('entrypoint-intervention-');
    const interventionDir = path.join(workspaceRoot, 'intervention');
    fs.mkdirSync(interventionDir, { recursive: true });
    fs.writeFileSync(path.join(interventionDir, 'needed-worker-a.json'), JSON.stringify({ question: 'Proceed?' }));
    fs.writeFileSync(path.join(interventionDir, 'needed-worker-b.json'), JSON.stringify({ question: 'Skip?' }));
    fs.writeFileSync(path.join(interventionDir, 'response-worker-b.json'), JSON.stringify({ answer: 'yes' }));

    const pending = detectPendingInterventions(interventionDir);

    expect(pending).toEqual([{ workerId: 'worker-a', question: 'Proceed?' }]);
  });

  it('resolves host runtime config from merged env', () => {
    const workspaceRoot = makeTempDir('entrypoint-config-');
    fs.writeFileSync(path.join(workspaceRoot, '.env'), 'MONOREPO_SOURCE=/tmp/monorepo\nAUTO_START=false\n');

    const config = resolveRuntimeConfig({
      workspaceRoot,
      env: {
        PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH: '/custom/chrome',
      },
    });

    expect(config.monorepoSourcePath).toBe('/tmp/monorepo');
    expect(config.autoStart).toBe(false);
    expect(config.chromiumPath).toBe('/custom/chrome');
  });

  it('runs the coordinator in dry-run mode with mocked commands', async () => {
    const workspaceRoot = makeTempDir('entrypoint-dry-run-');
    const monorepoRoot = makeTempDir('entrypoint-monorepo-');
    seedWorkspace(workspaceRoot);
    seedMonorepo(monorepoRoot);
    const packageJsonPath = path.join(workspaceRoot, 'storefront-next', 'package.json');
    const initialPackageJson = `${JSON.stringify({
      dependencies: {
        '@salesforce/storefront-next-runtime': 'workspace:*',
      },
      devDependencies: {
        '@salesforce/storefront-next-dev': 'file:///old/packages/storefront-next-dev',
      },
    }, null, 2)}\n`;
    fs.writeFileSync(packageJsonPath, initialPackageJson);

    const runner = createDryRunCommandRunner((spec) => {
      if (spec.command === 'git' && spec.args?.[0] === 'status') {
        return { stdout: '' };
      }
      return { exitCode: 0 };
    });

    const exitCode = await runMigrationEntrypoint({
      workspaceRoot,
      dryRun: true,
      interactive: false,
      commandRunner: runner,
      promptAdapter: staticPromptAdapter({
        MONOREPO_SOURCE: monorepoRoot,
        PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH: '/custom/chrome',
      }),
      commandExists: () => true,
      env: {
        PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH: '/custom/chrome',
      },
    });

    expect(exitCode).toBe(0);
    expect(runner.history.some((entry) => entry.command === 'pnpm')).toBe(true);
    expect(runner.history.some((entry) => entry.command === 'npx')).toBe(true);
    expect(fs.existsSync(path.join(workspaceRoot, '.env'))).toBe(false);
    expect(fs.existsSync(path.join(workspaceRoot, '.migration-state', 'phase1-complete'))).toBe(false);
    expect(fs.readFileSync(packageJsonPath, 'utf-8')).toBe(initialPackageJson);
  });

  it('returns intervention exit code when pending responses remain', async () => {
    const workspaceRoot = makeTempDir('entrypoint-pending-');
    const monorepoRoot = makeTempDir('entrypoint-monorepo-');
    seedWorkspace(workspaceRoot);
    seedMonorepo(monorepoRoot);
    fs.writeFileSync(
      path.join(workspaceRoot, 'intervention', 'needed-worker-a.json'),
      JSON.stringify({ question: 'Need input' })
    );

    const exitCode = await runMigrationEntrypoint({
      workspaceRoot,
      dryRun: true,
      interactive: false,
      commandRunner: createDryRunCommandRunner(),
      promptAdapter: staticPromptAdapter({
        MONOREPO_SOURCE: monorepoRoot,
        PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH: '/custom/chrome',
      }),
      commandExists: () => true,
      env: {
        PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH: '/custom/chrome',
      },
    });

    expect(exitCode).toBe(42);
  });

  it('repairs an existing standalone project when the phase marker is missing', async () => {
    const workspaceRoot = makeTempDir('entrypoint-existing-project-');
    const monorepoRoot = makeTempDir('entrypoint-monorepo-');
    seedWorkspace(workspaceRoot);
    seedMonorepo(monorepoRoot);

    fs.writeFileSync(
      path.join(workspaceRoot, 'storefront-next', 'package.json'),
      JSON.stringify({
        dependencies: {
          '@salesforce/storefront-next-runtime': 'workspace:*',
        },
      })
    );
    fs.mkdirSync(path.join(workspaceRoot, '.migration-state'), { recursive: true });

    const runner = createDryRunCommandRunner();
    const exitCode = await runMigrationEntrypoint({
      workspaceRoot,
      dryRun: false,
      interactive: false,
      commandRunner: runner,
      promptAdapter: staticPromptAdapter({
        MONOREPO_SOURCE: monorepoRoot,
        PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH: '/custom/chrome',
      }),
      commandExists: () => true,
      env: {
        PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH: '/custom/chrome',
      },
    });

    expect(exitCode).toBe(0);
    expect(fs.existsSync(path.join(workspaceRoot, '.migration-state', 'phase1-complete'))).toBe(true);
    expect(runner.history.some((entry) => entry.command === 'node')).toBe(false);
    expect(runner.history.some((entry) => entry.command === 'pnpm')).toBe(true);
  });
});
