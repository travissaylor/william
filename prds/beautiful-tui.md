# PRD: Beautiful TUI for `william start`

## Introduction

Replace the plain `console.log` output of `william start` with a rich Terminal User Interface (TUI) built on Ink (React for the terminal). The current experience dumps unformatted text in a single color, making it hard to track progress, distinguish between output types, or tell if the system is actively working. The TUI will add a sticky dashboard header, a spinner for thinking states, rendered markdown output, color-coded sections, and a scrolling log — all display-only (no keyboard interactivity beyond Ctrl+C to quit).

## Goals

- Show a persistent sticky dashboard with current story, progress bar, cost, iteration count, files changed, elapsed time, and stuck status
- Display a spinner/activity indicator while Claude is thinking (between visible outputs)
- Render Claude's markdown output with syntax highlighting and formatting in the terminal
- Use color and visual hierarchy to distinguish different output types (assistant text, tool calls, errors, system messages)
- Keep the TUI display-only — no interactive keyboard controls beyond standard terminal behavior
- Preserve all existing logging to NDJSON files (the TUI is a display layer, not a replacement for file logging)

## User Stories

### US-001: Create Ink app shell and mount it from `william start`
**Description:** As a developer, I want the `william start` command to render an Ink React app instead of raw `console.log` so that all output flows through a structured TUI layout.

**Acceptance Criteria:**
- [ ] New `src/ui/` directory with an Ink `<App>` root component
- [ ] `william start` renders the Ink app using `render()` from ink
- [ ] The Ink app receives workspace state, adapter, and run options as props or context
- [ ] All existing `console.log` / `process.stdout.write` calls in `runner.ts` and `consume.ts` are replaced with state updates that the Ink app renders
- [ ] NDJSON file logging continues to work exactly as before
- [ ] Typecheck passes

### US-002: Sticky dashboard header
**Description:** As a user, I want a persistent header at the top of my terminal that always shows the current workspace status so I can glance at progress without scrolling.

**Acceptance Criteria:**
- [ ] Dashboard is always visible at the top of the terminal (does not scroll away)
- [ ] Shows: workspace name, current story ID and title, iteration X/Y
- [ ] Shows: progress bar with N/M stories completed (e.g., `[████░░░░░░] 3/8`)
- [ ] Shows: cumulative cost (USD), cumulative tokens (input + output)
- [ ] Shows: elapsed time since `william start` was invoked (HH:MM:SS, updates every second)
- [ ] Shows: current story attempt count
- [ ] Shows: stuck status indicator (normal / hint written / approaching skip)
- [ ] Shows: files modified count for current story iteration
- [ ] Dashboard updates in real-time as data changes
- [ ] Typecheck passes

### US-003: Thinking spinner
**Description:** As a user, I want a visual spinner when Claude is processing so I know the system hasn't stalled.

**Acceptance Criteria:**
- [ ] An animated spinner (e.g., dots, braille, or similar) appears in the output area while waiting for Claude's response
- [ ] Spinner shows text like "Claude is thinking..." or "Waiting for response..."
- [ ] Spinner disappears and is replaced by actual content when Claude starts streaming text
- [ ] Spinner reappears between tool result and next assistant message
- [ ] Uses ink-spinner or a simple custom animation
- [ ] Typecheck passes

### US-004: Color-coded output sections
**Description:** As a user, I want different types of output visually distinguished by color so I can quickly scan what's happening.

**Acceptance Criteria:**
- [ ] Assistant text: default/white color
- [ ] Tool calls: dimmed/gray with tool name highlighted (e.g., cyan)
- [ ] Tool results: dimmed/gray (not shown in full — just a one-line summary)
- [ ] Errors: red text
- [ ] System messages (story complete, iteration start, stuck detection): yellow or green with a prefix badge
- [ ] Story completion: green with a checkmark
- [ ] Story skip: yellow with a skip indicator
- [ ] Typecheck passes

### US-005: Markdown rendering in terminal
**Description:** As a user, I want Claude's markdown output rendered with formatting (bold, headers, code blocks with syntax highlighting) so the output is readable.

**Acceptance Criteria:**
- [ ] Markdown headings rendered with bold/color
- [ ] Code blocks rendered with syntax highlighting (use a library like `cli-highlight` or `cardinal`)
- [ ] Inline code rendered with a distinct style (e.g., dim background or different color)
- [ ] Bold and italic text rendered correctly
- [ ] Lists rendered with proper indentation
- [ ] Links displayed as `text (url)` or similar readable format
- [ ] Raw markdown source is NOT shown — only the rendered version
- [ ] Typecheck passes

### US-006: Scrolling log area
**Description:** As a user, I want the streaming output to appear in a scrollable region below the dashboard so I can see recent activity without the header scrolling away.

**Acceptance Criteria:**
- [ ] Output area fills the remaining terminal height below the dashboard header
- [ ] New output appears at the bottom and scrolls up naturally
- [ ] The dashboard header remains fixed/sticky at the top
- [ ] When the terminal is resized, the layout adjusts accordingly
- [ ] Output does not overflow or break the layout
- [ ] Typecheck passes

### US-007: Wire stream events to TUI state
**Description:** As a developer, I want the NDJSON stream events to update the TUI's React state so the UI reflects real-time activity.

**Acceptance Criteria:**
- [ ] `consumeStreamOutput` emits events (via its existing `onMessage` callback) that the TUI consumes
- [ ] Assistant text blocks are accumulated and rendered as markdown in the log area
- [ ] Tool use events update a "current tool" indicator and/or log a summary line
- [ ] Tool result events (especially errors) are rendered with appropriate color
- [ ] Result messages update the dashboard with final cost/token/duration data
- [ ] System init messages can optionally show model name in the dashboard
- [ ] Typecheck passes

### US-008: Story transition display
**Description:** As a user, I want clear visual separation when the agent moves from one story to the next so I can tell where one story's work ends and the next begins.

**Acceptance Criteria:**
- [ ] When a story completes, a green banner/divider appears: `✓ US-001: [title] — COMPLETE`
- [ ] When a story is skipped, a yellow banner appears: `⊘ US-003: [title] — SKIPPED`
- [ ] When a new story starts, a header/divider appears: `→ Starting US-002: [title]`
- [ ] The dashboard progress bar and story info update immediately on transition
- [ ] Typecheck passes

## Functional Requirements

- FR-1: Create `src/ui/App.tsx` as the root Ink component with a layout of: sticky header (dashboard) + scrolling body (log)
- FR-2: Create `src/ui/Dashboard.tsx` component displaying: workspace name, story ID/title, progress bar (N/M), iteration X/Y, cumulative cost, cumulative tokens, elapsed time, attempt count, stuck status, files modified count
- FR-3: Create `src/ui/LogArea.tsx` component that renders a scrolling list of log entries (markdown-rendered text, tool summaries, system banners)
- FR-4: Create `src/ui/Spinner.tsx` component (or use `ink-spinner`) shown when Claude is processing
- FR-5: Create `src/ui/MarkdownText.tsx` component that renders markdown strings with terminal formatting (bold, headers, code highlighting, lists)
- FR-6: Create `src/ui/StoryBanner.tsx` component for story start/complete/skip dividers
- FR-7: Modify `runner.ts` to emit state updates (via callback, EventEmitter, or React context) instead of `console.log` calls
- FR-8: Modify `consume.ts` to route stream events to the TUI state instead of `process.stdout.write`
- FR-9: Modify `workspace.ts` `startWorkspace()` to mount the Ink app and pass the runner's event stream to it
- FR-10: Add `ink-spinner` (or equivalent) and `marked-terminal` (or equivalent) to `package.json` dependencies
- FR-11: The TUI must gracefully handle terminal resize events without crashing
- FR-12: All NDJSON log file writing must continue to work unchanged — the TUI is purely a display layer
- FR-13: Elapsed time in dashboard must tick every second using a React interval/effect

## Non-Goals

- No keyboard interactivity (no scrollback, no pause/resume, no story skipping from TUI)
- No changes to `william status`, `william list`, `william stop`, or `william archive` commands
- No changes to the NDJSON streaming protocol or log format
- No changes to the stuck detection logic or escalation behavior
- No persistent TUI state (dashboard is ephemeral, resets on restart)
- No mouse support
- No configuration options for TUI themes or colors (hardcoded sensible defaults)

## Technical Considerations

- **Ink v5** is already a dependency — use it as the React-for-terminal renderer
- **React 18** is already a dependency — use standard hooks (useState, useEffect, useRef)
- **ink-spinner** is the standard spinner component for Ink — add it as a dependency
- **marked** + **marked-terminal** (or **cli-markdown**) can render markdown to terminal-formatted strings — evaluate which works best and add as a dependency
- The runner currently uses `console.log` and `process.stdout.write` — these conflict with Ink's rendering. All output must go through Ink components. Consider an EventEmitter or callback pattern to decouple the runner from the display layer
- `consumeStreamOutput` already has an `onMessage` callback — this is the natural hook point for feeding events to the TUI
- Terminal width/height can be read from `process.stdout.columns` / `process.stdout.rows` and Ink's `useStdout` hook
- The dashboard needs data from multiple sources: `WorkspaceState` (stories, progress), `StreamSession` (cost, tokens), and the runner loop (iteration count, elapsed time). A shared state store or React context will be needed

## Success Metrics

- All information previously logged via `console.log` is still visible in the TUI (no data loss)
- A user can glance at the terminal and immediately know: what story is being worked on, how far along the run is, and whether the system is actively working or stuck
- Claude's markdown output (headers, code blocks, lists) is visually formatted, not raw
- Different output types (text, tools, errors, system events) are visually distinct without reading the content
- The TUI does not degrade performance of the underlying runner or streaming pipeline
- NDJSON log files remain identical to current behavior

## Open Questions

- Should we cap the number of log lines kept in memory (e.g., last 500 lines) to prevent memory growth on very long runs?
- Should tool call summaries show the tool name only, or also a truncated version of the input (e.g., file path for Read/Write)?
- Should the markdown renderer handle all GFM features or just the basics (headers, code, bold, lists)?
- Should we add a final summary screen when the run completes (total stories, total cost, total time)?
