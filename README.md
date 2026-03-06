# SFRA AI-Powered Migration

This repository drives an SFRA to Storefront Next migration workflow.

The main entrypoint is `docker/entrypoint.sh`. In its current form it:

- Optionally wipes migration state for a clean run
- Bootstraps `storefront-next/` from the Storefront Next monorepo
- Creates a baseline git commit for `storefront-next/`
- Runs page setup, feature discovery, feature analysis, and sub-plan generation
- Launches the migration execution loop
- Pauses for intervention when needed and can resume on the next run

## Quick Start

Both modes use `docker/entrypoint.sh`, but they differ in how Claude permissions are handled:

- Host mode uses the host-mode allow-list with `--permission-mode acceptEdits`
- Docker mode runs inside the container with `--dangerously-skip-permissions`

### Quick Start: Host Mode

Use this when you want the migration to run directly on your machine instead of inside Docker.

Prerequisites:

- `node`, `pnpm`, `git`, and `claude` installed on the host
- Chrome or Chromium installed on the host
- A local checkout of the Storefront Next monorepo
- A local checkout of `storefront-reference-architecture`

From the repo root:

```bash
cp .env.example .env
```

Set at least these values in `.env`:

```bash
# Choose one auth method
ANTHROPIC_API_KEY=your_key_here

# Or use Bedrock / gateway auth instead
# ANTHROPIC_AUTH_TOKEN=your_token_here
# ANTHROPIC_BEDROCK_BASE_URL=https://your-bedrock-endpoint
# CLAUDE_CODE_USE_BEDROCK=1
# CLAUDE_CODE_SKIP_BEDROCK_AUTH=1

SFRA_SOURCE=/absolute/path/to/storefront-reference-architecture

# Optional
# CLEAN_START=true
# KEEPALIVE=false
# AUTO_START=true
```

Then run:

```bash
set -a
source .env
set +a

MONOREPO_SOURCE="$HOME/dev/SFCC-Odyssey" \
./docker/entrypoint.sh
```

Notes:

- This path runs on the host and uses the host allow-list instead of `--dangerously-skip-permissions`
- For a first run, set `CLEAN_START=true` in `.env`

### Quick Start: Docker Mode

Use this when you want the migration to run inside the `claude-migration` container.

From the repo root:

```bash
cp .env.example .env
```

Set at least these values in `.env`:

```bash
# Choose one auth method
ANTHROPIC_API_KEY=your_key_here

# Or use Bedrock / gateway auth instead
# ANTHROPIC_AUTH_TOKEN=your_token_here
# ANTHROPIC_BEDROCK_BASE_URL=https://your-bedrock-endpoint
# CLAUDE_CODE_USE_BEDROCK=1
# CLAUDE_CODE_SKIP_BEDROCK_AUTH=1

SFRA_SOURCE=/absolute/path/to/storefront-reference-architecture

# Optional
# CLEAN_START=true
# KEEPALIVE=false
# AUTO_START=true
# MIGRATION_PLAN=/workspace/migration-main-plan.md
```

Then run:

```bash
STOREFRONT_MONOREPO_PATH="$HOME/dev/SFCC-Odyssey" \
docker compose -f docker/docker-compose.yml up
```

Notes:

- This path runs `docker/entrypoint.sh` inside the container
- In container mode, Claude uses `--dangerously-skip-permissions`
- `STOREFRONT_MONOREPO_PATH` must be supplied in the shell when you launch Compose
- The migration workflow should use the production preview server, not `pnpm dev` / Vite
- Internal migration scripts in Docker should target `http://localhost:3000`; the `3009:3000` mapping is for host-side browser access
- For a first run, set `CLEAN_START=true` in `.env`

### Optional: Run The Dashboard

The dashboard is not started by either quick-start path. Run it separately if you want the UI:

```bash
cd dashboard
pnpm install
pnpm start
```

Then open <http://localhost:3030>.

### Execution Range Selection

When the execution loop starts, it first asks which features to run. For each selected
feature with multiple sub-plans, it then asks for:

- the first sub-plan to execute
- the last sub-plan to execute

Only that inclusive sub-plan range is passed to Claude, and the run stops after the
selected last sub-plan instead of continuing through the rest of the feature.

### Resume Or Stop

Resume host mode:

```bash
set -a
source .env
set +a

MONOREPO_SOURCE="$HOME/dev/SFCC-Odyssey" \
./docker/entrypoint.sh
```

Resume Docker mode:

```bash
STOREFRONT_MONOREPO_PATH="$HOME/dev/SFCC-Odyssey" \
docker compose -f docker/docker-compose.yml up
```

Stop Docker mode:

```bash
docker compose -f docker/docker-compose.yml down
```

## Common Run Modes

Fresh run from scratch:

Set `CLEAN_START=true` in `.env`, then run:

```bash
STOREFRONT_MONOREPO_PATH="$HOME/dev/SFCC-Odyssey" \
docker compose -f docker/docker-compose.yml up
```

Keep the container alive after errors so you can inspect it:

Set `KEEPALIVE=true` in `.env`, then run:

```bash
STOREFRONT_MONOREPO_PATH="$HOME/dev/SFCC-Odyssey" \
docker compose -f docker/docker-compose.yml up
```

Run setup only, then stop before the execution loop:

Set `AUTO_START=false` in `.env`, then run:

```bash
STOREFRONT_MONOREPO_PATH="$HOME/dev/SFCC-Odyssey" \
docker compose -f docker/docker-compose.yml up
```

Run in the background:

```bash
STOREFRONT_MONOREPO_PATH="$HOME/dev/SFCC-Odyssey" \
docker compose -f docker/docker-compose.yml up -d

docker compose -f docker/docker-compose.yml logs -f
```

Open a shell in the running container:

```bash
docker compose -f docker/docker-compose.yml exec claude-migration bash
```

## Environment Variables

### Runtime variables loaded into the container

These come from the root `.env` file via `docker/docker-compose.yml`:

| Variable | Required | Default | Used for |
| --- | --- | --- | --- |
| `ANTHROPIC_API_KEY` | Yes, unless using auth token | none | Claude authentication |
| `ANTHROPIC_AUTH_TOKEN` | Yes, unless using API key | none | Claude / gateway auth |
| `ANTHROPIC_BEDROCK_BASE_URL` | With auth token flows | none | Bedrock / gateway endpoint |
| `CLAUDE_CODE_USE_BEDROCK` | Optional | unset | Enables Bedrock mode |
| `CLAUDE_CODE_SKIP_BEDROCK_AUTH` | Optional | unset | Skips extra Bedrock auth handling |
| `SFRA_SOURCE` | Strongly recommended | none | Resolves ISML template paths |
| `SFRA_TEMPLATE_BASE` | Optional | `cartridges/app_storefront_base/cartridge/templates/default` | Base path for relative ISML mappings |
| `CLEAN_START` | Optional | `false` | Clears state, removes generated screenshot wrappers, and backs up `migration-log.md` |
| `KEEPALIVE` | Optional | `false` | Prevents immediate exit on failure / completion |
| `AUTO_START` | Optional | `true` | Runs the execution loop automatically |
| `MIGRATION_PLAN` | Optional | `/workspace/migration-main-plan.md` | Plan file used by migration execution |

### Compose-time variable

This is not loaded from the root `.env` file by `env_file`; set it in your shell when invoking Docker Compose:

| Variable | Required | Default | Used for |
| --- | --- | --- | --- |
| `STOREFRONT_MONOREPO_PATH` | Yes in practice | `~/dev/SFCC-Odyssey` | Mounted to `/monorepo-source` inside the container |

### Host-mode variable

If you run `docker/entrypoint.sh` directly on the host instead of through Docker:

| Variable | Required | Used for |
| --- | --- | --- |
| `MONOREPO_SOURCE` | Yes | Path to the Storefront Next monorepo |

## What `docker/entrypoint.sh` Actually Does

The current execution path looks like this.

### 1. Detect environment and validate prerequisites

The script switches behavior based on whether it is running in Docker or directly on the host:

- Container mode uses `/workspace` and mounts the monorepo at `/monorepo-source`
- Host mode works from the local checkout and requires `MONOREPO_SOURCE`
- Host mode also checks for Chrome or Chromium because screenshot tooling depends on it
- Both modes validate `node`, `pnpm`, `git`, and `claude`

### 2. Optional clean start branch

If `CLEAN_START=true`, the script removes or resets:

- `.claude-session-id`
- `.migration-state/`
- `intervention/needed-*.json`
- `intervention/response-*.json`
- `claude-output.jsonl`
- `scripts/generated/`
- `analysis/screenshot-commands.json`

It also backs up `migration-log.md` instead of deleting it.

### 3. Bootstrap `storefront-next/`

If `.migration-state/phase1-complete` exists and the expected artifacts are still present, Phase 1 is skipped.

Otherwise the script:

- Builds the monorepo if `packages/storefront-next-dev/dist/cli.js` is missing
- Uses a `/tmp` copy inside the container to avoid bind-mount file-descriptor issues
- Generates `storefront-next/` with `create-storefront`
- Rewrites `workspace:*` dependencies to `file://.../packages/...`
- Installs dependencies
- Creates `.env` from `.env.default` inside `storefront-next/` if needed

### 4. Commit the baseline

If `.migration-state/baseline-committed` is missing and `storefront-next/` has changes, the script stages `storefront-next/` and creates a baseline commit in the current git repo.

If the repo is not a git repository, or `storefront-next/` is unchanged, it skips this safely.

### 5. Host-only allow-list prompt

In interactive host mode, the script prints the pre-approved Claude tool / command allow-list and pauses briefly before continuing.

This branch does not run in the container.

### 6. Setup branch: page config, discovery, analysis, and plan generation

If `.migration-state/phase4-complete` exists, this entire setup branch is skipped.

Otherwise the script:

1. Installs root dependencies if needed
2. Requires `url-mappings.json`
3. Runs `scripts/setup-migration.ts` only when stdin is interactive
4. Reads selected pages from `url-mappings.json`
5. Runs `scripts/discover-features-claude.ts` for each selected page
6. Runs `scripts/analyze-features.ts`
7. Runs `scripts/generate-plans.ts`
8. Runs `scripts/init-migration-log.ts`

Important details:

- Non-interactive runs skip `setup-migration.ts` and use `url-mappings.json` as-is
- The current default setup path uses `scripts/generate-plans.ts`
- `scripts/generate-subplan-claude.ts` still exists, but it is not the script the entrypoint calls during the normal execution path

### 7. Execution loop branch

If `AUTO_START=false`, the script stops after setup and keeps the runtime available for manual work.

If `AUTO_START=true`, it launches:

```bash
npx tsx scripts/execute-migration.ts
```

That execution loop reads the generated discovery and sub-plan artifacts and runs migration work feature by feature.
It also regenerates a screenshot wrapper manifest at `analysis/screenshot-commands.json`
and per-feature wrapper scripts under `scripts/generated/` so Claude can invoke simple
`tsx scripts/generated/capture-...` commands instead of flag-heavy screenshot CLI calls.

### 8. Exit and intervention handling

After the execution loop exits, the script:

- Checks `intervention/needed-*.json` for unresolved intervention requests
- Exits with code `42` when intervention is required
- Logs a migration summary, including screenshot counts
- Uses `KEEPALIVE=true` to stay attached instead of exiting immediately

To resume after intervention, respond to the pending request and then rerun the same startup command.

## Meaningful Directories

These are the directories you will interact with most often while running or debugging the migration flow.

### Generated migration artifacts

| Path | What it contains | Why it matters |
| --- | --- | --- |
| `migration-plans/` | Per-page discovery output such as `*-features.json` and related planning files | This is the first structured output from feature discovery and the main handoff into downstream analysis and planning |
| `analysis/` | Per-feature extracted DOM structure, metadata, and focused screenshots | Use this to understand what the system observed about each discovered feature before plan generation |
| `analysis/screenshot-commands.json` | Generated manifest mapping each feature to safe source/target screenshot commands | This is how the execution prompt gets simple wrapper-backed screenshot commands |
| `sub-plans/` | Generated sub-plans grouped by feature | This is the work queue that the execution loop consumes feature by feature |
| `screenshots/` | Baseline, analysis, source, and target screenshots | Useful for visual comparison, debugging regressions, and dashboard display |
| `scripts/generated/` | Generated per-feature screenshot wrapper entrypoints | These wrappers preserve dynamic screenshot config while keeping the shell command permission-safe |
| `.migration-state/` | Phase markers and per-feature completion files | This is how the workflow knows what can be skipped or resumed |
| `intervention/` | `needed-*.json`, `response-*.json`, and intervention history | This is the pause-and-resume handshake when a migration step needs user input |

### Runtime logs and top-level outputs

| Path | What it contains | Why it matters |
| --- | --- | --- |
| `migration-log.md` | Human-readable status log for setup and execution | The fastest place to see what the system is doing and where it failed |
| `claude-output.jsonl` | Raw execution-loop output | Useful when `migration-log.md` is not detailed enough and you need lower-level execution context |
| `url-mappings.json` | Page configuration, source/target URLs, selected pages, and ISML paths | This is the primary config file for what gets discovered and migrated |

### Core project code

| Path | What it contains | Why it matters |
| --- | --- | --- |
| `scripts/` | TypeScript and shell tooling for setup, discovery, analysis, plan generation, execution, screenshot capture, logging, and diagnostics | This is the automation backbone of the repo |
| `prompts/` | Handlebars prompt templates used by Claude-driven steps | Prompt behavior for discovery and execution is defined here |
| `dashboard/` | The standalone monitoring UI and server | Run this separately when you want live status, screenshots, and intervention handling in the browser |
| `docker/` | Dockerfile, compose file, and entrypoint scripts | This is the containerized runtime path, including the Docker startup flow |

### Source applications

| Path | What it contains | Why it matters |
| --- | --- | --- |
| `storefront-next/` | The generated or updated Storefront Next application under migration | This is the target app that gets bootstrapped, modified, committed, and compared against SFRA |
| `storefront-reference-architecture/` | Your SFRA source checkout, usually provided through `SFRA_SOURCE` rather than committed here | This is the source-of-truth storefront that discovery, mapping, and screenshot comparison are based on |

Notes:

- `storefront-next/` lives inside this workspace and is actively modified by the workflow
- `storefront-reference-architecture/` is often external to this repo and referenced through `SFRA_SOURCE`
- If you only need to inspect migration progress, start with `migration-log.md`, `sub-plans/`, `screenshots/`, and `intervention/`

## Manual Commands

Run the setup wrapper manually from the repo root:

```bash
pnpm install
pnpm start
```

Run individual setup phases manually:

```bash
npx tsx scripts/setup-migration.ts
npx tsx scripts/discover-features-claude.ts --page home
npx tsx scripts/analyze-features.ts
npx tsx scripts/generate-plans.ts
npx tsx scripts/init-migration-log.ts
```

Run the execution loop directly:

```bash
npx tsx scripts/execute-migration.ts
```

Run the entrypoint directly on the host:

```bash
set -a
source .env
set +a

MONOREPO_SOURCE="$HOME/dev/SFCC-Odyssey" \
./docker/entrypoint.sh
```

Host mode requires `node`, `pnpm`, `git`, `claude`, and Chrome or Chromium to already be available on your machine.

## Monitoring and Troubleshooting

Tail the migration log:

```bash
tail -f migration-log.md
```

Tail the execution log:

```bash
tail -f claude-output.jsonl
```

Watch container logs:

```bash
docker compose -f docker/docker-compose.yml logs -f
```

### Common issues

Missing Claude auth:

- Set `ANTHROPIC_API_KEY`, or
- Set `ANTHROPIC_AUTH_TOKEN` plus `ANTHROPIC_BEDROCK_BASE_URL`

No pages selected:

- Update `url-mappings.json` so at least one page has `"selected": true`
- Or rerun `scripts/setup-migration.ts` interactively

Container exits too quickly:

- Set `KEEPALIVE=true` in `.env` and retry
- Then inspect `migration-log.md` and `claude-output.jsonl`

Bootstrap cannot find the monorepo:

- In Docker mode, pass `STOREFRONT_MONOREPO_PATH=/absolute/path/to/SFCC-Odyssey`
- In host mode, pass `MONOREPO_SOURCE=/absolute/path/to/SFCC-Odyssey`

ISML mapping is incomplete:

- Set `SFRA_SOURCE` to a valid `storefront-reference-architecture` checkout

Pending intervention blocks progress:

- Check `intervention/needed-*.json`
- Respond through the dashboard or by writing the matching `intervention/response-*.json`
- Rerun the same startup command

## Notes

- Use `MIGRATION_PLAN` for the runtime plan override. That is the variable the current execution path reads before launching `scripts/execute-migration.ts`.
- The migration workflow standardizes on the production preview server and should avoid Vite file watching during migration runs.
- In Docker mode, the container exposes the production preview server on host port `3009`, while internal scripts use `http://localhost:3000`.
- The dashboard lives in `dashboard/` and is a separate process.
