---
phase: 01-safety-infrastructure
plan: 02
subsystem: safety
tags: [pid-registry, shutdown, signal-handling, orphan-cleanup, process-lifecycle]
dependency_graph:
  requires: [01-01]
  provides: [SAFE-02]
  affects: [src/runner.ts, src/workspace.ts, src/cli.ts]
tech_stack:
  added: []
  patterns:
    - Signal handler registration (SIGINT, SIGTERM, SIGHUP) with graceful shutdown escalation
    - PID registry pattern (JSON file per workspace) for cross-session process tracking
    - TDD with vi.useFakeTimers() for time-dependent async shutdown logic
key_files:
  created:
    - src/safety/pid-registry.ts
    - src/safety/pid-registry.test.ts
    - src/safety/shutdown.ts
    - src/safety/shutdown.test.ts
  modified:
    - src/runner.ts
    - src/workspace.ts
    - src/cli.ts
decisions:
  - name: Use synchronous fs for PID registry
    rationale: One write per spawn, called from parent process only — no concurrency risk
  - name: Use hasOwnProperty check for orphan story lookup
    rationale: TypeScript strict mode flagged index access check as unnecessary condition; hasOwnProperty is the correct runtime guard
  - name: Safety info placed before revisions section in status output
    rationale: Matches plan spec — safety is active operational info, revisions are historical
requirements:
  - SAFE-02
metrics:
  duration_minutes: 9
  completed_date: "2026-03-04"
  tasks_completed: 2
  files_changed: 7
---

# Phase 1 Plan 2: PID Registry and Signal-Driven Process Cleanup Summary

**One-liner:** JSON PID registry per workspace tracks spawned Claude processes; SIGTERM/SIGKILL escalation on Ctrl+C prevents orphaned agents after crashes or interruptions.

## What Was Built

### Task 1: PID registry and shutdown modules (TDD)

Created `src/safety/` module with two new files:

**`src/safety/pid-registry.ts`** — Registry CRUD for process tracking:
- `readRegistry(workspaceDir)` — reads `pid-registry.json`, returns `[]` on missing/invalid JSON
- `registerPid(workspaceDir, storyId, pid)` — appends entry with `startedAt` timestamp
- `deregisterPid(workspaceDir, pid)` — removes by pid, deletes file when empty
- `isProcessAlive(pid)` — uses `process.kill(pid, 0)` signal probe
- `cleanupOrphans(workspaceDir, statePath)` — finds dead PIDs, marks stories as `interrupted`, deregisters them, logs notice

**`src/safety/shutdown.ts`** — Signal handler registration and graceful shutdown:
- `registerShutdownHandlers(options)` — registers SIGINT, SIGTERM, SIGHUP handlers
- `gracefulShutdown(signal, options)` — SIGTERM all, wait 5s, SIGKILL survivors; double Ctrl+C triggers immediate SIGKILL
- `killAllAgents(workspaceDir)` — SIGTERM all alive agents (for `william stop`)
- `resetShutdownState()` — resets module state for test isolation

**Tests: 23 passing**
- `src/safety/pid-registry.test.ts`: 13 tests covering registry CRUD, orphan cleanup with real temp dirs
- `src/safety/shutdown.test.ts`: 10 tests using `vi.useFakeTimers()` for the 5-second grace period

### Task 2: Integration into existing modules

**`src/runner.ts`:**
- `registerPid(workspaceDir, currentStory, childProcess.pid)` after `adapter.spawn()`
- `deregisterPid(workspaceDir, childProcess.pid)` after `consumeStreamOutput` resolves

**`src/workspace.ts`:**
- `cleanupOrphans(resolved.workspaceDir, statePath)` in `startWorkspace` after removing stop/pause markers
- `killAllAgents(resolved.workspaceDir)` in `stopWorkspace` after writing `.stopped` marker

**`src/cli.ts`:**
- `registerShutdownHandlers({ workspaceDir: resolved.workspaceDir })` in `start` command, before `startWorkspace` call
- `registerShutdownHandlers({ workspaceDir: revisionDir })` in `revise` command, before `runWorkspace` call
- `status` command made `async`; added "Safety" section showing:
  - Active agents with PIDs, story IDs, and start times
  - State lock status via `lockfile.check()`
  - Last state write time via `fs.statSync().mtime`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed TypeScript strict mode violations in safety files**
- **Found during:** Task 1 commit (lint-staged pre-commit hook)
- **Issue:** `mockImplementation(() => {})` flagged by `@typescript-eslint/no-empty-function` in test files; `registeredWorkspaceDir` was declared but never used in shutdown.ts; `state.stories[orphan.storyId] !== undefined` flagged as unnecessary condition
- **Fix:** Changed console spy mocks to `.mockReturnValue(undefined)`; removed unused `registeredWorkspaceDir` variable; replaced index access condition with `Object.prototype.hasOwnProperty.call()`; fixed arrow function shorthand violations in `registerShutdownHandlers`
- **Files modified:** `src/safety/pid-registry.ts`, `src/safety/pid-registry.test.ts`, `src/safety/shutdown.ts`, `src/safety/shutdown.test.ts`
- **Commit:** Resolved before final commit 85522ec

**2. [Rule 1 - Bug] Fixed TypeScript spy type declarations in shutdown.test.ts**
- **Found during:** Task 1 typecheck
- **Issue:** `ReturnType<typeof vi.spyOn>` was too broad for the specific `process.kill` overload
- **Fix:** Changed to `ReturnType<typeof vi.spyOn<any, any>>` with appropriate eslint-disable comments
- **Files modified:** `src/safety/shutdown.test.ts`
- **Commit:** Resolved before final commit 85522ec

## Verification

All verification steps passed:

- `pnpm test -- src/safety/` — 23 tests pass
- `pnpm test -- src/prd/tracker.test.ts` — 11 tests pass (locking tests from Plan 01 unaffected)
- `pnpm typecheck` — zero errors
- `pnpm lint` — zero warnings or errors

Grep confirmations:
- `registerPid|deregisterPid` present in `src/runner.ts`
- `registerShutdownHandlers` present in `src/cli.ts` (2 locations: start + revise commands)
- `cleanupOrphans` present in `src/workspace.ts`
- `killAllAgents` present in `src/workspace.ts`
- `readRegistry` present in `src/cli.ts`
- `lockfile.check` present in `src/cli.ts`

## Commits

| Hash | Description |
|------|-------------|
| 85522ec | feat(01-02): create PID registry and shutdown modules with tests |
| b63176a | feat(01-02): integrate PID registry and shutdown into CLI, workspace, and runner |

## Self-Check: PASSED

- FOUND: src/safety/pid-registry.ts
- FOUND: src/safety/pid-registry.test.ts
- FOUND: src/safety/shutdown.ts
- FOUND: src/safety/shutdown.test.ts
- FOUND: commit 85522ec
- FOUND: commit b63176a
