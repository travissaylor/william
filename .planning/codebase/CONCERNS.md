# Codebase Concerns

**Analysis Date:** 2026-03-03

## Error Handling Gaps

**Unsafe JSON.parse without validation:**
- Issue: Multiple locations parse JSON from file reads without try-catch or schema validation
- Files: `src/prd/tracker.ts` (line 16), `src/config.ts` (line 26), `src/completions.ts` (line 343)
- Impact: Corrupted state.json or config.json will crash the process with unhandled JSON.SyntaxError
- Fix approach: Wrap JSON.parse in try-catch blocks, add fallback defaults, or use a schema validator like zod

**Unhandled NDJSON parse errors:**
- Issue: `src/stream/ndjson-parser.ts` emits "parse-error" event (line 49) but error recovery is minimal
- Files: `src/stream/consume.ts` (line 108)
- Impact: Malformed NDJSON lines are logged but don't interrupt session — silent data loss
- Fix approach: Track parse error count and escalate to pause/hint if threshold exceeded

**Generic error message suppression:**
- Issue: Multiple catch blocks silently convert errors to strings without logging stack traces
- Files: `src/cli.ts` (lines 112, 130, 160, 175, 262, 279, 313, 352, 434, 460, 580, 603), `src/workspace.ts` (line 279)
- Impact: Debugging hard — lost context on where errors originate
- Fix approach: Log full error object with stack, then display user-friendly message

## File I/O Race Conditions

**State file race condition during concurrent operations:**
- Issue: `src/runner.ts` and `src/workspace.ts` both read/write state.json in a loop without file locking
- Files: `src/runner.ts` (lines 309, 420), `src/workspace.ts` (lines 420, 467, 651)
- Scenario: If `william stop` is called while `william start` is running, one process could overwrite the other's state changes
- Impact: Lost story completion status, attempt counts, or stuck hints
- Fix approach: Implement file locking (use `proper-lockfile` package) or add version field to state + retry logic

**Process marker files without atomicity:**
- Issue: `.running`, `.stopped`, `.paused` are written separately from state updates
- Files: `src/workspace.ts` (lines 429, 458, 177)
- Scenario: Process crashes between writing marker and saving state — marker files left behind, confusing status commands
- Impact: Workspace appears running/stopped even when it's in the opposite state
- Fix approach: Bundle marker + state writes, or use atomic operations

## Type Safety Issues

**Type casting in stream parsing:**
- Issue: `src/stream/ndjson-parser.ts` (line 53) casts `parsed as StreamMessage` without validation
- Impact: If Claude API changes response schema, invalid data silently flows through without type errors
- Files: `src/stream/ndjson-parser.ts` (line 53), `src/adapters/claude.ts` (line 82)
- Fix approach: Use runtime validation library (zod/io-ts) to parse and validate incoming messages

**Error type confusion:**
- Issue: Catch blocks check `err instanceof Error` but some errors may be non-Error objects thrown as strings
- Files: `src/cli.ts` (many locations), `src/workspace.ts` (line 279)
- Impact: Type assertions assume all errors are Error objects — unreliable
- Fix approach: Always normalize caught values with `normalizeError()` utility

## Stream Output and Memory Concerns

**Unbounded buffer accumulation in NdjsonParser:**
- Issue: `src/stream/ndjson-parser.ts` accumulates `fullText` without size limits (line 88)
- Files: `src/stream/ndjson-parser.ts` (line 6, 88)
- Scenario: Long-running workspaces with verbose output could consume unbounded memory
- Impact: Process OOM on large sessions (1000+ iterations)
- Fix approach: Implement circular buffer with max line count or write text to disk log periodically

**Unbounded tool use history:**
- Issue: `StreamSession.toolUses` and `StreamSession.toolResults` arrays grow without limit
- Files: `src/stream/types.ts`, `src/runner.ts` (line 83-87 detects loops by iterating entire array)
- Scenario: Tool loop detection becomes O(n) in worst case; stuck detection scans entire history
- Impact: Performance degrades after 100+ tool uses in a session
- Fix approach: Keep fixed-size window of recent tool uses (e.g., last 20), not entire history

## Large File Handling

**Git diff truncation strategy is lossy:**
- Issue: `src/pr.ts` (lines 104-108) truncates diffs >100KB but doesn't preserve diff boundaries
- Impact: PR description may contain incomplete hunks ("diff truncated — exceeded 100KB")
- Files: `src/pr.ts` (line 95, 104-108)
- Fix approach: Truncate at newline boundaries or use structured diff format (JSON)

**No streaming for large PRD files:**
- Issue: `src/runner.ts` reads entire PRD into memory (line 320), no streaming or chunking
- Files: `src/runner.ts` (line 320)
- Scenario: Multi-MB PRD files consume full memory upfront
- Impact: Not a current concern but limits PRD size in future
- Fix approach: Lazy-load PRD sections or stream context building

## Incomplete Error Scenarios

**Shell detection may return null but no fallback:**
- Issue: `src/completions.ts` (lines 12-21) returns null if $SHELL not recognized
- Files: `src/completions.ts` (line 12, detectShell function)
- Impact: Shell completions silently fail to install if shell detection fails
- Fix approach: Default to bash, or prompt user to specify shell

**Missing validation for workspace path resolution:**
- Issue: `src/workspace.ts` (lines 30-107) has complex path resolution logic with overlapping conditions
- Files: `src/workspace.ts` (lines 30-107)
- Scenario: Ambiguous workspace names could match multiple projects
- Impact: User might archive/delete wrong workspace
- Fix approach: Require unambiguous names or enforce project/workspace prefix

**Unhandled spawn failures:**
- Issue: `src/adapters/claude.ts` spawns "claude" CLI but no check if executable exists
- Files: `src/adapters/claude.ts` (lines 23, 69)
- Scenario: User doesn't have claude CLI in PATH — process silently waits forever
- Impact: No error message; user has to Ctrl+C to exit
- Fix approach: Check executable exists before spawn, or set timeout on claude process

## Test Coverage Gaps

**E2E workflow untested:**
- Issue: No integration tests for full `william new` → `william start` → `william pr` flow
- Files: Tests exist for individual commands but not end-to-end
- Risk: Regressions in multi-command workflows not caught
- Priority: Medium — found by manual testing

**State file corruption not tested:**
- Issue: No tests for JSON.parse failure or corrupted state.json scenarios
- Files: `src/prd/tracker.ts`, `src/config.ts`
- Risk: Crashes not exercised before production
- Priority: High — safety-critical

**Concurrent workspace operations untested:**
- Issue: No tests for `william stop` called while `william start` running
- Files: `src/workspace.ts`, `src/runner.ts`
- Risk: Race condition undetected
- Priority: Medium — low frequency in practice but silent data loss if triggered

## Performance Bottlenecks

**O(n) stuck detection loop:**
- Issue: `src/runner.ts` (lines 82-89) iterates full toolUses array to detect loops
- Files: `src/runner.ts` (line 82-89, detectToolLoops function)
- Scenario: 500+ tool uses triggers O(n) check every iteration
- Impact: Marginal (few ms) but compounds over many iterations
- Improvement path: Use Set-based tracking for tool uses (name:input hash)

**Regex-based workspace resolution:**
- Issue: `src/workspace.ts` (line 67) uses regex test for each workspace directory
- Files: `src/workspace.ts` (line 67)
- Scenario: 100+ workspaces means 100+ regex tests
- Impact: Negligible at current scale; future-proofs needed
- Improvement path: Index workspaces by name prefix on load

## Fragile Areas

**Complex workspace resolution path logic:**
- Files: `src/workspace.ts` (lines 30-107)
- Why fragile: Three different path formats (single name, project/name, project/name/revision-N) with overlapping conditions
- Safe modification: Add comprehensive unit tests for each path format before refactoring
- Test coverage: Unit tests exist but edge cases for ambiguous names not covered

**NDJSON parser event-based architecture:**
- Files: `src/stream/ndjson-parser.ts`, `src/stream/consume.ts`
- Why fragile: Parser emits events; consumer relies on event order without guarantees
- Safe modification: Document event ordering contract; add integration tests for consume + parser interaction
- Test coverage: Parser tested in isolation; integration with consume not verified

**Stuck detection heuristics:**
- Files: `src/runner.ts` (lines 81-237)
- Why fragile: Multiple independent heuristics (tool loops, zero progress, error rate) combined with attempt counts and thresholds (hint at 3 attempts, skip at 5)
- Safe modification: Add logging for each heuristic trigger; smoke test with known stuck scenarios before threshold changes
- Test coverage: No tests for stuck detection logic

## Dependencies at Risk

**No version pinning for Claude adapter:**
- Risk: Claude API schema changes break NDJSON parsing without warning
- Files: `src/stream/types.ts`, `src/adapters/claude.ts`
- Impact: Upgrade to new claude CLI version could crash all active workspaces
- Migration plan: Pin claude CLI version in package.json; add schema validation layer before deploying new versions

## Known Limitations

**No support for interactive prompts during agent runs:**
- Workspace: Agent can only read/write files, not prompt user for input
- Blocks: Can't implement features requiring user interaction mid-iteration
- Workaround: Pre-generate all input or use .stopped marker to pause and resume

**Max iterations is hard cap, not adaptive:**
- Workspace: Always runs up to maxIterations even if story complete early in iteration
- Blocks: Can't run extra iterations if story still failing
- Workaround: User must manually restart with higher --max-iterations

**Revision workspaces don't support nested revisions:**
- Workspace: Can create revision-1 from parent, but revision-1 can't create revision-1 of its own
- Blocks: Can't iterate on revisions of revisions
- Workaround: Must revert parent and create new revision

---

*Concerns audit: 2026-03-03*
