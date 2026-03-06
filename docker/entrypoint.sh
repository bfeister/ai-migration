#!/bin/bash
set -euo pipefail

# entrypoint.sh - Migration worker entrypoint
# This script runs Claude Code and monitors for intervention requests
# Supports both container and host execution

# ============================================================================
# Environment Detection
# ============================================================================

if [ -f /.dockerenv ] || [ -n "${DOCKER_CONTAINER:-}" ]; then
    IN_CONTAINER=true
else
    IN_CONTAINER=false
fi

# Configure paths based on environment
if [ "$IN_CONTAINER" = "true" ]; then
    WORKSPACE_ROOT="/workspace"
    MONOREPO_SOURCE_PATH="/monorepo-source"
    MONOREPO_BUILD="/tmp/SFCC-Odyssey"
    STANDALONE_BUILD="/tmp/storefront-next-built"
    USE_TMP_STRATEGY=true
    CLAUDE_PERMS="--dangerously-skip-permissions"
    CHROMIUM_PATH="/usr/bin/chromium-browser"
    RUNTIME_NAME="container"
    ATTACH_CMD="docker compose exec claude-migration bash"
else
    WORKSPACE_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
    MONOREPO_SOURCE_PATH="${MONOREPO_SOURCE:-}"
    MONOREPO_BUILD="$MONOREPO_SOURCE_PATH"
    STANDALONE_BUILD="$WORKSPACE_ROOT/storefront-next"
    USE_TMP_STRATEGY=false

    # Host-mode allowed tools — commands Claude may run unattended during migration.
    # Defined once here, exported for execute-migration.ts to reuse.
    # Strategy B: modern documented Bash permission syntax using spaces, e.g.
    # "Bash(tsx *)" rather than legacy colon syntax like "Bash(tsx:*)".
    # NOTE: Bash patterns match the START of the command string. Compound commands
    # like "cd /foo && pnpm build" match on "cd", not "pnpm".
    CLAUDE_ALLOWED_TOOLS=(
        # Built-in file tools
        "Read" "Write" "Edit" "Glob" "Grep"
        # Package manager (typecheck, build, dev, start, test, lint, install)
        "Bash(pnpm *)"
        # Git operations — scoped to non-destructive only (no reset, push, rebase, etc.)
        "Bash(git add *)" "Bash(git commit *)" "Bash(git status *)"
        "Bash(git diff *)" "Bash(git log *)" "Bash(git -C *)"
        # Filesystem (archive dirs, file moves, cleanup)
        "Bash(mkdir *)" "Bash(mv *)" "Bash(cp *)" "Bash(rm *)" "Bash(touch *)"
        # Read-only utilities
        "Bash(cat *)" "Bash(ls *)" "Bash(jq *)" "Bash(date *)"
        "Bash(head *)" "Bash(tail *)" "Bash(wc *)" "Bash(find *)"
        "Bash(grep *)" "Bash(pwd *)" "Bash(echo *)" "Bash(which *)"
        # Script runners (covers CLI migration tooling: capture-screenshots.ts,
        # log-progress-cli.ts, prod-server.ts, etc.)
        "Bash(npx *)" "Bash(tsx *)" "Bash(node *)"
        # Process management (prod server lifecycle)
        "Bash(kill *)" "Bash(pkill *)" "Bash(lsof *)"
        # Shell constructs that start compound commands (e.g. "cd /foo && pnpm build")
        "Bash(cd *)" "Bash(export *)" "Bash(source *)" "Bash(test *)"
        # Network (health check fallback)
        "Bash(curl *)"
        # Waiting (retry loops)
        "Bash(sleep *)"
        # Text processing
        "Bash(sed *)" "Bash(sort *)" "Bash(tee *)"
    )
    # Newline-delimited string for env export to execute-migration.ts.
    # Space-delimited would break tools containing spaces (e.g. "Bash(git add *)").
    CLAUDE_ALLOWED_TOOLS_STR="$(printf '%s\n' "${CLAUDE_ALLOWED_TOOLS[@]}")"

    # Build CLAUDE_PERMS as an array to preserve quoting through expansion
    CLAUDE_PERMS_ARRAY=(-p --permission-mode acceptEdits --allowedTools "${CLAUDE_ALLOWED_TOOLS[@]}")
    CLAUDE_PERMS="-p --permission-mode acceptEdits"
    RUNTIME_NAME="script"
    ATTACH_CMD="tail -f \$WORKSPACE_ROOT/migration-log.md"

    # Detect Chrome/Chromium on host
    if [ "$(uname)" = "Darwin" ]; then
        if [ -f "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" ]; then
            CHROMIUM_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
        elif [ -f "/Applications/Chromium.app/Contents/MacOS/Chromium" ]; then
            CHROMIUM_PATH="/Applications/Chromium.app/Contents/MacOS/Chromium"
        else
            CHROMIUM_PATH=""
        fi
    elif command -v google-chrome >/dev/null 2>&1; then
        CHROMIUM_PATH="$(command -v google-chrome)"
    elif command -v chromium-browser >/dev/null 2>&1; then
        CHROMIUM_PATH="$(command -v chromium-browser)"
    elif command -v chromium >/dev/null 2>&1; then
        CHROMIUM_PATH="$(command -v chromium)"
    else
        CHROMIUM_PATH=""
    fi
fi

# Derived paths (work for both environments)
INTERVENTION_DIR="$WORKSPACE_ROOT/intervention"
LOG_FILE="$WORKSPACE_ROOT/migration-log.md"
PLAN_FILE="${PLAN_FILE:-$WORKSPACE_ROOT/migration-plan.md}"
STATE_DIR="$WORKSPACE_ROOT/.migration-state"
STANDALONE_PROJECT="$WORKSPACE_ROOT/storefront-next"
KEEPALIVE="${KEEPALIVE:-false}"

# Colors for logging
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $(date -u +"%Y-%m-%dT%H:%M:%SZ") - $1" | tee -a "$LOG_FILE"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $(date -u +"%Y-%m-%dT%H:%M:%SZ") - $1" | tee -a "$LOG_FILE"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $(date -u +"%Y-%m-%dT%H:%M:%SZ") - $1" | tee -a "$LOG_FILE"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $(date -u +"%Y-%m-%dT%H:%M:%SZ") - $1" | tee -a "$LOG_FILE"
}

# Exit helper - respects KEEPALIVE flag
exit_or_keepalive() {
    local exit_code=$1
    local message="${2:-$RUNTIME_NAME would exit with code $exit_code}"

    if [ "$KEEPALIVE" = "true" ]; then
        log_warning "$message"
        log_info "KEEPALIVE=true - $RUNTIME_NAME will stay running for inspection"
        log_info "Attach with: $ATTACH_CMD"
        if [ "$IN_CONTAINER" = "true" ]; then
            tail -f /dev/null
        else
            read -r -p "Press Enter to exit..."
        fi
    else
        exit $exit_code
    fi
}

# Validate environment prerequisites
validate_environment() {
    local errors=0

    # Required tools
    for cmd in node pnpm git claude; do
        if ! command -v "$cmd" >/dev/null 2>&1; then
            echo -e "${RED}[ERROR]${NC} Required command not found: $cmd" >&2
            errors=$((errors + 1))
        fi
    done

    # Optional tools (warn only)
    if ! command -v jq >/dev/null 2>&1; then
        echo -e "${YELLOW}[WARNING]${NC} jq not found - MCP config merging will use fallback" >&2
    fi

    # Browser check (host only)
    if [ "$IN_CONTAINER" = "false" ] && [ -z "$CHROMIUM_PATH" ]; then
        echo -e "${RED}[ERROR]${NC} Chrome/Chromium not found on host" >&2
        echo -e "${RED}[ERROR]${NC} Install Google Chrome or Chromium for screenshot functionality" >&2
        errors=$((errors + 1))
    fi

    if [ $errors -gt 0 ]; then
        echo -e "${RED}[ERROR]${NC} Environment validation failed with $errors error(s)" >&2
        exit 1
    fi
}

# ============================================================================
# Clean Start Handling
# ============================================================================

if [ "${CLEAN_START:-false}" = "true" ]; then
    echo -e "${YELLOW}[CLEAN]${NC} $(date -u +"%Y-%m-%dT%H:%M:%SZ") - Clean start requested"
    echo -e "${YELLOW}[CLEAN]${NC} Removing workspace artifacts..."

    # Remove session file
    if [ -f "$WORKSPACE_ROOT/.claude-session-id" ]; then
        rm -f "$WORKSPACE_ROOT/.claude-session-id"
        echo -e "${GREEN}[CLEAN]${NC}   ✓ Removed .claude-session-id"
    fi

    # Remove state tracking
    if [ -d "$STATE_DIR" ]; then
        rm -rf "$STATE_DIR"
        echo -e "${GREEN}[CLEAN]${NC}   ✓ Removed stage completion markers"
    fi

    # Remove intervention files
    if [ -d "$INTERVENTION_DIR" ]; then
        rm -f "$INTERVENTION_DIR"/needed-*.json "$INTERVENTION_DIR"/response-*.json 2>/dev/null || true
        echo -e "${GREEN}[CLEAN]${NC}   ✓ Removed intervention files"
    fi

    # Remove logs
    if [ -f "$WORKSPACE_ROOT/claude-output.jsonl" ]; then
        rm -f "$WORKSPACE_ROOT/claude-output.jsonl"
        echo -e "${GREEN}[CLEAN]${NC}   ✓ Removed claude-output.jsonl"
    fi

    # Remove generated screenshot wrapper artifacts
    if [ -d "$WORKSPACE_ROOT/scripts/generated" ]; then
        rm -rf "$WORKSPACE_ROOT/scripts/generated"
        echo -e "${GREEN}[CLEAN]${NC}   ✓ Removed scripts/generated"
    fi
    if [ -f "$WORKSPACE_ROOT/analysis/screenshot-commands.json" ]; then
        rm -f "$WORKSPACE_ROOT/analysis/screenshot-commands.json"
        echo -e "${GREEN}[CLEAN]${NC}   ✓ Removed analysis/screenshot-commands.json"
    fi

    # Optionally backup migration-log.md instead of deleting
    if [ -f "$LOG_FILE" ]; then
        backup_log="$WORKSPACE_ROOT/migration-log-backup-$(date -u +"%Y%m%d-%H%M%S").md"
        mv "$LOG_FILE" "$backup_log"
        echo -e "${GREEN}[CLEAN]${NC}   ✓ Backed up migration-log.md to $(basename "$backup_log")"
    fi

    echo -e "${GREEN}[CLEAN]${NC} Workspace cleaned, starting fresh"
    echo ""
fi

# Create state directory
mkdir -p "$STATE_DIR"

# Initialize log file
echo "# Migration Log - $(date -u +"%Y-%m-%dT%H:%M:%SZ")" > "$LOG_FILE"
echo "" >> "$LOG_FILE"

log_info "Migration worker starting..."
log_info "Intervention directory: $INTERVENTION_DIR"
log_info "Plan file: $PLAN_FILE"

# Ensure intervention directories exist
mkdir -p "$INTERVENTION_DIR/history"

# Check for API key or auth token (warning only - process stays running)
if [ -z "${ANTHROPIC_API_KEY:-}" ] && [ -z "${ANTHROPIC_AUTH_TOKEN:-}" ]; then
    log_warning "Neither ANTHROPIC_API_KEY nor ANTHROPIC_AUTH_TOKEN set"
    log_warning "Claude Code execution will fail without authentication"
    log_warning "Set one in .env file and restart"
else
    if [ -n "${ANTHROPIC_AUTH_TOKEN:-}" ]; then
        log_success "Authentication configured (Bedrock)"
    else
        log_success "Authentication configured (API key)"
    fi
fi

log_success "Environment validated - $RUNTIME_NAME ready"

# Validate prerequisites
validate_environment

# ============================================================================
# Host-only: Validate MONOREPO_SOURCE
# ============================================================================

if [ "$IN_CONTAINER" = "false" ]; then
    if [ -z "$MONOREPO_SOURCE_PATH" ]; then
        log_error "MONOREPO_SOURCE environment variable not set"
        log_error "Usage: MONOREPO_SOURCE=/path/to/SFCC-Odyssey ./docker/entrypoint.sh"
        exit 1
    fi
    if [ ! -d "$MONOREPO_SOURCE_PATH" ]; then
        log_error "MONOREPO_SOURCE path does not exist: $MONOREPO_SOURCE_PATH"
        exit 1
    fi
    if [ ! -d "$MONOREPO_SOURCE_PATH/packages" ] || [ ! -f "$MONOREPO_SOURCE_PATH/package.json" ]; then
        log_error "MONOREPO_SOURCE does not appear to be a valid monorepo"
        log_error "Expected packages/ directory and package.json in: $MONOREPO_SOURCE_PATH"
        exit 1
    fi
    log_success "MONOREPO_SOURCE validated: $MONOREPO_SOURCE_PATH"

    # Host-only: Validate SFRA_SOURCE (optional - for ISML template mapping)
    SFRA_SOURCE_PATH="${SFRA_SOURCE:-}"
    if [ -z "$SFRA_SOURCE_PATH" ]; then
        log_warning "SFRA_SOURCE not set - ISML template mapping will require manual paths"
    elif [ ! -d "$SFRA_SOURCE_PATH" ]; then
        log_warning "SFRA_SOURCE path does not exist: $SFRA_SOURCE_PATH"
    elif [ ! -d "$SFRA_SOURCE_PATH/cartridges" ]; then
        log_warning "SFRA_SOURCE does not appear to be a valid SFRA checkout"
        log_warning "Expected cartridges/ directory in: $SFRA_SOURCE_PATH"
    else
        log_success "SFRA_SOURCE validated: $SFRA_SOURCE_PATH"
    fi
fi

# ============================================================================
# Phase 1: Build Monorepo and Generate Standalone Project
# ============================================================================

# Check if Phase 1 already complete (different checks for container vs host)
phase1_complete=false
if [ -f "$STATE_DIR/phase1-complete" ]; then
    if [ "$USE_TMP_STRATEGY" = "true" ]; then
        # Container: check symlink and /tmp build
        if [ -L "$STANDALONE_PROJECT/node_modules" ] && \
           [ -f "$STANDALONE_BUILD/node_modules/.bin/sfnext" ] && \
           [ -f "$MONOREPO_BUILD/packages/storefront-next-dev/dist/cli.js" ]; then
            phase1_complete=true
        fi
    else
        # Host: check direct install
        if [ -f "$STANDALONE_PROJECT/node_modules/.bin/sfnext" ] && \
           [ -f "$MONOREPO_BUILD/packages/storefront-next-dev/dist/cli.js" ]; then
            phase1_complete=true
        fi
    fi
fi

if [ "$phase1_complete" = "true" ]; then
    log_success "Phase 1 already complete (built: $(cat "$STATE_DIR/phase1-complete"))"
    log_info "  Monorepo: $MONOREPO_BUILD"
    log_info "  Standalone: $STANDALONE_PROJECT"
    if [ "$USE_TMP_STRATEGY" = "true" ]; then
        log_info "  node_modules: $STANDALONE_BUILD/node_modules (symlinked)"
    else
        log_info "  node_modules: $STANDALONE_PROJECT/node_modules (direct)"
    fi
    log_info "Skipping to Phase 2 (git baseline)..."
else
    log_info "Running Phase 1: Build Monorepo and Generate Standalone Project"

    # Container-only: Remove existing node_modules to ensure clean symlink
    if [ "$IN_CONTAINER" = "true" ] && [ -d "$STANDALONE_PROJECT/node_modules" ] && [ ! -L "$STANDALONE_PROJECT/node_modules" ]; then
        log_info "Removing existing node_modules directory (will be replaced with symlink)..."
        rm -rf "$STANDALONE_PROJECT/node_modules"
    fi

# Step 1: Check if monorepo needs to be built
if [ -f "$MONOREPO_BUILD/packages/storefront-next-dev/dist/cli.js" ]; then
    log_success "Monorepo already built at $MONOREPO_BUILD"
else
    log_info "Building monorepo in $RUNTIME_NAME..."

    # Check if monorepo source is available
    if [ ! -d "$MONOREPO_SOURCE_PATH" ]; then
        if [ "$IN_CONTAINER" = "true" ]; then
            log_error "Monorepo source not mounted at $MONOREPO_SOURCE_PATH"
            log_error "Add volume: - \$STOREFRONT_MONOREPO_PATH:/monorepo-source:ro"
        else
            log_error "Monorepo source not found at $MONOREPO_SOURCE_PATH"
        fi
        log_warning "Skipping monorepo build - $RUNTIME_NAME will not be fully functional"
    else
        # Container: copy to /tmp to avoid bind mount FD issues
        # Host: build in place (MONOREPO_BUILD == MONOREPO_SOURCE_PATH)
        if [ "$IN_CONTAINER" = "true" ]; then
            log_info "Copying monorepo from $MONOREPO_SOURCE_PATH to $MONOREPO_BUILD..."

            # Remove old build
            rm -rf "$MONOREPO_BUILD"
            mkdir -p "$MONOREPO_BUILD"

            # Copy monorepo excluding build artifacts and node_modules
            # Use tar streaming (no temp files) to avoid file descriptor exhaustion
            log_info "Copying source files via tar streaming (excluding node_modules, dist, .git)..."
            tar -C "$MONOREPO_SOURCE_PATH" \
                --exclude='node_modules' \
                --exclude='.pnpm-store' \
                --exclude='.git' \
                --exclude='dist' \
                --exclude='build' \
                --exclude='.next' \
                --exclude='coverage' \
                --exclude='.nyc_output' \
                --exclude='test-results' \
                --exclude='playwright-report' \
                -czf - . | tar -C "$MONOREPO_BUILD" -xzf -

            log_success "Monorepo copied to $MONOREPO_BUILD"
        else
            log_info "Using monorepo in place at $MONOREPO_BUILD"
        fi

        # Build monorepo
        log_info "Installing monorepo dependencies..."
        cd "$MONOREPO_BUILD"

        if < /dev/null pnpm install --frozen-lockfile 2>&1; then
            log_success "Monorepo dependencies installed"
        else
            log_warning "Install with frozen lockfile failed, trying without..."
            if < /dev/null pnpm install 2>&1; then
                log_success "Monorepo dependencies installed"
            else
                log_error "Failed to install monorepo dependencies"
                log_error "Cannot continue without monorepo packages"
                cd "$WORKSPACE_ROOT"
                exit_or_keepalive 1 "Monorepo dependency installation failed"
            fi
        fi

        log_info "Building monorepo packages..."
        if < /dev/null pnpm -r build 2>&1; then
            log_success "Monorepo built successfully"

            # Verify key packages
            if [ -f "packages/storefront-next-dev/dist/cli.js" ]; then
                log_success "  ✓ storefront-next-dev"
            else
                log_error "  ✗ storefront-next-dev build missing"
                exit 1
            fi
            if [ -f "packages/storefront-next-runtime/dist/scapi.js" ]; then
                log_success "  ✓ storefront-next-runtime"
            else
                log_error "  ✗ storefront-next-runtime build missing"
                exit 1
            fi
        else
            log_error "Monorepo build failed"
            log_error "Cannot continue without built packages"
            cd "$WORKSPACE_ROOT"
            exit_or_keepalive 1 "Monorepo build failed"
        fi

        cd "$WORKSPACE_ROOT"
    fi
fi

# Step 2: Check if standalone project needs to be generated (idempotent check)
# The check differs based on environment (symlink in container, direct in host)
standalone_ready=false
if [ -f "$STANDALONE_PROJECT/package.json" ]; then
    if [ "$USE_TMP_STRATEGY" = "true" ]; then
        # Container: check for symlink
        if [ -L "$STANDALONE_PROJECT/node_modules" ] && \
           [ -f "$STANDALONE_BUILD/node_modules/.bin/sfnext" ]; then
            standalone_ready=true
        fi
    else
        # Host: check for direct install
        if [ -f "$STANDALONE_PROJECT/node_modules/.bin/sfnext" ]; then
            standalone_ready=true
        fi
    fi
fi

if [ "$standalone_ready" = "true" ]; then
    log_success "Standalone project already complete - skipping generation"

    # Check if dependencies need fixing (workspace:* or wrong file:// paths)
    needs_fix=false
    if grep -q '"workspace:' "$STANDALONE_PROJECT/package.json" 2>/dev/null; then
        needs_fix=true
        log_warning "Found workspace:* dependencies in existing project"
    elif ! grep -q "\"file://$MONOREPO_BUILD/packages/" "$STANDALONE_PROJECT/package.json" 2>/dev/null && \
         grep -q '"file://.*/packages/' "$STANDALONE_PROJECT/package.json" 2>/dev/null; then
        needs_fix=true
        log_warning "Found file:// paths pointing to wrong monorepo location"
    fi

    if [ "$needs_fix" = "true" ]; then
        log_info "Fixing monorepo package references..."

        cd "$STANDALONE_PROJECT"
        node -e "
            const fs = require('fs');
            const path = require('path');
            const pkg = require('./package.json');
            const monorepoPackages = '$MONOREPO_BUILD/packages';
            let converted = 0;

            ['dependencies', 'devDependencies'].forEach(depType => {
                if (pkg[depType]) {
                    Object.keys(pkg[depType]).forEach(name => {
                        const value = pkg[depType][name];
                        const pkgName = name.split('/').pop();
                        const expectedPath = 'file://' + path.join(monorepoPackages, pkgName);

                        if (value.startsWith('workspace:')) {
                            pkg[depType][name] = expectedPath;
                            converted++;
                        } else if (value.startsWith('file://') && value !== expectedPath && value.includes('/packages/')) {
                            pkg[depType][name] = expectedPath;
                            converted++;
                        }
                    });
                }
            });

            if (converted > 0) {
                fs.writeFileSync('./package.json', JSON.stringify(pkg, null, 2) + '\n');
                console.log('Fixed ' + converted + ' monorepo package reference(s)');
            }
        "

        if [ "$USE_TMP_STRATEGY" = "true" ]; then
            # Container: Install in /tmp to avoid bind mount FD exhaustion
            log_info "Copying to /tmp for dependency update..."
            mkdir -p "$STANDALONE_BUILD"
            rsync -a --exclude='node_modules' "$STANDALONE_PROJECT/" "$STANDALONE_BUILD/"

            cd "$STANDALONE_BUILD"
            log_info "Running pnpm install in container filesystem..."
            CI=true pnpm install --no-frozen-lockfile 2>&1 | tail -10

            # Sync back and recreate symlink
            rsync -a --exclude='node_modules' "$STANDALONE_BUILD/" "$STANDALONE_PROJECT/"
            rm -rf "$STANDALONE_PROJECT/node_modules"
            ln -s "$STANDALONE_BUILD/node_modules" "$STANDALONE_PROJECT/node_modules"
        else
            # Host: Install directly
            # Remove symlink if it exists (from previous container run)
            if [ -L "$STANDALONE_PROJECT/node_modules" ]; then
                log_info "Removing container symlink for direct install..."
                rm -f "$STANDALONE_PROJECT/node_modules"
            fi
            log_info "Running pnpm install..."
            CI=true pnpm install --no-frozen-lockfile 2>&1 | tail -10
        fi

        log_success "Project updated with correct file:// references"
    fi
else
    log_info "Standalone project incomplete or missing - regenerating..."

    # Check if monorepo is built
    if [ ! -f "$MONOREPO_BUILD/packages/storefront-next-dev/dist/cli.js" ]; then
        log_error "Cannot generate standalone project: monorepo not built"
        log_warning "$RUNTIME_NAME will not be fully functional"
    else
        # Create clean template with git history (required by create-storefront)
        log_info "Preparing template..."
        cd /tmp
        rm -rf template-clean

        rsync -a --exclude='node_modules' --exclude='.git' \
            "$MONOREPO_BUILD/packages/template-retail-rsc-app/" \
            template-clean/

        cd template-clean

        # Configure git for this repo (required for commit)
        git init
        if [ "$IN_CONTAINER" = "true" ]; then
            # Container: use disposable identity
            git config user.email "migration@example.com"
            git config user.name "Migration Bot"
        else
            # Host: respect existing global config, or set local fallback
            if ! git config user.email >/dev/null 2>&1; then
                git config --local user.email "migration@example.com"
            fi
            if ! git config user.name >/dev/null 2>&1; then
                git config --local user.name "Migration Bot"
            fi
        fi
        git add .
        git commit -m "Initial template"
        log_success "Template prepared"

        cd "$WORKSPACE_ROOT"

        # Check if project already exists and is complete
        if [ -d "$STANDALONE_PROJECT" ] && [ -f "$STANDALONE_PROJECT/package.json" ]; then
            log_success "Standalone project already exists, skipping generation"
        else
            # Remove incomplete project directory if it exists
            if [ -d "$STANDALONE_PROJECT" ]; then
                log_warning "Incomplete storefront-next found (missing package.json), removing..."
                rm -rf "$STANDALONE_PROJECT"
            fi

            log_info "Running create-storefront..."
            log_info "  Template: /tmp/template-clean"
            log_info "  Local packages: $MONOREPO_BUILD/packages"

            # Run create-storefront with --local-packages-dir to create file:// symlinks
            # Pipe newlines to accept default paths for workspace dependencies (non-interactive)
            echo -e "\n\n" | npx "$MONOREPO_BUILD/packages/storefront-next-dev/dist/cli.js" create-storefront \
                --name storefront-next \
                --template "file:///tmp/template-clean" \
                --local-packages-dir "$MONOREPO_BUILD/packages"

            if [ $? -eq 0 ]; then
                log_success "Standalone project created"
            else
                log_error "Failed to create standalone project"
                log_error "Cannot continue without valid project structure"
                exit_or_keepalive 1 "Failed to create standalone project"
            fi
        fi

        # Convert workspace:* dependencies to file:// references
        # This creates symlinks from /workspace (shared mount) to /tmp (container-only)
        # Avoids file descriptor exhaustion on host OS
        if [ -d "$STANDALONE_PROJECT" ]; then
            cd "$STANDALONE_PROJECT"

            log_info "Converting/fixing monorepo package references..."

            # Convert workspace:* to file:// AND fix existing file:// paths if they point to wrong location
            node -e "
                const fs = require('fs');
                const path = require('path');
                const pkg = require('./package.json');

                const monorepoPackages = '$MONOREPO_BUILD/packages';
                let converted = 0;

                function fixDep(depType) {
                    if (!pkg[depType]) return;
                    Object.keys(pkg[depType]).forEach(name => {
                        const value = pkg[depType][name];
                        const pkgName = name.split('/').pop();
                        const expectedPath = 'file://' + path.join(monorepoPackages, pkgName);

                        // Convert workspace:* references
                        if (value.startsWith('workspace:')) {
                            pkg[depType][name] = expectedPath;
                            converted++;
                            console.error('  ✓ ' + name + ': workspace:* → ' + expectedPath);
                        }
                        // Fix file:// references that point to wrong location
                        else if (value.startsWith('file://') && value !== expectedPath) {
                            // Only fix if it's a monorepo package (contains /packages/)
                            if (value.includes('/packages/')) {
                                pkg[depType][name] = expectedPath;
                                converted++;
                                console.error('  ✓ ' + name + ': ' + value + ' → ' + expectedPath);
                            }
                        }
                    });
                }

                fixDep('dependencies');
                fixDep('devDependencies');

                if (converted > 0) {
                    fs.writeFileSync('./package.json', JSON.stringify(pkg, null, 2) + '\n');
                    console.error('');
                    console.error('Fixed ' + converted + ' monorepo package reference(s)');
                } else {
                    console.error('All monorepo references already correct');
                }
            "

            if [ $? -ne 0 ]; then
                log_error "Failed to convert workspace dependencies"
                exit_or_keepalive 1 "Failed to convert workspace dependencies"
            fi

            if [ "$USE_TMP_STRATEGY" = "true" ]; then
                # Container: Install dependencies in container-only filesystem to avoid FD exhaustion
                log_info "Copying project to /tmp for installation..."
                mkdir -p "$STANDALONE_BUILD"
                rsync -a --exclude='node_modules' "$STANDALONE_PROJECT/" "$STANDALONE_BUILD/"

                cd "$STANDALONE_BUILD"
                log_info "Installing dependencies in container filesystem (avoids bind mount FD limits)..."

                # Use --no-frozen-lockfile since we modified package.json
                # Set CI=true to run pnpm in non-interactive mode (no prompts)
                if CI=true pnpm install --no-frozen-lockfile 2>&1 | tail -20; then
                    log_success "Dependencies installed in $STANDALONE_BUILD"
                else
                    log_error "Failed to install dependencies"
                    log_error "Cannot continue without dependencies"
                    exit_or_keepalive 1 "Failed to install dependencies"
                fi

                # Copy structure back to workspace (excluding node_modules)
                log_info "Syncing project structure back to workspace..."
                rsync -a --exclude='node_modules' "$STANDALONE_BUILD/" "$STANDALONE_PROJECT/"

                # Remove any existing node_modules (directory or symlink) before creating new symlink
                log_info "Creating symlink for node_modules..."
                rm -rf "$STANDALONE_PROJECT/node_modules"
                ln -s "$STANDALONE_BUILD/node_modules" "$STANDALONE_PROJECT/node_modules"

                # Verify symlink and binaries
                if [ -L "$STANDALONE_PROJECT/node_modules" ]; then
                    log_success "  ✓ node_modules symlinked to $(readlink $STANDALONE_PROJECT/node_modules)"
                else
                    log_error "  ✗ Failed to create node_modules symlink"
                    exit 1
                fi

                if [ -f "$STANDALONE_BUILD/node_modules/.bin/sfnext" ]; then
                    log_success "  ✓ sfnext CLI available at $STANDALONE_BUILD/node_modules/.bin/sfnext"
                    # Verify it's accessible via symlink
                    if [ -f "$STANDALONE_PROJECT/node_modules/.bin/sfnext" ]; then
                        log_success "  ✓ sfnext accessible via workspace symlink"
                    fi
                else
                    log_error "  ✗ sfnext CLI not found at $STANDALONE_BUILD/node_modules/.bin/sfnext"

                    # Debug: Check if package was installed
                    log_info "Debugging: Checking for @salesforce/storefront-next-dev package..."
                    if [ -d "$STANDALONE_BUILD/node_modules/@salesforce/storefront-next-dev" ]; then
                        log_info "  Package directory exists"
                        log_info "  Checking package.json bin entry..."
                        if [ -f "$STANDALONE_BUILD/node_modules/@salesforce/storefront-next-dev/package.json" ]; then
                            grep -A2 '"bin"' "$STANDALONE_BUILD/node_modules/@salesforce/storefront-next-dev/package.json" || log_warning "  No bin entry found"
                        fi
                        log_info "  Listing .bin directory:"
                        ls -la "$STANDALONE_BUILD/node_modules/.bin/" | head -10 || log_warning "  .bin directory missing"
                    else
                        log_error "  @salesforce/storefront-next-dev package not installed"
                        log_info "  Checking package.json dependencies..."
                        grep -A5 '"dependencies"' "$STANDALONE_BUILD/package.json" | head -20
                    fi

                    log_error "Project setup failed - cannot continue"
                    log_warning "$RUNTIME_NAME will stay running for investigation"
                    sleep infinity
                fi
            else
                # Host: Install dependencies directly in project directory
                # Remove symlink if it exists (from previous container run)
                if [ -L "$STANDALONE_PROJECT/node_modules" ]; then
                    log_info "Removing container symlink for direct install..."
                    rm -f "$STANDALONE_PROJECT/node_modules"
                fi

                log_info "Installing dependencies directly..."

                # Use --no-frozen-lockfile since we modified package.json
                # Set CI=true to run pnpm in non-interactive mode (no prompts)
                if CI=true pnpm install --no-frozen-lockfile 2>&1 | tail -20; then
                    log_success "Dependencies installed in $STANDALONE_PROJECT"
                else
                    log_error "Failed to install dependencies"
                    log_error "Cannot continue without dependencies"
                    exit_or_keepalive 1 "Failed to install dependencies"
                fi

                # Verify binaries
                if [ -f "$STANDALONE_PROJECT/node_modules/.bin/sfnext" ]; then
                    log_success "  ✓ sfnext CLI available at $STANDALONE_PROJECT/node_modules/.bin/sfnext"
                else
                    log_error "  ✗ sfnext CLI not found at $STANDALONE_PROJECT/node_modules/.bin/sfnext"

                    # Debug: Check if package was installed
                    log_info "Debugging: Checking for @salesforce/storefront-next-dev package..."
                    if [ -d "$STANDALONE_PROJECT/node_modules/@salesforce/storefront-next-dev" ]; then
                        log_info "  Package directory exists"
                        log_info "  Checking package.json bin entry..."
                        if [ -f "$STANDALONE_PROJECT/node_modules/@salesforce/storefront-next-dev/package.json" ]; then
                            grep -A2 '"bin"' "$STANDALONE_PROJECT/node_modules/@salesforce/storefront-next-dev/package.json" || log_warning "  No bin entry found"
                        fi
                        log_info "  Listing .bin directory:"
                        ls -la "$STANDALONE_PROJECT/node_modules/.bin/" | head -10 || log_warning "  .bin directory missing"
                    else
                        log_error "  @salesforce/storefront-next-dev package not installed"
                        log_info "  Checking package.json dependencies..."
                        grep -A5 '"dependencies"' "$STANDALONE_PROJECT/package.json" | head -20
                    fi

                    log_error "Project setup failed - cannot continue"
                    exit_or_keepalive 1 "sfnext CLI not found"
                fi
            fi

            # Create .env if needed
            if [ ! -f .env ] && [ -f .env.default ]; then
                cp .env.default .env
                log_success "  ✓ Created .env from .env.default"
            fi

            cd "$WORKSPACE_ROOT"
        fi
    fi
fi

# Mark Phase 1 complete
echo "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" > "$STATE_DIR/phase1-complete"
log_success "Phase 1 complete: Monorepo built and standalone project ready"
fi  # End Phase 1 skip check

# ============================================================================
# Phase 2: Commit Storefront-Next Baseline to Git
# ============================================================================

# Check if baseline already committed
if [ -f "$STATE_DIR/baseline-committed" ]; then
    log_success "Phase 2 already complete (baseline committed: $(cat "$STATE_DIR/baseline-committed"))"
    log_info "Skipping to Phase 3..."
else
    log_info "Running Phase 2: Commit storefront-next baseline to git"

    # Check if we're in a git repository
    cd "$WORKSPACE_ROOT"
    if git rev-parse --git-dir > /dev/null 2>&1; then
        # Check if storefront-next exists and has content
        if [ -d "$STANDALONE_PROJECT" ] && [ "$(ls -A $STANDALONE_PROJECT 2>/dev/null)" ]; then
            # Only commit if there are actual changes in storefront-next/
            if [ -n "$(git status --porcelain -- storefront-next/ 2>/dev/null)" ]; then
                log_info "Changes detected in storefront-next/, committing baseline..."

                if git add storefront-next/ 2>&1 | tee -a "$LOG_FILE"; then
                    if git commit -m "chore: add storefront-next baseline after bootstrap

Generated by create-storefront during Phase 1 initialization.
This commit establishes the baseline for tracking migration changes.

Components:
- Source code from template-retail-rsc-app
- Package.json with file:// references to monorepo packages
- Configuration files (.env, tsconfig, etc.)
- Note: node_modules is symlinked to /tmp and excluded by .gitignore" 2>&1 | tee -a "$LOG_FILE"; then
                        log_success "Storefront-next baseline committed to git"
                    else
                        log_warning "Git commit had issues, but continuing (may already be committed)"
                    fi
                else
                    log_error "Failed to add storefront-next to git"
                    log_warning "Continuing without git baseline (git tracking may not work)"
                fi
            else
                log_success "No changes in storefront-next/ — already up to date"
            fi

            # Mark as complete regardless (directory exists and is tracked or unchanged)
            echo "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" > "$STATE_DIR/baseline-committed"
            log_success "Phase 2 complete: Baseline committed"
        else
            log_warning "storefront-next directory missing or empty, skipping git baseline"
        fi
    else
        log_warning "$WORKSPACE_ROOT is not a git repository, skipping git baseline"
        log_info "Git tracking will not be available for migration changes"
    fi
fi

# ============================================================================
# Host Mode: Tool Allow-List Transparency Prompt
# ============================================================================

if [ "$IN_CONTAINER" = "false" ] && [ -t 0 ]; then
    echo ""
    log_info "━━━ Host Mode: Tool Allow-List ━━━"
    log_info "The following commands are pre-approved for Claude during migration:"
    log_info ""
    log_info "  Package manager:  pnpm (typecheck, build, dev, start, test, lint)"
    log_info "  Git:              add, commit, status, diff, log (no reset/push/rebase)"
    log_info "  Filesystem:       mkdir, mv, cp, rm, touch, cat, ls, head, tail, find"
    log_info "  Script runners:   npx, tsx, node (migration tools, prod-server.ts, etc.)"
    log_info "  Shell:            cd, echo, grep, sed, sort, tee, pwd, which, export, test"
    log_info "  Process mgmt:     kill, pkill, lsof, sleep"
    log_info "  Network:          curl (health check fallback)"
    log_info "  File editing:     Read, Write, Edit, Glob, Grep"
    log_info ""
    log_info "All other bash commands will still require manual approval."
    log_info "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    read -r -t 10 -p "Press Enter to continue (auto-continues in 10s)... " || true
    echo ""
fi

log_success "$RUNTIME_NAME initialization complete"
log_info "Chromium available: $([ -n "$CHROMIUM_PATH" ] && echo "Yes ($CHROMIUM_PATH)" || echo 'No')"

# ============================================================================
# Phase 4: Interactive Setup (Feature Discovery & Plan Generation)
# ============================================================================

if [ -f "$STATE_DIR/phase4-complete" ]; then
    log_success "Phase 4 already complete (setup: $(cat "$STATE_DIR/phase4-complete"))"
    log_info "  Discovery: $(find "$WORKSPACE_ROOT/migration-plans" -name '*-features.json' 2>/dev/null | wc -l | tr -d ' ') page(s)"
    log_info "  Sub-plans: $(find "$WORKSPACE_ROOT/sub-plans" -name '*.md' 2>/dev/null | wc -l | tr -d ' ')"
    log_info "Skipping to Phase 5..."
else
    log_info "Running Phase 4: Feature Discovery & Plan Generation"

    # Install setup script dependencies if needed
    if [ -f "$WORKSPACE_ROOT/package.json" ]; then
        log_info "Installing setup dependencies..."
        cd "$WORKSPACE_ROOT"
        if ! pnpm install --frozen-lockfile 2>/dev/null; then
            pnpm install 2>&1 | tail -5
        fi
    fi

    # Check that url-mappings.json exists (page-level config)
    if [ ! -f "$WORKSPACE_ROOT/url-mappings.json" ]; then
        log_error "url-mappings.json not found - required for page-level config"
        log_info "Create url-mappings.json with page definitions (URLs, ISML paths, viewport)"
        exit_or_keepalive 1 "url-mappings.json required"
    fi

    # Step 1: Interactive page config confirmation
    # Skip when non-interactive (e.g. piped stdin in CI)
    if [ -t 0 ]; then
        log_info "Step 1/5: Interactive page configuration..."
        if npx tsx "$WORKSPACE_ROOT/scripts/setup-migration.ts"; then
            log_success "Page configuration complete"
        else
            log_error "Page configuration failed"
            exit_or_keepalive 1 "Page configuration failed"
        fi
    else
        log_info "Step 1/5: Non-interactive mode — using url-mappings.json as-is"
    fi

    # Step 2: Read selected page IDs from url-mappings.json
    SELECTED_PAGES=$(jq -r '.pages[] | select(.selected == true) | .page_id' "$WORKSPACE_ROOT/url-mappings.json")

    if [ -z "$SELECTED_PAGES" ]; then
        log_error "No pages selected in url-mappings.json"
        log_info "Run setup-migration.ts to select pages, or set \"selected\": true on desired pages."
        exit_or_keepalive 1 "No selected pages"
    fi

    log_info "Selected pages: $SELECTED_PAGES"

    # Step 3: Feature discovery per selected page (separate Claude context each)
    log_info "Step 2/5: Discovering features from ISML..."
    for PAGE_ID in $SELECTED_PAGES; do
        log_info "  Discovering features for page: $PAGE_ID"
        if CLAUDECODE= npx tsx "$WORKSPACE_ROOT/scripts/discover-features-claude.ts" --page "$PAGE_ID"; then
            log_success "  Feature discovery complete for $PAGE_ID"
        else
            log_error "  Feature discovery failed for $PAGE_ID"
            exit_or_keepalive 1 "Feature discovery failed for $PAGE_ID"
        fi
    done

    # Step 4: Run analysis on discovered features
    log_info "Step 3/5: Analyzing features..."
    if npx tsx "$WORKSPACE_ROOT/scripts/analyze-features.ts"; then
        log_success "Feature analysis complete"
    else
        log_warning "Feature analysis failed (continuing anyway)"
    fi

    # Step 4: Generate sub-plans
    log_info "Step 4/5: Generating sub-plans..."
    if npx tsx "$WORKSPACE_ROOT/scripts/generate-plans.ts"; then
        log_success "Sub-plans generated"
    else
        log_error "Sub-plan generation failed"
        exit_or_keepalive 1 "Sub-plan generation failed"
    fi

    # Step 5: Initialize migration log
    log_info "Step 5/5: Initializing migration log..."
    if npx tsx "$WORKSPACE_ROOT/scripts/init-migration-log.ts"; then
        log_success "Migration log initialized"
    else
        log_warning "Migration log initialization failed (continuing anyway)"
    fi

    # Mark Phase 4 complete
    echo "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" > "$STATE_DIR/phase4-complete"
    log_success "Phase 4 complete: Discovery and plan generation finished"
fi

# ============================================================================
# Phase 5: Execute Migration
# ============================================================================

# Configuration from environment
MIGRATION_PLAN="${MIGRATION_PLAN:-$WORKSPACE_ROOT/migration-main-plan.md}"
AUTO_START="${AUTO_START:-true}"

if [ "$AUTO_START" != "true" ]; then
    log_info "AUTO_START disabled, keeping $RUNTIME_NAME running for manual execution"
    log_info "To run manually: $ATTACH_CMD"
    if [ "$IN_CONTAINER" = "true" ]; then
        tail -f /dev/null
    else
        read -r -p "Press Enter to exit..."
    fi
    exit 0
fi

# Launch the TypeScript execution loop (multi-session, one per feature)
log_info "Launching execution loop"
log_info "Output also logged to: $WORKSPACE_ROOT/claude-output.jsonl"
export WORKSPACE_ROOT MONOREPO_BUILD STANDALONE_PROJECT CLAUDE_ALLOWED_TOOLS_STR

cd "$WORKSPACE_ROOT"
npx tsx "$WORKSPACE_ROOT/scripts/execute-migration.ts"
CLAUDE_EXIT_CODE=$?
log_info "Execution loop exited with code $CLAUDE_EXIT_CODE"

# ============================================================================
# Phase 6: Exit Handling
# ============================================================================

check_exit_reason() {
    log_info "Checking exit reason..."

    # Check for pending interventions
    local pending_count=0

    if [ -d "$INTERVENTION_DIR" ]; then
        for needed_file in "$INTERVENTION_DIR"/needed-*.json; do
            [ -f "$needed_file" ] || continue

            local worker_id=$(basename "$needed_file" .json | sed 's/needed-//')
            local response_file="$INTERVENTION_DIR/response-$worker_id.json"

            if [ ! -f "$response_file" ]; then
                pending_count=$((pending_count + 1))

                local question=$(jq -r '.question' "$needed_file" 2>/dev/null || echo "Unknown")
                log_info "Pending intervention: $worker_id"
                log_info "  Question: $question"
            fi
        done
    fi

    if [ $pending_count -gt 0 ]; then
        log_warning "Claude paused with $pending_count pending intervention(s)"
        log_info "Next steps:"
        log_info "  1. Open dashboard: http://localhost:3030"
        log_info "  2. Go to 'Interventions' tab"
        log_info "  3. Submit your responses"
        if [ "$IN_CONTAINER" = "true" ]; then
            log_info "  4. Resume: cd docker && docker compose up"
        else
            log_info "  4. Resume: $0"
        fi
        log_info ""
        log_info "The $RUNTIME_NAME will automatically resume session: $SESSION_ID"

        # Exit with special code to indicate intervention needed
        exit_or_keepalive 42 "Intervention required - check dashboard"
    fi

    # Show summary
    log_info "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    log_info "Migration Summary"
    log_info "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

    # Count artifacts
    local completed_plans=0
    if [ -f "$LOG_FILE" ]; then
        completed_plans=$(grep -c "Status.*✅ Success" "$LOG_FILE" 2>/dev/null || echo "0")
    fi

    local screenshot_count=0
    if [ -d "$WORKSPACE_ROOT/screenshots" ]; then
        screenshot_count=$(find "$WORKSPACE_ROOT/screenshots" -name "*.png" -type f 2>/dev/null | wc -l | tr -d ' ')
    fi

    log_info "Completed micro-plans: $completed_plans"
    log_info "Screenshots captured: $screenshot_count"
    log_info "Session ID: $SESSION_ID"
    log_info ""
    log_info "View migration log: $LOG_FILE"
    log_info "View dashboard: http://localhost:3030"

    if [ $CLAUDE_EXIT_CODE -eq 0 ]; then
        log_success "Migration completed successfully!"
        exit_or_keepalive 0 "Migration complete"
    else
        log_error "Migration exited with error code $CLAUDE_EXIT_CODE"
        log_info "Check logs above for details"
        exit_or_keepalive $CLAUDE_EXIT_CODE "Migration failed with exit code $CLAUDE_EXIT_CODE"
    fi
}

check_exit_reason
