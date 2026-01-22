# Migration Loop Learnings & Status

**Date:** 2026-01-21
**Phase:** 4 - First Micro-Plan Demo
**Status:** Partially Working - Build Issues

---

## ✅ What's Working

### 1. Docker Environment Setup
- **Pre-entrypoint permission fix:** Successfully runs as root to fix volume mount ownership, then switches to node user via `su-exec`
- **Claude Code execution:** Works with `--dangerously-skip-permissions` as node user (uid=1000)
- **MCP Integration:** Intervention server configured at `~/.config/claude-code/mcp.json`
- **Playwright + Chromium:** Installed and functional for screenshot capture
- **Network access:** Container can reach external SFRA URLs and localhost dev servers

### 2. Migration Loop Execution
Claude Code successfully executed the control loop from `migration-main-plan.md`:

**Subplan-01-01 (Analysis):** ✅ Complete
- Read SFRA baseline screenshot
- Documented hero section, featured products, color scheme
- No code changes (analysis-only)
- Logged to migration-log.md

**Subplan-01-02 (Documentation):** ✅ Complete
- Read existing Storefront Next homepage (`_index.tsx`)
- Performed gap analysis (SFRA vs Storefront Next)
- Created git commit (hash: `168e61c`)
- **Captured dual screenshots:**
  - Source: `screenshots/20260121-224748-subplan-01-02-source.png` (2.82 MB)
  - Target: `screenshots/20260121-224801-subplan-01-02-target.png` (275 KB)
- Used existing build artifacts (workaround for build issue)
- Logged progress to migration-log.md

**Subplan-01-03 (Hero Styling):** ⏸️ Paused
- Requires code changes and build validation
- Blocked by Docker file descriptor limits (ENFILE error)
- Created intervention request: `intervention/needed-next-steps.json`

### 3. Core Features Validated
- ✅ Sliding window context (last 5 log entries)
- ✅ URL mapping loading from `url-mappings.json`
- ✅ Sequential micro-plan execution
- ✅ Dual screenshot capture (SFRA + Storefront Next)
- ✅ Git commit creation with descriptive messages
- ✅ Progress logging to migration-log.md
- ✅ Intervention request flow (creates `needed-*.json`, waits for `response-*.json`)

---

## ❌ Issues & Blockers

### 1. Docker File Descriptor Limit (CRITICAL)

**Problem:**
`pnpm build` and `pnpm install` fail with `ENFILE: file table overflow` error.

**Root Cause:**
Docker Desktop on Mac has limited file descriptors. pnpm + esbuild operations scan thousands of files simultaneously, exceeding the limit.

**Error Details:**
```
ENFILE: file table overflow, scandir '/workspace/storefront-next/.pnpm-store/v3/files/XX'
```

**Attempted Fixes:**
1. ❌ Increased `ulimit -n` to 65536 inside container (still failed)
2. ❌ Attempted to clean `.pnpm-store` (hit same file limit)
3. ✅ Workaround: Used existing `dist/` directory for screenshot capture

**Impact:**
- Blocks build validation for code-change micro-plans
- Cannot verify TypeScript compilation succeeds
- Cannot start fresh dev server (requires build)

**Possible Solutions:**
1. **Skip build validation entirely** - Rely on existing artifacts, only validate via screenshots
2. **Build on host, mount dist/** - Run `pnpm build` on host macOS, mount result into container
3. **Use Docker Desktop settings** - Increase file descriptor limits in Docker Desktop preferences
4. **Switch to Linux VM** - Run Docker on Linux instead of Docker Desktop Mac
5. **Use production build** - Build once, use for all screenshot iterations

### 2. API Key Configuration

**Issue:** `.env` file has `ANTHROPIC_API_KEY` commented out, uses `ANTHROPIC_AUTH_TOKEN` + Bedrock URL instead.

**Current Config:**
```bash
# ANTHROPIC_API_KEY=sk-...
ANTHROPIC_AUTH_TOKEN=xxx
ANTHROPIC_BEDROCK_BASE_URL=https://...
```

**Status:** Claude Code is running successfully with this configuration, so it's not blocking progress.

### 3. Intervention Response Monitoring

**Issue:** The entrypoint.sh intervention monitor expects `needed.json` / `response.json`, but Claude Code creates worker-specific files like `needed-build-issue.json` / `response-build-issue.json`.

**Impact:** Manual intervention responses work, but the background monitor doesn't auto-archive them.

**Solution:** Update MCP server or intervention monitor to handle worker-specific filenames.

---

## 🤔 What Needs to Be Figured Out

### Short-term (to continue Phase 4):

1. **Build Strategy Decision:**
   - Option A: Skip builds, rely on existing artifacts for screenshot validation
   - Option B: Build on host, mount into container
   - Option C: Accept ENFILE errors, use last-known-good build
   - **Recommendation:** Option A for Phase 4 demo (homepage is already built)

2. **Screenshot-Only Validation:**
   - If skipping builds, how do we ensure code changes are valid?
   - **Approach:** Capture screenshots, rely on visual diff + Claude's analysis
   - Build can be validated later outside the tight loop

3. **Automated Intervention Responses:**
   - Common interventions (e.g., "skip build") could be auto-responded
   - Less common (e.g., "choose color theme") require user input
   - **Tool needed:** Script to detect interventions and prompt user

### Medium-term (before Phase 5):

1. **Docker Environment Optimization:**
   - Test on Linux Docker (not Docker Desktop Mac)
   - Benchmark file descriptor usage
   - Consider Docker Compose with resource limits

2. **Build Caching Strategy:**
   - Pre-build storefront-next once at container start
   - Only rebuild when dependencies change
   - Use incremental builds (Vite's dev mode is already incremental)

3. **Multi-Feature Execution:**
   - Test URL mapping switches between features
   - Verify dev server restart between features
   - Validate screenshot capture across different pages

### Long-term (Phase 5+):

1. **CI/CD Integration:**
   - Run migration loop in GitHub Actions
   - Handle interventions via GitHub Issues or PRs
   - Upload screenshots as artifacts

2. **Visual Diff Automation:**
   - Compare source vs target screenshots programmatically
   - Highlight pixel differences
   - Score visual similarity

3. **Parallel Execution:**
   - Multiple Docker containers, one per feature
   - Coordinate via shared intervention directory
   - Merge logs and screenshots at the end

---

## 📊 Current Status

### Files Created:
- `migration-log.md` - 3 entries (subplan-01-01, 01-02, 01-03 paused)
- `screenshots/20260121-224748-subplan-01-02-source.png` - SFRA homepage (2.82 MB)
- `screenshots/20260121-224801-subplan-01-02-target.png` - Storefront Next (275 KB)
- `intervention/needed-next-steps.json` - Awaiting decision on build strategy
- Git commit in `storefront-next/` repo (hash: `168e61c`)

### Micro-Plans Status:
- ✅ subplan-01-01 (Analyze SFRA baseline)
- ✅ subplan-01-02 (Document existing homepage)
- ⏸️ subplan-01-03 (Adjust hero styling) - **BLOCKED**
- ⏸️ subplan-01-04 (Adjust featured products)
- ⏸️ subplan-01-05 (Adjust spacing)
- ⏸️ subplan-01-06 (Final verification)

### Container Status:
```bash
CONTAINER ID   STATUS
12f034576a6c   Up 20 minutes (claude-migration-test)
```

---

## 🎯 Next Steps

### Immediate Actions:

1. **Respond to intervention:** Decide on build strategy for subplan-01-03+
   - Create `intervention/response-next-steps.json` with chosen approach

2. **Create monitoring script:** Automate the `docker exec` commands for demo
   - Start container
   - Launch Claude Code
   - Tail migration log
   - Detect interventions
   - Show screenshot updates

3. **Test complete loop:** Run through all 6 homepage micro-plans
   - Document timing (how long per iteration)
   - Count API calls / tokens used
   - Verify final screenshots match SFRA

### Documentation Needed:

1. **Demo script** (`scripts/demo-migration-loop.sh`)
2. **Troubleshooting guide** for common errors
3. **Architecture diagram** showing file flow
4. **Phase 4 completion report**

---

## 💡 Key Insights

1. **Micro-iteration works:** The 2-5 minute loop is achievable and effective
2. **Dual screenshots are valuable:** Visual proof of progress at each step
3. **Sliding window context is sufficient:** Last 5 entries provide enough context
4. **Intervention flow is clean:** Claude pauses, asks question, waits, resumes
5. **Docker Desktop Mac has limits:** File descriptor overflow is a real constraint
6. **Build validation may be optional:** Screenshots + git history might be enough for visual migration

---

## 🔍 Testing Coverage

### What We've Tested:
- ✅ Container startup with permission fixes
- ✅ Claude Code execution with --dangerously-skip-permissions
- ✅ MCP intervention server communication
- ✅ Micro-plan sequential execution
- ✅ Screenshot capture (Playwright + Chromium)
- ✅ Git commit creation
- ✅ Migration log updates
- ✅ Intervention request/response flow

### What We Haven't Tested:
- ❌ Full build validation (blocked by ENFILE)
- ❌ Dev server startup from fresh build
- ❌ URL mapping switches between features
- ❌ Error recovery (build failures, screenshot timeouts)
- ❌ Multi-feature execution (features 02-05)
- ❌ Complete end-to-end run (all 6 micro-plans)

---

## 📈 Success Metrics

### Phase 4 Goals:
- ✅ Execute first iteration successfully
- ✅ Capture dual screenshots
- 🟡 Complete all 6 homepage micro-plans (2/6 done)
- ❌ No manual intervention needed (1 intervention required)
- ❌ Build passes after each change (builds skipped due to ENFILE)

### Overall:
- **Progress:** 33% of Phase 4 complete (2/6 micro-plans)
- **Blockers:** 1 critical (Docker file limits)
- **Workarounds:** 1 active (use existing build artifacts)
- **Time spent:** ~4 hours (setup + testing)
- **Estimated to complete Phase 4:** 2-3 hours (with build workaround)

---

## 🚀 Confidence Level

**Can we complete Phase 4?** Yes, with build workaround
**Can we scale to Phase 5?** Maybe - need to solve build issue first
**Is the architecture sound?** Yes - core loop works as designed
**Is this production-ready?** No - needs build stability and more testing

---

## 📝 Recommendations

1. **Short-term:** Skip build validation, proceed with screenshot-only validation for Phase 4 demo
2. **Medium-term:** Test on Linux Docker to eliminate Docker Desktop Mac limitations
3. **Long-term:** Implement visual diff automation to replace build validation
4. **Alternative:** Build storefront-next once on host, use for all iterations (read-only)

---

**Last Updated:** 2026-01-21T22:50:00Z
**Next Review:** After Phase 4 completion
