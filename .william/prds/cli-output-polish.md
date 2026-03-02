<prd>
# PRD: CLI Output Polish for `revise` and `pr` Commands

## Introduction

The `william start` command has a polished TUI experience — streaming markdown rendering, colored event indicators, a dashboard with progress metrics. Two other commands that invoke Claude (`revise` plan generation and `pr`) have significantly rougher output. The `revise` command streams Claude's plan generation as raw unformatted text via `process.stdout.write`, with no markdown rendering or color. The `pr` command uses synchronous `spawnSync("claude", ["--print"])` with zero user feedback — no spinners, no streaming, no phase indicators — just silence followed by a PR URL.

This feature brings both commands up to a consistent, polished output standard using lightweight status indicators, streaming with markdown rendering, and colored phase labels.

## Goals

- Stream Claude's output with terminal markdown rendering during `revise` plan generation (instead of raw `process.stdout.write`)
- Stream Claude's output with terminal markdown rendering during `pr` description generation (instead of blocking `spawnSync`)
- Add phase indicators (spinners + labels) to `william pr` for each step (generating description, pushing branch, creating/updating PR)
- Keep the approach lightweight — no full Ink.js TUI dashboard, just spinners and formatted streaming output

## User Stories

### US-001: Render markdown in revise plan generation stream

**Description:** As a user running `william revise`, I want Claude's plan generation output to be rendered with terminal markdown formatting (headers, bold, code blocks, lists) so that the streamed text is readable instead of raw plaintext.

**Acceptance Criteria:**

- [ ] During plan generation, Claude's streamed assistant text is rendered using the existing `marked` + `marked-terminal` markdown pipeline (same as `MarkdownText.tsx` uses)
- [ ] Headers, bold, code blocks, and lists display with ANSI styling in the terminal
- [ ] The plan approval prompt (`--- Revision Plan ---` / `--- End of Plan ---` + plan text) also renders the plan with markdown formatting
- [ ] Feedback loop re-generation also streams with markdown rendering
- [ ] Typecheck and lint pass

### US-002: Add spinner during revise plan generation

**Description:** As a user running `william revise`, I want to see a spinner/loading indicator while Claude is generating the revision plan so that I know the system is working.

**Acceptance Criteria:**

- [ ] A spinner with a descriptive label (e.g., "Generating revision plan...") displays while waiting for Claude's first streamed token
- [ ] The spinner stops or transitions once streaming output begins
- [ ] During feedback rounds, a spinner with label (e.g., "Regenerating plan with feedback...") displays before streaming resumes
- [ ] Typecheck and lint pass

### US-003: Switch `pr` from `spawnSync` to async streaming for Claude

**Description:** As a developer, I need the PR description generation to use async streaming (like `spawnCapture`) instead of synchronous `spawnSync("claude", ["--print"])` so that we can show live output and status indicators.

**Acceptance Criteria:**

- [ ] `generatePrDescription` uses an async spawn with `--output-format stream-json` instead of `spawnSync` with `--print`
- [ ] Claude's streamed assistant text is rendered with terminal markdown formatting
- [ ] The JSON response (`{ title, body }`) is still correctly extracted from the full output after streaming completes
- [ ] `prCommand` becomes an async function to support the streaming spawn
- [ ] Typecheck and lint pass

### US-004: Add phase indicators to `william pr`

**Description:** As a user running `william pr`, I want to see colored status indicators for each phase of the PR process so that I know what's happening instead of staring at a silent terminal.

**Acceptance Criteria:**

- [ ] A spinner + label shows during PR description generation (e.g., "Generating PR description...")
- [ ] The spinner transitions or a success indicator shows when description generation completes
- [ ] A spinner + label shows during branch push (e.g., "Pushing branch...")
- [ ] A success indicator shows when push completes
- [ ] A spinner + label shows during PR creation/update (e.g., "Creating pull request..." or "Updating pull request #N...")
- [ ] The final PR URL is printed with a colored success prefix (e.g., green checkmark)
- [ ] Incomplete story warnings still display (with yellow/warning coloring)
- [ ] Dry-run mode still works and outputs title + body (no spinners needed for dry-run since it's instant)
- [ ] Typecheck and lint pass

### US-005: Stream Claude's PR description output live

**Description:** As a user running `william pr`, I want to see Claude's output streamed live while it generates the PR description so that I can observe what's being produced in real time.

**Acceptance Criteria:**

- [ ] Claude's assistant text streams to the terminal in real time during PR description generation, rendered with markdown formatting
- [ ] After streaming completes, the spinner for that phase shows a completion indicator
- [ ] The streamed output does not interfere with the JSON extraction logic — the full text is still collected and parsed for `{ title, body }`
- [ ] Typecheck and lint pass

## Functional Requirements

- FR-1: Create a shared utility for rendering streamed markdown text to the terminal, reusing the existing `marked` + `marked-terminal` setup from `ui/MarkdownText.tsx`
- FR-2: Create a shared lightweight CLI spinner/phase indicator utility (can use `ora`, `nanospinner`, or a simple implementation using ANSI escape codes) that supports: starting with a label, updating the label, and completing with a success/failure indicator
- FR-3: Modify `spawnCapture()` in `src/adapters/claude.ts` to accept an optional callback or emitter for streamed text, so callers can render it however they want (currently it does `process.stdout.write(block.text)` unconditionally)
- FR-4: Update `generateRevisionPlan()` and `spawnAndExtractPlan()` in `src/revision-wizard.ts` to use markdown-rendered output via the callback from FR-3
- FR-5: Convert `generatePrDescription()` in `src/pr.ts` from `spawnSync` with `--print` to an async streaming spawn using `--output-format stream-json`
- FR-6: Convert `prCommand()` in `src/pr.ts` to an async function with phase spinners for: description generation, branch push, PR lookup, and PR creation/update
- FR-7: The incomplete story warning in `prCommand` should use colored output (yellow text or a warning symbol)
- FR-8: The final PR URL output should use a green success indicator (e.g., checkmark)

## Non-Goals

- No full Ink.js TUI or dashboard for `revise` plan generation or `pr` — these stay as lightweight CLI output
- No changes to the `william start` TUI — it already works well
- No changes to `william new`, `william status`, or other commands
- No streaming of tool calls or tool results during plan generation or PR generation — only assistant text
- No persistent log files for the PR generation stream (unlike `start` which writes NDJSON logs)

## Technical Considerations

- The existing `marked` + `marked-terminal` setup in `ui/MarkdownText.tsx` is designed for Ink.js React components. The shared utility (FR-1) should export a plain function (not a React component) that can be called from non-Ink code. The `renderMarkdown` function may already be suitable — check if it can be imported directly.
- `spawnCapture` currently writes raw text to stdout unconditionally. Modifying it to accept a callback (e.g., `onText?: (text: string) => void`) lets callers decide how to render. Default behavior can remain as `process.stdout.write` for backward compatibility.
- For `pr`, the switch from `spawnSync` to async means `prCommand` and `generatePrDescription` must become `async`. The CLI action handler in `cli.ts` already uses `async` for other commands, so this is straightforward.
- The spinner library choice should be lightweight. `ora` is a common choice and supports label updates, success/failure states, and works well with streaming output. Alternatively, a minimal implementation using `\r` and ANSI codes would avoid adding a dependency.
- When streaming markdown, the text arrives incrementally (word by word or chunk by chunk). Rendering markdown on partial text can produce broken formatting. Consider buffering by line or paragraph before rendering, or rendering the full accumulated text with a screen-clear approach. The `revise` command already accumulates full text in `spawnCapture` — the callback can receive incremental chunks while the final rendering uses the complete text.
- The `pr` command's JSON extraction expects the full Claude output. Streaming text to the terminal is purely visual — the extraction logic operates on the accumulated `session.fullText` after the stream completes.

## Success Metrics

- `william revise` plan generation output displays formatted markdown (headers, code blocks, lists styled with ANSI codes) instead of raw plaintext
- `william pr` shows phase progress from start to finish — the user never sees a silent, unresponsive terminal
- Claude's output streams live during PR description generation
- All existing functionality (dry-run, feedback loops, PR create/update, draft mode) continues to work correctly

## Open Questions

- Should the streamed Claude output during `pr` description generation be shown in a visually distinct area (e.g., indented or dimmed) to separate it from the phase indicators, or is inline streaming sufficient?
- Should there be a `--quiet` flag for `pr` to suppress streaming output and just show spinners + final URL (useful for scripting)?
</prd>
