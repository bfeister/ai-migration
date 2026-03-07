#!/bin/bash
set -euo pipefail

# reset-migration-state.sh
# Resets migration state without redoing Phase 1 bootstrap (monorepo/storefront-next)
# Use this to restart migration from baseline without expensive rebuild

WORKSPACE="${WORKSPACE:-/Users/bfeister/dev/test-storefront}"
STATE_DIR="$WORKSPACE/.migration-state"
INTERVENTION_DIR="$WORKSPACE/intervention"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}Migration State Reset${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo "This will remove:"
echo "  - Claude session and execution logs"
echo "  - Migration state markers (phases 2-5)"
echo "  - Intervention files"
echo "  - Screenshots"
echo "  - Migration log backups"
echo ""
echo -e "${YELLOW}This will NOT remove:${NC}"
echo "  - Phase 1 bootstrap (monorepo build, storefront-next project)"
echo "  - Git commits (use --reset-git to remove)"
echo ""

# Parse options
RESET_GIT=false
while [[ $# -gt 0 ]]; do
    case $1 in
        --reset-git)
            RESET_GIT=true
            shift
            ;;
        *)
            echo -e "${RED}Unknown option: $1${NC}"
            exit 1
            ;;
    esac
done

# Confirm
read -p "Continue? (y/N) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Aborted."
    exit 0
fi

cd "$WORKSPACE"

# 1. Remove Claude session
if [ -f .claude-session-id ]; then
    rm -f .claude-session-id
    echo -e "${GREEN}✓${NC} Removed Claude session file"
fi

# 2. Remove migration state markers (keep phase1-complete)
if [ -d "$STATE_DIR" ]; then
    rm -f "$STATE_DIR/baseline-committed"
    rm -f "$STATE_DIR/phase3-complete"
    echo -e "${GREEN}✓${NC} Removed migration state markers (phases 2-3)"
fi

# 3. Remove intervention files
if [ -d "$INTERVENTION_DIR" ]; then
    rm -f "$INTERVENTION_DIR"/needed-*.json "$INTERVENTION_DIR"/response-*.json 2>/dev/null || true
    if [ -d "$INTERVENTION_DIR/history" ]; then
        rm -rf "$INTERVENTION_DIR/history"
        mkdir -p "$INTERVENTION_DIR/history"
    fi
    echo -e "${GREEN}✓${NC} Removed intervention files"
fi

# 4. Remove Claude execution logs
if [ -f claude-output.log ]; then
    rm -f claude-output.log
    echo -e "${GREEN}✓${NC} Removed claude-output.log"
fi

# 5. Backup and remove migration log
if [ -f migration-log.md ]; then
    backup_log="migration-log-backup-$(date -u +"%Y%m%d-%H%M%S").md"
    mv migration-log.md "$backup_log"
    echo -e "${GREEN}✓${NC} Backed up migration-log.md to $backup_log"
fi

# 6. Remove old log backups
if ls migration-log-backup-*.md 1> /dev/null 2>&1; then
    count=$(ls migration-log-backup-*.md | wc -l | tr -d ' ')
    if [ "$count" -gt 3 ]; then
        # Keep only 3 most recent backups
        ls -t migration-log-backup-*.md | tail -n +4 | xargs rm -f
        echo -e "${GREEN}✓${NC} Removed old migration log backups (kept 3 most recent)"
    fi
fi

# 7. Remove screenshots
if [ -d screenshots ]; then
    screenshot_count=$(find screenshots -name "*.png" -type f 2>/dev/null | wc -l | tr -d ' ')
    if [ "$screenshot_count" -gt 0 ]; then
        rm -rf screenshots
        mkdir -p screenshots
        echo -e "${GREEN}✓${NC} Removed $screenshot_count screenshots"
    fi
fi

# 8. Git reset (optional)
if [ "$RESET_GIT" = true ]; then
    if git rev-parse --git-dir > /dev/null 2>&1; then
        echo ""
        echo -e "${YELLOW}Git Reset Options:${NC}"
        echo "  1. Remove baseline commit only (soft reset)"
        echo "  2. Remove all migration commits and unstage changes"
        echo "  3. Hard reset to before storefront-next was added"
        echo "  4. Skip git reset"
        echo ""
        read -p "Choose option (1-4): " -n 1 -r
        echo

        case $REPLY in
            1)
                # Check if storefront-next baseline commit exists
                if git log --oneline | grep -q "add storefront-next baseline"; then
                    git reset --soft HEAD~1
                    echo -e "${GREEN}✓${NC} Removed baseline commit (changes still staged)"
                else
                    echo -e "${YELLOW}⚠${NC} No baseline commit found"
                fi
                ;;
            2)
                # Reset and unstage all storefront-next changes
                git reset HEAD storefront-next/ 2>/dev/null || true
                echo -e "${GREEN}✓${NC} Unstaged storefront-next changes"
                ;;
            3)
                # Hard reset to before storefront-next
                if git log --oneline | grep -q "add storefront-next baseline"; then
                    git reset --hard HEAD~1
                    echo -e "${GREEN}✓${NC} Hard reset to before storefront-next baseline"
                    echo -e "${YELLOW}⚠${NC} Local changes to storefront-next were discarded"
                else
                    echo -e "${YELLOW}⚠${NC} No baseline commit found"
                fi
                ;;
            4)
                echo "Skipping git reset"
                ;;
            *)
                echo -e "${RED}Invalid option${NC}"
                ;;
        esac
    else
        echo -e "${YELLOW}⚠${NC} Not a git repository, skipping git reset"
    fi
fi

echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}Migration state reset complete${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo "Next steps:"
echo "  1. Restart container: docker compose up"
echo "  2. Container will resume from Phase 2 (git baseline)"
echo ""
