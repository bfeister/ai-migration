---
name: Migration Framework Master Plan
overview: A multi-phase plan to build an LLM-driven migration framework that transforms SFRA projects to Storefront Next architecture, using a platform-agnostic core with adapters, parallel migration thread agents, git worktrees, coordination layer for shared files, conflict resolution, retry logic, incremental visual validation, and execution modes (serial/parallel).
todos:
  - id: pillar-0-subplan
    content: "Create detailed sub-plan for Pillar 0: Platform-Agnostic Core + Adapters"
    status: pending
  - id: pillar-1-subplan
    content: "Create detailed sub-plan for Pillar 1: Orchestration Layer (including coordination layer and retry logic)"
    status: pending
    dependencies:
      - pillar-0-subplan
  - id: pillar-2-subplan
    content: "Create detailed sub-plan for Pillar 2: Planner Agent (including known mappings documentation)"
    status: pending
  - id: pillar-3a-discovery
    content: Analyze SFRA + Storefront Next codebases to identify required tools and document known equivalents/gaps
    status: pending
  - id: pillar-3b-subplan
    content: "Create detailed sub-plan for Pillar 3b: MCP Tools (after discovery)"
    status: pending
    dependencies:
      - pillar-3a-discovery
  - id: pillar-4-subplan
    content: "Create detailed sub-plan for Pillar 4: Migration Thread Agents (with coordination integration)"
    status: pending
    dependencies:
      - pillar-3b-subplan
  - id: pillar-5-subplan
    content: "Create detailed sub-plan for Pillar 5: Validation Layer (including incremental screenshot capture)"
    status: pending
  - id: pillar-6-subplan
    content: "Create detailed sub-plan for Pillar 6: Coordination & Conflict Resolution"
    status: pending
    dependencies:
      - pillar-4-subplan
  - id: workspace-setup
    content: Design and implement workspace setup validation (parent git, SFRA git, Storefront Next git)
    status: pending
    dependencies:
      - pillar-1-subplan
  - id: coordination-layer
    content: "Implement coordination layer: file registry, conflict detection, resolver agent"
    status: pending
    dependencies:
      - pillar-1-subplan
  - id: retry-logic
    content: Implement three-tier retry logic (network, compilation, thread)
    status: pending
    dependencies:
      - pillar-1-subplan
  - id: incremental-screenshots
    content: Implement incremental screenshot capture with historical preservation
    status: pending
    dependencies:
      - pillar-5-subplan
  - id: prototype-worktree
    content: Prototype git worktree + sub-agent coordination with conflict detection
    status: pending
    dependencies:
      - pillar-1-subplan
      - coordination-layer
  - id: cursor-adapter
    content: Implement Cursor subagent adapter for development/debugging
    status: pending
    dependencies:
      - pillar-0-subplan
  - id: claude-adapter
    content: Implement Claude Code adapter for headless demos and CI/CD
    status: pending
    dependencies:
      - pillar-0-subplan
---

# SFRA to Storefront Next Migration Framework - Master Plan

This is a "plan for plans" - a high-level architectural blueprint that will spawn detailed sub-plans for each pillar. The goal is to build autonomous migration tooling that can transform SFRA codebases to Storefront Next with visual validation and human-verifiable output.

---

## Business Motivation

Salesforce Commerce Cloud customers currently on **Storefront Reference Architecture (SFRA)** need a migration path to the new **Storefront Next** architecture. This represents:

-   **Billions of dollars** in potential customer value
-   A fundamental architecture shift that cannot be done manually at scale
-   An opportunity to demonstrate LLM-driven migration capabilities

The two architectures have **nearly zero overlap**:

-   SFRA: Monolithic, server-rendered via ISML templates, Bootstrap/jQuery, runs in Rhino (Java-based JS engine)
-   Storefront Next: Headless React 19 RSC, Tailwind/ShadCN, runs on AWS Lambda/Node.js

**Direct code translation is not feasible** - this requires intelligent trait mapping and reconstruction.

---

## Goals

| Goal | Description |

|------|-------------|

| **Autonomous migration** | LLM-driven migration that runs to completion without constant human intervention |

| **Fully detached demos** | Ability to start migration, walk away, and return to completed results |

| **Full codebase migration** | Attempt to migrate entire SFRA codebase including customizations, with retry logic allowing multiple attempts. Failed migrations logged for review. Success not guaranteed - framework attempts all features unless explicitly marked as "no migration path" |

| **Visual validation** | Incremental screenshot comparison at regular intervals within each migration thread, preserving historical progress |

| **Parallel execution** | Multiple migration thread agents working simultaneously via git worktrees with conflict coordination (optional serial mode for headless) |

| **Human-verifiable output** | All work produces PRs that humans review before merging, with conflict/failure logs |

| **Platform flexibility** | Cursor for development, Claude Code for demos/CI |

| **Minimize throwaway work** | Platform-agnostic core (~85% reuse between adapters) |

| **Conflict resolution** | Automated conflict detection and resolution with fallback to human review |

| **Known mappings documentation** | Quantify and document known functionality equivalents and expected gaps |

### Phase 1 Migration Scope Clarification

**Phase 1 Goal**: Attempt full codebase migration with a "mostly known" scope, but expect grey areas.

**Known Scope (Allow-List & Deny-List)**:

-   **Allow-List**: Features with documented migration paths (e.g., baseline SFRA components mapped to Storefront Next equivalents)
-   **Deny-List**: Features explicitly marked as "has no migration path" in the migration plan (e.g., deprecated SFRA features with no Storefront Next equivalent, proprietary integrations)

**Grey Areas (Non-Deterministic)**:

During feature detection and mapping, some features will fall into neither the allow-list nor deny-list:

-   **Unknown features**: Custom SFRA code not recognized by the planner agent
-   **Ambiguous mappings**: Features where migration path is unclear
-   **Edge cases**: Variations of known features that don't match documented patterns

**Handling Grey Areas**:

-   **Generalized agentic layer**: Unknown features (not on allow-list or deny-list) are handled by the migration thread agents using general migration tools
-   **Retry logic**: Multiple attempts (up to 3 thread-level retries) allow the framework to recover from initial failures
-   **Failure logging**: Features that fail after all retry attempts are logged in `failed-migrations.md` for human review
-   **No guarantee**: The framework attempts migration but doesn't guarantee success for grey-area features

**Expected Outcomes**:

-   **Known features (allow-list)**: High success rate with documented migration paths
-   **Known gaps (deny-list)**: Explicitly skipped, logged with rationale
-   **Grey areas**: Variable success rate, logged failures for human review and potential Phase 2 handling

---

## Non-Goals

| Non-Goal | Rationale |

|----------|-----------|

| **Direct ISML-to-JSX translation** | Paradigm shift is too fundamental; focus on data flow and trait mapping instead |

| **Automatic deployment** | Human must review and approve all changes before any deployment |

| **100% automation of custom features** | Unknown/custom SFRA features logged in failure log for manual review |

| **Real-time human collaboration during migration** | Hand-holding happens at END (validation), not during execution |

| **Single-threaded migration** | Must parallelize via worktrees to complete in reasonable time (serial mode available for headless) |

| **Perfect conflict-free merges** | Conflicts expected; automated resolution with human fallback |

| **Guaranteed success for all features** | Framework attempts full migration but doesn't guarantee success; grey-area features may fail and be logged for Phase 2 |

---

## Success Criteria

1. **Demo-ready**: Can start a migration, walk away, and return to completed PRs
2. **Full codebase migration**: Attempts to migrate entire SFRA codebase including customizations, with known features (allow-list) achieving high success rates
3. **Visual parity**: Incremental screenshot comparison shows acceptable similarity (tunable threshold)
4. **Parallel execution**: Multiple migration thread agents complete with conflict coordination (or serial mode for headless)
5. **Human validation**: All output is reviewable via standard PR workflow with conflict/failure logs
6. **CI/CD ready**: Can run headless in GitHub Actions or similar
7. **Conflict handling**: Shared file conflicts detected, resolved, or flagged for review
8. **Failure logging**: Failed migrations and customizations logged for human review

---

## Key Constraints

| Constraint | Impact |

|------------|--------|

| Cursor requires IDE open | Claude Code adapter needed for true headless operation |

| SFRA runs on Rhino (Java JS) | Cannot execute SFRA code directly; must analyze statically |

| Bootstrap ≠ Tailwind | Class mapping is lossy; requires LLM judgment |

| ISML templates are proprietary | No standard parser; must build custom analysis |

| Customer codebases vary wildly | Baseline-first, then handle customizations |

---

## Terminology Guide

Before diving into architecture, let's establish precise definitions:

| Term | Definition | Implementation |

|------|------------|----------------|

| **Tool** | A discrete function an LLM can invoke (e.g., read file, grep, run command) | MCP server endpoints or built-in Cursor/Claude tools |

| **Skill** | A specialized prompt + tool combination for a specific task | Markdown files with instructions + allowed tools (e.g., "Bootstrap to Tailwind") |

| **Agent** | An LLM instance with a goal, tools, and observe-think-act loop | Cursor/Claude Code session with system prompt |

| **Sub-agent** | A delegated agent spawned by a parent agent, runs in isolated context | `.cursor/agents/*.md` or Claude Code subagent files |

| **Orchestrator** | The top-level coordinator that spawns sub-agents and manages workflow | CLI tool + parent agent that delegates to specialists |

| **Worktree** | A git feature allowing multiple working directories from one repo | `git worktree add` - enables parallel non-conflicting work |

| **Migration Thread** | A logical grouping of migration work (e.g., "Checkout", "PDP") | Directory-scoped sub-agent assignment |

| **Trait** | A detected feature/functionality pattern in the source codebase | Output of planner agent's analysis (e.g., "has custom checkout") |

---

## Architecture Overview

```mermaid
flowchart TB
    subgraph cli [Unified CLI]
        MigrateCLI["migrate CLI"]
        AdapterSelect{Adapter Selection}
    end

    subgraph core [Platform-Agnostic Core]
        subgraph planner [Planner]
            Scanner[Codebase Scanner]
            TraitDetector[Trait Detector]
            TaskGenerator[Task Generator]
        end

        subgraph tools [MCP Tools]
            BootstrapTailwind[Bootstrap to Tailwind]
            jQueryShadcn[jQuery to ShadCN]
            VisualDiff[Visual Regression]
            ISMLAnalyzer[ISML Analyzer]
        end

        subgraph worktree [Worktree Manager]
            WorktreeCreate[Create Worktrees]
            WorktreeMerge[Merge Coordinator]
            PRCreator[PR Creator]
        end

        subgraph prompts [Agent Prompts]
            OrchestratorPrompt[Orchestrator Prompt]
            ThreadPrompts[Migration Thread Agent Prompts]
            SkillPrompts[Skill Prompts]
        end

        subgraph validation [Validation]
            ScreenshotCompare[Screenshot Comparison]
            ProgressLog[Progress Screenshots]
        end
    end

    subgraph adapters [Platform Adapters]
        CursorAdapter[Cursor Adapter]
        ClaudeAdapter[Claude Code Adapter]
    end

    subgraph execution [Execution Environment]
        CursorIDE[Cursor IDE + Subagents]
        ClaudeHeadless[Claude Code Headless]
    end

    MigrateCLI --> AdapterSelect
    AdapterSelect -->|"--adapter cursor"| CursorAdapter
    AdapterSelect -->|"--adapter claude-code"| ClaudeAdapter

    CursorAdapter --> CursorIDE
    ClaudeAdapter --> ClaudeHeadless

    CursorAdapter --> core
    ClaudeAdapter --> core

    CursorIDE --> worktree
    ClaudeHeadless --> worktree
```

---

## Platform Decision: Adapter Pattern

After evaluating the three options:

| Platform | Fully Detached? | Visual Debugging | CI/CD Ready | Verdict |

|----------|-----------------|------------------|-------------|---------|

| **Cursor Subagents** | No (IDE must stay open) | Excellent | No | Development only |

| **Claude Code** | Yes (headless SDK) | Limited | Yes | Demos + Production |

| **dispatch-agent** | N/A | N/A | N/A | Not suitable (wrong problem) |

**dispatch-agent** was ruled out - it's an MCP server for filesystem operations to preserve context window, NOT a multi-agent orchestrator. See [dispatch-agent repo](https://github.com/abhinav-mangla/dispatch-agent).

**Chosen approach**: Build a **platform-agnostic core** with thin adapters for both Cursor and Claude Code.

### Why This Approach

| Requirement | How Adapter Pattern Solves It |

|-------------|-------------------------------|

| Fully detached demos | Use Claude Code adapter |

| Visual debugging during dev | Use Cursor adapter |

| Minimize throwaway work | ~85% of code is in shared core |

| CI/CD integration | Claude Code adapter runs headless |

| Future flexibility | Can add new adapters (e.g., Aider, custom) |

### Code Reusability Analysis

| Component | Shared in Core | Platform-Specific |

|-----------|---------------|-------------------|

| MCP Tools | 100% | 0% |

| Migration prompts | 95% | 5% (format wrappers) |

| Git worktree logic | 100% | 0% |

| Validation/screenshots | 100% | 0% |

| Orchestration logic | 70% | 30% (spawn APIs differ) |

| Agent definitions | Content: 100% | Format: platform-specific |

| Coordination layer | 100% | 0% |

| Retry logic | 100% | 0% |

**Net reusability**: ~85% of work transfers between platforms.

---

## Package Structure

```
packages/migration-framework/
├── core/                           # 100% platform-agnostic
│   ├── planner/
│   │   ├── scanner.ts              # SFRA codebase traversal
│   │   ├── trait-detector.ts       # Feature identification
│   │   ├── feature-mapper.ts       # SFRA -> Storefront Next mapping
│   │   ├── task-generator.ts       # Migration task creation
│   │   └── known-mappings.ts       # Document known equivalents & gaps
│   │
│   ├── coordination/               # Shared file coordination
│   │   ├── file-registry.ts        # Track file/line access by agents
│   │   ├── conflict-detector.ts   # Detect line number conflicts
│   │   ├── resolver-agent.ts       # Automated conflict resolution
│   │   └── conflict-logger.ts     # Append-only conflict log
│   │
│   ├── retry/                      # Retry logic
│   │   ├── network-retry.ts        # Fast network retry (20x, 1000ms)
│   │   ├── compile-retry.ts         # Compilation retry (3min tolerance)
│   │   └── thread-retry.ts         # Thread-level retry (3x max)
│   │
│   ├── tools/                      # MCP tools (work with any client)
│   │   ├── bootstrap-to-tailwind/
│   │   ├── jquery-to-react/
│   │   ├── shadcn-mapper/
│   │   ├── isml-analyzer/
│   │   ├── visual-diff/
│   │   └── scapi-mapper/
│   │
│   ├── worktree/
│   │   ├── manager.ts              # Create/list/remove worktrees
│   │   ├── branch-strategy.ts      # Naming conventions
│   │   └── pr-creator.ts           # GitHub PR automation
│   │
│   ├── validation/
│   │   ├── screenshot-capture.ts   # Playwright-based capture
│   │   ├── incremental-capture.ts  # Regular interval captures
│   │   ├── visual-diff.ts          # Image comparison
│   │   └── progress-logger.ts      # Periodic snapshots with history
│   │
│   ├── logging/                    # Centralized logging
│   │   ├── failed-migrations.ts    # Failed migration log manager
│   │   ├── conflict-log.ts        # Conflict log manager
│   │   └── progress-log.ts         # Thread progress logging
│   │
│   └── prompts/                    # Raw markdown prompts
│       ├── orchestrator.md
│       ├── planner.md
│       ├── resolver-agent.md       # Conflict resolver prompt
│       ├── threads/
│       │   ├── home.md
│       │   ├── pdp.md
│       │   ├── checkout.md
│       │   └── ...
│       └── skills/
│           ├── bootstrap-to-tailwind.md
│           └── jquery-to-react.md
│
├── adapters/
│   ├── cursor/
│   │   ├── index.ts                # Cursor adapter entry
│   │   ├── agent-generator.ts      # Generate .cursor/agents/*.md
│   │   ├── subagent-spawner.ts     # Task tool invocation
│   │   └── progress-monitor.ts     # Read ~/.cursor/subagents/
│   │
│   └── claude-code/
│       ├── index.ts                # Claude Code adapter entry
│       ├── sdk-wrapper.ts          # Claude Code SDK integration
│       ├── headless-runner.ts      # Background execution
│       └── ci-integration.ts       # GitHub Actions support
│
└── cli/
    ├── index.ts                    # CLI entry point
    ├── commands/
    │   ├── init.ts                 # migrate init
    │   ├── plan.ts                 # migrate plan
    │   ├── run.ts                  # migrate run
    │   └── status.ts               # migrate status
    └── config.ts                   # Adapter selection, modes
```

---

## Git Worktree + PR Strategy

Each migration thread operates in isolation and produces a reviewable PR:

```mermaid
flowchart LR
    subgraph repo [Git Repository]
        Main[main branch]
    end

    subgraph worktrees [Parallel Worktrees]
        HomeWT["worktrees/home"]
        PDPWT["worktrees/pdp"]
        CheckoutWT["worktrees/checkout"]
    end

    subgraph agents [Migration Thread Agents]
        HomeAgent[Home Agent]
        PDPAgent[PDP Agent]
        CheckoutAgent[Checkout Agent]
    end

    subgraph prs [Pull Requests]
        HomePR["PR: Home Page Migration"]
        PDPPR["PR: PDP Migration"]
        CheckoutPR["PR: Checkout Migration"]
    end

    Main -->|"git worktree add"| HomeWT
    Main -->|"git worktree add"| PDPWT
    Main -->|"git worktree add"| CheckoutWT

    HomeAgent -->|works in| HomeWT
    PDPAgent -->|works in| PDPWT
    CheckoutAgent -->|works in| CheckoutWT

    HomeWT -->|"git push + gh pr create"| HomePR
    PDPWT -->|"git push + gh pr create"| PDPPR
    CheckoutWT -->|"git push + gh pr create"| CheckoutPR

    HomePR -->|"human review + merge"| Main
    PDPPR -->|"human review + merge"| Main
    CheckoutPR -->|"human review + merge"| Main
```

### Worktree Workflow

**Initialization** (applies to both serial and parallel modes):

1. **Workspace Setup**: Initialize git in parent, source, and target directories if needed
2. **Orchestrator** creates worktrees for each migration thread: `cd storefront-next && git worktree add worktrees/home -b migration/home`

**Serial Mode Execution**:

1. **Thread 1** executes in its worktree, completes (or fails)
2. **PR creation** for successful thread via `gh pr create`
3. **Thread 2** executes in its worktree (only after Thread 1 completes if `--continue-on-failure` not set)
4. Process repeats for all threads sequentially

**Parallel Mode Execution**:

1. **All threads** spawn simultaneously, each in their own worktree
2. **Coordination layer** tracks file access to prevent conflicts
3. **Each agent** commits incrementally, pushes to remote
4. **PR creation** via `gh pr create` for each successful thread independently
5. Failed threads don't block successful ones

**Final Steps** (both modes):

-   **Human** reviews PRs at end (or at checkpoints in checkpoint mode)
-   **Merge** happens only after validation passes

This workflow is **platform-agnostic** - works identically with Cursor or Claude Code adapter.

---

## Workspace Structure & Git Initialization

### Directory Layout

The migration framework requires a specific workspace structure with three independent git repositories:

```
migration-workspace/                    # Parent directory (has git)
├── .git/                              # Parent git repository
├── sfra/                              # SFRA source repository
│   ├── .git/                          # SFRA git repository (independent)
│   └── [SFRA codebase files]
├── storefront-next/                   # Storefront Next target repository
│   ├── .git/                          # Storefront Next git repository (independent)
│   ├── worktrees/                     # Git worktrees created here
│   │   ├── home/                      # Worktree for home migration thread
│   │   ├── pdp/                       # Worktree for PDP migration thread
│   │   └── ...
│   └── [Storefront Next codebase files]
└── .migration/                        # Migration framework state (committed to parent git)
    ├── coordination/                  # Shared file coordination layer (parallel mode only)
    │   ├── file-registry.json         # Tracks which agents touch which files/lines
    │   └── conflict-log.md           # Changelog-style conflict log (append-only)
    ├── logs/
    │   ├── failed-migrations.md       # Changelog-style failed migration log (append-only)
    │   └── thread-progress/          # Per-thread progress logs
    ├── screenshots/                   # Incremental screenshots by thread/iteration
    │   ├── home/
    │   │   ├── iteration-001/
    │   │   ├── iteration-002/
    │   │   └── ...
    │   └── ...
    └── migration-plan.json            # Generated migration plan
```

### Git Initialization Strategy

**Consistent across all execution contexts** (Cursor IDE, Claude Code headless, CI):

1. **Parent Directory**: Initialize git if not present: `git init` in workspace root
2. **Source Directory** (`sfra/`): Initialize git if not present: `cd sfra && git init`
3. **Target Directory** (`storefront-next/`): Initialize git if not present: `cd storefront-next && git init`
4. **Worktrees**: Created within target directory's git context: `cd storefront-next && git worktree add worktrees/{thread-name} -b migration/{thread-name}`

**CLI Arguments**:

-   `--source-path <path>`: Path to SFRA source directory
-   `--target-path <path>`: Path to Storefront Next target directory
-   `--workspace-path <path>`: Path to parent workspace (defaults to current directory)

**Note for CI Context**: In CI environments (GitHub Actions, etc.), the framework will:

1. Clone the parent repository (which contains both source and target as subdirectories)
2. Initialize git in each subdirectory if not already initialized
3. Proceed with migration using the same workflow as local execution

**Follow-up**: Need to design CI-specific workflow that handles:

-   Cloning strategy (monorepo vs separate repos)
-   Git credential handling for PR creation
-   Workspace cleanup after migration completion

---

## Execution Modes: Serial vs Parallel

### Overview

The framework supports two execution modes for migration threads, each optimized for different use cases:

| Aspect | Serial Mode | Parallel Mode |

| ----------------------- | ---------------------------------- | ---------------------------------------------------- |

| **Default Context** | Headless/CI (Claude Code) | Development (Cursor IDE) |

| **Speed** | Slower (sequential) | Faster (concurrent) |

| **Conflict Resolution** | None needed (one thread at a time) | Coordination layer required |

| **Partial Success** | ❌ One failure stops all | ✅ Successful threads create PRs even if others fail |

| **Complexity** | Low (no coordination) | Higher (file registry, conflict detection) |

| **Demo Reliability** | High (predictable, clean output) | Medium (may have conflicts) |

| **Resource Usage** | Low (one agent at a time) | High (multiple agents) |

### Serial Mode

**Use when**:

-   Running in fully headless CI/CD context
-   Need guaranteed conflict-free execution
-   Want predictable, linear progress
-   Debugging migration issues

**Behavior**:

-   Threads execute sequentially, one at a time
-   Each thread completes (or fails) before next starts
-   No coordination layer needed (no file conflicts possible)
-   If `--continue-on-failure` flag is set: failed threads are logged, execution continues
-   If `--continue-on-failure` is not set: first failure stops entire migration

**CLI Usage**:

```bash
migrate run --execution-mode serial --adapter claude-code
migrate run --execution-mode serial --continue-on-failure  # Continue even if threads fail
```

### Parallel Mode

**Use when**:

-   Running in Cursor IDE (development/debugging)
-   Need faster execution
-   Want partial success (some threads succeed even if others fail)
-   Have coordination layer implemented

**Behavior**:

-   All threads spawn simultaneously
-   Coordination layer tracks file access to prevent conflicts
-   Resolver agent attempts automated conflict resolution
-   Successful threads create PRs independently
-   Failed threads don't block successful ones

**CLI Usage**:

```bash
migrate run --execution-mode parallel --adapter cursor
```

### Implementation Strategy

```typescript
// Pseudo-code for orchestrator execution mode handling
async function executeMigration(
    threads: MigrationThread[],
    mode: 'serial' | 'parallel',
    continueOnFailure: boolean = false
) {
    if (mode === 'serial') {
        // Sequential execution - no coordination needed
        for (const thread of threads) {
            const result = await executeThread(thread);
            if (result.success) {
                await createPR(result);
            } else if (continueOnFailure) {
                logFailedThread(thread, result.error);
                // Continue to next thread
            } else {
                throw new Error(
                    `Thread ${thread.id} failed - stopping migration`
                );
            }
        }
    } else {
        // Parallel execution - requires coordination
        const coordinationLayer = new CoordinationLayer();
        const promises = threads.map((thread) =>
            executeThreadWithCoordination(thread, coordinationLayer)
        );
        const results = await Promise.allSettled(promises);

        // Process results - create PRs for successful threads
        for (const [thread, result] of zip(threads, results)) {
            if (result.status === 'fulfilled' && result.value.success) {
                await createPR(result.value);
            } else {
                logFailedThread(thread, result.reason || result.value.error);
            }
        }
    }
}
```

### Future Enhancement: Smart Serial Mode

**Proposed**: A hybrid mode that runs threads sequentially but continues on failure:

-   No conflicts (serial execution)
-   Partial success (failed threads don't block others)
-   Best of both worlds for headless demos

**CLI Usage**:

```bash
migrate run --execution-mode smart-serial --adapter claude-code
```

### Future Phase 2: Post-Baseline Enhancements

**Future Work**: After baseline-to-baseline migration is proven, Phase 2 will include two major areas of work:

#### 2.1: Custom Features Migration

Extend the framework to handle custom SFRA customizations and features beyond the baseline:

-   Custom cartridges and plugins
-   Custom checkout flows
-   Custom product features
-   Third-party integrations
-   Customer-specific business logic

#### 2.2: Execution Mode Evaluation

Conduct comprehensive evaluations comparing serial and parallel execution modes in CI contexts:

**Evaluation Strategy**:

-   Run identical migration tasks multiple times (N=50+ runs) in CI using both execution modes
-   Measure and compare:
    -   **Success Rate**: Percentage of threads that complete successfully
    -   **Partial Success Rate**: Percentage of migrations where at least one thread succeeds
    -   **Time to Completion**: Average execution time per migration
    -   **Conflict Frequency**: Number of conflicts requiring resolution (parallel mode only)
    -   **Resource Utilization**: CPU, memory, and API usage patterns
    -   **PR Quality**: Visual diff scores, compilation success rates, functional test pass rates
-   Analyze failure modes and root causes for each mode
-   Optimize default execution mode selection based on empirical data

**Expected Outcomes**:

-   Data-driven decision on optimal execution mode for CI contexts
-   Tuning of coordination layer effectiveness (if parallel mode shows promise)
-   Potential refinement of "Smart Serial Mode" based on learnings
-   Documentation of best practices for different migration scenarios

**Note**: Both modes can run in CI, enabling A/B testing and comparative analysis. This evaluation will inform whether parallel mode's coordination layer complexity is justified by improved success rates and partial success capabilities, or if serial mode's simplicity is preferable for CI contexts.

**Timeline**: Phase 2 work begins after Phase 7 (Testing) is complete and baseline-to-baseline migration is proven successful.

---

## Retry Logic Strategy

### Three-Tier Retry System

1. **Network Retry** (Fast Loop)

    - Trigger: Network/API errors
    - Retries: 20 attempts
    - Delay: 1000ms between attempts
    - Scope: Individual API calls

2. **Compilation Retry** (Medium Loop)

    - Trigger: Compilation/build failures
    - Tolerance: 3 minutes of consecutive failures
    - Scope: Entire thread task
    - Action: Mark task as failed, trigger thread retry

3. **Thread Retry** (Slow Loop)

    - Trigger: Thread task failure after compilation retry exhausted
    - Retries: 3 attempts maximum
    - Action: Start entire task over in new thread iteration
    - Final: If all 3 attempts fail, mark thread as fully failed, halt all attempts

### Retry Flow

```mermaid
flowchart TD
    Start[Agent Starts Task] --> NetworkCall{Network Call}
    NetworkCall -->|Success| Compile{Compile Project}
    NetworkCall -->|Fail| NetworkRetry{Retry < 20?}
    NetworkRetry -->|Yes| Wait1[Wait 1000ms]
    Wait1 --> NetworkCall
    NetworkRetry -->|No| NetworkFail[Network Failure]

    Compile -->|Success| TaskSuccess[Task Success]
    Compile -->|Fail| CompileRetry{< 3min consecutive?}
    CompileRetry -->|Yes| Wait2[Wait & Retry]
    Wait2 --> Compile
    CompileRetry -->|No| ThreadRetry{Thread Retry < 3?}

    ThreadRetry -->|Yes| NewThread[Start New Thread Iteration]
    NewThread --> Start
    ThreadRetry -->|No| ThreadFailed[Thread Fully Failed]

    NetworkFail --> ThreadRetry
```

---

## Architectural Pillars

### Pillar 0: Platform-Agnostic Core + Adapters (NEW)

**Goal**: Establish the foundational architecture that maximizes code reuse across platforms

**Core package** (`packages/migration-framework/core/`):

-   All migration logic, prompts, and tools live here
-   Zero platform-specific code
-   Exports TypeScript interfaces that adapters implement

**Adapter interface**:

```typescript
interface MigrationAdapter {
    name: string;

    // Agent lifecycle
    spawnAgent(config: AgentConfig): Promise<AgentHandle>;
    monitorAgent(handle: AgentHandle): AsyncIterable<AgentStatus>;
    terminateAgent(handle: AgentHandle): Promise<void>;

    // Mode support
    supportsHeadless: boolean;
    supportsCheckpoints: boolean;

    // Platform-specific setup
    initialize(projectPath: string): Promise<void>;
    cleanup(): Promise<void>;
}
```

**Cursor adapter** (`packages/migration-framework/adapters/cursor/`):

-   Generates `.cursor/agents/*.md` files from core prompts
-   Uses Cursor's Task tool to spawn background subagents
-   Monitors `~/.cursor/subagents/` for progress
-   **Limitation**: Requires IDE open, no true headless mode

**Claude Code adapter** (`packages/migration-framework/adapters/claude-code/`):

-   Uses Claude Code SDK for programmatic control
-   Runs fully headless via `claude code run`
-   Supports CI/CD integration
-   **Advantage**: True detached execution for demos

---

### Pillar 1: Orchestration Layer

**Goal**: CLI tool that manages the entire migration workflow

-   **CLI Interface**: Commands like `migrate init`, `migrate plan`, `migrate run --mode checkpoint|autonomous --execution-mode serial|parallel --adapter cursor|claude-code`
-   **Workspace Initialization**: Sets up parent workspace with separate git instances for source, target, and parent directories
-   **Git Worktree Manager**: Creates/manages worktrees for migration thread execution (parallel or serial)
-   **Execution Mode Controller**: Serial (headless-friendly, no conflicts) vs Parallel (faster, requires coordination)
-   **Coordination Layer Manager**: Optional - only active in parallel mode for conflict detection/resolution
-   **Progress Tracker**: Real-time status of all sub-agents, screenshot logging
-   **Mode Controller**: Checkpoint (pause at milestones) vs Autonomous (run to completion)
-   **Merge Coordinator**: Combines completed worktree branches back to main

**Key files to create**:

-   `packages/migration-framework/cli/` - CLI entry point
-   `packages/migration-framework/core/workspace/` - Workspace initialization and git setup
-   `packages/migration-framework/core/worktree/` - Git worktree utilities
-   `packages/migration-framework/core/execution/` - Execution mode controller (serial/parallel)
-   Adapter implementations in `packages/migration-framework/adapters/`

---

### Pillar 2: Planner Agent

**Goal**: Analyze source SFRA codebase and generate migration plan

-   **Codebase Scanner**: Traverse SFRA project, identify controllers, templates, models
-   **Trait Detector**: Identify features (custom checkout, wishlists, store locator, etc.)
-   **Screenshot Capture**: Headless browser captures of all pages for later comparison
-   **Feature Mapper**: Map detected traits to known Storefront Next equivalents
-   **Known Mappings Documenter**: Quantify and document known equivalents and expected gaps
-   **Task Generator**: Output structured migration tasks for each migration thread

**Key outputs**:

-   `migration-plan.json` - Structured plan with migration threads, traits, mappings
-   `screenshots/source/` - Reference screenshots of original site
-   `trait-mapping.json` - Detected features mapped to target architecture
-   `known-mappings.md` - Documented known equivalents and gaps (allow-list/deny-list)

---

### Pillar 3: MCP Tools/Skills

**Goal**: Reusable migration capabilities that any sub-agent can invoke

#### Phase 3a: Tool Discovery (REQUIRED FIRST)

Before building any migration tools, we must analyze both codebases to understand what transformations are actually needed:

**SFRA Codebase Analysis** (`storefront-reference-architecture/`):

-   Inventory all Bootstrap CSS classes and patterns used
-   Catalog jQuery patterns and DOM manipulation approaches
-   Document ISML template structure and data bindings
-   Map controller endpoints and data shapes
-   Identify client-side JS patterns (event handlers, AJAX calls)

**Storefront Next Codebase Analysis** (`storefront-next/packages/template-retail-rsc-app/`):

-   Document Tailwind CSS patterns and design tokens in use
-   Catalog ShadCN components and their props/variants
-   Understand React patterns (RSC vs client components, hooks)
-   Map SCAPI endpoints and data shapes
-   Document React Router 7 loader patterns

**Discovery Outputs**:

-   `analysis/sfra-patterns.json` - Categorized inventory of SFRA patterns
-   `analysis/storefront-next-patterns.json` - Inventory of target patterns
-   `analysis/transformation-matrix.md` - Mapping of source -> target for each category
-   `analysis/tool-requirements.md` - Prioritized list of tools needed based on actual usage
-   `analysis/known-equivalents.md` - Quantified known functionality mappings (allow-list)
-   `analysis/expected-gaps.md` - Documented features with no direct equivalent (deny-list)

**Discovery Questions to Answer**:

1. Which Bootstrap classes are most frequently used? (Focus tool effort there)
2. What jQuery patterns have direct React equivalents vs need custom handling?
3. Which SFRA components map cleanly to ShadCN vs need custom components?
4. Are there SFRA patterns with NO Storefront Next equivalent? (Flag for manual review)

---

#### Phase 3b: Tool Implementation

**Candidate Tools** (to be validated/prioritized by discovery):

| Tool/Skill | Purpose | Implementation | Priority |

| ------------------------- | ------------------------------------------------- | -------------------------------------------- | -------------------- |

| `bootstrap-to-tailwind` | Convert Bootstrap CSS classes to Tailwind | AST parsing + class mapping + LLM refinement | TBD by discovery |

| `jquery-to-react` | Convert jQuery DOM manipulation to React patterns | Pattern detection + JSX generation | TBD by discovery |

| `shadcn-component-mapper` | Map Bootstrap components to ShadCN equivalents | Component registry + props mapping | TBD by discovery |

| `isml-analyzer` | Extract data requirements from ISML templates | Template parsing, variable extraction | TBD by discovery |

| `visual-diff` | Compare screenshots for regression detection | Playwright + pixelmatch/resemblejs | High (always needed) |

| `scapi-mapper` | Map SFRA controller data to SCAPI equivalents | API documentation + endpoint matching | TBD by discovery |

**Additional tools may be identified during discovery.**

**Key files**:

-   `packages/migration-framework/core/tools/` - Migration-specific MCP tools
-   `packages/migration-framework/analysis/` - Discovery outputs
-   Skill definitions in `core/prompts/skills/`

---

### Pillar 4: Migration Thread Agents

**Goal**: Specialized sub-agents for each functional area

Each migration thread agent:

1. Operates in its own git worktree (within Storefront Next git context)
2. Has domain-specific knowledge (e.g., checkout flows, product display)
3. Uses tools from Pillar 3
4. Requests file access via coordination layer (parallel mode only)
5. Captures incremental screenshots at regular intervals
6. Reports progress via screenshots and logs
7. Runs in parallel with other migration threads (or serial in headless mode)
8. Handles retries according to retry strategy

**Migration Threads (initial baseline)**:

-   `home` - Homepage, hero sections, featured products
-   `pdp` - Product Detail Page
-   `plp` - Product List/Category Pages
-   `cart` - Shopping cart
-   `checkout` - Checkout flow (most complex)
-   `account` - User account pages
-   `search` - Search results, filters
-   `navigation` - Header, footer, menus
-   `customizations` - Custom SFRA features (isolated, rollback-friendly)
-   `unknown` - Unmapped features (isolated, rollback-friendly)

---

### Pillar 5: Validation Layer

**Goal**: Verify migration quality through visual and functional testing

**Components**:

-   **Incremental Screenshot Capture**: Regular interval captures within each migration thread
-   **Screenshot Comparison**: Side-by-side source vs migrated
-   **Visual Regression**: Automated diff detection with tolerance thresholds
-   **Progress Logging**: Historical screenshots preserved for analysis
-   **Functional Smoke Tests**: Basic interaction tests (add to cart, search, etc.)
-   **Accessibility Check**: Ensure migration doesn't degrade a11y
-   **Compilation Validation**: Continuous compilation checks with retry logic

**Integration with [Ledger](https://github.com/peterjthomson/ledger)**: Could visualize worktree/branch progress across migration threads

---

### Pillar 6: Coordination & Conflict Resolution

**Goal**: Manage shared file access and resolve conflicts

**Components**:

-   **File Registry**: Track file/line access by migration thread agents
-   **Conflict Detector**: Identify overlapping line number ranges
-   **Resolver Agent**: Attempt automated merge + compilation
-   **Conflict Logger**: Append-only changelog of conflicts and resolutions
-   **Failed Migration Logger**: Append-only changelog of failed customizations

**Workflow**:

1. Agent requests file access with line number ranges
2. Registry checks for conflicts
3. If conflict: Resolver attempts automated merge
4. Resolver compiles to validate merge
5. If compilation fails: Flag for human review, append to conflict log
6. Agents continue work, conflicts surfaced in final review phase

**Integration with Unknown Features**:

-   Unknown features (grey areas) are handled by migration thread agents in their own worktrees
-   Higher tolerance for failure (can be rolled back)
-   Generates "migration notes" for human review
-   Falls back to generating TODOs if confident migration isn't possible
-   Failed attempts logged in `failed-migrations.md` for Phase 2 consideration

---

## Phased Delivery

```mermaid
gantt
    title Migration Framework Development Phases
    dateFormat  YYYY-MM-DD

    section Phase0_Core
    Core package structure               :p0a, 2026-01-13, 1w
    Adapter interface design             :p0b, after p0a, 1w
    Cursor adapter implementation        :p0c, after p0b, 2w

    section Phase1_Orchestration
    CLI skeleton with adapter selection  :p1a, after p0c, 1w
    Git worktree management              :p1b, after p1a, 1w
    Checkpoint/autonomous modes          :p1c, after p1b, 1w

    section Phase2_Planner
    Codebase scanner                     :p2a, 2026-01-20, 2w
    Trait detector                       :p2b, after p2a, 2w
    Screenshot capture                   :p2c, 2026-01-20, 1w
    Task generator                       :p2d, after p2b, 1w

    section Phase3a_Discovery
    SFRA codebase analysis               :p3disc1, after p1c, 1w
    Storefront Next analysis             :p3disc2, after p3disc1, 1w
    Transformation matrix                :p3disc3, after p3disc2, 1w
    Tool requirements doc                :p3disc4, after p3disc3, 3d

    section Phase3b_Tools
    Visual diff tool                     :p3a, after p3disc4, 1w
    Bootstrap to Tailwind tool           :p3b, after p3a, 2w
    jQuery to React patterns             :p3c, after p3b, 2w
    Additional tools from discovery      :p3d, after p3c, 2w

    section Phase4_Threads
    Home migration thread agent          :p4a, after p3d, 1w
    PDP migration thread agent           :p4b, after p4a, 1w
    Remaining migration thread agents   :p4c, after p4b, 3w

    section Phase5_Validation
    Validation integration               :p5a, after p4c, 2w
    Unknown feature handler              :p5b, after p5a, 2w

    section Phase6_ClaudeAdapter
    Claude Code adapter                  :p6a, after p5a, 2w
    Headless demo mode                   :p6b, after p6a, 1w
    CI/CD integration                    :p6c, after p6b, 1w

    section Phase7_Testing
    Baseline to baseline test            :p7a, after p6c, 2w
    Documentation and refinement         :p7b, after p7a, 1w
```

### Phase Summary

| Phase | Focus | Adapter Used | Deliverable |

| ----- | --------------------- | -------------- | ---------------------------------------- |

| 0 | Core + Cursor Adapter | Cursor | Dev environment working |

| 1 | Orchestration CLI | Cursor | `migrate init/plan/run` commands |

| 2 | Planner Agent | Cursor | SFRA analysis + migration plan |

| 3a | **Tool Discovery** | N/A (analysis) | Transformation matrix, tool requirements |

| 3b | MCP Tools | Cursor | Tools prioritized by discovery findings |

| 4 | Migration Thread Agents | Cursor | Parallel migration capability |

| 5 | Validation | Cursor | Screenshot comparison, smoke tests |

| 6 | Claude Code Adapter | Claude Code | Headless demos + CI/CD |

| 7 | Testing | Both | Baseline-to-baseline validation |

---

## Risks and Mitigations

| Risk | Impact | Mitigation |

|------|--------|------------|

| ISML semantics don't map to RSC | High | Focus on data flow extraction, not template conversion |

| Visual diff false positives | Medium | Tune tolerance, allow human override |

| Sub-agent context limits | Medium | Careful prompt engineering, chunked processing |

| Parallel merge conflicts | Low | Migration thread boundaries designed to avoid overlap |

| Bootstrap class edge cases | Medium | Fallback to manual TODO comments |

| **Cursor adapter limitations** | Medium | Claude Code adapter as fallback for headless needs |

| **Platform API changes** | Low | Adapter abstraction isolates core from platform changes |

---

## Next Steps

1. **Approve this master plan** - Confirm pillars, phasing, and adapter pattern
2. **Create Pillar 0 sub-plan** - Detailed core + adapter architecture design
3. **Prototype worktree + Cursor subagent** - Validate the approach works end-to-end
4. **Define adapter interface** - TypeScript interfaces before implementation

---

## Open Questions for Future Sub-Plans

1. Should the `migration-framework` be a standalone package or integrated into `storefront-next-dev`?
2. What's the minimum viable baseline-to-baseline scope? (All pages or subset like Home + PDP?)
3. How should credentials/environment be passed to sub-agents for screenshot capture?
4. Should we build a web dashboard for progress visualization, or is CLI + [Ledger](https://github.com/peterjthomson/ledger) sufficient?
5. How do we handle Cursor nightly channel requirement? (Document for users? Auto-detect?)
6. Should Claude Code adapter use the SDK directly or shell out to `claude code run`?
7. **CI Context Follow-up**: Design CI-specific workflow for:

    - Cloning strategy (monorepo vs separate repos)
    - Git credential handling for PR creation in CI
    - Workspace cleanup after migration completion
    - Handling pre-initialized vs fresh git repositories

8. **Smart Serial Mode**: Implement hybrid execution mode that combines serial's conflict-free nature with parallel's partial success capability?

---

## References

### Source and Target Codebases

-   [Storefront Next (Target)](https://github.com/SalesforceCommerceCloud/storefront-next) - The headless storefront we're migrating TO
-   [SFRA - Storefront Reference Architecture (Source)](https://github.com/SalesforceCommerceCloud/storefront-reference-architecture) - The legacy storefront we're migrating FROM

### Agent Platforms

-   [Cursor Subagents Documentation](https://cursor.com/docs/agent/subagents) - Primary development platform
-   [Claude Code Subagents Documentation](https://code.claude.com/docs/en/sub-agents) - Headless/CI platform
-   [dispatch-agent](https://github.com/abhinav-mangla/dispatch-agent) - Evaluated and ruled out (solves different problem)

### Tooling

-   [Ledger - Git Worktree Visualizer](https://github.com/peterjthomson/ledger) - Potential visualization for parallel worktrees
-   [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) - Protocol for building LLM tools
-   [Playwright](https://playwright.dev/) - Browser automation for screenshots and validation

### Source Architecture (SFRA)

-   [Rhino JavaScript Engine](<https://en.wikipedia.org/wiki/Rhino_\(JavaScript_engine)>) - SFRA's server-side JS runtime
-   [Bootstrap 4](https://getbootstrap.com/docs/4.6/) - SFRA's CSS framework
-   [jQuery](https://jquery.com/) - SFRA's client-side JS library

### Target Architecture (Storefront Next)

-   [React 19](https://react.dev/) - UI framework
-   [React Router 7](https://reactrouter.com/) - Routing framework
-   [Tailwind CSS 4](https://tailwindcss.com/) - CSS framework
-   [ShadCN/UI](https://ui.shadcn.com/) - Component library
-   [Vite](https://vite.dev/) - Build tool
-   [SCAPI - Salesforce Commerce API](https://developer.salesforce.com/docs/commerce/commerce-api/overview) - Backend API

---

## Footnotes

<sup>1</sup> **Future Phase 2 Scope**: After baseline-to-baseline migration is proven, Phase 2 will include: (1) Custom features migration - extending the framework to handle custom SFRA customizations beyond baseline, and (2) Execution mode evaluation - comprehensive CI-based comparison of serial vs parallel modes (50+ runs) to optimize execution mode selection. See "Future Phase 2: Post-Baseline Enhancements" section for details.