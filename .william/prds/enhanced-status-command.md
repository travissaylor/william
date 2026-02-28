# PRD: Enhanced Status Command

## Introduction

The `william status` command currently outputs plain, unformatted text with minimal information — just story pass/fail marks and attempt counts. Users have to dig into workspace files (like `progress.txt` or `.stuck-hint.md`) to understand what's actually happening. This feature overhauls both the summary view (all workspaces) and the detailed view (single workspace) with rich terminal UI — box-drawing characters, color-coded sections, progress bars — and surfaces deeper insights like codebase patterns learned, recent agent activity, stuck detection status, elapsed time, cost/token usage, and skip reasons.

## Goals

- Replace plain `console.log` output with a rich, color-coded terminal UI using box-drawing characters and progress bars
- Surface runtime metrics (cost, tokens) in the status command by persisting them to `state.json`
- Display progress.txt insights (codebase patterns learned + recent activity log) in the detailed view
- Show stuck detection status, skip reasons, elapsed time, and story-level timestamps
- Overhaul both the summary view (all workspaces) and the detailed single-workspace view

## User Stories

### US-001: Persist cumulative metrics to state.json

**Description:** As a user, I want runtime metrics (cost, tokens) saved to disk so the status command can display them even when the runner isn't active.

**Acceptance Criteria:**

- [ ] Add `cumulativeCostUsd`, `cumulativeInputTokens`, and `cumulativeOutputTokens` fields to the `WorkspaceState` interface in `src/types.ts`
- [ ] Update `src/runner.ts` to write these cumulative values to `state.json` after each iteration (alongside the existing `saveState` calls)
- [ ] Existing workspaces with no metric fields default to `0` when loaded (no crash on missing fields)
- [ ] `pnpm typecheck` and `pnpm lint` pass

### US-002: Add chalk and create status rendering helpers

**Description:** As a developer, I need a terminal formatting foundation so the status views can use colors, box-drawing characters, and progress bars consistently.

**Acceptance Criteria:**

- [ ] Add `chalk` as a dependency via `pnpm add chalk`
- [ ] Create `src/status/format.ts` with helper functions: `colorForStatus(status)` returns chalk color for running/stopped/paused; `statusBadge(status)` returns a colored, bracketed label like `[● RUNNING]` (green), `[■ STOPPED]` (red), `[⏸ PAUSED]` (yellow); `progressBar(completed, total, width)` returns a filled/empty bar string like `[████░░░░░░]`; `box(title, lines)` returns content wrapped in Unicode box-drawing characters (`┌─┐│└─┘`); `sectionHeader(text)` returns a dimmed separator with a label
- [ ] Helper functions handle edge cases: zero total for progress bar, empty lines for box
- [ ] `pnpm typecheck` and `pnpm lint` pass

### US-003: Parse progress.txt for status display

**Description:** As a developer, I need functions to extract displayable insights from `progress.txt` so the status command can show codebase patterns and recent activity without duplicating parsing logic.

**Acceptance Criteria:**

- [ ] Create `src/status/progress.ts` that exports `parseProgressFile(filePath): ProgressInsights`
- [ ] `ProgressInsights` includes `codebasePatterns: string` (the content under `## Codebase Patterns`, or empty string if `(none yet)` or missing) and `recentEntries: ProgressEntry[]` (last 3 dated entries, each with `date: string`, `storyId: string`, `content: string`)
- [ ] Reuses the same regex patterns from `src/runner.ts` (`extractCodebasePatterns` and `extractRecentLearnings`) — consider extracting the shared logic or importing it
- [ ] Returns sensible defaults when `progress.txt` doesn't exist or is empty
- [ ] `pnpm typecheck` and `pnpm lint` pass

### US-004: Redesign summary view (all workspaces)

**Description:** As a user, I want the `william status` (no args) output to be a visually organized, color-coded overview so I can quickly scan all workspace states at a glance.

**Acceptance Criteria:**

- [ ] Output is grouped by project with a styled project header (e.g., bold project name with a separator line)
- [ ] Each workspace row includes: a colored status badge (`[● RUNNING]` / `[■ STOPPED]` / `[⏸ PAUSED]`), workspace name, a compact progress bar, story count (`3/8 complete`), current story ID (if running), and attempt count for the current story
- [ ] Stuck workspaces (`.stuck-hint.md` exists) show a yellow warning indicator (e.g., `⚠ stuck`) next to the status
- [ ] Paused workspaces show the pause reason if available (from `.paused` file content)
- [ ] Empty state ("No active workspaces.") is preserved
- [ ] Output is readable on standard 80-column terminals (no wrapping)
- [ ] `pnpm typecheck` and `pnpm lint` pass

### US-005: Redesign detailed view — header and metadata

**Description:** As a user, when I run `william status <workspace>`, I want a rich header section showing workspace metadata, elapsed time, and cost so I get a full picture without opening files.

**Acceptance Criteria:**

- [ ] Top section is wrapped in a box with the workspace name as the title
- [ ] Inside the box: status badge (colored), branch name, target directory, PRD file path, started at timestamp (human-readable), elapsed time (e.g., `2h 34m` or `3d 12h` — calculated from `startedAt`), cumulative cost (e.g., `$1.23`), cumulative tokens (e.g., `input: 245K / output: 89K` — formatted with K/M suffixes)
- [ ] Fields are aligned in two columns (label: value) for readability
- [ ] Missing metrics (old workspaces without persisted cost) show `—` instead of `$0.00`
- [ ] `pnpm typecheck` and `pnpm lint` pass

### US-006: Redesign detailed view — story table

**Description:** As a user, I want the story breakdown to be a formatted table with richer per-story information, including timestamps and skip reasons.

**Acceptance Criteria:**

- [ ] Stories are displayed in a table-like format with columns: status icon (colored: green `✓` for passed, red `✗` for failed/pending with attempts, dim `·` for untouched, yellow `⊘` for skipped, cyan `→` for current), story ID, story title (truncated if needed to fit terminal width), attempts count, and completion/skip timestamp (relative, e.g., `2h ago`)
- [ ] The current story row is highlighted (e.g., bold or bright color) with a `→` indicator
- [ ] Skipped stories show the skip reason below the row (indented, dimmed, e.g., `  ⊘ Skipped: stuck after 5 attempts with stuck hint present`)
- [ ] A summary progress bar appears above the table: `Progress [████████░░░░] 8/12 stories  (2 skipped)`
- [ ] `pnpm typecheck` and `pnpm lint` pass

### US-007: Add stuck detection display to detailed view

**Description:** As a user, I want to see stuck detection status prominently so I know if and why the agent is struggling, without having to check `.stuck-hint.md` manually.

**Acceptance Criteria:**

- [ ] When `.stuck-hint.md` exists in the workspace directory, a yellow warning box appears in the detailed view between the header and story table
- [ ] The warning box shows: the stuck story ID, the reason from the hint file (first line of `## Reason` section), the escalation level (e.g., `Hint written — will skip after 2 more failed attempts` or `Approaching skip — 1 attempt remaining`), and the number of attempts so far
- [ ] When no `.stuck-hint.md` exists, this section is not shown at all (no empty box)
- [ ] `pnpm typecheck` and `pnpm lint` pass

### US-008: Add progress.txt insights panel to detailed view

**Description:** As a user, I want to see what the agent has learned (codebase patterns) and what it's been doing recently (activity log) so I get qualitative insight beyond just pass/fail counts.

**Acceptance Criteria:**

- [ ] A "Codebase Patterns" section appears after the story table, showing the content extracted from `progress.txt`'s `## Codebase Patterns` section
- [ ] If patterns are `(none yet)` or empty, this section is hidden entirely
- [ ] A "Recent Activity" section shows the last 3 dated entries from `progress.txt`, each with its date and story ID as a sub-header and the content below (truncated to ~4 lines per entry to keep output manageable)
- [ ] If no dated entries exist, this section is hidden
- [ ] Content is displayed with dimmed formatting to visually separate it from the structured data above
- [ ] `pnpm typecheck` and `pnpm lint` pass

### US-009: Wire up status views in CLI

**Description:** As a developer, I need to replace the existing status command logic in `src/cli.ts` with the new rendering functions so everything is connected.

**Acceptance Criteria:**

- [ ] The status command action in `src/cli.ts` calls into the new `src/status/` module functions instead of inline `console.log` calls
- [ ] Summary view (no args) uses the new formatted summary renderer
- [ ] Detailed view (workspace name arg) uses the new formatted detail renderer
- [ ] The old inline rendering code in the status action is fully removed
- [ ] Error handling is preserved (unknown workspace, missing state.json)
- [ ] `pnpm typecheck` and `pnpm lint` pass

## Functional Requirements

- FR-1: The `WorkspaceState` interface must include optional `cumulativeCostUsd`, `cumulativeInputTokens`, and `cumulativeOutputTokens` number fields
- FR-2: The runner must persist cumulative cost and token counts to `state.json` after each iteration
- FR-3: Loading a `state.json` without metric fields must default them to `0` without errors
- FR-4: The status command must use `chalk` for terminal colors — green for running/passed, red for stopped/failed, yellow for paused/skipped/stuck, cyan for current story, dim for secondary info
- FR-5: All status output must use Unicode box-drawing characters (`┌ ─ ┐ │ └ ┘`) for section borders
- FR-6: Progress bars must use block characters (`█` for filled, `░` for empty) and show completion as fraction
- FR-7: Status badges must be color-coded with an icon: `[● RUNNING]` green, `[■ STOPPED]` red, `[⏸ PAUSED]` yellow
- FR-8: Elapsed time must be calculated from `state.startedAt` and displayed in human-readable format (e.g., `2h 34m`, `3d 12h`)
- FR-9: Token counts must be formatted with K/M suffixes (e.g., `245K`, `1.2M`)
- FR-10: The summary view must detect stuck workspaces by checking for `.stuck-hint.md` file presence
- FR-11: The detailed view must parse `.stuck-hint.md` to extract the reason and display escalation level based on current attempt count
- FR-12: The detailed view must parse `progress.txt` to extract codebase patterns and the last 3 dated activity entries
- FR-13: All output must be readable on a standard 80-column terminal without wrapping

## Non-Goals

- No interactive/live-updating status (this is a one-shot CLI command, not an ink app)
- No changes to the runner's TUI dashboard (`src/ui/`) — that remains a separate React/ink component
- No new CLI flags or subcommands (e.g., `--json` output format) — this is purely a visual overhaul
- No changes to how `progress.txt` is written by the agent
- No changes to stuck detection logic itself — only surfacing existing data
- No per-story cost tracking (cumulative workspace cost only)

## Technical Considerations

- `chalk` should be added as a dependency — it's already an indirect dependency via `ink` but should be declared directly for the status module
- The progress.txt parsing functions in `runner.ts` (`extractCodebasePatterns`, `extractRecentLearnings`) contain regex logic that should either be extracted to a shared module or duplicated in `src/status/progress.ts` — prefer extracting to avoid drift
- The `WorkspaceState` type change is additive (optional fields), so existing `state.json` files remain compatible
- The `getWorkspaceStatus` function in `src/workspace.ts` may need to be extended to return additional data (stuck status, progress insights, metrics), or the status rendering module can read these directly from the workspace directory
- Box-drawing output should account for terminals that don't support Unicode — but since the existing codebase already uses Unicode symbols (`✓`, `⊘`, `·`), this is an accepted baseline

## Success Metrics

- Status output is immediately scannable — a user can identify which workspaces need attention within 2 seconds
- Stuck workspaces are visually prominent without requiring manual file inspection
- Users no longer need to `cat progress.txt` or `cat .stuck-hint.md` separately to understand agent state
- Output fits within 80 columns without horizontal scrolling or wrapping

## Open Questions

- Should we consider `chalk`'s `level` detection for CI environments where color isn't supported, or rely on chalk's built-in auto-detection?
- Should the progress.txt parsing logic be extracted from `runner.ts` into a shared module, or is it acceptable to have it exist in both places?
- Should story titles in the detailed view be pulled from the parsed PRD (requires re-parsing `prd.md`) or just show the story ID? Currently, titles aren't stored in `state.json`.
