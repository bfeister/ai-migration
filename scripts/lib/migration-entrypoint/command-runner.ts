import { spawn } from 'child_process';

const WINDOWS_COMMAND_SHIMS = new Set(['pnpm', 'npx']);

export interface CommandSpec {
  command: string;
  args?: string[];
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  input?: string;
  description?: string;
  printStdout?: boolean;
  printStderr?: boolean;
  allowFailure?: boolean;
  inheritStdio?: boolean;
}

export interface CommandResult {
  command: string;
  args: string[];
  cwd: string;
  exitCode: number;
  stdout: string;
  stderr: string;
  skipped: boolean;
}

export interface CommandRunner {
  readonly dryRun: boolean;
  readonly history: CommandResult[];
  run(spec: CommandSpec): Promise<CommandResult>;
}

export type DryRunResponder = (spec: CommandSpec) => Partial<CommandResult> | undefined;

function withDefaults(spec: CommandSpec): Required<CommandSpec> {
  return {
    command: spec.command,
    args: spec.args ?? [],
    cwd: spec.cwd ?? process.cwd(),
    env: spec.env ?? process.env,
    input: spec.input ?? '',
    description: spec.description ?? '',
    printStdout: spec.printStdout ?? true,
    printStderr: spec.printStderr ?? true,
    allowFailure: spec.allowFailure ?? false,
    inheritStdio: spec.inheritStdio ?? false,
  };
}

export function normalizeCommandForPlatform(
  command: string,
  platform = process.platform
): string {
  if (platform !== 'win32') return command;
  if (/\.(cmd|exe|bat|ps1)$/i.test(command)) return command;

  return WINDOWS_COMMAND_SHIMS.has(command.toLowerCase())
    ? `${command}.cmd`
    : command;
}

export function createRealCommandRunner(): CommandRunner {
  const history: CommandResult[] = [];

  return {
    dryRun: false,
    history,
    async run(spec) {
      const normalized = withDefaults(spec);
      const command = normalizeCommandForPlatform(normalized.command);

      return await new Promise<CommandResult>((resolve, reject) => {
        const child = spawn(command, normalized.args, {
          cwd: normalized.cwd,
          env: normalized.env,
          stdio: normalized.inheritStdio ? 'inherit' : 'pipe',
          shell: false,
        });

        let stdout = '';
        let stderr = '';

        if (!normalized.inheritStdio) {
          child.stdout.on('data', (data: Buffer) => {
            const text = data.toString();
            stdout += text;
            if (normalized.printStdout) process.stdout.write(data);
          });

          child.stderr.on('data', (data: Buffer) => {
            const text = data.toString();
            stderr += text;
            if (normalized.printStderr) process.stderr.write(data);
          });
        }

        child.on('error', (error) => {
          reject(error);
        });

        child.on('close', (code) => {
          const result: CommandResult = {
            command,
            args: normalized.args,
            cwd: normalized.cwd,
            exitCode: code ?? 1,
            stdout,
            stderr,
            skipped: false,
          };
          history.push(result);

          if (!normalized.allowFailure && result.exitCode !== 0) {
            reject(
              new Error(
                `Command failed (${result.exitCode}): ${command} ${normalized.args.join(' ')}`
              )
            );
            return;
          }

          resolve(result);
        });

        if (!normalized.inheritStdio) {
          if (normalized.input) {
            child.stdin.write(normalized.input);
          }
          child.stdin.end();
        }
      });
    },
  };
}

export function createDryRunCommandRunner(
  responder?: DryRunResponder
): CommandRunner {
  const history: CommandResult[] = [];

  return {
    dryRun: true,
    history,
    async run(spec) {
      const normalized = withDefaults(spec);
      const response = responder?.(normalized);
      const result: CommandResult = {
        command: normalized.command,
        args: normalized.args,
        cwd: normalized.cwd,
        exitCode: response?.exitCode ?? 0,
        stdout: response?.stdout ?? '',
        stderr: response?.stderr ?? '',
        skipped: true,
      };
      history.push(result);
      return result;
    },
  };
}
