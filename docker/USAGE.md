# Migration System Usage

All migration logic is handled by the container itself. Simply use standard Docker Compose commands.

## Quick Start

```bash
cd docker
docker compose up
```

The container will:
1. Build the monorepo (if needed)
2. Generate standalone project (if needed)  
3. Check for existing Claude session
4. Resume existing session OR start new migration
5. Display all output to your terminal

## Commands

### Start/Resume Migration

```bash
cd docker
docker compose up
```

- If no session exists: starts new migration with `migration-main-plan.md`
- If session exists: automatically resumes it
- Shows all output in real-time

### Clean Start (Remove Everything)

```bash
cd docker
docker compose down -v
docker compose up
```

The `-v` flag removes volumes, forcing complete rebuild of:
- Monorepo build
- Standalone project
- Node modules
- Claude session

### Background Mode

```bash
cd docker
docker compose up -d          # Start in background
docker compose logs -f        # Attach to logs
```

### Stop Container

```bash
cd docker
docker compose down           # Stop (keeps volumes for faster restart)
docker compose down -v        # Stop and remove volumes
```

### Manual Shell Access

```bash
cd docker
docker compose exec claude-migration bash
```

## Intervention Workflow

When Claude requests intervention:

1. Container exits with code 42
2. Open dashboard: http://localhost:3030
3. Go to "Interventions" tab
4. Submit your responses
5. Run `docker compose up` again - **container automatically resumes**

No special resume command needed!

## Environment Variables

Set in `.env` file or override on command line:

### AUTO_START (default: true)

Start migration automatically when container starts:

```bash
AUTO_START=false docker compose up
```

With `false`, container stays running without starting Claude. Useful for debugging.

### MIGRATION_PLAN (default: /workspace/migration-main-plan.md)

Path to migration plan file inside container:

```bash
MIGRATION_PLAN=/workspace/custom-plan.md docker compose up
```

### STOREFRONT_MONOREPO_PATH

Path to monorepo on host machine:

```bash
STOREFRONT_MONOREPO_PATH=~/projects/SFCC-Odyssey docker compose up
```

## File Locations

Inside container:
- `/workspace` - Project root (mounted from host)
- `/workspace/.claude-session-id` - Current session ID
- `/workspace/migration-log.md` - Migration progress log
- `/workspace/claude-output.log` - Claude Code output
- `/workspace/screenshots/` - Captured screenshots
- `/workspace/intervention/` - Intervention requests/responses

## Dashboard

Monitor progress in real-time:

```
http://localhost:3030
```

- View migration log
- See screenshots
- Respond to interventions
- Track completion status

## Troubleshooting

### Container won't start

Check prerequisites:
- Docker installed and running
- `.env` file exists with `ANTHROPIC_API_KEY` or `ANTHROPIC_AUTH_TOKEN`
- `migration-main-plan.md` exists in project root
- `STOREFRONT_MONOREPO_PATH` points to valid monorepo

### Container exits immediately

Check logs:
```bash
docker compose logs
```

Look for error messages about missing files or invalid configuration.

### Session stuck

Remove session file and start fresh:
```bash
rm ../.claude-session-id
docker compose up
```

### Complete reset

Nuclear option - removes everything:
```bash
docker compose down -v
docker system prune -a
docker compose up
```

This rebuilds Docker image, removes all volumes, and starts completely fresh.
