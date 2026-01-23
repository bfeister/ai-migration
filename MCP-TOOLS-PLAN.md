# MCP Tools Implementation Plan

## Problem Statement

The current migration loop requires Claude to perform many deterministic, repetitive tasks that:
1. **Consume context window**: Detailed instructions for logging, screenshots, git commits
2. **Risk inconsistency**: Manual formatting of log entries, screenshot filenames
3. **Slow execution**: Claude must read/generate boilerplate repeatedly
4. **Error-prone**: Manual bash commands, filename patterns, JSON parsing

## Solution: MCP Tool Suite

Convert deterministic behaviors into MCP tools that provide simple, reliable interfaces for:
- **Logging progress** - Atomic iteration logging with dashboard-optimized format
- **Dev server validation** - Error detection and health checks
- **Screenshot capture** - Dual capture (source + target) with ~500KB optimization and metadata
- **Git commits** - Standardized commit messages and hash tracking
- **Navigation** - Automatic next micro-plan detection
- **Configuration** - URL mapping lookup and parsing

### Core Principles

1. **Atomic Iterations**: One consolidated log entry per complete iteration (no "started" logs)
2. **Non-blocking Failures**: Tools return error status, Claude self-corrects (no internal retries)
3. **Dashboard-First**: Log format and screenshot metadata optimized for dashboard parsing
4. **Permissive Input**: Accept flexible formats, normalize automatically (e.g., "01-02" → "subplan-01-02")
5. **Required Steps**: Dev validation, screenshots, and commits are blocking (must succeed to proceed)

---

## MCP Tool Design

### Tool 1: `LogMigrationProgress`

**Purpose**: Append structured entries to migration-log.md (atomic iteration logging)

**Parameters**:
```typescript
{
  subplan_id: string;              // e.g., "subplan-01-02" or "01-02" (normalized)
  status: "success" | "failed";    // Only log on completion (success/fail)
  summary: string;                 // What was done (e.g., "Implemented hero layout")
  source_screenshot_url: string;   // SFRA baseline URL
  target_screenshot_url: string;   // Storefront Next result URL
  commit_sha: string;              // Git commit hash (proof of work)
  duration_seconds?: number;       // Auto-calculated if not provided
  error_message?: string;          // If status === "failed"
}
```

**Behavior**:
1. Normalize subplan_id (e.g., "01-02" → "subplan-01-02")
2. Read current migration-log.md
3. Parse header to get counts
4. Generate timestamp (ISO 8601)
5. Format entry with proper markdown (dashboard-friendly order)
6. Update header counts
7. Append to log
8. Return: `{ success: true, log_path: string }`

**Example call** (atomic iteration complete):
```javascript
await mcp.call("LogMigrationProgress", {
  subplan_id: "01-02",  // Normalized automatically
  status: "success",
  summary: "Implemented hero section layout matching SFRA baseline",
  source_screenshot_url: "https://zzrf-001.dx.commercecloud.salesforce.com/s/RefArchGlobal/en_GB/home",
  target_screenshot_url: "http://localhost:5173",
  commit_sha: "a3f2c1b"
})
```

**Generated log entry** (optimized for dashboard UI):
```markdown
## [2026-01-23T15:42:30Z] subplan-01-02: Document Existing Implementation

**Status:** ✅ Success
**Duration:** 4m 23s
**Summary:** Implemented hero section layout matching SFRA baseline

**Screenshots:**
- 📸 Source: https://zzrf-001.dx.commercecloud.salesforce.com/s/RefArchGlobal/en_GB/home
- 🎯 Target: http://localhost:5173

**Commit:** [`a3f2c1b`](../storefront-next/commit/a3f2c1b)

---
```

**Benefits**:
- Consistent formatting for dashboard parsing
- Auto-timestamps (ISO 8601)
- Auto-calculates duration
- Updates header counts
- Normalized subplan IDs
- Dashboard-friendly structure (timestamp → subplan → summary → screenshots → commit)
- No context wasted on log format instructions

---

### Tool 2: `ValidateDevServer`

**Purpose**: Start dev server, validate it's error-free, return health status

**Parameters**:
```typescript
{
  app_dir: string;              // e.g., "/workspace/storefront-next"
  timeout_seconds?: number;     // Default: 60
  port?: number;                // Default: 5173
  check_endpoints?: string[];   // Optional URLs to validate (e.g., ["/", "/search"])
}
```

**Behavior**:
1. `cd` to app_dir
2. Check if dev server already running (port check)
3. If not running, start: `pnpm dev`
4. Parse output for errors/warnings
5. Wait for "Local: http://localhost:5173" message
6. Optionally fetch check_endpoints to verify responses
7. Return health status

**Returns**:
```typescript
{
  success: boolean;
  server_running: boolean;
  errors: string[];           // Compilation errors
  warnings: string[];         // Warnings
  server_url: string;         // e.g., "http://localhost:5173"
  startup_time_seconds: number;
}
```

**Example call**:
```javascript
const result = await mcp.call("ValidateDevServer", {
  app_dir: "/workspace/storefront-next",
  check_endpoints: ["/"]
})

if (!result.success) {
  // Handle errors
}
```

**Benefits**:
- Deterministic server validation
- Captures errors/warnings automatically
- No need for Claude to parse `pnpm dev` output
- Returns structured data for decision-making

---

### Tool 3: `CaptureDualScreenshots`

**Purpose**: Capture source (SFRA) and target (Storefront Next) screenshots with proper naming

**Parameters**:
```typescript
{
  feature_id: string;           // e.g., "01-homepage-hero"
  subplan_id: string;           // e.g., "subplan-01-02"
  sfra_url?: string;            // Optional, looked up from url-mappings.json if not provided
  target_url?: string;          // Optional, defaults to localhost:5173
  viewport?: { width: number; height: number };
  source_config?: object;       // dismiss_consent, wait_for_selector, etc.
  target_config?: object;
}
```

**Behavior**:
1. If URLs not provided, look up from `/workspace/url-mappings.json` by feature_id
2. Generate timestamp: `YYYYMMDD-HHMMSS`
3. Generate filenames:
   - Source: `{timestamp}-{subplan_id}-source.png`
   - Target: `{timestamp}-{subplan_id}-target.png`
4. Call Playwright screenshot script twice (source + target)
5. Verify both files created
6. Return paths and metadata

**Returns**:
```typescript
{
  success: boolean;
  source_screenshot: {
    path: string;
    size_bytes: number;
    url: string;
  };
  target_screenshot: {
    path: string;
    size_bytes: number;
    url: string;
  };
  timestamp: string;
}
```

**Example call**:
```javascript
const result = await mcp.call("CaptureDualScreenshots", {
  feature_id: "01-homepage-hero",
  subplan_id: "subplan-01-02"
})
// Auto-looks up URLs from url-mappings.json
// Auto-generates proper filenames
// Returns paths for verification
```

**Benefits**:
- Consistent filename format
- Auto-lookup from url-mappings.json
- Handles consent dialogs automatically
- No manual bash commands
- Returns structured data

---

### Tool 4: `CommitMigrationProgress`

**Purpose**: Create git commit with standardized message format

**Parameters**:
```typescript
{
  subplan_id: string;           // e.g., "subplan-01-02"
  title: string;                // e.g., "Document existing homepage implementation"
  files_changed?: string[];     // Optional, auto-detected with git status if not provided
  include_screenshots?: boolean; // Default: false (screenshots typically too large)
}
```

**Behavior**:
1. `cd /workspace/storefront-next`
2. `git add .` (or specific files if provided)
3. Generate commit message:
   ```
   feat(migration): {subplan_id} - {title}

   Micro-plan: {subplan_id}
   Feature: {feature_name}

   Changes:
   - {list of changed files}
   ```
4. `git commit -m "..."`
5. Return commit hash

**Returns**:
```typescript
{
  success: boolean;
  commit_hash: string;
  files_changed: string[];
  commit_message: string;
}
```

**Example call**:
```javascript
const result = await mcp.call("CommitMigrationProgress", {
  subplan_id: "subplan-01-02",
  title: "Document existing homepage implementation"
})
```

**Benefits**:
- Consistent commit message format
- Auto-detects changed files
- Returns commit hash for logging
- No git commands in Claude's context

---

### Tool 5: `GetNextMicroPlan`

**Purpose**: Determine next micro-plan to execute based on migration log

**Parameters**:
```typescript
{
  feature_directory?: string;   // e.g., "01-homepage-content", optional
}
```

**Behavior**:
1. Read `/workspace/migration-log.md`
2. Parse to find last completed subplan (e.g., "subplan-01-02")
3. If feature_directory provided:
   - List files in `/workspace/sub-plans/{feature_directory}/`
   - Find next sequential file (e.g., `subplan-01-03.md`)
4. If not provided:
   - Auto-detect from last completed subplan
5. Read next micro-plan file
6. Parse title and content
7. Return structured data

**Returns**:
```typescript
{
  found: boolean;
  subplan_id: string;           // e.g., "subplan-01-03"
  file_path: string;            // Full path to .md file
  title: string;                // Extracted from markdown
  content: string;              // Full markdown content
  feature_directory: string;    // e.g., "01-homepage-content"
  previous_subplan: string;     // e.g., "subplan-01-02"
}
```

**Example call**:
```javascript
const next = await mcp.call("GetNextMicroPlan", {})
// Auto-detects from migration log
// Returns next subplan to execute
```

**Benefits**:
- No manual file globbing
- Automatic sequence detection
- Returns structured data ready to use
- Handles edge cases (no next plan, feature complete)

---

### Tool 6: `ParseURLMapping`

**Purpose**: Look up SFRA source + target URLs for a feature

**Parameters**:
```typescript
{
  feature_id: string;           // e.g., "01-homepage-hero"
}
```

**Behavior**:
1. Read `/workspace/url-mappings.json`
2. Find mapping by feature_id
3. Extract URLs and configuration
4. Return structured data

**Returns**:
```typescript
{
  found: boolean;
  feature_id: string;
  feature_name: string;
  sfra_url: string;
  target_url: string;
  viewport: { width: number; height: number };
  source_config: object;        // dismiss_consent, wait_for_selector, etc.
  target_config: object;
}
```

**Example call**:
```javascript
const mapping = await mcp.call("ParseURLMapping", {
  feature_id: "01-homepage-hero"
})
// Returns URLs and config for screenshot capture
```

**Benefits**:
- No manual JSON parsing
- Consistent config extraction
- Returns typed data
- Handles missing mappings gracefully

---

### ~~Tool 7: `CreateMigrationLogHeader`~~ (REMOVED)

**Decision**: Merged into `LogMigrationProgress` for simplicity. The logging tool will auto-initialize the migration-log.md file on first use, eliminating the need for a separate header creation tool.

---

## Implementation Plan

### Phase 1: Core Logging Tools (1-2 hours)

**Tools**:
- `LogMigrationProgress` (with auto-initialization of migration-log.md)

**Why first**: Provides immediate value by standardizing log format and reducing context usage.

**Implementation**:
1. Update `package.json` to use ES modules (`"type": "module"`)
2. Update `tsconfig.json` to target ES2020 modules
3. Create `mcp-server/src/tools/` directory structure:
   - `types.ts` - Shared TypeScript interfaces
   - `utils.ts` - Path resolution, normalization helpers
   - `intervention.ts` - Extract from intervention-server.ts
   - `logging.ts` - LogMigrationProgress implementation
4. Implement log parsing/formatting logic with:
   - Auto-initialization of migration-log.md
   - Subplan ID normalization
   - Header count updates
5. Test with manual calls
6. Update migration-main-plan.md to use tools

**Path Resolution Strategy**:
- Use `WORKSPACE_ROOT` environment variable (for Docker/CI)
- Fall back to `process.cwd()` for local development
- Support both git clone + Docker and headless GitHub Actions contexts

### Phase 2: Dev Server Validation (1 hour)

**Tools**:
- `ValidateDevServer`

**Why second**: Reduces context spent parsing dev server output and checking for errors.

**Implementation**:
1. Add server validation logic
2. Parse `pnpm dev` output for errors/warnings
3. Health check via HTTP fetch
4. Return structured status

### Phase 3: Screenshot Automation (1-2 hours)

**Tools**:
- `ParseURLMapping`
- `CaptureDualScreenshots`

**Why third**: Major context saver, handles complex Playwright logic deterministically.

**Implementation**:
1. Integrate with existing `capture-screenshots.ts`
2. Auto-generate filenames
3. Auto-lookup URLs from mappings
4. Handle both source + target in single call

### Phase 4: Git & Navigation Tools (1 hour)

**Tools**:
- `CommitMigrationProgress`
- `GetNextMicroPlan`

**Why last**: Complete the automation suite, enable fully deterministic loop.

**Implementation**:
1. Git commit with standardized messages
2. Micro-plan sequence detection
3. Return next plan to execute

---

## Migration Loop Changes

### Before (Verbose Instructions)

```markdown
### 5. Dev Server Startup & Screenshot Capture

Start the dev server and capture dual screenshots:

**IMPORTANT:** Use url-mappings.json to find SFRA source and target URLs.

**Commands:**
1. Load feature config: `cat url-mappings.json | jq '.mappings[] | select(.feature_id == "01-homepage-hero")'`
2. Start dev server: `cd storefront-next/packages/template-retail-rsc-app && pnpm dev`
3. Wait for "Local: http://localhost:5173" message
4. Check for compilation errors in output
5. Extract SFRA URL from config
6. Extract target URL (default: http://localhost:5173)
7. Generate timestamp: `date -u +"%Y%m%d-%H%M%S"`
8. Capture SFRA source: `tsx scripts/capture-screenshots.ts <sfra_url> screenshots/<timestamp>-subplan-XX-YY-source.png --mapping <json>`
9. Capture target: `tsx scripts/capture-screenshots.ts http://localhost:5173 screenshots/<timestamp>-subplan-XX-YY-target.png`
10. Verify both screenshots exist and have reasonable file sizes

**Error Handling:**
- If server fails to start, check for port conflicts
- If screenshot fails, check consent modal dismissal
- If errors in compilation, fix before proceeding
```

### After (MCP Tools)

```markdown
### 5. Dev Server Startup & Screenshot Capture

**Validate Dev Server:**
```javascript
const server = await mcp.call("ValidateDevServer", {
  app_dir: "/workspace/storefront-next"
});

if (!server.success) {
  // Log errors and stop iteration
  await mcp.call("LogMigrationProgress", {
    subplan_id: current_subplan,
    status: "failed",
    error_message: server.errors.join("\n")
  });
  return;
}
```

**Capture Screenshots:**
```javascript
const screenshots = await mcp.call("CaptureDualScreenshots", {
  feature_id: "01-homepage-hero",
  subplan_id: current_subplan
});

if (!screenshots.success) {
  // Handle screenshot failure
}
```

**Context saved**: ~400 words → ~50 words (90% reduction)

---

## Benefits Analysis

### Context Usage Reduction

| Task | Before (words) | After (words) | Savings |
|------|---------------|---------------|---------|
| Logging progress | ~200 | ~30 | 85% |
| Dev server validation | ~300 | ~40 | 87% |
| Screenshot capture | ~400 | ~50 | 88% |
| Git commit | ~150 | ~30 | 80% |
| Next plan detection | ~200 | ~40 | 80% |
| URL mapping parsing | ~150 | ~30 | 80% |
| **Total per iteration** | **~1,400** | **~220** | **84%** |

**Result**: Each iteration uses ~1,200 fewer words, enabling ~5-6x more iterations per session.

### Reliability Improvements

1. **Consistent Formatting**: No variation in log entries, filenames, commit messages
2. **Error Handling**: Built-in validation and error reporting
3. **Atomic Operations**: Each tool is self-contained and tested
4. **Type Safety**: TypeScript interfaces ensure correct parameters
5. **Idempotency**: Safe to retry on failure

### Developer Experience

1. **Easier Debugging**: Structured errors vs parsing bash output
2. **Faster Iterations**: No waiting for Claude to generate boilerplate
3. **Better Logs**: Consistent format enables automated analysis
4. **Reduced Errors**: No typos in filenames, timestamps, etc.

---

## Testing Strategy

### Unit Tests (Per Tool)

```typescript
describe("LogMigrationProgress", () => {
  it("should append entry to existing log", async () => {
    const result = await LogMigrationProgress({
      subplan_id: "subplan-01-02",
      status: "success",
      notes: "Test"
    });
    expect(result.success).toBe(true);
    // Verify log file contains entry
  });

  it("should create log if doesn't exist", async () => {
    // Delete log file
    const result = await LogMigrationProgress({
      subplan_id: "subplan-01-01",
      status: "started"
    });
    expect(result.success).toBe(true);
    // Verify log file created with header
  });

  it("should update header counts", async () => {
    // Log two successes
    // Verify header shows "Completed: 2 / 6"
  });
});
```

### Integration Tests

```typescript
describe("Migration Loop Integration", () => {
  it("should execute full iteration with MCP tools", async () => {
    // 1. Initialize log
    await CreateMigrationLogHeader({ total_subplans: 6, feature_name: "test" });

    // 2. Get next plan
    const next = await GetNextMicroPlan({});
    expect(next.found).toBe(true);

    // 3. Start server
    const server = await ValidateDevServer({ app_dir: "/workspace/storefront-next" });
    expect(server.success).toBe(true);

    // 4. Capture screenshots
    const screenshots = await CaptureDualScreenshots({
      feature_id: "01-homepage-hero",
      subplan_id: next.subplan_id
    });
    expect(screenshots.success).toBe(true);

    // 5. Commit changes
    const commit = await CommitMigrationProgress({
      subplan_id: next.subplan_id,
      title: next.title
    });
    expect(commit.success).toBe(true);

    // 6. Log success
    const log = await LogMigrationProgress({
      subplan_id: next.subplan_id,
      status: "success"
    });
    expect(log.success).toBe(true);
  });
});
```

---

## Rollout Plan

### Stage 1: Parallel Implementation (Week 1)

- Implement MCP tools alongside existing bash-based approach
- Test tools independently
- Don't modify migration-main-plan.md yet

### Stage 2: Controlled Testing (Week 1)

- Update migration-main-plan.md to use tools
- Run test migration with 1-2 micro-plans
- Compare results with bash-based approach
- Verify logs, screenshots, commits identical

### Stage 3: Production Deployment (Week 2)

- Run full 6-subplan migration using tools
- Monitor for errors
- Collect performance metrics
- Document any edge cases

### Stage 4: Iteration (Week 2)

- Add more tools based on learnings:
  - `RollbackMicroPlan` - undo last iteration
  - `CompareScreenshots` - visual diff
  - `GenerateMigrationReport` - summary report
  - `ValidateMigrationState` - consistency checks

---

## File Structure

```
mcp-server/
├── src/
│   ├── tools/                      # NEW: Modular tool implementations
│   │   ├── types.ts                # TypeScript interfaces
│   │   ├── utils.ts                # Shared utilities (path resolution, normalization)
│   │   ├── intervention.ts         # RequestUserIntervention (extracted)
│   │   ├── logging.ts              # LogMigrationProgress
│   │   ├── dev-server.ts           # ValidateDevServer
│   │   ├── screenshots.ts          # CaptureDualScreenshots
│   │   ├── git.ts                  # CommitMigrationProgress
│   │   ├── navigation.ts           # GetNextMicroPlan
│   │   └── config.ts               # ParseURLMapping
│   ├── intervention-server.ts      # Existing standalone server
│   └── migration-server.ts         # Main MCP server (imports from tools/)
├── tests/
│   ├── migration-tools.test.ts     # Unit tests
│   └── integration.test.ts         # Integration tests
└── package.json                     # Updated with ES modules support
```

---

## Success Metrics

### Quantitative

1. **Context Reduction**: 84% fewer words per iteration
2. **Execution Speed**: 2-3x faster iterations (less parsing/generation)
3. **Error Rate**: < 1% tool failures (vs ~5-10% bash command failures)
4. **Log Consistency**: 100% format compliance (vs ~80-90% manual)

### Qualitative

1. **Maintainability**: Easy to update tool behavior without changing prompts
2. **Debuggability**: Structured errors easier to diagnose
3. **Extensibility**: New tools easy to add
4. **Reliability**: Deterministic operations reduce variability

---

## Next Steps

1. **Create MCP tool stubs**: Set up file structure, TypeScript interfaces
2. **Implement Phase 1**: Logging tools (immediate value)
3. **Test in isolation**: Verify log format, header updates
4. **Update migration-main-plan.md**: Use tools in instructions
5. **Run test migration**: Validate with 1-2 micro-plans
6. **Iterate**: Add remaining tools based on learnings

---

## Atomic Iteration Workflow

### How Tools Work Together

**Key principle**: Tools are **non-blocking**. Failures bubble up to Claude for self-correction, not auto-retried by tools.

```javascript
// ==========================================
// ATOMIC ITERATION (one micro-plan)
// ==========================================

// Step 1: Get next micro-plan
const next = await mcp.call("GetNextMicroPlan", {});
// Returns: { subplan_id, title, content, feature_directory }

// Step 2: Make code changes (Claude's main work)
// Claude edits files based on micro-plan instructions
// ... edit storefront-next/src/routes/_index.tsx ...
// ... edit storefront-next/src/components/Hero.tsx ...

// Step 3: Validate dev server
const server = await mcp.call("ValidateDevServer", {
  app_dir: "/workspace/storefront-next",
  timeout_seconds: 60
});

if (!server.success) {
  // ❌ FAILURE: Bubble to Claude
  console.log("Dev server failed:", server.errors);
  // Claude sees error, fixes compilation issues, retries from Step 2
  return; // Stop iteration, Claude self-corrects
}

// Step 4: Capture screenshots (blocking, required)
const screenshots = await mcp.call("CaptureDualScreenshots", {
  feature_id: "01-homepage-hero",
  subplan_id: next.subplan_id  // Accepts "01-02", normalizes to "subplan-01-02"
});

if (!screenshots.success) {
  // ❌ FAILURE: Bubble to Claude
  console.log("Screenshot capture failed:", screenshots.error);
  // Claude investigates (consent modal? timeout?), fixes, retries from Step 4
  return; // Stop iteration, Claude self-corrects
}

// Step 5: Commit changes (blocking, required)
const commit = await mcp.call("CommitMigrationProgress", {
  subplan_id: next.subplan_id,
  title: next.title
});

if (!commit.success) {
  // ❌ FAILURE: Bubble to Claude
  console.log("Git commit failed:", commit.error);
  // Claude resolves (merge conflict? nothing to commit?), fixes, retries from Step 5
  return; // Stop iteration, Claude self-corrects
}

// Step 6: Log atomic iteration success (ONLY on full completion)
const log = await mcp.call("LogMigrationProgress", {
  subplan_id: next.subplan_id,
  status: "success",
  summary: "Implemented hero section layout matching SFRA baseline",
  source_screenshot_url: screenshots.source_screenshot.url,
  target_screenshot_url: screenshots.target_screenshot.url,
  commit_sha: commit.commit_hash
});

// ✅ ITERATION COMPLETE
// Loop to next micro-plan (Step 1)
```

**Key behaviors**:
1. **No logging on start** - Only log on completion (success/failure)
2. **Non-blocking failures** - Tools return error status, don't retry internally
3. **Claude self-corrects** - Failures bubble to Claude, which analyzes and fixes
4. **Atomic logging** - One consolidated log entry with all metadata
5. **Required steps** - Dev validation, screenshots, commit all blocking (must succeed)

**Total context**: ~250 words (vs ~1,400 words with bash commands)

---

## Appendix: Individual Tool Examples

### Example: LogMigrationProgress (success)

```javascript
await mcp.call("LogMigrationProgress", {
  subplan_id: "01-02",  // Normalized to "subplan-01-02"
  status: "success",
  summary: "Implemented hero section layout matching SFRA baseline",
  source_screenshot_url: "https://zzrf-001.dx.commercecloud.salesforce.com/...",
  target_screenshot_url: "http://localhost:5173",
  commit_sha: "a3f2c1b"
});
// Appends to migration-log.md, updates header counts
```

### Example: LogMigrationProgress (failure)

```javascript
await mcp.call("LogMigrationProgress", {
  subplan_id: "01-02",
  status: "failed",
  summary: "Attempted hero section layout",
  source_screenshot_url: "",
  target_screenshot_url: "",
  commit_sha: "",
  error_message: "Dev server failed: Cannot find module 'react'"
});
// Logs failure immediately, Claude can analyze and retry
```

---

## Design Decisions (Resolved)

1. **Error Recovery**: ✅ Tools auto-retry twice on transient failures, then log failure to migration log
2. **Logging Strategy**: ✅
   - No per-tool logging to separate files
   - Log failures immediately to migration-log.md
   - Hold success logs until atomic iteration completes
   - One consolidated log entry per iteration with:
     - **Timestamp** (when)
     - **Subplan ID** (what)
     - **Summary of changes** (description)
     - **Source Screenshot URL** (SFRA baseline)
     - **Target Screenshot URL** (Storefront Next result)
     - **Git commit SHA** (proof)
3. **Screenshots**: ✅ ~500KB target with compression (lower quality, optimized for dashboard)
4. **Git Strategy**: ✅ Always commit to main (no feature branches)
5. **Input Validation**: ✅ Permissive with normalization
   - Accept `"01-02"` → normalize to `"subplan-01-02"`
   - Accept `"subplan_01_02"` → normalize to `"subplan-01-02"`
   - Smart defaults for optional parameters
   - Strict validation for required data (URLs, paths)
6. **Failure Handling**: ✅ Non-blocking tools, failures bubble to Claude for self-correction
   - Dev server failure → Claude fixes and retries
   - Screenshot failure → Claude investigates and retries
   - Git commit failure → Claude resolves and retries
7. **Screenshot Metadata**: ✅ JSON sidecar files with:
   - `url` - URL captured
   - `filepath` - Path to PNG file
   - `size_bytes` - File size in bytes
   - `feature_id` - Feature identifier
   - `subplan_id` - Subplan identifier
   - `timestamp` - ISO 8601 timestamp
   - `variant` - "source" or "target"

---

## Implementation Status

**Status**: 🚧 Phase 1 Implementation In Progress
**Current Phase**: Core Logging Tools
**Module System**: ES Modules (ESM)
**Next Action**: Implement logging.ts with auto-initialization
**Estimated Time Remaining**: 4-6 hours implementation + 2-3 hours testing
**Expected ROI**: 84% context reduction, 2-3x faster iterations, 5-10x fewer errors

### Implementation Decisions
- ✅ **ES Modules**: Using `"type": "module"` in package.json with .js import extensions
- ✅ **CreateMigrationLogHeader**: Merged into LogMigrationProgress (auto-initialization)
- ✅ **Workspace Path**: Environment variable `WORKSPACE_ROOT` with fallback to `process.cwd()`
- ✅ **Deployment Contexts**: Supports both local Docker + git clone AND headless GitHub Actions
