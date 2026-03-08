import { spawnSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import prompts from 'prompts';
import { pathToFileURL } from 'url';
import { CLAUDE_ALLOWED_TOOLS_STR } from '../claude-tools.js';
import {
    type CommandRunner,
    createDryRunCommandRunner,
    createRealCommandRunner
} from './command-runner.js';
import { loadEnvFile, writeEnvFile } from './env-file.js';

export interface EditableEnvValues {
    MONOREPO_SOURCE: string;
    SFRA_SOURCE: string;
    SFRA_TEMPLATE_BASE: string;
    PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH: string;
    PLAN_FILE: string;
    MIGRATION_PLAN: string;
    CLEAN_START: string;
    KEEPALIVE: string;
    AUTO_START: string;
    ANTHROPIC_API_KEY: string;
    ANTHROPIC_AUTH_TOKEN: string;
    ANTHROPIC_BEDROCK_BASE_URL: string;
    CLAUDE_CODE_USE_BEDROCK: string;
    CLAUDE_CODE_SKIP_BEDROCK_AUTH: string;
    NODE_TLS_REJECT_UNAUTHORIZED: string;
}

export interface RuntimeConfig {
    workspaceRoot: string;
    envFilePath: string;
    inContainer: boolean;
    runtimeName: 'container' | 'script';
    useTmpStrategy: boolean;
    monorepoSourcePath: string;
    monorepoBuild: string;
    standaloneProject: string;
    standaloneBuild: string;
    templateTempDir: string;
    interventionDir: string;
    logFile: string;
    stateDir: string;
    planFile: string;
    migrationPlan: string;
    keepalive: boolean;
    autoStart: boolean;
    cleanStart: boolean;
    chromiumPath: string;
    attachCommand: string;
    editableEnv: EditableEnvValues;
}

export interface PromptAdapter {
    reviewEnvironment(
        values: EditableEnvValues,
        config: RuntimeConfig
    ): Promise<EditableEnvValues>;
}

export interface RunEntrypointOptions {
    workspaceRoot?: string;
    env?: NodeJS.ProcessEnv;
    dryRun?: boolean;
    interactive?: boolean;
    commandRunner?: CommandRunner;
    promptAdapter?: PromptAdapter;
    commandExists?: (command: string) => boolean;
}

const MONOREPO_EXCLUDES = new Set([
    'node_modules',
    '.pnpm-store',
    '.git',
    'dist',
    'build',
    '.next',
    'coverage',
    '.nyc_output',
    'test-results',
    'playwright-report'
]);

const colors = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    red: '\x1b[31m'
};

export class MigrationLogger {
    constructor(
        private readonly logFile: string,
        private readonly dryRun: boolean
    ) {}

    info(message: string): void {
        this.write('INFO', colors.blue, message);
    }

    success(message: string): void {
        this.write('SUCCESS', colors.green, message);
    }

    warn(message: string): void {
        this.write('WARNING', colors.yellow, message);
    }

    error(message: string): void {
        this.write('ERROR', colors.red, message);
    }

    init(): void {
        if (this.dryRun) return;
        fs.writeFileSync(
            this.logFile,
            `# Migration Log - ${new Date().toISOString()}\n\n`
        );
    }

    private write(
        level: 'INFO' | 'SUCCESS' | 'WARNING' | 'ERROR',
        color: string,
        message: string
    ): void {
        const timestamp = new Date().toISOString();
        const line = `${color}[${level}]${colors.reset} ${timestamp} - ${message}`;
        console.log(line);
        if (!this.dryRun) {
            fs.appendFileSync(this.logFile, `${line}\n`);
        }
    }
}

export async function runMigrationEntrypoint(
    options: RunEntrypointOptions = {}
): Promise<number> {
    const workspaceRoot = path.resolve(options.workspaceRoot ?? process.cwd());
    const env = { ...process.env, ...options.env };
    const dryRun = options.dryRun ?? false;
    const interactive = options.interactive ?? Boolean(process.stdin.isTTY);
    const runner =
        options.commandRunner ??
        (dryRun ? createDryRunCommandRunner() : createRealCommandRunner());
    const commandExistsFn = options.commandExists ?? commandExists;

    let config = resolveRuntimeConfig({ workspaceRoot, env });
    const promptAdapter =
        options.promptAdapter ?? createInteractivePromptAdapter(interactive);
    const reviewedEnv = await promptAdapter.reviewEnvironment(
        config.editableEnv,
        config
    );
    if (!dryRun) {
        writeEnvFile(config.envFilePath, { ...reviewedEnv });
    }

    config = resolveRuntimeConfig({
        workspaceRoot,
        env: {
            ...env,
            ...reviewedEnv
        }
    });

    const logger = new MigrationLogger(config.logFile, dryRun);

    validateEnvironment(config, logger, commandExistsFn);
    handleCleanStart(config, logger, dryRun);
    initializeWorkspace(config, logger, dryRun);
    logAuthentication(config, logger);

    await runBootstrapPhase(config, runner, logger, dryRun);
    await runBaselinePhase(config, runner, logger, dryRun);
    await runPlanningPhase(config, runner, logger, dryRun, interactive);

    if (!config.autoStart) {
        logger.info(`AUTO_START disabled. Run manually with: pnpm execute`);
        return 0;
    }

    const executeResult = await runExecutionPhase(
        config,
        runner,
        logger,
        interactive
    );
    const finalCode = await finalizeRun(
        config,
        logger,
        executeResult.exitCode,
        dryRun
    );

    if (finalCode !== 0 && config.keepalive && !dryRun) {
        logger.warn(
            `KEEPALIVE=true. ${config.runtimeName} remains available for inspection.`
        );
        logger.info(`Attach with: ${config.attachCommand}`);
        await keepAlive(config);
    }

    return finalCode;
}

export function resolveRuntimeConfig({
    workspaceRoot,
    env
}: {
    workspaceRoot: string;
    env: NodeJS.ProcessEnv;
}): RuntimeConfig {
    const envFilePath = path.join(workspaceRoot, '.env');
    const envFromFile = loadEnvFile(envFilePath);
    const mergedEnv = { ...envFromFile, ...env };
    const inContainer =
        mergedEnv.DOCKER_CONTAINER === 'true' || fs.existsSync('/.dockerenv');
    const tmpRoot = os.tmpdir();
    const detectedChromium = detectChromiumPath(
        mergedEnv.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
    );

    const editableEnv: EditableEnvValues = {
        MONOREPO_SOURCE:
            mergedEnv.MONOREPO_SOURCE ??
            (inContainer ? '/monorepo-source' : ''),
        SFRA_SOURCE: mergedEnv.SFRA_SOURCE ?? '',
        SFRA_TEMPLATE_BASE:
            mergedEnv.SFRA_TEMPLATE_BASE ??
            'cartridges/app_storefront_base/cartridge/templates/default',
        PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH:
            mergedEnv.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ?? detectedChromium,
        PLAN_FILE:
            mergedEnv.PLAN_FILE ??
            path.join(workspaceRoot, 'migration-plan.md'),
        MIGRATION_PLAN:
            mergedEnv.MIGRATION_PLAN ??
            path.join(workspaceRoot, 'migration-main-plan.md'),
        CLEAN_START: normalizeBooleanString(mergedEnv.CLEAN_START, false),
        KEEPALIVE: normalizeBooleanString(mergedEnv.KEEPALIVE, false),
        AUTO_START: normalizeBooleanString(mergedEnv.AUTO_START, true),
        ANTHROPIC_API_KEY: mergedEnv.ANTHROPIC_API_KEY ?? '',
        ANTHROPIC_AUTH_TOKEN: mergedEnv.ANTHROPIC_AUTH_TOKEN ?? '',
        ANTHROPIC_BEDROCK_BASE_URL: mergedEnv.ANTHROPIC_BEDROCK_BASE_URL ?? '',
        CLAUDE_CODE_USE_BEDROCK: normalizeBooleanString(
            mergedEnv.CLAUDE_CODE_USE_BEDROCK,
            false
        ),
        CLAUDE_CODE_SKIP_BEDROCK_AUTH: normalizeBooleanString(
            mergedEnv.CLAUDE_CODE_SKIP_BEDROCK_AUTH,
            false
        ),
        NODE_TLS_REJECT_UNAUTHORIZED:
            mergedEnv.NODE_TLS_REJECT_UNAUTHORIZED ?? ''
    };

    return {
        workspaceRoot,
        envFilePath,
        inContainer,
        runtimeName: inContainer ? 'container' : 'script',
        useTmpStrategy: inContainer,
        monorepoSourcePath: editableEnv.MONOREPO_SOURCE,
        monorepoBuild: inContainer
            ? path.join(tmpRoot, 'SFCC-Odyssey')
            : editableEnv.MONOREPO_SOURCE,
        standaloneProject: path.join(workspaceRoot, 'storefront-next'),
        standaloneBuild: inContainer
            ? path.join(tmpRoot, 'storefront-next-built')
            : path.join(workspaceRoot, 'storefront-next'),
        templateTempDir: path.join(tmpRoot, 'template-clean'),
        interventionDir: path.join(workspaceRoot, 'intervention'),
        logFile: path.join(workspaceRoot, 'migration-log.md'),
        stateDir: path.join(workspaceRoot, '.migration-state'),
        planFile: editableEnv.PLAN_FILE,
        migrationPlan: editableEnv.MIGRATION_PLAN,
        keepalive: editableEnv.KEEPALIVE === 'true',
        autoStart: editableEnv.AUTO_START === 'true',
        cleanStart: editableEnv.CLEAN_START === 'true',
        chromiumPath: editableEnv.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
        attachCommand: inContainer
            ? 'docker compose exec claude-migration bash'
            : 'pnpm entrypoint',
        editableEnv
    };
}

export function createInteractivePromptAdapter(
    interactive: boolean
): PromptAdapter {
    return {
        async reviewEnvironment(values, config) {
            if (!interactive) return values;

            printEnvironmentSummary(values, config);

            const authMode = values.ANTHROPIC_AUTH_TOKEN
                ? 'bedrock'
                : values.ANTHROPIC_API_KEY
                  ? 'api'
                  : 'none';

            const baseAnswers = await prompts(
                [
                    {
                        type: 'text',
                        name: 'MONOREPO_SOURCE',
                        message: 'Storefront Next Monorepo source path:',
                        initial: values.MONOREPO_SOURCE,
                        validate: (value: string) =>
                            value.trim() !== '' || 'MONOREPO_SOURCE is required'
                    },
                    {
                        type: 'text',
                        name: 'SFRA_SOURCE',
                        message: 'SFRA source path (optional):',
                        initial: values.SFRA_SOURCE
                    },
                    {
                        type: 'text',
                        name: 'SFRA_TEMPLATE_BASE',
                        message: 'SFRA template base:',
                        initial: values.SFRA_TEMPLATE_BASE
                    },
                    {
                        type: 'text',
                        name: 'PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH',
                        message: 'Chromium executable path:',
                        initial: values.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
                    },
                    {
                        type: 'text',
                        name: 'PLAN_FILE',
                        message: 'Plan file path:',
                        initial: values.PLAN_FILE
                    },
                    {
                        type: 'text',
                        name: 'MIGRATION_PLAN',
                        message: 'Migration main plan path:',
                        initial: values.MIGRATION_PLAN
                    },
                    {
                        type: 'confirm',
                        name: 'CLEAN_START',
                        message: 'Clean start?',
                        initial: values.CLEAN_START === 'true'
                    },
                    {
                        type: 'confirm',
                        name: 'KEEPALIVE',
                        message: 'Keep process alive on failure?',
                        initial: values.KEEPALIVE === 'true'
                    },
                    {
                        type: 'confirm',
                        name: 'AUTO_START',
                        message: 'Auto-start execution phase?',
                        initial: values.AUTO_START === 'true'
                    },
                    {
                        type: 'select',
                        name: 'AUTH_MODE',
                        message: 'Authentication mode:',
                        initial:
                            authMode === 'api'
                                ? 1
                                : authMode === 'bedrock'
                                  ? 2
                                  : 0,
                        choices: [
                            { title: 'None', value: 'none' },
                            { title: 'Anthropic API key', value: 'api' },
                            { title: 'Bedrock / auth token', value: 'bedrock' }
                        ]
                    }
                ],
                {
                    onCancel: () => {
                        throw new Error('Environment review cancelled');
                    }
                }
            );

            const reviewed: EditableEnvValues = {
                ...values,
                ...baseAnswers,
                CLEAN_START: String(Boolean(baseAnswers.CLEAN_START)),
                KEEPALIVE: String(Boolean(baseAnswers.KEEPALIVE)),
                AUTO_START: String(Boolean(baseAnswers.AUTO_START))
            };

            if (baseAnswers.AUTH_MODE === 'api') {
                const authAnswers = await prompts([
                    {
                        type: 'password',
                        name: 'ANTHROPIC_API_KEY',
                        message:
                            'Anthropic API key (leave blank to keep current):'
                    }
                ]);
                reviewed.ANTHROPIC_API_KEY =
                    authAnswers.ANTHROPIC_API_KEY || values.ANTHROPIC_API_KEY;
                reviewed.ANTHROPIC_AUTH_TOKEN = '';
            } else if (baseAnswers.AUTH_MODE === 'bedrock') {
                const authAnswers = await prompts([
                    {
                        type: 'password',
                        name: 'ANTHROPIC_AUTH_TOKEN',
                        message:
                            'Anthropic auth token (leave blank to keep current):'
                    },
                    {
                        type: 'text',
                        name: 'ANTHROPIC_BEDROCK_BASE_URL',
                        message: 'Bedrock base URL:',
                        initial: values.ANTHROPIC_BEDROCK_BASE_URL
                    },
                    {
                        type: 'confirm',
                        name: 'CLAUDE_CODE_USE_BEDROCK',
                        message: 'Set CLAUDE_CODE_USE_BEDROCK?',
                        initial: values.CLAUDE_CODE_USE_BEDROCK === 'true'
                    },
                    {
                        type: 'confirm',
                        name: 'CLAUDE_CODE_SKIP_BEDROCK_AUTH',
                        message: 'Set CLAUDE_CODE_SKIP_BEDROCK_AUTH?',
                        initial: values.CLAUDE_CODE_SKIP_BEDROCK_AUTH === 'true'
                    },
                    {
                        type: 'text',
                        name: 'NODE_TLS_REJECT_UNAUTHORIZED',
                        message: 'NODE_TLS_REJECT_UNAUTHORIZED:',
                        initial: values.NODE_TLS_REJECT_UNAUTHORIZED
                    }
                ]);
                reviewed.ANTHROPIC_API_KEY = '';
                reviewed.ANTHROPIC_AUTH_TOKEN =
                    authAnswers.ANTHROPIC_AUTH_TOKEN ||
                    values.ANTHROPIC_AUTH_TOKEN;
                reviewed.ANTHROPIC_BEDROCK_BASE_URL =
                    authAnswers.ANTHROPIC_BEDROCK_BASE_URL;
                reviewed.CLAUDE_CODE_USE_BEDROCK = String(
                    Boolean(authAnswers.CLAUDE_CODE_USE_BEDROCK)
                );
                reviewed.CLAUDE_CODE_SKIP_BEDROCK_AUTH = String(
                    Boolean(authAnswers.CLAUDE_CODE_SKIP_BEDROCK_AUTH)
                );
                reviewed.NODE_TLS_REJECT_UNAUTHORIZED =
                    authAnswers.NODE_TLS_REJECT_UNAUTHORIZED;
            } else {
                reviewed.ANTHROPIC_API_KEY = '';
                reviewed.ANTHROPIC_AUTH_TOKEN = '';
            }

            return reviewed;
        }
    };
}

export function updatePackageReferences(
    packageJsonPath: string,
    monorepoBuild: string
): number {
    const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
    let converted = 0;

    for (const field of ['dependencies', 'devDependencies']) {
        const deps = pkg[field];
        if (!deps) continue;

        for (const [name, currentValue] of Object.entries<string>(deps)) {
            const pkgName = name.split('/').pop() ?? name;
            const expected = toDependencyFileUrl(
                path.join(monorepoBuild, 'packages', pkgName)
            );
            if (currentValue.startsWith('workspace:')) {
                deps[name] = expected;
                converted += 1;
            } else if (
                currentValue.startsWith('file://') &&
                currentValue !== expected &&
                currentValue.includes('/packages/')
            ) {
                deps[name] = expected;
                converted += 1;
            }
        }
    }

    if (converted > 0) {
        fs.writeFileSync(packageJsonPath, `${JSON.stringify(pkg, null, 2)}\n`);
    }

    return converted;
}

function toDependencyFileUrl(targetPath: string): string {
    if (/^[A-Za-z]:[\\/]/.test(targetPath)) {
        return new URL(`file:///${targetPath.replace(/\\/g, '/')}`).href;
    }

    if (/^\\\\/.test(targetPath)) {
        return new URL(`file://${targetPath.slice(2).replace(/\\/g, '/')}`).href;
    }

    return pathToFileURL(targetPath).href;
}

export function detectPendingInterventions(
    interventionDir: string
): Array<{ workerId: string; question: string }> {
    if (!fs.existsSync(interventionDir)) return [];

    const pending: Array<{ workerId: string; question: string }> = [];
    for (const entry of fs.readdirSync(interventionDir)) {
        if (!entry.startsWith('needed-') || !entry.endsWith('.json')) continue;
        const workerId = entry.slice('needed-'.length, -'.json'.length);
        const responsePath = path.join(
            interventionDir,
            `response-${workerId}.json`
        );
        if (fs.existsSync(responsePath)) continue;

        const neededPath = path.join(interventionDir, entry);
        let question = 'Unknown';
        try {
            const parsed = JSON.parse(fs.readFileSync(neededPath, 'utf-8'));
            question = parsed.question ?? question;
        } catch {
            // keep fallback
        }
        pending.push({ workerId, question });
    }

    return pending;
}

function validateEnvironment(
    config: RuntimeConfig,
    logger: MigrationLogger,
    commandExistsFn: (command: string) => boolean
): void {
    const missingCommands = ['node', 'pnpm', 'git', 'claude'].filter(
        (command) => !commandExistsFn(command)
    );
    if (missingCommands.length > 0) {
        throw new Error(
            `Missing required commands: ${missingCommands.join(', ')}`
        );
    }

    if (!config.inContainer && !config.monorepoSourcePath) {
        throw new Error('MONOREPO_SOURCE must be set for host execution.');
    }

    if (config.monorepoSourcePath) {
        if (!fs.existsSync(config.monorepoSourcePath)) {
            throw new Error(
                `MONOREPO_SOURCE path does not exist: ${config.monorepoSourcePath}`
            );
        }
        if (
            !fs.existsSync(path.join(config.monorepoSourcePath, 'packages')) ||
            !fs.existsSync(path.join(config.monorepoSourcePath, 'package.json'))
        ) {
            throw new Error(
                `MONOREPO_SOURCE does not look like the expected monorepo: ${config.monorepoSourcePath}`
            );
        }
    }

    if (config.editableEnv.SFRA_SOURCE) {
        if (!fs.existsSync(config.editableEnv.SFRA_SOURCE)) {
            logger.warn(
                `SFRA_SOURCE does not exist: ${config.editableEnv.SFRA_SOURCE}`
            );
        } else if (
            !fs.existsSync(
                path.join(config.editableEnv.SFRA_SOURCE, 'cartridges')
            )
        ) {
            logger.warn(
                `SFRA_SOURCE does not look like an SFRA checkout: ${config.editableEnv.SFRA_SOURCE}`
            );
        }
    }

    if (!config.inContainer && !config.chromiumPath) {
        throw new Error(
            'Chrome/Chromium not found. Set PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH or install a browser.'
        );
    }
}

function handleCleanStart(
    config: RuntimeConfig,
    logger: MigrationLogger,
    dryRun: boolean
): void {
    if (!config.cleanStart) return;

    logger.warn('Clean start requested.');
    const removals = [
        path.join(config.workspaceRoot, '.claude-session-id'),
        config.stateDir,
        path.join(config.workspaceRoot, 'claude-output.jsonl'),
        path.join(config.workspaceRoot, 'scripts/generated'),
        path.join(config.workspaceRoot, 'analysis', 'screenshot-commands.json')
    ];

    for (const target of removals) {
        if (!fs.existsSync(target)) continue;
        logger.info(
            `${dryRun ? 'Would remove' : 'Removing'} ${path.relative(
                config.workspaceRoot,
                target
            )}`
        );
        if (!dryRun) {
            fs.rmSync(target, { recursive: true, force: true });
        }
    }

    if (fs.existsSync(config.interventionDir)) {
        const interventionEntries = fs
            .readdirSync(config.interventionDir)
            .filter(
                (entry) =>
                    entry.startsWith('needed-') || entry.startsWith('response-')
            )
            .map((entry) => path.join(config.interventionDir, entry));
        for (const target of interventionEntries) {
            logger.info(
                `${dryRun ? 'Would remove' : 'Removing'} ${path.relative(
                    config.workspaceRoot,
                    target
                )}`
            );
            if (!dryRun) fs.rmSync(target, { force: true });
        }
    }

    if (fs.existsSync(config.logFile)) {
        const backupName = `migration-log-backup-${timestampForFile()}.md`;
        const backupPath = path.join(config.workspaceRoot, backupName);
        logger.info(
            `${
                dryRun ? 'Would back up' : 'Backing up'
            } migration-log.md to ${backupName}`
        );
        if (!dryRun) {
            fs.renameSync(config.logFile, backupPath);
        }
    }
}

function initializeWorkspace(
    config: RuntimeConfig,
    logger: MigrationLogger,
    dryRun: boolean
): void {
    if (!dryRun) {
        fs.mkdirSync(config.stateDir, { recursive: true });
        fs.mkdirSync(path.join(config.interventionDir, 'history'), {
            recursive: true
        });
        logger.init();
    }

    logger.info(`Migration worker starting in ${config.runtimeName} mode`);
    logger.info(`Intervention directory: ${config.interventionDir}`);
    logger.info(`Plan file: ${config.planFile}`);
    logger.success('Environment validated');
}

function logAuthentication(
    config: RuntimeConfig,
    logger: MigrationLogger
): void {
    if (config.editableEnv.ANTHROPIC_AUTH_TOKEN) {
        logger.success('Authentication configured (Bedrock)');
    } else if (config.editableEnv.ANTHROPIC_API_KEY) {
        logger.success('Authentication configured (API key)');
    } else {
        logger.warn(
            'Neither ANTHROPIC_API_KEY nor ANTHROPIC_AUTH_TOKEN is set'
        );
    }
}

async function runBootstrapPhase(
    config: RuntimeConfig,
    runner: CommandRunner,
    logger: MigrationLogger,
    dryRun: boolean
): Promise<void> {
    const markerPath = path.join(config.stateDir, 'phase1-complete');
    if (phase1IsComplete(config)) {
        logger.success(
            `Phase 1 already complete (${fs
                .readFileSync(markerPath, 'utf-8')
                .trim()})`
        );
        return;
    }

    logger.info(
        'Running Phase 1: Build monorepo and generate standalone project'
    );

    if (
        config.useTmpStrategy &&
        fs.existsSync(path.join(config.standaloneProject, 'node_modules')) &&
        !isSymlink(path.join(config.standaloneProject, 'node_modules')) &&
        !dryRun
    ) {
        fs.rmSync(path.join(config.standaloneProject, 'node_modules'), {
            recursive: true,
            force: true
        });
    }

    await ensureMonorepoBuilt(config, runner, logger, dryRun);
    await ensureStandaloneProject(config, runner, logger, dryRun);

    if (!dryRun) {
        fs.writeFileSync(markerPath, `${new Date().toISOString()}\n`);
    }
    logger.success('Phase 1 complete: standalone project ready');
}

async function ensureMonorepoBuilt(
    config: RuntimeConfig,
    runner: CommandRunner,
    logger: MigrationLogger,
    dryRun: boolean
): Promise<void> {
    const cliPath = path.join(
        config.monorepoBuild,
        'packages',
        'storefront-next-dev',
        'dist',
        'cli.js'
    );
    if (fs.existsSync(cliPath)) {
        logger.success(`Monorepo already built at ${config.monorepoBuild}`);
        return;
    }

    if (!config.monorepoSourcePath) {
        throw new Error('MONOREPO_SOURCE is required to build the monorepo.');
    }

    if (config.useTmpStrategy) {
        logger.info(
            `Copying monorepo into temporary workspace ${config.monorepoBuild}`
        );
        if (!dryRun) {
            fs.rmSync(config.monorepoBuild, { recursive: true, force: true });
            copyDirectory(
                config.monorepoSourcePath,
                config.monorepoBuild,
                MONOREPO_EXCLUDES
            );
        }
    }

    await installWithFallback(runner, config.monorepoBuild, logger, {
        description: 'monorepo dependencies'
    });

    await runner.run({
        command: 'pnpm',
        args: ['-r', 'build'],
        cwd: config.monorepoBuild,
        env: { ...process.env, CI: 'true' },
        description: 'Build monorepo packages'
    });

    const requiredOutputs = [
        path.join(
            config.monorepoBuild,
            'packages',
            'storefront-next-dev',
            'dist',
            'cli.js'
        ),
        path.join(
            config.monorepoBuild,
            'packages',
            'storefront-next-runtime',
            'dist',
            'scapi.js'
        )
    ];
    for (const requiredPath of requiredOutputs) {
        if (!dryRun && !fs.existsSync(requiredPath)) {
            throw new Error(`Expected build output missing: ${requiredPath}`);
        }
    }
}

async function ensureStandaloneProject(
    config: RuntimeConfig,
    runner: CommandRunner,
    logger: MigrationLogger,
    dryRun: boolean
): Promise<void> {
    if (standaloneReady(config)) {
        logger.success('Standalone project already complete');
        if (!dryRun) {
            const fixed = updatePackageReferences(
                path.join(config.standaloneProject, 'package.json'),
                config.monorepoBuild
            );
            if (fixed > 0) {
                logger.info(`Fixed ${fixed} monorepo package reference(s)`);
                await installStandaloneDependencies(config, runner, logger);
            }
        }
        return;
    }

    const packageJsonPath = path.join(config.standaloneProject, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
        logger.info(
            'Existing standalone project detected without a complete Phase 1 marker. Repairing in place.'
        );

        if (!dryRun) {
            const fixed = updatePackageReferences(
                packageJsonPath,
                config.monorepoBuild
            );
            if (fixed > 0) {
                logger.info(`Fixed ${fixed} monorepo package reference(s)`);
            }

            await installStandaloneDependencies(config, runner, logger);

            const envDefault = path.join(
                config.standaloneProject,
                '.env.default'
            );
            const envFile = path.join(config.standaloneProject, '.env');
            if (!fs.existsSync(envFile) && fs.existsSync(envDefault)) {
                fs.copyFileSync(envDefault, envFile);
                logger.success(
                    'Created storefront-next/.env from .env.default'
                );
            }
        }

        return;
    }

    logger.info('Standalone project missing or incomplete. Regenerating.');
    if (!dryRun) {
        prepareTemplateRepository(config, logger);
        if (
            fs.existsSync(config.standaloneProject) &&
            !fs.existsSync(packageJsonPath)
        ) {
            fs.rmSync(config.standaloneProject, {
                recursive: true,
                force: true
            });
        }
    }

    const cliPath = path.join(
        config.monorepoBuild,
        'packages',
        'storefront-next-dev',
        'dist',
        'cli.js'
    );
    const templateUrl = pathToFileURL(config.templateTempDir).href;
    await runner.run({
        command: 'node',
        args: [
            cliPath,
            'create-storefront',
            '--name',
            'storefront-next',
            '--template',
            templateUrl,
            '--local-packages-dir',
            path.join(config.monorepoBuild, 'packages')
        ],
        cwd: config.workspaceRoot,
        input: '\n\n',
        description: 'Generate standalone storefront'
    });

    if (!dryRun) {
        const fixed = updatePackageReferences(
            path.join(config.standaloneProject, 'package.json'),
            config.monorepoBuild
        );
        if (fixed > 0) {
            logger.info(`Fixed ${fixed} monorepo package reference(s)`);
        }
        await installStandaloneDependencies(config, runner, logger);

        const envDefault = path.join(config.standaloneProject, '.env.default');
        const envFile = path.join(config.standaloneProject, '.env');
        if (!fs.existsSync(envFile) && fs.existsSync(envDefault)) {
            fs.copyFileSync(envDefault, envFile);
            logger.success('Created storefront-next/.env from .env.default');
        }
    }
}

function prepareTemplateRepository(
    config: RuntimeConfig,
    logger: MigrationLogger
): void {
    const templateSource = path.join(
        config.monorepoBuild,
        'packages',
        'template-retail-rsc-app'
    );
    fs.rmSync(config.templateTempDir, { recursive: true, force: true });
    copyDirectory(
        templateSource,
        config.templateTempDir,
        new Set(['node_modules', '.git'])
    );

    spawnSync('git', ['init'], {
        cwd: config.templateTempDir,
        stdio: 'ignore'
    });
    spawnSync('git', ['add', '.'], {
        cwd: config.templateTempDir,
        stdio: 'ignore'
    });
    spawnSync(
        'git',
        [
            '-c',
            'user.email=migration@example.com',
            '-c',
            'user.name=Migration Bot',
            'commit',
            '-m',
            'Initial template'
        ],
        {
            cwd: config.templateTempDir,
            stdio: 'ignore',
            env: {
                ...process.env,
                GIT_AUTHOR_NAME: 'Migration Bot',
                GIT_AUTHOR_EMAIL: 'migration@example.com',
                GIT_COMMITTER_NAME: 'Migration Bot',
                GIT_COMMITTER_EMAIL: 'migration@example.com'
            }
        }
    );
    logger.success('Template prepared');
}

async function installStandaloneDependencies(
    config: RuntimeConfig,
    runner: CommandRunner,
    logger: MigrationLogger
): Promise<void> {
    if (config.useTmpStrategy) {
        fs.rmSync(config.standaloneBuild, { recursive: true, force: true });
        copyDirectory(
            config.standaloneProject,
            config.standaloneBuild,
            new Set(['node_modules'])
        );
        await runner.run({
            command: 'pnpm',
            args: ['install', '--no-frozen-lockfile'],
            cwd: config.standaloneBuild,
            env: { ...process.env, CI: 'true' },
            description: 'Install standalone dependencies in temp directory'
        });
        copyDirectory(
            config.standaloneBuild,
            config.standaloneProject,
            new Set(['node_modules'])
        );
        fs.rmSync(path.join(config.standaloneProject, 'node_modules'), {
            recursive: true,
            force: true
        });
        fs.symlinkSync(
            path.join(config.standaloneBuild, 'node_modules'),
            path.join(config.standaloneProject, 'node_modules')
        );
    } else {
        const nodeModulesPath = path.join(
            config.standaloneProject,
            'node_modules'
        );
        if (isSymlink(nodeModulesPath)) {
            fs.rmSync(nodeModulesPath, { force: true });
        }
        await runner.run({
            command: 'pnpm',
            args: ['install', '--no-frozen-lockfile'],
            cwd: config.standaloneProject,
            env: { ...process.env, CI: 'true' },
            description: 'Install standalone dependencies'
        });
    }

    const sfnextBinary = resolveSfnextBinary(
        config.useTmpStrategy
            ? config.standaloneBuild
            : config.standaloneProject
    );
    if (!sfnextBinary) {
        throw new Error(
            'sfnext CLI not found after installing standalone dependencies'
        );
    }
    logger.success(`sfnext CLI available at ${sfnextBinary}`);
}

async function runBaselinePhase(
    config: RuntimeConfig,
    runner: CommandRunner,
    logger: MigrationLogger,
    dryRun: boolean
): Promise<void> {
    const markerPath = path.join(config.stateDir, 'baseline-committed');
    if (fs.existsSync(markerPath)) {
        logger.success(
            `Phase 2 already complete (${fs
                .readFileSync(markerPath, 'utf-8')
                .trim()})`
        );
        return;
    }

    logger.info('Running Phase 2: commit standalone baseline to git');
    const gitRepo = await runner.run({
        command: 'git',
        args: ['rev-parse', '--git-dir'],
        cwd: config.workspaceRoot,
        allowFailure: true,
        printStdout: false,
        printStderr: false
    });
    if (gitRepo.exitCode !== 0) {
        logger.warn(
            'Workspace is not a git repository; skipping baseline commit'
        );
        return;
    }

    if (
        !fs.existsSync(config.standaloneProject) ||
        fs.readdirSync(config.standaloneProject).length === 0
    ) {
        logger.warn(
            'storefront-next is missing or empty; skipping baseline commit'
        );
        return;
    }

    const status = await runner.run({
        command: 'git',
        args: ['status', '--porcelain', '--', 'storefront-next/'],
        cwd: config.workspaceRoot,
        allowFailure: true,
        printStdout: false,
        printStderr: false
    });

    if (status.stdout.trim()) {
        await runner.run({
            command: 'git',
            args: ['add', 'storefront-next/'],
            cwd: config.workspaceRoot
        });
        await runner.run({
            command: 'git',
            args: [
                'commit',
                '-m',
                'chore: add storefront-next baseline after bootstrap\n\nGenerated by create-storefront during Phase 1 initialization.'
            ],
            cwd: config.workspaceRoot,
            allowFailure: true
        });
    } else {
        logger.success('No changes detected in storefront-next/');
    }

    if (!dryRun) {
        fs.writeFileSync(markerPath, `${new Date().toISOString()}\n`);
    }
    logger.success('Phase 2 complete');
}

async function runPlanningPhase(
    config: RuntimeConfig,
    runner: CommandRunner,
    logger: MigrationLogger,
    dryRun: boolean,
    interactive: boolean
): Promise<void> {
    const markerPath = path.join(config.stateDir, 'phase3-complete');
    if (fs.existsSync(markerPath)) {
        logger.success(
            `Phase 3 already complete (${fs
                .readFileSync(markerPath, 'utf-8')
                .trim()})`
        );
        return;
    }

    logger.info('Running Phase 3: discovery and plan generation');
    await installWithFallback(runner, config.workspaceRoot, logger, {
        description: 'root script dependencies'
    });

    const urlMappingsPath = path.join(
        config.workspaceRoot,
        'url-mappings.json'
    );
    if (!fs.existsSync(urlMappingsPath)) {
        throw new Error('url-mappings.json is required before running setup.');
    }

    if (interactive) {
        await runTsxScript(
            config,
            runner,
            'scripts/setup-migration.ts',
            [],
            undefined,
            false,
            true
        );
    } else {
        logger.info('Non-interactive mode: using url-mappings.json as-is');
    }

    const selectedPages = loadSelectedPages(urlMappingsPath);
    if (selectedPages.length === 0) {
        throw new Error('No pages are selected in url-mappings.json');
    }

    for (const pageId of selectedPages) {
        await runTsxScript(
            config,
            runner,
            'scripts/discover-features-claude.ts',
            ['--page', pageId],
            {
                CLAUDECODE: ''
            }
        );
    }

    await runTsxScript(config, runner, 'scripts/analyze-features.ts');
    await runTsxScript(config, runner, 'scripts/generate-plans.ts');
    await runTsxScript(
        config,
        runner,
        'scripts/init-migration-log.ts',
        [],
        undefined,
        true
    );

    if (!dryRun) {
        fs.writeFileSync(markerPath, `${new Date().toISOString()}\n`);
    }
    logger.success('Phase 3 complete');
}

async function runExecutionPhase(
    config: RuntimeConfig,
    runner: CommandRunner,
    logger: MigrationLogger,
    interactive: boolean
): Promise<{ exitCode: number }> {
    logger.info('Launching execution loop');
    const result = await runTsxScript(
        config,
        runner,
        'scripts/execute-migration.ts',
        [],
        {
            WORKSPACE_ROOT: config.workspaceRoot,
            MONOREPO_BUILD: config.monorepoBuild,
            STANDALONE_PROJECT: config.standaloneProject,
            CLAUDE_ALLOWED_TOOLS_STR,
            PLAN_FILE: config.planFile,
            MIGRATION_PLAN: config.migrationPlan,
            PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH: config.chromiumPath
        },
        true,
        interactive
    );
    logger.info(`Execution loop exited with code ${result.exitCode}`);
    return { exitCode: result.exitCode };
}

async function finalizeRun(
    config: RuntimeConfig,
    logger: MigrationLogger,
    executeExitCode: number,
    dryRun: boolean
): Promise<number> {
    const pending = detectPendingInterventions(config.interventionDir);
    if (pending.length > 0) {
        logger.warn(`Pending interventions: ${pending.length}`);
        for (const entry of pending) {
            logger.info(`Intervention ${entry.workerId}: ${entry.question}`);
        }
        return 42;
    }

    const completedPlans = dryRun ? 0 : countCompletedPlans(config.logFile);
    const screenshotCount = dryRun
        ? 0
        : countScreenshots(path.join(config.workspaceRoot, 'screenshots'));
    logger.info(`Completed micro-plans: ${completedPlans}`);
    logger.info(`Screenshots captured: ${screenshotCount}`);

    if (executeExitCode === 0) {
        logger.success('Migration completed successfully');
        return 0;
    }

    logger.error(`Migration exited with code ${executeExitCode}`);
    return executeExitCode;
}

function phase1IsComplete(config: RuntimeConfig): boolean {
    const markerPath = path.join(config.stateDir, 'phase1-complete');
    if (!fs.existsSync(markerPath)) return false;

    const cliPath = path.join(
        config.monorepoBuild,
        'packages',
        'storefront-next-dev',
        'dist',
        'cli.js'
    );
    if (!fs.existsSync(cliPath)) return false;

    if (config.useTmpStrategy) {
        return (
            isSymlink(path.join(config.standaloneProject, 'node_modules')) &&
            Boolean(resolveSfnextBinary(config.standaloneBuild))
        );
    }

    return Boolean(resolveSfnextBinary(config.standaloneProject));
}

function standaloneReady(config: RuntimeConfig): boolean {
    const packageJsonPath = path.join(config.standaloneProject, 'package.json');
    if (!fs.existsSync(packageJsonPath)) return false;

    return config.useTmpStrategy
        ? isSymlink(path.join(config.standaloneProject, 'node_modules')) &&
              Boolean(resolveSfnextBinary(config.standaloneBuild))
        : Boolean(resolveSfnextBinary(config.standaloneProject));
}

export function resolveSfnextBinary(projectDir: string): string | null {
    const candidates = [
        path.join(projectDir, 'node_modules', '.bin', 'sfnext'),
        path.join(projectDir, 'node_modules', '.bin', 'sfnext.cmd'),
        path.join(projectDir, 'node_modules', '.bin', 'sfnext.ps1')
    ];
    return candidates.find((candidate) => fs.existsSync(candidate)) ?? null;
}

function isSymlink(targetPath: string): boolean {
    try {
        return fs.lstatSync(targetPath).isSymbolicLink();
    } catch {
        return false;
    }
}

function commandExists(command: string): boolean {
    const lookup = process.platform === 'win32' ? 'where' : 'which';
    const result = spawnSync(lookup, [command], { stdio: 'ignore' });
    return result.status === 0;
}

function detectChromiumPath(preferred?: string): string {
    const preferredCandidates = preferred ? [preferred] : [];
    const platformCandidates =
        process.platform === 'darwin'
            ? [
                  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
                  '/Applications/Chromium.app/Contents/MacOS/Chromium'
              ]
            : process.platform === 'win32'
              ? [
                    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
                    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
                    path.join(
                        process.env.LOCALAPPDATA ?? '',
                        'Google\\Chrome\\Application\\chrome.exe'
                    )
                ]
              : [
                    '/usr/bin/google-chrome',
                    '/usr/bin/chromium-browser',
                    '/usr/bin/chromium'
                ];

    for (const candidate of [...preferredCandidates, ...platformCandidates]) {
        if (candidate && fs.existsSync(candidate)) return candidate;
    }

    const binaryCandidates =
        process.platform === 'win32'
            ? ['chrome', 'msedge']
            : ['google-chrome', 'chromium-browser', 'chromium'];
    for (const candidate of binaryCandidates) {
        if (commandExists(candidate)) return candidate;
    }

    return '';
}

function normalizeBooleanString(
    value: string | undefined,
    fallback: boolean
): string {
    if (value === undefined || value === '') return String(fallback);
    return value === 'true' ? 'true' : 'false';
}

function printEnvironmentSummary(
    values: EditableEnvValues,
    config: RuntimeConfig
): void {
    console.log('');
    console.log('Environment Review');
    console.log('------------------');
    console.log(`Runtime: ${config.runtimeName}`);
    console.log(`MONOREPO_SOURCE: ${values.MONOREPO_SOURCE}`);
    console.log(`SFRA_SOURCE: ${values.SFRA_SOURCE || '(unset)'}`);
    console.log(`SFRA_TEMPLATE_BASE: ${values.SFRA_TEMPLATE_BASE}`);
    console.log(
        `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH: ${
            values.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || '(auto-detect failed)'
        }`
    );
    console.log(`PLAN_FILE: ${values.PLAN_FILE}`);
    console.log(`MIGRATION_PLAN: ${values.MIGRATION_PLAN}`);
    console.log(`CLEAN_START: ${values.CLEAN_START}`);
    console.log(`KEEPALIVE: ${values.KEEPALIVE}`);
    console.log(`AUTO_START: ${values.AUTO_START}`);
    console.log(`ANTHROPIC_API_KEY: ${maskSecret(values.ANTHROPIC_API_KEY)}`);
    console.log(
        `ANTHROPIC_AUTH_TOKEN: ${maskSecret(values.ANTHROPIC_AUTH_TOKEN)}`
    );
    console.log('');
}

function maskSecret(value: string): string {
    if (!value) return '(unset)';
    if (value.length <= 8) return '********';
    return `${value.slice(0, 4)}…${value.slice(-4)}`;
}

function timestampForFile(): string {
    return new Date()
        .toISOString()
        .replace(/[-:]/g, '')
        .replace(/\.\d{3}Z$/, 'Z');
}

function copyDirectory(
    source: string,
    target: string,
    excludedBaseNames: Set<string>
): void {
    fs.cpSync(source, target, {
        recursive: true,
        force: true,
        filter: (entryPath) => !excludedBaseNames.has(path.basename(entryPath))
    });
}

async function installWithFallback(
    runner: CommandRunner,
    cwd: string,
    logger: MigrationLogger,
    options: { description: string }
): Promise<void> {
    const frozen = await runner.run({
        command: 'pnpm',
        args: ['install', '--frozen-lockfile'],
        cwd,
        env: { ...process.env, CI: 'true' },
        allowFailure: true,
        description: `Install ${options.description} with frozen lockfile`
    });

    if (frozen.exitCode === 0) return;
    logger.warn(
        `Frozen lockfile install failed for ${options.description}; retrying without lockfile`
    );
    await runner.run({
        command: 'pnpm',
        args: ['install'],
        cwd,
        env: { ...process.env, CI: 'true' },
        description: `Install ${options.description}`
    });
}

function loadSelectedPages(urlMappingsPath: string): string[] {
    const parsed = JSON.parse(fs.readFileSync(urlMappingsPath, 'utf-8'));
    return Array.isArray(parsed.pages)
        ? parsed.pages
              .filter((page: { selected?: boolean }) => page.selected === true)
              .map((page: { page_id: string }) => page.page_id)
        : [];
}

async function runTsxScript(
    config: RuntimeConfig,
    runner: CommandRunner,
    relativeScriptPath: string,
    args: string[] = [],
    extraEnv?: NodeJS.ProcessEnv,
    allowFailure = false,
    inheritStdio = false
) {
    return await runner.run({
        command: 'npx',
        args: [
            'tsx',
            path.join(config.workspaceRoot, relativeScriptPath),
            ...args
        ],
        cwd: config.workspaceRoot,
        env: {
            ...process.env,
            ...config.editableEnv,
            WORKSPACE_ROOT: config.workspaceRoot,
            PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH: config.chromiumPath,
            ...extraEnv
        },
        allowFailure,
        inheritStdio
    });
}

function countCompletedPlans(logFile: string): number {
    if (!fs.existsSync(logFile)) return 0;
    const content = fs.readFileSync(logFile, 'utf-8');
    return (content.match(/Status.*✅ Success/g) ?? []).length;
}

function countScreenshots(screenshotsDir: string): number {
    if (!fs.existsSync(screenshotsDir)) return 0;
    let total = 0;
    const entries = fs.readdirSync(screenshotsDir, { withFileTypes: true });
    for (const entry of entries) {
        const fullPath = path.join(screenshotsDir, entry.name);
        if (entry.isDirectory()) {
            total += countScreenshots(fullPath);
        } else if (entry.name.endsWith('.png')) {
            total += 1;
        }
    }
    return total;
}

async function keepAlive(config: RuntimeConfig): Promise<void> {
    if (config.inContainer) {
        await new Promise<void>(() => {
            // Intentional no-op: keep container process alive for inspection.
        });
    } else {
        await new Promise<void>((resolve) => {
            process.stdout.write('Press Enter to exit...');
            process.stdin.once('data', () => resolve());
        });
    }
}
