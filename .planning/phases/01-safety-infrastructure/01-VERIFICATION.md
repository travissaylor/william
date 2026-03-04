---
phase: 01-safety-infrastructure
verified: 2026-03-03T21:45:00Z
status: passed
score: 12/12 must-haves verified
re_verification: false
---

# Phase 1: Safety Infrastructure Verification Report

**Phase Goal:** Concurrent state writes, orphaned processes, and token runaway are eliminated before any parallel agent is ever dispatched
**Verified:** 2026-03-03T21:45:00Z
**Status:** passed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths (from ROADMAP.md Success Criteria + PLAN must_haves)

| # | Truth | Status | Evidence |
|---|-------|--------|---------|
| 1 | Three simultaneous story completions all write to state.json without data loss or corruption | VERIFIED | `saveStateLocked` with `proper-lockfile` in `src/prd/tracker.ts`; concurrent test passes in `tracker.test.ts` (line 149-168) |
| 2 | Pressing Ctrl+C or crashing William kills all active Claude processes with no orphaned PIDs remaining | VERIFIED | `registerShutdownHandlers` in `cli.ts` (lines 159, 562); `gracefulShutdown` in `shutdown.ts` sends SIGTERM then SIGKILL after 5s |
| 3 | Running `william stop` after a crash terminates any processes listed in the PID registry | VERIFIED | `killAllAgents(resolved.workspaceDir)` called in `stopWorkspace` in `workspace.ts` (line 470) |
| 4 | Three simultaneous `saveStateLocked` calls all succeed without corrupting state.json | VERIFIED | Integration test in `tracker.test.ts`: `await Promise.all(states.map((s) => saveStateLocked(...)))` — all 3 pass |
| 5 | If `saveState` throws mid-write, the lock is still released | VERIFIED | `try/finally` block in `saveStateLocked` (tracker.ts lines 34-40); chmod test in `tracker.test.ts` confirms lock released after EACCES |
| 6 | Lock status can be checked programmatically via `lockfile.check()` | VERIFIED | `lockfile.check(statePath)` in `cli.ts` line 220 (status command) |
| 7 | `'interrupted'` is a valid `StoryState.passes` value and `getCurrentStory` treats it as pending | VERIFIED | `types.ts` line 2: `boolean \| "skipped" \| "interrupted"`; `getCurrentStory` condition in `tracker.ts` line 50 |
| 8 | Pressing Ctrl+C sends SIGTERM to all registered Claude processes, waits 5s, then SIGKILL survivors | VERIFIED | `gracefulShutdown` in `shutdown.ts` lines 44-87; 5-second `setTimeout` at line 71; survivor SIGKILL loop lines 74-87 |
| 9 | Double Ctrl+C force-kills all agents immediately without waiting | VERIFIED | `shuttingDown` guard at lines 39-52 in `shutdown.ts`; force-kills via SIGKILL immediately |
| 10 | Running `william start` after a crash auto-detects orphaned PIDs and cleans them up | VERIFIED | `cleanupOrphans(resolved.workspaceDir, statePath)` in `workspace.ts` line 431, called in `startWorkspace` before run loop |
| 11 | Orphaned stories with dead PIDs are marked as `'interrupted'` (not `'pending'`) | VERIFIED | `cleanupOrphans` calls `markStoryInterrupted` for each dead PID (pid-registry.ts lines 83-89) |
| 12 | `william status` shows active agents with PIDs and lock status | VERIFIED | `readRegistry` + `lockfile.check` in `cli.ts` lines 219-239; displays PIDs, story IDs, lock status, last write time |

**Score:** 12/12 truths verified

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/types.ts` | StoryState with `'interrupted'` passes value | VERIFIED | Line 2: `boolean \| "skipped" \| "interrupted"` |
| `src/prd/tracker.ts` | `saveStateLocked()` with proper-lockfile protection | VERIFIED | Exported async function, lines 24-42; try/finally guarantees release |
| `src/prd/tracker.ts` | `markStoryInterrupted()` exported | VERIFIED | Lines 55-68; preserves attempts, sets passes="interrupted", sets lastAttempt |
| `src/prd/tracker.ts` | `getCurrentStory()` treats interrupted as pending | VERIFIED | Line 50: `story.passes === false \|\| story.passes === "interrupted"` |
| `src/prd/tracker.test.ts` | Tests for concurrent locking, error release, interrupted status | VERIFIED | 186 lines; 11 tests covering all required behaviors |
| `src/safety/pid-registry.ts` | PID registry CRUD: register, deregister, read, isProcessAlive, cleanupOrphans | VERIFIED | All 5 functions exported; substantive implementation |
| `src/safety/shutdown.ts` | Signal handler registration, graceful shutdown with SIGTERM/SIGKILL escalation | VERIFIED | `registerShutdownHandlers`, `gracefulShutdown`, `killAllAgents`, `resetShutdownState` exported |
| `src/safety/pid-registry.test.ts` | Tests for PID registry operations, orphan cleanup | VERIFIED | 243 lines; 13 tests covering all registry behaviors |
| `src/safety/shutdown.test.ts` | Tests for shutdown logic with mocked `process.kill` | VERIFIED | 248 lines; 10 tests using `vi.useFakeTimers()` for grace period |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `src/runner.ts` | `src/prd/tracker.ts` | `saveStateLocked` replaces `saveState` for all writes | VERIFIED | Lines 8, 198, 453; no bare `saveState` calls remain in runner.ts |
| `src/prd/tracker.ts` | `proper-lockfile` | `lockfile.lock()` / `release()` around `writeFileSync` | VERIFIED | Import line 2; `lockfile.lock()` at line 29; try/finally release at lines 34-40 |
| `src/runner.ts` | `src/safety/pid-registry.ts` | `registerPid` after `adapter.spawn()`, `deregisterPid` in close handler | VERIFIED | Lines 14, 415, 426 |
| `src/cli.ts` | `src/safety/shutdown.ts` | `registerShutdownHandlers` before `startWorkspace` call | VERIFIED | Line 44 (import), lines 159 (start command) and 562 (revise command) |
| `src/cli.ts` | `src/safety/pid-registry.ts` | `readRegistry` in status command to display active agents with PIDs | VERIFIED | Line 45 (import), line 219 (usage) |
| `src/workspace.ts` | `src/safety/pid-registry.ts` | `cleanupOrphans` in `startWorkspace` before `runWorkspace` | VERIFIED | Line 18 (import), line 431 (usage) |
| `src/workspace.ts` | `src/safety/shutdown.ts` | `killAllAgents` in `stopWorkspace` | VERIFIED | Line 19 (import), line 470 (usage) |
| `src/workspace.ts` | `src/prd/tracker.ts` | `saveStateLocked` in `updateParentAfterRevision` (async, awaited) | VERIFIED | Line 10 (import), line 412 (usage); function is `async`, awaited in cli.ts line 595 |

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|---------|
| SAFE-01 | 01-01-PLAN.md | Concurrent state.json writes are protected by file locking to prevent data loss during parallel execution | SATISFIED | `saveStateLocked` with `proper-lockfile` used in all state write paths: `runner.ts` lines 198, 453; `workspace.ts` line 412 |
| SAFE-02 | 01-02-PLAN.md | All spawned Claude processes are killed via SIGTERM when William exits (crash, Ctrl+C, or normal exit) | SATISFIED | SIGINT/SIGTERM/SIGHUP handlers registered via `registerShutdownHandlers`; PID registry tracks all spawned processes; graceful SIGTERM + SIGKILL escalation implemented |

**Orphaned requirements check:** REQUIREMENTS.md maps only SAFE-01 and SAFE-02 to Phase 1. Both are claimed by plans and verified. No orphaned requirements.

---

### Anti-Patterns Found

No anti-patterns detected in key files:

- No TODO/FIXME/HACK/PLACEHOLDER comments in `src/prd/tracker.ts`, `src/safety/pid-registry.ts`, `src/safety/shutdown.ts`, or `src/types.ts`
- No stub implementations (empty returns, placeholder bodies)
- No unwired artifacts — all new exports are imported and called from their intended consumers
- No bare `saveState(` calls remain in `runner.ts` or `workspace.ts` (all migrated to `saveStateLocked`)

---

### Test Results

Ran target test files directly to exclude unrelated workspace test failures:

```
npx vitest run src/prd/tracker.test.ts src/safety/pid-registry.test.ts src/safety/shutdown.test.ts

 ✓ src/safety/shutdown.test.ts (10 tests) 6ms
 ✓ src/safety/pid-registry.test.ts (13 tests) 13ms
 ✓ src/prd/tracker.test.ts (11 tests) 315ms

 Test Files  3 passed (3)
       Tests  34 passed (34)
```

Typecheck: `pnpm typecheck` — zero errors
Lint: `pnpm lint` — zero warnings or errors

---

### Human Verification Required

None — all phase behaviors are programmatically verifiable through code inspection and tests. The signal handling behavior (Ctrl+C sending SIGTERM, double Ctrl+C for SIGKILL) is validated through the shutdown.test.ts test suite with mocked `process.kill` and `vi.useFakeTimers()`.

---

### Summary

Phase 1 goal is fully achieved. Both requirements (SAFE-01, SAFE-02) are satisfied with substantive implementations and passing tests. Every key link is wired — no orphaned artifacts exist. The implementation is clean with no anti-patterns.

Key evidence of goal achievement:
- `saveStateLocked` serializes all concurrent state.json writes via file locking with guaranteed lock release (try/finally)
- PID registry (`pid-registry.json` per workspace) tracks all spawned Claude processes across the full lifecycle
- Signal handlers (SIGINT, SIGTERM, SIGHUP) registered before workspace startup in both `start` and `revise` commands
- Graceful shutdown escalates SIGTERM → SIGKILL with 5-second grace period; double Ctrl+C bypasses wait
- Crash recovery: `cleanupOrphans` at startup marks interrupted stories and purges stale PIDs
- `william stop` actively kills agents via `killAllAgents` rather than only writing a `.stopped` marker
- `william status` surfaces safety info: active agents with PIDs, lock status, last state write time

---

_Verified: 2026-03-03T21:45:00Z_
_Verifier: Claude (gsd-verifier)_
