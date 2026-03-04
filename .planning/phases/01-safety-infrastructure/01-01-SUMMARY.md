---
phase: 01-safety-infrastructure
plan: 01
subsystem: infra
tags: [proper-lockfile, file-locking, concurrency, state-management, tdd]

# Dependency graph
requires: []
provides:
  - saveStateLocked() async function with proper-lockfile protection in src/prd/tracker.ts
  - markStoryInterrupted() function preserving attempts, setting passes="interrupted"
  - StoryState.passes extended with "interrupted" value
  - getCurrentStory() treats "interrupted" as pending (same as false)
  - All state.json writes in runner.ts and workspace.ts protected by file locks
affects:
  - 01-02 (crash recovery: uses interrupted status as pending story marker)
  - Any future plans touching state.json writes

# Tech tracking
tech-stack:
  added: [proper-lockfile 4.1.2, @types/proper-lockfile 4.1.4]
  patterns:
    - saveStateLocked wraps saveState in lockfile.lock()/release() with try/finally
    - Async state writes: all callers of saveState migrated to await saveStateLocked
    - TDD: write failing tests first, implement to green, fix lint

key-files:
  created:
    - src/prd/tracker.test.ts
  modified:
    - src/types.ts
    - src/prd/tracker.ts
    - src/runner.ts
    - src/workspace.ts
    - src/cli.ts
    - package.json
    - pnpm-lock.yaml

key-decisions:
  - "proper-lockfile chosen for file locking — stale: 10000ms, retries: 5 with backoff 100-500ms"
  - "saveState retained as internal helper; saveStateLocked is the public API for all callers"
  - "runStuckDetection made async to support await saveStateLocked in skip branch"
  - "updateParentAfterRevision made async; cli.ts revise command awaits it"

patterns-established:
  - "Lock-then-write pattern: lock file, write in try, release in finally"
  - "Async propagation: making a sync function async requires updating all call sites"

requirements-completed: [SAFE-01]

# Metrics
duration: 7min
completed: 2026-03-03
---

# Phase 01 Plan 01: File Locking for state.json Summary

**proper-lockfile serialized state.json writes across concurrent agent processes, with "interrupted" StoryState value enabling crash recovery in Plan 02**

## Performance

- **Duration:** 7 min
- **Started:** 2026-03-03T21:12:39Z
- **Completed:** 2026-03-03T21:20:26Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments
- Installed proper-lockfile and extended StoryState.passes to include "interrupted"
- Implemented saveStateLocked() with lock acquisition timing warning (>2s), try/finally release
- Updated markStoryInterrupted() to set passes="interrupted" while preserving attempts
- Updated getCurrentStory() to treat "interrupted" same as false (pending story)
- Migrated all state.json write call sites in runner.ts and workspace.ts to async saveStateLocked
- 11 tests covering concurrent locking, error release, contention warning, and interrupted status

## Task Commits

Each task was committed atomically:

1. **Task 1: Install proper-lockfile and extend StoryState type** - `a950d82` (feat - TDD)
2. **Task 2: Replace saveState with saveStateLocked in runner.ts** - `402f46a` (feat)

**Plan metadata:** (created in final commit)

_Note: Task 1 was TDD — tests written first (RED), implementation to GREEN, lint fixes applied._

## Files Created/Modified
- `src/prd/tracker.ts` - Added saveStateLocked(), markStoryInterrupted(), updated getCurrentStory()
- `src/prd/tracker.test.ts` - New: 11 tests for locking, error release, interrupted status, concurrent writes
- `src/types.ts` - Extended StoryState.passes with "interrupted" value
- `src/runner.ts` - Migrated to saveStateLocked, made runStuckDetection async
- `src/workspace.ts` - Migrated updateParentAfterRevision to async saveStateLocked
- `src/cli.ts` - Awaits updateParentAfterRevision in revise command
- `package.json` / `pnpm-lock.yaml` - Added proper-lockfile 4.1.2 and @types/proper-lockfile 4.1.4

## Decisions Made
- Used `proper-lockfile` with `stale: 10_000` to auto-release locks from crashed processes — critical for crash recovery scenarios
- Kept `saveState` as an internal function called by `saveStateLocked` (not removed) so the locking wrapper pattern is clear and testable
- Made `runStuckDetection` async (propagated from saveStateLocked requirement) — all callers updated
- The `vi.spyOn(fs, 'writeFileSync')` approach failed in ESM (Cannot redefine property); used `fs.chmodSync` to create a real write-failure scenario instead

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] ESM module spy incompatibility in error-release test**
- **Found during:** Task 1 (tracker.test.ts TDD RED phase)
- **Issue:** `vi.spyOn(fs, 'writeFileSync')` throws `Cannot redefine property: writeFileSync` in ESM modules — the plan's suggested approach doesn't work with ESM
- **Fix:** Replaced mock with `fs.chmodSync(statePath, 0o444)` (chmod read-only) to produce a real EACCES error, then restored permissions to verify lock was released
- **Files modified:** src/prd/tracker.test.ts
- **Verification:** Test passes and correctly verifies lock release on error
- **Committed in:** a950d82 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - test approach bug)
**Impact on plan:** Equivalent behavior tested via real file system error instead of mock. No scope creep.

## Issues Encountered
- ESM module property redefinition restriction prevented vi.spyOn on fs.writeFileSync — resolved by using chmod to create real write failure condition

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Plan 02 (crash recovery) can use `interrupted` as pending marker — getCurrentStory() already handles it
- saveStateLocked is ready for use by any future state.json writers
- proper-lockfile stale timeout (10s) ensures crashed processes release locks automatically

---
*Phase: 01-safety-infrastructure*
*Completed: 2026-03-03*
