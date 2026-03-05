<prd>
# PRD: Orchestration Pipeline Regression Tests

## Introduction

The `william start` command — the core workflow that parses a PRD, chains Claude agent sessions across user stories, and tracks state — has no automated tests covering its end-to-end behavior. This feature adds an integration test suite that verifies the orchestration pipeline using synthetic NDJSON fixtures and a mock `ToolAdapter`, so regressions can be caught automatically without consuming Claude API tokens.

## Goals

- Verify that `runWorkspace()` processes stories sequentially in the correct order
- Confirm each story's Claude session receives appropriate chain context from previous stories
- Validate state transitions in `state.json` throughout a run (pending → running → done/skipped)
- Test stuck detection triggers and escalation behavior (hint → pause/skip)
- Ensure error conditions are handled gracefully without corrupting state
- Run deterministically with no live Claude API calls (synthetic fixtures only)
- Integrate with the existing vitest setup and CI pipeline

## User Stories

### US-001: Create mock ToolAdapter and synthetic NDJSON fixture helpers

**Description:** As a developer, I need a mock `ToolAdapter` implementation and helper utilities for creating synthetic NDJSON streams so that integration tests can simulate Claude subprocess behavior without real API calls.

**Acceptance Criteria:**

- [ ] Create a `MockAdapter` class implementing `ToolAdapter` interface from `src/adapters/types.ts`
- [ ] `MockAdapter.spawn()` returns a fake `ChildProcess` whose `stdout` emits pre-configured NDJSON lines (as Buffer chunks), `stderr` is an empty readable stream, and fires a `close` event with exit code 0 after all chunks are emitted
- [ ] `MockAdapter.parseOutput()` delegates to the same logic as `ClaudeAdapter.parseOutput()` (checks for `<promise>STORY_COMPLETE</promise>` / `ALL_COMPLETE` markers)
- [ ] Create a `buildNdjsonFixture()` helper that generates valid NDJSON sequences from a simple config: `{ messages: [{ role, content?, toolUse?, toolResult? }], cost?, tokens?, duration? }`
- [ ] The helper produces the correct message types: `system` (with session_id, model, tools), `assistant` (with text and/or tool_use blocks), `user` (with tool_result blocks), and `result` (with cost/tokens/duration)
- [ ] Create a fixture for a "story complete" session: assistant does some tool calls, emits `<promise>STORY_COMPLETE</promise>`, result message follows
- [ ] Create a fixture for an "all complete" session: same as above but with `ALL_COMPLETE` marker
- [ ] Create a fixture for a "stuck" session: assistant calls the same tool 10+ times with identical input (triggers tool loop detection)
- [ ] Create a fixture for an "error" session: process exits with non-zero code or stderr output
- [ ] All fixtures and helpers live in `src/__tests__/integration/fixtures/`
- [ ] Typecheck and lint pass

### US-002: Create test workspace scaffolding helper

**Description:** As a developer, I need a helper that creates a temporary workspace directory with valid `state.json`, `prd.md`, and `progress.txt` so integration tests have a realistic workspace to run against without touching real project workspaces.

**Acceptance Criteria:**

- [ ] Create a `createTestWorkspace()` helper that sets up a temp directory (via `os.tmpdir()` + unique suffix) with the workspace directory structure
- [ ] The helper accepts a simple PRD (1–3 stories) and generates a valid `state.json` using `initStateFromPrd()` from `src/prd/tracker.ts`
- [ ] The helper writes a `prd.md` file from the provided PRD text
- [ ] The helper creates an empty `progress.txt` file
- [ ] The helper returns `{ workspaceDir, statePath, cleanup }` where `cleanup()` removes the temp directory
- [ ] Helper lives in `src/__tests__/integration/helpers/`
- [ ] Typecheck and lint pass

### US-003: Test happy-path sequential story execution

**Description:** As a developer, I want a test that verifies stories from a 3-story PRD are processed sequentially with correct state transitions, so I can catch regressions in the core orchestration loop.

**Acceptance Criteria:**

- [ ] Test uses a 3-story PRD fixture (US-001, US-002, US-003)
- [ ] `MockAdapter` is configured to return "story complete" NDJSON for each story call in sequence, and "all complete" on the final story
- [ ] After the run, `state.json` shows all 3 stories with `passes: true` and valid `completedAt` timestamps
- [ ] Stories were processed in order: US-001 → US-002 → US-003 (verified by checking the order of prompts received by `MockAdapter.spawn()`)
- [ ] The `MockAdapter` was called exactly 3 times (once per story)
- [ ] Test file: `src/__tests__/integration/orchestration.test.ts`
- [ ] Typecheck and lint pass

### US-004: Test chain context is passed between stories

**Description:** As a developer, I want to verify that each story's Claude session receives chain context from the previous story's session, so I can catch regressions in context chaining.

**Acceptance Criteria:**

- [ ] Using the 3-story PRD, configure `MockAdapter` story-1 fixture to include tool_use blocks for Write and Bash tools (simulating file edits and commands)
- [ ] Capture the prompt passed to `MockAdapter.spawn()` for story-2
- [ ] Assert that story-2's prompt contains a "Previous Story Context" or chain context section that references the files modified and commands run from story-1's session
- [ ] Assert that story-1's prompt does NOT contain a chain context section (it's the first story)
- [ ] Typecheck and lint pass

### US-005: Test stuck detection triggers hint and pause

**Description:** As a developer, I want to verify that stuck detection correctly identifies tool loops and escalates through hint → pause, so I can catch regressions in the stuck detection system.

**Acceptance Criteria:**

- [ ] Configure `MockAdapter` to return a "stuck" fixture (same tool called 10+ times with identical input) for 3+ consecutive attempts on the same story
- [ ] After the first stuck attempt, verify `attempts` counter in `state.json` increments
- [ ] After reaching the hint threshold (3 attempts), verify `.stuck-hint.md` is written to the workspace directory
- [ ] After reaching the pause threshold (7 attempts), verify `.paused` marker file is created and the runner exits the loop
- [ ] Test verifies stuck detection heuristics: tool loop detection (same tool + same input 10+ times)
- [ ] Typecheck and lint pass

### US-006: Test error handling — adapter spawn failure and non-zero exit

**Description:** As a developer, I want to verify the pipeline handles Claude subprocess failures gracefully, so errors don't corrupt state or crash the runner.

**Acceptance Criteria:**

- [ ] Test scenario 1: `MockAdapter.spawn()` returns a process that immediately emits `close` with exit code 1 and stderr output — verify the runner increments attempts but does not mark the story as complete, and `state.json` remains valid
- [ ] Test scenario 2: `MockAdapter.spawn()` returns a process whose stdout emits malformed (non-JSON) data — verify the runner handles the parse error gracefully without corrupting state
- [ ] In both scenarios, verify the runner continues to the next iteration (does not crash)
- [ ] Typecheck and lint pass

### US-007: Test story skip behavior

**Description:** As a developer, I want to verify that stories are correctly skipped after exceeding the attempt threshold with a stuck hint, so I can catch regressions in the skip logic.

**Acceptance Criteria:**

- [ ] Configure a 2-story PRD where story-1 gets stuck and exceeds the skip threshold (5+ attempts with hint present)
- [ ] Verify story-1 ends up with `passes: "skipped"` and a `skipReason` in `state.json`
- [ ] Verify the runner proceeds to story-2 after skipping story-1
- [ ] Verify story-2 receives chain context noting that story-1 was skipped
- [ ] Typecheck and lint pass

### US-008: Validate TUI event emission with ink-testing-library

**Description:** As a developer, I want to verify that the Ink TUI correctly renders orchestration events (story starts, completions, errors, dashboard updates), so I can catch regressions in the user-facing output.

**Acceptance Criteria:**

- [ ] Test renders the `App` component using `ink-testing-library`'s `render()` with a `TuiEmitter` instance
- [ ] Emit a sequence of events via `TuiEmitter`: `storyStart("US-001")`, `assistantText("Working on...")`, `toolCall("Write", "src/foo.ts")`, `storyComplete("US-001")`, `dashboardUpdate({...})`
- [ ] Assert that rendered output contains the story ID, assistant text, tool call info, and completion message
- [ ] Assert that the Dashboard component shows updated metrics after `dashboardUpdate`
- [ ] Test file: `src/__tests__/integration/tui.test.ts`
- [ ] Add `@inkjs/ui` testing utilities or `ink-testing-library` as a dev dependency if not already present
- [ ] Typecheck and lint pass

## Functional Requirements

- FR-1: A `MockAdapter` class must implement the `ToolAdapter` interface (`spawn()` returns a fake `ChildProcess` with NDJSON stdout, `parseOutput()` checks for completion markers)
- FR-2: A `buildNdjsonFixture()` helper must generate valid NDJSON byte streams from a declarative config
- FR-3: A `createTestWorkspace()` helper must scaffold a temp workspace directory with valid state, PRD, and progress files
- FR-4: Integration tests must call `runWorkspace()` directly with the `MockAdapter` injected via the existing `opts.adapter` parameter
- FR-5: Tests must use a mock `TuiEmitter` to capture events emitted during the run (for orchestration tests) and `ink-testing-library` for TUI rendering tests
- FR-6: All integration tests must run deterministically with no network calls or Claude API tokens
- FR-7: Integration tests must be included in the `pnpm test` command and CI pipeline
- FR-8: Test fixtures must live in `src/__tests__/integration/fixtures/` and helpers in `src/__tests__/integration/helpers/`
- FR-9: The `MockAdapter` must support configuring different responses per sequential `spawn()` call (e.g., story-1 returns fixture A, story-2 returns fixture B)

## Non-Goals

- No testing of the actual Claude API or response quality
- No load/performance testing of the orchestration pipeline
- No testing of the `william new` / `william init` / `william prd` commands
- No testing of git worktree or branch creation (already covered by workspace tests)
- No snapshot testing of exact TUI terminal output (too brittle)
- No refactoring of the runner architecture beyond what's needed for testability (the `ToolAdapter` DI seam already exists)

## Technical Considerations

- **Existing DI seam:** `runWorkspace()` already accepts `opts.adapter: ToolAdapter` — no production code refactor needed to inject the mock
- **Fake ChildProcess:** The mock must implement enough of `ChildProcess` for `consumeStreamOutput()` to work: `stdout` (Readable), `stderr` (Readable), `on("close")`, and `pid`
- **Timing:** The runner has a 2-second sleep between iterations — tests should either mock `setTimeout` or use a short/zero sleep override to keep tests fast
- **File locking:** `saveStateLocked()` uses `proper-lockfile` — this should work fine in tests since each test uses its own temp directory, but watch for lock cleanup in test teardown
- **ink-testing-library:** May need to install `@inkjs/ui` or `ink-testing-library` as a dev dependency. Check compatibility with the project's Ink version (likely Ink 4+)
- **CI integration:** Tests should run as part of the existing `pnpm test` command — vitest will auto-discover `*.test.ts` files in `src/__tests__/integration/`

## Success Metrics

- All 6 orchestration scenarios (happy path, chain context, stuck detection, error handling, story skip, TUI events) pass deterministically
- Tests complete in under 10 seconds total (no real subprocess spawning or API calls)
- Tests catch at least one real regression when making changes to `runner.ts`, `consume.ts`, `chain.ts`, or `tracker.ts` (validated during development by intentionally breaking code)
- Zero flakiness — tests pass 100% of the time in CI across 10 consecutive runs

## Open Questions

- Should the 2-second sleep between iterations in `runWorkspace()` be configurable via opts, or should tests mock `setTimeout`/`sleep` directly?
- Does `ink-testing-library` support the current Ink version used by the project, or is a compatibility shim needed?
- Should the `MockAdapter` support simulating slow responses (delayed chunk emission) for testing timeout behavior, or is that out of scope for the initial suite?
</prd>
