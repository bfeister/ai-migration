# Phase 4: First Micro-Plan Demo - Quick Start Guide

## Overview

Phase 4 begins the micro-iteration migration loop for the homepage. All components are now in place:

- ✅ Micro-plans created (`sub-plans/01-homepage-content/`)
- ✅ Migration log initialized (`migration-log.md`)
- ✅ URL mappings configured (`url-mappings.json`)
- ✅ Main control plan ready (`migration-main-plan.md`)
- ✅ Docker environment prepared (Playwright + Claude Code)
- ✅ Test script created (`scripts/test-first-iteration.sh`)

## Quick Start

### Option 1: Manual Docker Testing (Recommended for First Run)

```bash
# 1. Start the test environment
./scripts/test-first-iteration.sh

# This will:
# - Build Docker image (if needed)
# - Start container with proper mounts
# - Display instructions for manual testing

# 2. In a separate terminal, attach to the container
docker exec -it claude-migration-test bash

# 3. Inside the container, run Claude Code with the main plan
claude code run --dangerously-skip-permissions < migration-main-plan.md

# 4. Claude will:
#    - Read migration-log.md (currently empty, starts from beginning)
#    - Read url-mappings.json (loads homepage URLs)
#    - Find first micro-plan: sub-plans/01-homepage-content/subplan-01-01.md
#    - Execute the micro-plan (analyze SFRA baseline)
#    - Log progress to migration-log.md
#    - Loop to next micro-plan

# 5. Monitor progress
#    - Watch migration-log.md: tail -f /workspace/migration-log.md
#    - Check screenshots: ls -lh /workspace/screenshots/
#    - View git commits: git log --oneline
#    - Check interventions: cat /workspace/intervention/needed-*.json
```

### Option 2: Direct Host Testing (Faster for Development)

```bash
# If you have the same Node.js + pnpm + Playwright setup on your host
cd /Users/bfeister/dev/test-storefront

# Run Claude Code directly (requires ANTHROPIC_API_KEY in .env)
export $(cat .env | xargs)
claude code run --dangerously-skip-permissions < migration-main-plan.md
```

## What to Expect

### Iteration 1: Subplan-01-01 (Analysis)
- **Task:** Analyze SFRA homepage baseline screenshot
- **Duration:** ~2-3 minutes
- **Output:**
  - Log entry in `migration-log.md`
  - No code changes (analysis only)
  - No screenshots (uses existing baseline)

### Iteration 2: Subplan-01-02 (Documentation)
- **Task:** Document existing Storefront Next homepage
- **Duration:** ~3-5 minutes
- **Output:**
  - Initial dual screenshots captured
  - Build verification
  - Log entry with gap analysis

### Iteration 3-5: Subplan-01-03 to 01-05 (Incremental Improvements)
- **Task:** Make targeted styling adjustments
- **Duration:** ~3-4 minutes each
- **Output:**
  - Code changes in `storefront-next/packages/template-retail-rsc-app/src/routes/_index.tsx`
  - Dual screenshots showing progress
  - Git commits with descriptive messages
  - Build validation

### Iteration 6: Subplan-01-06 (Verification)
- **Task:** Final verification and documentation
- **Duration:** ~5 minutes
- **Output:**
  - Production build verification
  - Final dual screenshots
  - Complete feature documentation

## Monitoring Progress

### Check Migration Log
```bash
cat migration-log.md
# or watch in real-time
tail -f migration-log.md
```

### View Screenshots
```bash
ls -lh screenshots/
# Expected naming: YYYYMMDD-HHMMSS-subplan-XX-YY-{source|target}.png
```

### Check Git History
```bash
cd storefront-next
git log --oneline
# Expected: One commit per micro-plan
```

### Monitor Interventions
```bash
# Check if Claude is waiting for user input
ls intervention/needed-*.json 2>/dev/null

# If intervention exists, view it
cat intervention/needed-worker-1.json

# Respond to intervention
cat > intervention/response-worker-1.json << EOF
{
  "response": "blue",
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF
```

## Understanding the MCP Intervention Flow

When Claude needs user input during migration:

1. **Claude calls RequestUserIntervention** (via MCP server)
   ```json
   {
     "worker_id": "worker-1",
     "question": "What color theme for hero background?",
     "options": ["blue", "green", "purple"]
   }
   ```

2. **MCP server writes intervention file**
   - File: `intervention/needed-worker-1.json`
   - Contains: question + options + timestamp

3. **Claude pauses execution**
   - Migration loop stops
   - Log entry shows "⏸️ Awaiting Intervention"
   - Claude is polling for response file

4. **User responds**
   - Create: `intervention/response-worker-1.json`
   - Content: `{"response": "blue", "timestamp": "..."}`

5. **Claude resumes execution**
   - MCP server reads response
   - Marks response as processed
   - Returns to Claude
   - Migration loop continues

## Troubleshooting

### Build Failures
```bash
# Inside container or on host
cd storefront-next/packages/template-retail-rsc-app
pnpm build

# Check for errors, fix them manually if needed
# Claude will also attempt to fix build errors automatically
```

### Dev Server Won't Start
```bash
# Check port availability
lsof -i :5173

# Kill existing process if needed
pkill -f "pnpm dev"

# Check .env file has required API credentials
cat .env | grep -E "COMMERCE_API|CLIENT_ID"
```

### Screenshot Failures
```bash
# Test screenshot script manually
cd scripts
pnpm tsx capture-screenshots.ts \
  "https://zzrf-001.dx.commercecloud.salesforce.com/s/RefArchGlobal/en_GB/home" \
  "../screenshots/test.png"

# Check Playwright in Docker
docker exec claude-migration-test chromium-browser --version
```

### Claude Code Not Finding MCP Server
```bash
# Verify MCP server is built
ls -la mcp-server/dist/intervention-server.js

# Check MCP config
cat ~/.config/claude/claude_desktop_config.json

# Rebuild MCP server if needed
cd mcp-server
pnpm build
```

## Success Criteria

Phase 4 is complete when:

- ✅ All 6 micro-plans executed successfully
- ✅ Dual screenshots captured for each iteration (except 01-01)
- ✅ Git commits created with proper messages
- ✅ Migration log shows clear progression
- ✅ Homepage content visually closer to SFRA baseline
- ✅ Build passes with no errors

## Next Steps

After Phase 4 completes:

1. **Review Results**
   - Compare final screenshots to SFRA baseline
   - Identify remaining gaps
   - Document lessons learned

2. **Phase 5: Scale to Multiple Features**
   - Create micro-plans for features 02-05
   - Test multi-feature execution
   - Verify URL mapping switches correctly

3. **Iterate and Improve**
   - Refine micro-plan granularity based on learnings
   - Adjust screenshot timing/configuration
   - Optimize Docker build process

## Files Created in Phase 4

```
sub-plans/
└── 01-homepage-content/
    ├── subplan-01-01.md  # Analyze SFRA baseline
    ├── subplan-01-02.md  # Document existing implementation
    ├── subplan-01-03.md  # Adjust hero styling
    ├── subplan-01-04.md  # Adjust featured products
    ├── subplan-01-05.md  # Adjust spacing
    └── subplan-01-06.md  # Final verification

migration-log.md          # Progress log (initialized)
scripts/test-first-iteration.sh  # Test script
PHASE4-README.md         # This file
```

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│ Docker Container: claude-migration-test                     │
│                                                              │
│  ┌────────────────────────────────────────────────────┐    │
│  │ Claude Code CLI                                     │    │
│  │  - Reads: migration-main-plan.md                    │    │
│  │  - Executes: sub-plans/01-homepage-content/*.md    │    │
│  │  - Writes: migration-log.md                         │    │
│  │  - Commits: git commits to storefront-next          │    │
│  │  - MCP Integration: RequestUserIntervention tool    │    │
│  └────────────────────────────────────────────────────┘    │
│                                                              │
│  ┌────────────────────────────────────────────────────┐    │
│  │ MCP Intervention Server (Node.js)                   │    │
│  │  - Listens: stdio (MCP protocol)                    │    │
│  │  - Writes: intervention/needed-*.json               │    │
│  │  - Polls: intervention/response-*.json              │    │
│  │  - Provides: RequestUserIntervention tool           │    │
│  └────────────────────────────────────────────────────┘    │
│                                                              │
│  ┌────────────────────────────────────────────────────┐    │
│  │ Playwright + Chromium                               │    │
│  │  - Script: scripts/capture-screenshots.ts           │    │
│  │  - Captures: Dual screenshots (SFRA + Storefront)   │    │
│  │  - Output: screenshots/*.png                         │    │
│  └────────────────────────────────────────────────────┘    │
│                                                              │
└─────────────────────────────────────────────────────────────┘
           ↕ Volume Mounts                ↕ Network (host mode)
┌─────────────────────────────────────────────────────────────┐
│ Host: /Users/bfeister/dev/test-storefront                   │
│  - sub-plans/                                                │
│  - migration-log.md                                          │
│  - migration-main-plan.md                                    │
│  - url-mappings.json                                         │
│  - storefront-next/                                          │
│  - screenshots/                                              │
│  - intervention/                                             │
└─────────────────────────────────────────────────────────────┘
```

## Contact & Support

For issues or questions:
- Check troubleshooting section above
- Review logs in `migration-log.md`
- Check Docker logs: `docker logs claude-migration-test`
- Inspect intervention files in `intervention/` directory

Happy migrating! 🚀
