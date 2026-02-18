import { describe, it, expect } from 'vitest';
import { parsePrd } from './parser.js';

// Small PRD (< 10KB) with all optional sections populated
const SMALL_PRD_WITH_ALL_SECTIONS = `# PRD: Test Feature

## Introduction

This feature adds something useful to the application. It improves the user experience significantly.

## Goals

- Improve user experience
- Reduce friction in the workflow
- Enable faster task completion

## Non-Goals

- Not changing the database schema
- Not modifying legacy components

## User Stories

### US-001: First user story
**Description:** As a user, I want to do something useful so I can accomplish my goals.

**Acceptance Criteria:**
- [ ] Criteria one is met
- [ ] Criteria two is met

### US-002: Second user story
**Description:** As a developer, I want clean code so future development is easier.

**Acceptance Criteria:**
- [ ] Refactored properly
- [ ] Tests updated

## Functional Requirements

- FR-1: System must respond within 200ms
- FR-2: Input must be validated before processing

## Technical Considerations

Use the existing utility functions where possible. Avoid introducing new dependencies.

## Design Considerations

Follow the existing design system and component patterns.

## Success Metrics

- Response time < 200ms for all user actions
- Zero regression bugs introduced

## Open Questions

- Should we also support dark mode in this iteration?
- What is the expected scale?
`;

// PRD where all stories lack explicit US-XXX IDs
const PRD_WITH_NO_IDS = `# PRD: No ID Stories

## Introduction

A PRD where stories have no explicit US-XXX IDs.

## User Stories

### Create the table
**Description:** As a developer, I need to create the database table.

**Acceptance Criteria:**
- [ ] Table created with correct schema
- [ ] Migration runs without errors

### Seed the data
**Description:** As a developer, I need to seed initial data.

**Acceptance Criteria:**
- [ ] Data seeded correctly

### Write the tests
**Description:** As a developer, I need to write unit tests.

**Acceptance Criteria:**
- [ ] Tests written and passing
`;

// Minimal PRD missing the optional sections (designConsiderations, openQuestions)
const PRD_MISSING_OPTIONAL_SECTIONS = `# PRD: Minimal Feature

## Introduction

A minimal PRD that only has required sections.

## Goals

- One goal

## User Stories

### US-001: Only story
**Description:** As a user, I want something.

**Acceptance Criteria:**
- [ ] Done

## Technical Considerations

Some technical notes.
`;

// Large PRD (> 10KB) mirroring prd-revision-analysis-performance.md structure
// with 4 phases and 13 stories (US-001 through US-013)
function buildLargePrd(): string {
  const base = `# PRD: Revision Analysis Performance Optimization

## Introduction

The narrative and visual comparison pages experience severe performance degradation when handling revision analyses with thousands of comparisons. The root cause is that the current GetRevisionAnalysisDetail endpoint returns all drawings, comparisons, and changes in a single response—which can result in 10,000+ objects loaded into memory at once.

This PRD outlines a phased approach to progressively load data, implement server-side pagination/sorting/filtering, and defer detailed data fetching until user action requires it. The narrative page will be addressed first as it is the most problematic.

## Goals

- Reduce initial page load data by 80%+ for analyses with thousands of comparisons
- Enable the narrative page to remain responsive with analyses containing 5,000+ changes
- Enable the visual comparison page to remain responsive with 500+ drawings
- Implement server-side pagination for endpoints returning potentially large datasets
- Defer loading of detailed data until user interaction requires it

## User Stories

### Phase 1: Narrative Page Optimization

#### US-001: Create v2 routes directory and base setup
**Description:** As a developer, I need a v2 routes directory to organize all new optimized endpoints separately from the existing v1 implementation.

**Acceptance Criteria:**
- [ ] New directory created at src/routes/agents/revision-analyses/v2/
- [ ] Routes file created and mounted correctly
- [ ] Typecheck/lint passes

#### US-002: Create paginated changes endpoint
**Description:** As a developer, I need a new endpoint that returns changes with server-side pagination so the client can progressively load changes instead of receiving all at once.

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
**Description:** As a developer, I need a new endpoint that returns drawings with pagination so the sidebar can progressively load drawings.

**Acceptance Criteria:**
- [ ] New endpoint created with correct URL pattern
- [ ] Supports pagination params: page, pageSize, sortField, sortOrder
- [ ] Typecheck/lint passes

#### US-005: Create data hooks for paginated endpoints
**Description:** As a frontend developer, I need React Query hooks for the new paginated endpoints so components can easily consume paginated data.

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
**Description:** As a user, I want the visual comparison sidebar to load quickly and scroll smoothly with large analyses containing hundreds of drawings.

**Acceptance Criteria:**
- [ ] Sidebar uses virtual scrolling for the drawing list
- [ ] Discipline grouping maintained within virtualized list
- [ ] Typecheck/lint passes

#### US-008: Lazy load comparison detail on drawing selection
**Description:** As a user, I want to see drawing details load only when I select a drawing so the page does not freeze loading unused data.

**Acceptance Criteria:**
- [ ] Comparison details fetched when drawing is selected
- [ ] Loading skeleton shown while comparison loads
- [ ] Typecheck/lint passes

### Phase 3: Feature Flag and Code Separation

#### US-009: Create feature flag for optimized revision analysis pages
**Description:** As a developer, I need a feature flag to control whether users see the new optimized pages or the existing implementation.

**Acceptance Criteria:**
- [ ] Feature flag added to FlagKey enum
- [ ] Flag created in Flipt configuration
- [ ] Typecheck/lint passes

#### US-010: Create separate component directory for optimized implementations
**Description:** As a developer, I need the new optimized components to live in a completely separate directory from the existing implementation.

**Acceptance Criteria:**
- [ ] New directory created at src/components/RevisionAnalysis/v2/
- [ ] No cross-imports between v1 and v2 components
- [ ] Typecheck/lint passes

#### US-011: Create optimized data hooks in separate module
**Description:** As a developer, I need the new paginated data hooks to be organized separately so they do not conflict with existing hooks.

**Acceptance Criteria:**
- [ ] New file created at src/dataHooks/revision-analysis-v2.dataHook.ts
- [ ] All new hooks contained in the separate module
- [ ] Typecheck/lint passes

### Phase 4: Shared Infrastructure

#### US-012: Add cursor-based pagination option for large datasets
**Description:** As a developer, I need cursor-based pagination for endpoints that may have rapidly changing data to ensure consistent pagination results.

**Acceptance Criteria:**
- [ ] New pagination mode using cursor query param
- [ ] Cursor encodes sort position for stable pagination
- [ ] Typecheck/lint passes

#### US-013: Add prefetching for adjacent pages
**Description:** As a user, I want navigation between pages to feel instant so pagination does not interrupt my workflow.

**Acceptance Criteria:**
- [ ] Hooks prefetch next page when current page loads
- [ ] Prefetched data available in cache when navigating forward
- [ ] Typecheck/lint passes

## Functional Requirements

- FR-1: All new endpoints use /api/agents/revision/v2/ URL prefix to separate from existing v1 endpoints
- FR-2: New summary endpoint returns analysis metadata and aggregates without embedded collections
- FR-3: New drawings endpoint returns paginated drawings with filtering support

## Non-Goals

- No changes to the revision analysis processing pipeline
- No changes to how data is stored in the database
- No virtualization for ChangeSidebar
- No real-time updates or WebSocket integration

## Technical Considerations

Paginated queries should use OFFSET/LIMIT or cursor-based patterns. Add database indexes if needed for common filter combinations such as revision_change(revision_comparison_id, change_status) and revision_drawing(revision_analysis_id, discipline). Use COUNT(*) with same filters for total_count and consider caching for large datasets. The SearchRevisionAnalysesController has an existing pagination pattern to follow when implementing new paginated endpoints.`;

  const byteLen = Buffer.byteLength(base, 'utf8');
  if (byteLen < 10_241) {
    return base + '\n\n' + ' '.repeat(10_241 - byteLen);
  }
  return base;
}

const LARGE_PRD_MARKDOWN = buildLargePrd();

describe('parsePrd', () => {
  describe('small PRD with all sections', () => {
    it('extracts the document title from the H1 heading', () => {
      const result = parsePrd(SMALL_PRD_WITH_ALL_SECTIONS);
      expect(result.title).toBe('PRD: Test Feature');
    });

    it('populates all section fields with non-empty content', () => {
      const result = parsePrd(SMALL_PRD_WITH_ALL_SECTIONS);
      expect(result.introduction).not.toBe('');
      expect(result.goals).not.toBe('');
      expect(result.nonGoals).not.toBe('');
      expect(result.technicalConsiderations).not.toBe('');
      expect(result.functionalRequirements).not.toBe('');
      expect(result.designConsiderations).not.toBe('');
      expect(result.successMetrics).not.toBe('');
      expect(result.openQuestions).not.toBe('');
    });

    it('parses stories with correct count and IDs', () => {
      const result = parsePrd(SMALL_PRD_WITH_ALL_SECTIONS);
      expect(result.stories).toHaveLength(2);
      expect(result.stories[0].id).toBe('US-001');
      expect(result.stories[1].id).toBe('US-002');
    });

    it('extracts story titles correctly', () => {
      const result = parsePrd(SMALL_PRD_WITH_ALL_SECTIONS);
      expect(result.stories[0].title).toBe('First user story');
      expect(result.stories[1].title).toBe('Second user story');
    });

    it('extracts story description and acceptance criteria', () => {
      const result = parsePrd(SMALL_PRD_WITH_ALL_SECTIONS);
      const story = result.stories[0];
      expect(story.description).toContain('As a user');
      expect(story.acceptanceCriteria).toHaveLength(2);
      expect(story.acceptanceCriteria[0]).toContain('Criteria one is met');
    });

    it('includes full rawMarkdown for each story', () => {
      const result = parsePrd(SMALL_PRD_WITH_ALL_SECTIONS);
      expect(result.stories[0].rawMarkdown).toContain('US-001');
      expect(result.stories[0].rawMarkdown).toContain('Acceptance Criteria');
    });
  });

  describe('large PRD with phases (prd-revision-analysis-performance.md structure)', () => {
    it('parses exactly 13 stories', () => {
      const result = parsePrd(LARGE_PRD_MARKDOWN);
      expect(result.stories).toHaveLength(13);
    });

    it('assigns correct US-XXX IDs in sequential order', () => {
      const result = parsePrd(LARGE_PRD_MARKDOWN);
      const ids = result.stories.map((s) => s.id);
      expect(ids).toEqual([
        'US-001',
        'US-002',
        'US-003',
        'US-004',
        'US-005',
        'US-006',
        'US-007',
        'US-008',
        'US-009',
        'US-010',
        'US-011',
        'US-012',
        'US-013',
      ]);
    });

    it('skips phase headers and does not treat them as stories', () => {
      const result = parsePrd(LARGE_PRD_MARKDOWN);
      const titles = result.stories.map((s) => s.title);
      // Phase headers like "Phase 1: Narrative Page Optimization" should not appear as story titles
      expect(titles).not.toContain('Narrative Page Optimization');
      expect(titles).not.toContain('Visual Comparison Page Optimization');
      expect(titles).not.toContain('Feature Flag and Code Separation');
      expect(titles).not.toContain('Shared Infrastructure');
    });

    it('extracts non-goals section from large PRD', () => {
      const result = parsePrd(LARGE_PRD_MARKDOWN);
      expect(result.nonGoals).toContain('No changes to the revision analysis processing pipeline');
    });
  });

  describe('stories without explicit US-XXX IDs', () => {
    it('assigns sequential IDs starting from US-001', () => {
      const result = parsePrd(PRD_WITH_NO_IDS);
      expect(result.stories).toHaveLength(3);
      expect(result.stories[0].id).toBe('US-001');
      expect(result.stories[1].id).toBe('US-002');
      expect(result.stories[2].id).toBe('US-003');
    });

    it('uses the heading text as the story title', () => {
      const result = parsePrd(PRD_WITH_NO_IDS);
      expect(result.stories[0].title).toBe('Create the table');
      expect(result.stories[1].title).toBe('Seed the data');
      expect(result.stories[2].title).toBe('Write the tests');
    });
  });

  describe('missing optional sections', () => {
    it('defaults designConsiderations to empty string when section is absent', () => {
      const result = parsePrd(PRD_MISSING_OPTIONAL_SECTIONS);
      expect(result.designConsiderations).toBe('');
    });

    it('defaults openQuestions to empty string when section is absent', () => {
      const result = parsePrd(PRD_MISSING_OPTIONAL_SECTIONS);
      expect(result.openQuestions).toBe('');
    });

    it('does not crash and still parses present sections', () => {
      const result = parsePrd(PRD_MISSING_OPTIONAL_SECTIONS);
      expect(result.title).toBe('PRD: Minimal Feature');
      expect(result.introduction).not.toBe('');
      expect(result.stories).toHaveLength(1);
      expect(result.stories[0].id).toBe('US-001');
    });
  });
});
