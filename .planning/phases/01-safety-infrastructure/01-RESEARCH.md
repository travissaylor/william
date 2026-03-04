# Phase 1: Safety Infrastructure - Research

**Researched:** 2026-03-03
**Domain:** Node.js file locking, process signal handling, PID registry, graceful shutdown
**Confidence:** HIGH

## Summary

Phase 1 adds two non-negotiable safety systems before parallel agent dispatch is ever enabled: file locking on `state.json` (SAFE-01) and a PID registry with signal-driven process cleanup (SAFE-02). Both systems hook into existing code — `tracker.ts` for locking, `claude.ts` / `runner.ts` for PID tracking, and `cli.ts` / `workspace.ts` for signal handlers and startup cleanup.

The core file-locking mechanism is `proper-lockfile` (v4.1.2), a well-established library that uses atomic `mkdir` to acquire locks and periodically updates lock `mtime` to detect staleness. It integrates directly around the existing `loadState`/`saveState` pair in `tracker.ts`. For the PID registry, the simplest and most reliable approach is a workspace-scoped JSON file (`pid-registry.json`) written next to `state.json`. Both pieces are pure Node.js — no additional runtime dependencies beyond `proper-lockfile` and `@types/proper-lockfile`.

**Primary recommendation:** Wrap `saveState` with a `proper-lockfile`-protected write using the write-then-rename atomic pattern for `state.json`, and build a simple PID registry module that integrates into `runner.ts` spawn/exit hooks and `cli.ts` signal handlers with SIGTERM-then-SIGKILL escalation after a 5-second window.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **Shutdown behavior:** Graceful then force — send SIGTERM to Claude processes, wait 5 seconds, then SIGKILL if still alive
- **Double Ctrl+C:** Skips the graceful window and force-kills immediately (npm-style pattern)
- **Interrupted stories:** Mark as 'interrupted' with attempt count preserved — not reset to 'pending'
- **Post-crash recovery:** `william start` auto-detects orphaned processes from PID registry and cleans them up — no manual `william stop` required
- **Auto-repair state.json inconsistencies:** Reset 'running' stories to 'pending' if their process is dead
- **Brief notice on stale PID cleanup:** e.g., "Cleaned up stale PID registry from previous run", then continue
- **Minimal shutdown reporting:** One summary line (e.g., "Shutting down... killed 3 agents, state saved.")
- **Warn if file lock wait exceeds threshold:** Helps debug rare contention issues
- **Warn on force-kill:** "Agent [story-1] did not respond to graceful shutdown, force-killed."
- **`william status` includes safety info:** Active agents with PIDs, lock status, last state write time

### Claude's Discretion
- PID registry storage location (workspace-level vs global)
- File locking implementation (library choice, lock file format)
- Exact lock wait threshold before warning
- Signal handling specifics (which signals beyond SIGINT/SIGTERM)

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| SAFE-01 | Concurrent state.json writes are protected by file locking to prevent data loss during parallel execution | `proper-lockfile` v4.1.2 wraps `saveState` in `tracker.ts`; atomic mkdir strategy guarantees safety across processes |
| SAFE-02 | All spawned Claude processes are killed via SIGTERM when William exits (crash, Ctrl+C, or normal exit) | `process.on('SIGINT'/'SIGTERM')` in `cli.ts`; workspace-scoped PID registry JSON file; `process.kill(pid, 'SIGTERM')` then `SIGKILL` after 5s timeout |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| proper-lockfile | 4.1.2 | File locking for state.json | Atomic mkdir strategy; handles stale locks; 664+ dependents; built-in mtime heartbeat |
| @types/proper-lockfile | 3.0.1 (types 4.1.4) | TypeScript types | Required for TypeScript compilation; project uses strict TS |
| Node.js built-ins: `process`, `child_process` | (runtime) | Signal handling, PID tracking, process.kill() | No extra deps needed; process.kill(pid, 0) for liveness check |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `fs` (built-in) | (runtime) | PID registry JSON read/write | Synchronous ops acceptable for registry; keep it simple |
| vitest | 2.x (already installed) | Test suite | All existing tests use vitest; add new test files alongside existing ones |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| proper-lockfile | write-file-atomic v7.0.1 | write-file-atomic serializes writes within one process but does NOT prevent concurrent multi-process access — insufficient for SAFE-01's inter-process requirement |
| proper-lockfile | manual advisory lock (open O_EXCL) | Would need to hand-roll stale detection, mtime heartbeat, retry logic — all provided by proper-lockfile |
| workspace-scoped pid-registry.json | global PID registry | Global registry creates cross-workspace coupling; workspace-scoped is simpler, maps cleanly to one workspace = one `william start` session |

**Installation:**
```bash
pnpm add proper-lockfile
pnpm add -D @types/proper-lockfile
```

## Architecture Patterns

### Recommended Project Structure
```
src/
├── prd/
│   └── tracker.ts          # Add: withStateLock() wrapper, saveStateLocked()
├── safety/
│   ├── pid-registry.ts     # NEW: PID registry read/write/cleanup
│   └── shutdown.ts         # NEW: signal handler registration, graceful kill logic
└── cli.ts                  # Modify: register signal handlers, startup cleanup
```

### Pattern 1: File Lock Around State Writes

**What:** Wrap `saveState` in a proper-lockfile acquire/release that holds the lock only for the duration of the write. Reads do not need the lock (reads are atomic for JSON files of this size on all filesystems used by william).

**When to use:** Every call to `saveState` in `runner.ts` and anywhere else state is mutated.

**Example:**
```typescript
// Source: https://github.com/moxystudio/node-proper-lockfile
import lockfile from 'proper-lockfile';
import { saveState, loadState } from './tracker.js';

export async function saveStateLocked(
  statePath: string,
  state: WorkspaceState
): Promise<void> {
  const release = await lockfile.lock(statePath, {
    retries: { retries: 5, minTimeout: 100, maxTimeout: 500 },
    stale: 10_000,   // 10 seconds — generous for disk I/O
  });
  try {
    saveState(statePath, state);
  } finally {
    await release();
  }
}
```

**Lock file location:** `proper-lockfile` creates `state.json.lock` (a directory) adjacent to `state.json`. No configuration needed.

### Pattern 2: PID Registry

**What:** A JSON file `pid-registry.json` in the workspace directory that maps story IDs to child process PIDs. Written when a process is spawned, deleted when it exits normally.

**When to use:** `runner.ts` — register PID after `adapter.spawn()` returns; deregister in the `close` handler of `consumeStreamOutput`.

**Example:**
```typescript
// src/safety/pid-registry.ts
import * as fs from 'fs';
import * as path from 'path';

export interface PidEntry {
  pid: number;
  storyId: string;
  startedAt: string;
}

export function readRegistry(workspaceDir: string): PidEntry[] {
  const registryPath = path.join(workspaceDir, 'pid-registry.json');
  if (!fs.existsSync(registryPath)) return [];
  try {
    return JSON.parse(fs.readFileSync(registryPath, 'utf-8')) as PidEntry[];
  } catch {
    return [];
  }
}

export function registerPid(workspaceDir: string, storyId: string, pid: number): void {
  const registryPath = path.join(workspaceDir, 'pid-registry.json');
  const entries = readRegistry(workspaceDir);
  entries.push({ pid, storyId, startedAt: new Date().toISOString() });
  fs.writeFileSync(registryPath, JSON.stringify(entries, null, 2), 'utf-8');
}

export function deregisterPid(workspaceDir: string, pid: number): void {
  const registryPath = path.join(workspaceDir, 'pid-registry.json');
  const entries = readRegistry(workspaceDir).filter(e => e.pid !== pid);
  if (entries.length === 0) {
    if (fs.existsSync(registryPath)) fs.unlinkSync(registryPath);
  } else {
    fs.writeFileSync(registryPath, JSON.stringify(entries, null, 2), 'utf-8');
  }
}

export function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
```

### Pattern 3: Signal Handler with Double Ctrl+C

**What:** Register `SIGINT`/`SIGTERM` handlers in `cli.ts` before `startWorkspace` is called. Track a `shuttingDown` flag. First signal: SIGTERM all registered PIDs, wait 5s, SIGKILL survivors. Second signal during grace window: immediate SIGKILL.

**When to use:** `start` command action in `cli.ts` — attach before `await startWorkspace(...)` and clean up in the `finally` block.

**Example:**
```typescript
// Source: Node.js docs - https://nodejs.org/api/process.html#signal-events
// Pattern from: https://dev.to/superiqbal7/graceful-shutdown-in-nodejs-handling-stranger-danger-29jo

let shuttingDown = false;

async function gracefulShutdown(signal: string, workspaceDir: string): Promise<void> {
  if (shuttingDown) {
    // Double Ctrl+C — force kill immediately
    console.log('[william] Force shutdown requested. Killing all agents immediately...');
    const entries = readRegistry(workspaceDir);
    for (const { pid, storyId } of entries) {
      try { process.kill(pid, 'SIGKILL'); } catch { /* already dead */ }
    }
    process.exit(1);
  }
  shuttingDown = true;

  const entries = readRegistry(workspaceDir);
  const alive = entries.filter(e => isProcessAlive(e.pid));

  // SIGTERM all alive processes
  for (const { pid } of alive) {
    try { process.kill(pid, 'SIGTERM'); } catch { /* already dead */ }
  }

  // Wait 5 seconds for graceful exit
  const GRACE_MS = 5_000;
  await new Promise(resolve => setTimeout(resolve, GRACE_MS));

  // SIGKILL any survivors
  let forceKilled = 0;
  for (const { pid, storyId } of alive) {
    if (isProcessAlive(pid)) {
      try { process.kill(pid, 'SIGKILL'); } catch { /* ignore */ }
      forceKilled++;
      console.warn(`[william] Agent [${storyId}] did not respond to graceful shutdown, force-killed.`);
    }
  }

  const killedCount = alive.length;
  console.log(`[william] Shutting down... killed ${killedCount} agent${killedCount !== 1 ? 's' : ''}, state saved.`);
  process.exit(signal === 'SIGINT' ? 130 : 143);
}

// Registration in cli.ts start command:
process.on('SIGINT', () => gracefulShutdown('SIGINT', workspaceDir));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM', workspaceDir));
```

### Pattern 4: Startup Orphan Cleanup

**What:** On `william start`, read the PID registry before entering the run loop. For each entry: check liveness with `process.kill(pid, 0)`; if dead, mark its story as 'interrupted' in state.json (not 'pending'). Print a single notice if any stale PIDs found.

**Example:**
```typescript
// In workspace.ts startWorkspace() — before runWorkspace():
async function cleanupOrphanedProcesses(workspaceDir: string, statePath: string): Promise<void> {
  const entries = readRegistry(workspaceDir);
  if (entries.length === 0) return;

  const staleEntries = entries.filter(e => !isProcessAlive(e.pid));
  if (staleEntries.length === 0) return;

  console.log(`[william] Cleaned up stale PID registry from previous run (${staleEntries.length} orphaned PID${staleEntries.length !== 1 ? 's' : ''}).`);

  // Auto-repair: any 'running' story whose PID is dead → 'interrupted'
  const state = loadState(statePath);
  // (mark affected stories as interrupted, preserve attempt count)
  saveState(statePath, repairedState);

  // Remove dead entries from registry
  for (const e of staleEntries) {
    deregisterPid(workspaceDir, e.pid);
  }
}
```

### Anti-Patterns to Avoid

- **Locking reads, not just writes:** Lock contention on reads kills concurrency. `state.json` is small; reads are effectively atomic. Only lock writes.
- **Global PID registry:** Cross-workspace coupling creates complex cleanup scenarios. Keep `pid-registry.json` workspace-scoped.
- **SIGKILL without SIGTERM first:** SIGKILL prevents Claude from saving its context. Always attempt SIGTERM first with the 5-second window.
- **Registering the signal handler inside `runWorkspace`:** The handler must be registered before the workspace starts, in the `start` command action, so it fires even if `runWorkspace` throws during setup.
- **Not cleaning up the lock on crash:** `proper-lockfile` auto-releases on normal exit but NOT on SIGKILL. Design so that stale lock cleanup (via `stale` option) handles this case automatically.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Stale lock detection | Custom mtime polling | proper-lockfile `stale` option | proper-lockfile updates mtime on a heartbeat; detects process death automatically |
| Lock file atomicity | `writeFileSync` of a flag file | proper-lockfile (uses `mkdir` internally) | `mkdir` is atomic on POSIX and NFS; `writeFileSync` is not |
| Retry-on-contention | Sleep loop with random backoff | proper-lockfile `retries` option (uses `retry` package) | Exponential backoff with jitter already built in |
| Process liveness check | Querying `/proc` or platform APIs | `process.kill(pid, 0)` in a try/catch | Cross-platform, built-in, no dependencies |

**Key insight:** File locking has many edge cases (stale locks after crash, NFS mtime granularity, TOCTOU races) that `proper-lockfile` has already solved over 10+ years and 664+ dependent packages.

## Common Pitfalls

### Pitfall 1: Lock Not Released on Uncaught Exception
**What goes wrong:** If `saveState` throws (corrupt JSON, disk full), the lock is never released; subsequent processes spin forever on retries.
**Why it happens:** Forgetting `try/finally` around the lock.
**How to avoid:** Always wrap the locked operation in `try/finally { await release(); }`.
**Warning signs:** Workspace hangs indefinitely on the next `william start`.

### Pitfall 2: Signal Handler Registered Too Late
**What goes wrong:** If `startWorkspace` throws during setup (worktree missing, etc.), the SIGINT handler was never registered — Ctrl+C just kills the parent without cleaning up children.
**Why it happens:** Registering signals inside `startWorkspace` rather than in the `cli.ts` action.
**How to avoid:** Register signal handlers in the `cli.ts` `start` action BEFORE calling `startWorkspace`. Track the workspace directory in closure scope.
**Warning signs:** Claude processes remain alive after parent crashes during workspace validation.

### Pitfall 3: PID Registry Survives Across Stale Workspaces
**What goes wrong:** PID from a previous session collides with a new process that was assigned the same PID by the OS. Startup cleanup incorrectly treats the new process as the old agent.
**Why it happens:** OS reuses PIDs aggressively.
**How to avoid:** Store `startedAt` timestamp in each PID entry. On cleanup, if a PID is alive but `startedAt` is from a previous session (e.g., more than a few minutes ago), treat it as stale regardless.
**Warning signs:** Startup cleanup incorrectly kills a new unrelated process.

### Pitfall 4: Concurrent Registry Writes (Phase 3 Preview)
**What goes wrong:** Multiple agent processes write to `pid-registry.json` simultaneously (relevant in Phase 3 when agents run in parallel), causing partial JSON corruption.
**Why it happens:** `writeFileSync` is not atomic across OS processes.
**How to avoid:** Use `proper-lockfile` on `pid-registry.json` as well, OR funnel all registry writes through the parent process only (cleanest for the current architecture where `runner.ts` spawns all children).
**Warning signs:** JSON parse errors on `pid-registry.json` at startup.

### Pitfall 5: Lock File Persisting After SIGKILL
**What goes wrong:** If William itself is SIGKILL'd, `proper-lockfile` cannot auto-release the lock. The next `william start` finds a fresh lock file and the `stale` timeout must expire before it can acquire.
**Why it happens:** SIGKILL cannot be caught; no cleanup code runs.
**How to avoid:** Set `stale` to a reasonable value (10000ms default is fine). The next `william start` will wait at most `stale` ms before the lock is considered stale and acquired. This is acceptable.
**Warning signs:** `william start` hangs for ~10 seconds after an abnormal kill.

## Code Examples

Verified patterns from official sources:

### Acquiring and Releasing a Lock
```typescript
// Source: https://github.com/moxystudio/node-proper-lockfile
import lockfile from 'proper-lockfile';

const release = await lockfile.lock('/path/to/state.json', {
  retries: { retries: 5, minTimeout: 100, maxTimeout: 500 },
  stale: 10_000,
});
try {
  // perform write
} finally {
  await release();
}
```

### Checking Lock Contention for Status Display
```typescript
// Source: https://github.com/moxystudio/node-proper-lockfile
import lockfile from 'proper-lockfile';

const isLocked = await lockfile.check('/path/to/state.json');
// Use in `william status` to show lock status
```

### Checking if a PID is Alive (Cross-Platform)
```typescript
// Source: Node.js docs - https://nodejs.org/api/process.html
function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0); // Signal 0 = existence check only
    return true;
  } catch {
    return false; // ESRCH = no such process
  }
}
```

### Registering SIGINT/SIGTERM Handlers Before Async Work
```typescript
// Source: https://nodejs.org/api/process.html#signal-events
let shuttingDown = false;

process.on('SIGINT', async () => {
  if (shuttingDown) {
    process.exit(1); // Second Ctrl+C = force exit
  }
  shuttingDown = true;
  await gracefulShutdown('SIGINT', workspaceDir);
});

process.on('SIGTERM', async () => {
  if (!shuttingDown) {
    shuttingDown = true;
    await gracefulShutdown('SIGTERM', workspaceDir);
  }
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `writeFileSync` for state (current) | `saveStateLocked` with proper-lockfile | Phase 1 | Concurrent writes from Phase 3 parallel agents won't corrupt state |
| No signal handling (current) | SIGINT/SIGTERM handlers with PID registry cleanup | Phase 1 | Ctrl+C and crashes no longer leave orphaned Claude processes |
| No story status for interruptions (current) | 'interrupted' status preserving attempt count | Phase 1 | Post-crash recovery can resume intelligently |

**Deprecated/outdated:**
- `stopWorkspace` currently only writes a `.stopped` marker file — it does NOT kill active processes. Phase 1 changes `stop` to also read the PID registry and SIGTERM all live agents.

## Open Questions

1. **StoryState needs an 'interrupted' status value**
   - What we know: Current `StoryState.passes` is `boolean | "skipped"`. The decisions require an 'interrupted' status.
   - What's unclear: Whether to add `"interrupted"` to the `passes` union type, or track it in a separate field (e.g., `interrupted?: boolean`).
   - Recommendation: Add `"interrupted"` to the `passes` union — consistent with how 'skipped' is handled. Update `getCurrentStory` to treat 'interrupted' the same as `false` (pending) so those stories get retried on resume.

2. **Lock wait threshold value**
   - What we know: CONTEXT.md says "warn if file lock wait exceeds a threshold" — exact value is Claude's discretion.
   - What's unclear: What's the right threshold? Lock wait correlates with how long a write takes (typically < 100ms for state.json).
   - Recommendation: 2000ms (2 seconds). If a lock is held longer than that, something is pathologically wrong (stalled process, deadlock). Log `[william] Warning: state lock held for >2s — possible contention.`

3. **SIGHUP handling**
   - What we know: SIGTERM and SIGINT are explicitly mentioned. SIGHUP fires when the terminal window closes.
   - What's unclear: Whether William needs SIGHUP handling.
   - Recommendation: Also handle SIGHUP the same as SIGTERM. Terminal close should trigger cleanup. Keep it simple — same handler as SIGTERM.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 2.x |
| Config file | none — uses package.json defaults |
| Quick run command | `pnpm test --run --dir src` |
| Full suite command | `pnpm test --run --dir src` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SAFE-01 | Concurrent saveState calls don't corrupt state.json | unit | `pnpm test --run --dir src src/prd/tracker.test.ts` | Wave 0 |
| SAFE-01 | Lock releases on error in write operation | unit | `pnpm test --run --dir src src/prd/tracker.test.ts` | Wave 0 |
| SAFE-01 | Lock status visible via lockfile.check() | unit | `pnpm test --run --dir src src/prd/tracker.test.ts` | Wave 0 |
| SAFE-02 | PID registry registers/deregisters correctly | unit | `pnpm test --run --dir src src/safety/pid-registry.test.ts` | Wave 0 |
| SAFE-02 | isProcessAlive returns false for dead PID | unit | `pnpm test --run --dir src src/safety/pid-registry.test.ts` | Wave 0 |
| SAFE-02 | Startup cleanup marks interrupted stories, logs notice | unit | `pnpm test --run --dir src src/safety/pid-registry.test.ts` | Wave 0 |
| SAFE-02 | Signal handler force-kills on double Ctrl+C | manual-only | N/A — cannot programmatically send SIGINT to self reliably in vitest | manual |

### Sampling Rate
- **Per task commit:** `pnpm test --run --dir src`
- **Per wave merge:** `pnpm test --run --dir src`
- **Phase gate:** Full suite green (104 existing + new tests) before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `src/prd/tracker.test.ts` — covers SAFE-01 (lock acquire/release/contention)
- [ ] `src/safety/pid-registry.test.ts` — covers SAFE-02 (registry, liveness, orphan cleanup)
- [ ] `src/safety/shutdown.test.ts` — covers SAFE-02 (graceful shutdown logic, mocked signals)
- [ ] Framework install: `pnpm add proper-lockfile && pnpm add -D @types/proper-lockfile`

## Sources

### Primary (HIGH confidence)
- `https://github.com/moxystudio/node-proper-lockfile` — lock/unlock/check API, stale behavior, auto-release behavior
- `https://nodejs.org/api/process.html#signal-events` — SIGINT/SIGTERM/SIGHUP handling, process.kill(), double-signal pattern
- npm registry (`pnpm info proper-lockfile`) — version 4.1.2, last modified 2022-06-24; `@types/proper-lockfile` 4.1.4

### Secondary (MEDIUM confidence)
- `https://github.com/npm/write-file-atomic` — confirmed write-file-atomic uses temp+rename but only serializes within one process (insufficient for SAFE-01)
- `https://dev.to/superiqbal7/graceful-shutdown-in-nodejs-handling-stranger-danger-29jo` — double Ctrl+C pattern confirmed via multiple sources

### Tertiary (LOW confidence)
- npm-compare.com comparison of proper-lockfile vs async-lock vs lockfile — shows proper-lockfile is standard choice for inter-process locking (not verified against official docs)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — verified via npm registry, official GitHub README
- Architecture: HIGH — patterns derived from official Node.js docs and proper-lockfile README
- Pitfalls: HIGH — derived from library behavior (documented) and existing code analysis

**Research date:** 2026-03-03
**Valid until:** 2026-09-03 (proper-lockfile is stable/unmaintained at 4.1.2 — API will not change)
