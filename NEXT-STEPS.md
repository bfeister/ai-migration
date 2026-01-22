# Next Steps & Open Questions

**Status:** Phase 4 - Partially Complete (2/6 micro-plans done)
**Last Updated:** 2026-01-21T22:55:00Z

---

## 🎯 Immediate Next Steps

### 1. Complete Phase 4 Demo (Estimated: 1-2 hours)

**Goal:** Execute all 6 homepage micro-plans with screenshot validation

**Approach:** Skip build validation, use existing build artifacts

**Steps:**
1. ✅ Respond to current intervention (`intervention/response-next-steps.json`)
2. ⏸️ Let Claude continue with subplan-01-03 (hero styling adjustments)
3. ⏸️ Execute subplan-01-04 (featured products adjustments)
4. ⏸️ Execute subplan-01-05 (spacing adjustments)
5. ⏸️ Execute subplan-01-06 (final verification)
6. ⏸️ Review all screenshots for visual progression
7. ⏸️ Document findings in Phase 4 completion report

**Decision Needed:**
- **Build validation strategy:** Skip entirely, or build on host and mount?
  - **Recommendation:** Skip for Phase 4, revisit for Phase 5

**Command to Resume:**
```bash
./scripts/demo-migration-loop.sh
```

---

## 🤔 Open Questions

### Critical (Blocks Phase 5+)

**1. How do we handle the Docker file descriptor limit issue?**

**Options:**
- **A. Skip build validation entirely**
  - Pros: Simple, works immediately, screenshots provide visual validation
  - Cons: No TypeScript compilation checks, can't catch build errors early
  - Best for: Quick demos, visual-focused migrations

- **B. Build on host, mount `dist/` into container**
  - Pros: Build works on host macOS, container only runs dev server
  - Cons: Two-step process, need to sync build with code changes
  - Best for: Reliable builds with container for screenshots

- **C. Use Linux Docker (not Docker Desktop Mac)**
  - Pros: Eliminates file descriptor limits, production-like environment
  - Cons: Requires Linux VM or cloud instance, more setup
  - Best for: CI/CD, production deployments

- **D. Pre-build once at container start, reuse throughout**
  - Pros: One-time build cost, incremental rebuilds faster
  - Cons: Still hits file limits on first build, doesn't help
  - Best for: Doesn't solve the root issue

**Recommendation:** Option B for Phase 5 (build on host, mount dist/)

**Action Required:** Test Option B with a script that:
1. Runs `pnpm build` on host macOS
2. Mounts `storefront-next/packages/template-retail-rsc-app/dist/` into container
3. Starts dev server in container (uses pre-built artifacts)
4. Captures screenshots

---

**2. Should we validate code changes via build, or trust screenshots + visual inspection?**

**Context:**
- SFRA → Storefront Next migration is primarily a visual matching exercise
- TypeScript compilation catches syntax/type errors, but screenshots catch visual regressions
- Build validation adds ~30-60s per iteration

**Tradeoffs:**

| Approach | Pros | Cons |
|----------|------|------|
| **Build every iteration** | Catches errors early, validates TypeScript | Slower, hits Docker limits, blocks loop |
| **Screenshot only** | Fast, visual proof of progress, no Docker limits | Misses type errors, harder to debug broken code |
| **Hybrid (build after N iterations)** | Balance speed + safety | More complex logic, partial validation |

**Recommendation:** Screenshot-only for Phase 4-5, add optional build validation in Phase 6

**Action Required:** Document this decision in migration-main-plan.md

---

### Important (Nice to Have)

**3. How do we automate visual diff comparison?**

**Goal:** Programmatically compare SFRA source vs Storefront Next target screenshots

**Options:**
- Use Playwright's screenshot diff (`toHaveScreenshot()`)
- Use ImageMagick `compare` command
- Use a visual regression testing tool (Percy, Chromatic, BackstopJS)
- Build custom diff tool with Python + OpenCV

**Action Required:** Prototype image diff script in Phase 5

---

**4. How do we handle intervention responses in CI/CD?**

**Context:** GitHub Actions can't pause for interactive input

**Options:**
- Pre-define intervention responses in config file (e.g., `intervention-defaults.json`)
- Create GitHub Issues automatically, pause workflow until issue closed
- Use GitHub PR comments for intervention responses
- Skip interventions in CI, only run them locally

**Recommendation:** Pre-defined responses + GitHub Issues for custom choices

**Action Required:** Design intervention config format

---

**5. How do we coordinate multiple parallel workers?**

**Context:** Phase 6+ may run multiple features in parallel

**Challenges:**
- Shared migration-log.md (concurrent writes)
- Shared intervention directory (multiple questions at once)
- Docker resource limits (CPU, memory, file descriptors)

**Options:**
- One log per worker, merge at the end
- Worker-specific intervention files (already partially implemented)
- Use file locking (flock) for critical sections
- Orchestration layer (shell script or Node.js)

**Action Required:** Test 2-3 workers in parallel, document issues

---

## 📋 Roadmap

### Phase 4: Complete Homepage Demo (Current)

**Timeline:** 1-2 hours

**Tasks:**
- [x] Execute subplan-01-01 (Analyze SFRA)
- [x] Execute subplan-01-02 (Document existing)
- [ ] Execute subplan-01-03 (Hero styling)
- [ ] Execute subplan-01-04 (Featured products)
- [ ] Execute subplan-01-05 (Spacing)
- [ ] Execute subplan-01-06 (Final verification)
- [ ] Write Phase 4 completion report

**Blockers:** Docker file descriptor limits (workaround: skip builds)

**Deliverables:**
- 6 micro-plan completions
- 10+ dual screenshots (source + target)
- Git commits showing incremental progress
- Migration log with detailed history

---

### Phase 5: Scale to Multiple Features

**Timeline:** 3-4 hours

**Goals:**
- Create micro-plans for features 02-05
- Test multi-feature execution with URL mapping switches
- Validate screenshot capture across different pages
- Test error recovery (retries, fallbacks)

**Tasks:**
- [ ] Create micro-plans for feature 02 (featured products - 4-5 subplans)
- [ ] Create micro-plans for feature 03 (product tile - 4-5 subplans)
- [ ] Create micro-plans for feature 04 (navbar - 4-5 subplans)
- [ ] Create micro-plans for feature 05 (footer - 3-4 subplans)
- [ ] Test URL mapping switches (homepage → search → homepage)
- [ ] Test dev server restart between features
- [ ] Document timing and resource usage

**Blockers:** Need to resolve build strategy first (Option B recommended)

**Deliverables:**
- 20-25 micro-plans total
- Complete migration of 5 homepage features
- End-to-end test report

---

### Phase 6: Optimization & Automation

**Timeline:** 2-3 hours

**Goals:**
- Implement visual diff automation
- Add optional build validation (host-based)
- Create CI/CD workflow (GitHub Actions)
- Document system for external users

**Tasks:**
- [ ] Prototype image diff script (ImageMagick or Playwright)
- [ ] Create host-based build script (runs before container)
- [ ] Test build + mount workflow
- [ ] Create `.github/workflows/migration.yml`
- [ ] Test CI execution with artifacts upload
- [ ] Write comprehensive README for the system

**Deliverables:**
- Visual diff automation
- CI/CD workflow
- Complete documentation
- Demo video or screenshots

---

## 🔬 Experiments to Run

### Experiment 1: Host Build + Container Screenshot

**Hypothesis:** Building on host Mac avoids Docker file limits

**Steps:**
1. Run `cd storefront-next/packages/template-retail-rsc-app && pnpm build` on host
2. Mount `dist/` directory into container
3. Start dev server in container (should use pre-built files)
4. Capture screenshot
5. Measure time and success rate

**Success Criteria:** Build succeeds, dev server starts, screenshot captured

---

### Experiment 2: Screenshot-Only Validation

**Hypothesis:** Visual comparison is sufficient for migration validation

**Steps:**
1. Skip build validation entirely in migration-main-plan.md
2. Execute 3-5 micro-plans with only screenshot capture
3. Compare screenshots visually
4. Introduce intentional bug (typo in code)
5. Determine if bug is visible in screenshot

**Success Criteria:** Visual bugs are detectable, loop runs faster without builds

---

### Experiment 3: Parallel Worker Coordination

**Hypothesis:** Multiple workers can run simultaneously without conflicts

**Steps:**
1. Start 2 containers with different feature IDs
2. Each runs micro-plans from different `sub-plans/` directories
3. Monitor for file conflicts (logs, interventions)
4. Measure total time vs sequential execution

**Success Criteria:** Both workers complete without errors, faster than sequential

---

## 💡 Design Decisions to Make

### Decision 1: Build Validation Strategy

**Question:** Do we build inside container, on host, or skip entirely?

**Context:** Docker Desktop Mac file descriptor limits block `pnpm build`

**Options:**
- **Skip:** Fastest, but no type checking
- **Host:** Reliable, but two-step process
- **Container:** Ideal, but currently broken

**Recommendation:** Start with host-based (Option B), revisit container in Phase 6

**Decision Maker:** User (you)
**Deadline:** Before starting Phase 5

---

### Decision 2: Screenshot Diff Automation

**Question:** Do we automate visual comparison, or rely on manual inspection?

**Context:** Manual inspection works for 6 micro-plans, but not for 25+

**Options:**
- **Manual:** Simple, but doesn't scale
- **Automated:** Scalable, but requires tooling
- **Hybrid:** Automated with manual review

**Recommendation:** Automated with manual review for ambiguous cases

**Decision Maker:** User (you)
**Deadline:** Before starting Phase 6

---

### Decision 3: Error Recovery Strategy

**Question:** What happens when a micro-plan fails (build error, screenshot timeout)?

**Options:**
- **Retry once:** Simple, handles transient failures
- **Skip and continue:** Keeps loop moving, logs failure
- **Pause for intervention:** User fixes, loop resumes
- **Revert and retry:** Git revert, try again

**Recommendation:** Pause for intervention (already implemented)

**Decision Maker:** Already decided, documented here for reference

---

## 📊 Metrics to Track

### Performance Metrics
- **Time per micro-plan:** Target 2-5 minutes, measure actual
- **Screenshot capture time:** SFRA vs Storefront Next (latency differences)
- **Build time:** If we enable builds, measure impact
- **Total loop time:** Homepage (6 micro-plans) should be < 30 minutes

### Quality Metrics
- **Screenshot diff score:** Pixel differences, color accuracy
- **Intervention frequency:** How often does Claude need user input?
- **Build success rate:** If building, how often does it pass?
- **Git commit quality:** Are messages descriptive?

### Resource Metrics
- **Docker memory usage:** Monitor for leaks
- **Docker CPU usage:** Check if container is CPU-bound
- **Disk space:** Screenshots accumulate quickly (track growth)
- **API token usage:** Claude Code API calls per micro-plan

**Action Required:** Add metrics collection to demo script

---

## 🚦 Go/No-Go Decision Points

### Can we proceed to Phase 5?

**Checklist:**
- [ ] Phase 4 complete (6/6 micro-plans done)
- [ ] Build strategy decided and tested
- [ ] Screenshot capture reliable (>90% success rate)
- [ ] Intervention flow works smoothly
- [ ] Migration log is accurate and complete

**Decision:** Review after Phase 4 completion

---

### Can we deploy to production?

**Checklist:**
- [ ] All phases (4-6) complete
- [ ] Tested on Linux Docker (not just Mac)
- [ ] CI/CD workflow functional
- [ ] Error recovery tested
- [ ] Documentation complete
- [ ] External user tested system successfully

**Decision:** Phase 6+ completion required

---

## 📞 Who to Ask

### Technical Questions
- **Docker issues:** Docker Desktop support, StackOverflow
- **Playwright issues:** Playwright Discord, GitHub Issues
- **Claude Code issues:** Anthropic support, GitHub Issues

### Design Questions
- **Migration strategy:** Storefront Next team (if available)
- **Visual standards:** Design team or SFRA reference docs
- **Architecture decisions:** Tech lead or senior engineer

---

## 📝 Documentation Needed

### Before Phase 5:
- [ ] Phase 4 completion report
- [ ] Build strategy decision document
- [ ] Updated migration-main-plan.md with build skip logic

### Before Phase 6:
- [ ] Visual diff automation design doc
- [ ] CI/CD integration guide
- [ ] Multi-worker coordination protocol

### Before Production:
- [ ] Complete system README
- [ ] Troubleshooting guide
- [ ] Video demo or walkthrough
- [ ] API cost estimation guide

---

## 🎬 Demo Script for Stakeholders

**Purpose:** Show Phase 4 results to stakeholders

**Duration:** 10-15 minutes

**Outline:**
1. **Show baseline screenshot** (SFRA homepage)
2. **Show initial Storefront Next** (before migration)
3. **Walk through migration log** (6 micro-plans)
4. **Show screenshot progression** (dual screenshots side-by-side)
5. **Show git commit history** (incremental changes)
6. **Show final result** (after 6 iterations)
7. **Discuss findings** (what worked, what didn't)

**Script:** TBD after Phase 4 completion

---

**Next Review:** After Phase 4 completion
**Contact:** [Your name/email]
