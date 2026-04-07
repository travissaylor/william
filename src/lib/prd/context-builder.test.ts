import { describe, it, expect } from "vitest";
import { buildContext } from "./context-builder.js";
import { parsePrd } from "./parser.js";
import type { WorkspaceState } from "../types.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

// Small PRD (< 10KB): the full content should be injected verbatim
const SMALL_PRD_MARKDOWN = `# PRD: Small Feature

## Introduction

A simple feature that fits within the 10KB threshold.

## Goals

- Do the thing

## Non-Goals

- Not doing other things

## User Stories

### US-001: First story
**Description:** As a user, I want to do something.

**Acceptance Criteria:**
- [ ] It works

### US-002: Second story
**Description:** As a developer, I want clean code.

**Acceptance Criteria:**
- [ ] Clean code achieved
`;

// Large PRD (> 10KB): selective injection based on parsed sections
// This mirrors the prd-revision-analysis-performance.md structure
function buildLargePrd(): string {
  const base = `# PRD: Revision Analysis Performance Optimization

## Introduction

The narrative and visual comparison pages experience severe performance degradation when handling revision analyses with thousands of comparisons. The root cause is that the current GetRevisionAnalysisDetail endpoint returns all drawings, comparisons, and changes in a single response.

## Goals

- Reduce initial page load data by 80%+ for analyses with thousands of comparisons
- Enable the narrative page to remain responsive with analyses containing 5,000+ changes

## User Stories

### Phase 1: Narrative Page Optimization

#### US-001: Create v2 routes directory and base setup
**Description:** As a developer, I need a v2 routes directory to organize all new optimized endpoints separately from the existing v1 implementation.

**Acceptance Criteria:**
- [ ] New directory created at src/routes/agents/revision-analyses/v2/
- [ ] Routes file created and mounted correctly
- [ ] Typecheck/lint passes

#### US-002: Create paginated changes endpoint
**Description:** As a developer, I need a new endpoint that returns changes with server-side pagination so the client can progressively load changes.

**Acceptance Criteria:**
- [ ] New endpoint created with correct URL pattern
- [ ] Supports filtering by change_status
- [ ] Typecheck/lint passes

#### US-003: Create lightweight analysis summary endpoint
**Description:** As a developer, I need an endpoint that returns only the essential analysis metadata without embedded comparisons or changes.

**Acceptance Criteria:**
- [ ] New endpoint returns analysis metadata without embedded collections
- [ ] Response size under 5KB for any analysis
- [ ] Typecheck/lint passes

#### US-004: Create paginated drawings endpoint
**Description:** As a developer, I need a new endpoint that returns drawings with pagination.

**Acceptance Criteria:**
- [ ] New endpoint created with correct URL pattern
- [ ] Supports pagination params: page, pageSize, sortField, sortOrder
- [ ] Typecheck/lint passes

#### US-005: Create data hooks for paginated endpoints
**Description:** As a frontend developer, I need React Query hooks for the new paginated endpoints.

**Acceptance Criteria:**
- [ ] useRevisionAnalysisSummary hook created
- [ ] usePaginatedDrawings hook created
- [ ] usePaginatedChanges hook created
- [ ] Typecheck/lint passes

#### US-006: Refactor narrative page to use progressive loading
**Description:** As a user, I want the narrative page to load quickly and progressively fetch additional data so I can start reading immediately.

**Acceptance Criteria:**
- [ ] Page loads using summary endpoint
- [ ] Drawing list loads with pagination on initial load
- [ ] Typecheck/lint passes

### Phase 2: Visual Comparison Page Optimization

#### US-007: Implement virtualized drawing sidebar with discipline grouping
**Description:** As a user, I want the visual comparison sidebar to load quickly and scroll smoothly with large analyses.

**Acceptance Criteria:**
- [ ] Sidebar uses virtual scrolling for the drawing list
- [ ] Discipline grouping maintained within virtualized list
- [ ] Typecheck/lint passes

#### US-008: Lazy load comparison detail on drawing selection
**Description:** As a user, I want to see drawing details load only when I select a drawing.

**Acceptance Criteria:**
- [ ] Comparison details fetched when drawing is selected
- [ ] Loading skeleton shown while comparison loads
- [ ] Typecheck/lint passes

### Phase 3: Feature Flag and Code Separation

#### US-009: Create feature flag for optimized revision analysis pages
**Description:** As a developer, I need a feature flag to control whether users see the new optimized pages.

**Acceptance Criteria:**
- [ ] Feature flag added to FlagKey enum
- [ ] Flag created in Flipt configuration
- [ ] Typecheck/lint passes

#### US-010: Create separate component directory for optimized implementations
**Description:** As a developer, I need the new optimized components to live in a completely separate directory.

**Acceptance Criteria:**
- [ ] New directory created at src/components/RevisionAnalysis/v2/
- [ ] No cross-imports between v1 and v2 components
- [ ] Typecheck/lint passes

#### US-011: Create optimized data hooks in separate module
**Description:** As a developer, I need the new paginated data hooks to be organized separately.

**Acceptance Criteria:**
- [ ] New file created at src/dataHooks/revision-analysis-v2.dataHook.ts
- [ ] All new hooks contained in the separate module
- [ ] Typecheck/lint passes

### Phase 4: Shared Infrastructure

#### US-012: Add cursor-based pagination option for large datasets
**Description:** As a developer, I need cursor-based pagination for endpoints that may have rapidly changing data.

**Acceptance Criteria:**
- [ ] New pagination mode using cursor query param
- [ ] Cursor encodes sort position for stable pagination
- [ ] Typecheck/lint passes

#### US-013: Add prefetching for adjacent pages
**Description:** As a user, I want navigation between pages to feel instant.

**Acceptance Criteria:**
- [ ] Hooks prefetch next page when current page loads
- [ ] Prefetched data available in cache when navigating forward
- [ ] Typecheck/lint passes

## Functional Requirements

- FR-1: All new endpoints use /api/agents/revision/v2/ URL prefix
- FR-2: New summary endpoint returns analysis metadata without embedded collections

## Non-Goals

- No changes to the revision analysis processing pipeline
- No changes to how data is stored in the database
- No virtualization for ChangeSidebar
- No real-time updates or WebSocket integration

## Technical Considerations

Paginated queries should use OFFSET/LIMIT or cursor-based patterns. Add database indexes if needed for common filter combinations. Use COUNT(*) with same filters for total_count and consider caching for large datasets.`;

  const byteLen = Buffer.byteLength(base, "utf8");
  if (byteLen < 10_241) {
    return base + "\n\n" + " ".repeat(10_241 - byteLen);
  }
  return base;
}

const LARGE_PRD_MARKDOWN = buildLargePrd();

// Progress text with Codebase Patterns section and recent entries
const SAMPLE_PROGRESS_TXT = `## Codebase Patterns
- Always use strict TypeScript types throughout the codebase
- Follow existing naming conventions for controllers and routes

## 2024-01-15 - US-003
- Implemented summary endpoint returning analysis metadata
- Files changed: GetRevisionAnalysisSummaryController.ts
---

## 2024-01-16 - US-004
- Implemented paginated drawings endpoint with filtering
- Files changed: GetPaginatedDrawingsController.ts
---

## 2024-01-17 - US-005
- Added React Query hooks for paginated endpoints
- Files changed: revision-analysis-v2.dataHook.ts
---
`;

// WorkspaceState for large PRD tests:
// US-001 through US-004 completed, US-005 current, US-006+ pending
// Previous 2 completed stories before US-005: US-003, US-004
const LARGE_PRD_STATE: WorkspaceState = {
  workspace: "test-ws",
  project: "test-project",
  targetDir: "/tmp/test-project",
  branchName: "feature/test",
  sourceFile: "prd-revision-analysis-performance.md",
  startedAt: "2024-01-01T00:00:00Z",
  currentStory: "US-005",
  stories: {
    "US-001": { passes: true, attempts: 1, completedAt: "2024-01-01" },
    "US-002": { passes: true, attempts: 1, completedAt: "2024-01-02" },
    "US-003": { passes: true, attempts: 1, completedAt: "2024-01-03" },
    "US-004": { passes: true, attempts: 1, completedAt: "2024-01-04" },
    "US-005": { passes: false, attempts: 1 },
    "US-006": { passes: false, attempts: 0 },
    "US-007": { passes: false, attempts: 0 },
    "US-008": { passes: false, attempts: 0 },
    "US-009": { passes: false, attempts: 0 },
    "US-010": { passes: false, attempts: 0 },
    "US-011": { passes: false, attempts: 0 },
    "US-012": { passes: false, attempts: 0 },
    "US-013": { passes: false, attempts: 0 },
  },
};

// WorkspaceState for small PRD tests
const SMALL_PRD_STATE: WorkspaceState = {
  workspace: "small-ws",
  project: "small-project",
  targetDir: "/tmp/small-project",
  branchName: "feature/small",
  sourceFile: "prd-small.md",
  startedAt: "2024-01-01T00:00:00Z",
  currentStory: "US-001",
  stories: {
    "US-001": { passes: false, attempts: 0 },
    "US-002": { passes: false, attempts: 0 },
  },
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("buildContext - large PRD (≥ 10KB)", () => {
  const parsedPrd = parsePrd(LARGE_PRD_MARKDOWN);

  it("assembled output includes the non-goals section", () => {
    const output = buildContext({
      parsedPrd,
      rawMarkdown: LARGE_PRD_MARKDOWN,
      state: LARGE_PRD_STATE,
      progressTxt: "",
    });
    expect(output).toContain("## Non-Goals");
    expect(output).toContain(
      "No changes to the revision analysis processing pipeline",
    );
  });

  it("does NOT include full criteria for completed stories outside the previous 2", () => {
    // US-001 and US-002 are completed but are not in the "previous 2" window
    // (US-003 and US-004 are the previous 2 before US-005 current)
    const output = buildContext({
      parsedPrd,
      rawMarkdown: LARGE_PRD_MARKDOWN,
      state: LARGE_PRD_STATE,
      progressTxt: "",
    });
    // US-001 acceptance criteria text should NOT appear in full
    expect(output).not.toContain("Routes file created and mounted correctly");
    // US-002 acceptance criteria text should NOT appear in full
    expect(output).not.toContain("Supports filtering by change_status");
  });

  it("previous 2 completed stories appear with their full rawMarkdown", () => {
    // US-003 and US-004 are the 2 most recent completed stories before the current
    const output = buildContext({
      parsedPrd,
      rawMarkdown: LARGE_PRD_MARKDOWN,
      state: LARGE_PRD_STATE,
      progressTxt: "",
    });
    // US-003 acceptance criteria should appear
    expect(output).toContain("Response size under 5KB for any analysis");
    // US-004 acceptance criteria should appear
    expect(output).toContain(
      "Supports pagination params: page, pageSize, sortField, sortOrder",
    );
    // They appear under "Previously Completed" headings
    expect(output).toContain("## Previously Completed: US-003");
    expect(output).toContain("## Previously Completed: US-004");
  });

  it("current story full rawMarkdown is present in output", () => {
    const output = buildContext({
      parsedPrd,
      rawMarkdown: LARGE_PRD_MARKDOWN,
      state: LARGE_PRD_STATE,
      progressTxt: "",
    });
    expect(output).toContain("## Current Story");
    // US-005 acceptance criteria text should appear
    expect(output).toContain("useRevisionAnalysisSummary hook created");
  });

  it("next 2 upcoming stories appear with title+description only, no acceptance criteria", () => {
    // After US-005 (current), the next 2 pending stories are US-006 and US-007
    const output = buildContext({
      parsedPrd,
      rawMarkdown: LARGE_PRD_MARKDOWN,
      state: LARGE_PRD_STATE,
      progressTxt: "",
    });
    // US-006 upcoming section present
    expect(output).toContain("US-006");
    // US-006 description should appear
    expect(output).toContain("progressively fetch additional data");
    // US-007 upcoming section present
    expect(output).toContain("US-007");

    // US-006 acceptance criteria should NOT appear in the upcoming section
    expect(output).not.toContain("Page loads using summary endpoint");
    // US-007 acceptance criteria should NOT appear in the upcoming section
    expect(output).not.toContain(
      "Loading skeleton shown while comparison loads",
    );
  });
});

describe("buildContext - small PRD (< 10KB)", () => {
  const parsedPrd = parsePrd(SMALL_PRD_MARKDOWN);

  it("includes the full raw markdown content verbatim", () => {
    const output = buildContext({
      parsedPrd,
      rawMarkdown: SMALL_PRD_MARKDOWN,
      state: SMALL_PRD_STATE,
      progressTxt: "",
    });
    // The entire raw markdown should appear in the output
    expect(output).toContain(SMALL_PRD_MARKDOWN);
  });

  it("full content appears even when progressTxt is empty", () => {
    const output = buildContext({
      parsedPrd,
      rawMarkdown: SMALL_PRD_MARKDOWN,
      state: SMALL_PRD_STATE,
      progressTxt: "",
    });
    expect(output).toContain("# PRD: Small Feature");
    expect(output).toContain("US-001: First story");
    expect(output).toContain("US-002: Second story");
  });
});

describe("buildContext - stuck hint", () => {
  const smallParsed = parsePrd(SMALL_PRD_MARKDOWN);
  const largeParsed = parsePrd(LARGE_PRD_MARKDOWN);

  it("appears under ## Stuck Recovery Hint heading when provided (small PRD)", () => {
    const hint =
      "Try a completely different approach to the database migration.";
    const output = buildContext({
      parsedPrd: smallParsed,
      rawMarkdown: SMALL_PRD_MARKDOWN,
      state: SMALL_PRD_STATE,
      progressTxt: "",
      stuckHint: hint,
    });
    expect(output).toContain(`## Stuck Recovery Hint\n\n${hint}`);
  });

  it("appears under ## Stuck Recovery Hint heading when provided (large PRD)", () => {
    const hint =
      "The endpoint returns 500 — check the database connection string.";
    const output = buildContext({
      parsedPrd: largeParsed,
      rawMarkdown: LARGE_PRD_MARKDOWN,
      state: LARGE_PRD_STATE,
      progressTxt: "",
      stuckHint: hint,
    });
    expect(output).toContain(`## Stuck Recovery Hint\n\n${hint}`);
  });

  it("is omitted from output when not provided", () => {
    const output = buildContext({
      parsedPrd: smallParsed,
      rawMarkdown: SMALL_PRD_MARKDOWN,
      state: SMALL_PRD_STATE,
      progressTxt: "",
    });
    expect(output).not.toContain("## Stuck Recovery Hint");
  });
});

describe("buildContext - codebase patterns from progressTxt", () => {
  const smallParsed = parsePrd(SMALL_PRD_MARKDOWN);
  const largeParsed = parsePrd(LARGE_PRD_MARKDOWN);

  it("includes the Codebase Patterns section in output for small PRD", () => {
    const output = buildContext({
      parsedPrd: smallParsed,
      rawMarkdown: SMALL_PRD_MARKDOWN,
      state: SMALL_PRD_STATE,
      progressTxt: SAMPLE_PROGRESS_TXT,
    });
    expect(output).toContain("## Codebase Patterns");
    expect(output).toContain(
      "Always use strict TypeScript types throughout the codebase",
    );
  });

  it("includes the Codebase Patterns section in output for large PRD", () => {
    const output = buildContext({
      parsedPrd: largeParsed,
      rawMarkdown: LARGE_PRD_MARKDOWN,
      state: LARGE_PRD_STATE,
      progressTxt: SAMPLE_PROGRESS_TXT,
    });
    expect(output).toContain("## Codebase Patterns");
    expect(output).toContain(
      "Always use strict TypeScript types throughout the codebase",
    );
  });

  it("includes the last 3 progress entries from progressTxt", () => {
    const output = buildContext({
      parsedPrd: smallParsed,
      rawMarkdown: SMALL_PRD_MARKDOWN,
      state: SMALL_PRD_STATE,
      progressTxt: SAMPLE_PROGRESS_TXT,
    });
    expect(output).toContain("## Recent Progress");
    expect(output).toContain("2024-01-15 - US-003");
    expect(output).toContain("2024-01-16 - US-004");
    expect(output).toContain("2024-01-17 - US-005");
  });

  it("omits Codebase Patterns section when progressTxt has no patterns", () => {
    const progressWithoutPatterns = `## 2024-01-15 - US-001
- Implemented something
---
`;
    const output = buildContext({
      parsedPrd: smallParsed,
      rawMarkdown: SMALL_PRD_MARKDOWN,
      state: SMALL_PRD_STATE,
      progressTxt: progressWithoutPatterns,
    });
    expect(output).not.toContain("## Codebase Patterns");
  });
});
