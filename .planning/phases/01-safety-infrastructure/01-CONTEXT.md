# Phase 1: Safety Infrastructure - Context

**Gathered:** 2026-03-03
**Status:** Ready for planning

<domain>
## Phase Boundary

Protect state from concurrent writes and orphaned processes before any parallel agent is dispatched. File locking on state.json (SAFE-01) and process lifecycle management with PID registry (SAFE-02). No new user-facing commands — enhances existing `start`, `stop`, and `status` commands.

</domain>

<decisions>
## Implementation Decisions

### Shutdown behavior
- Graceful then force: send SIGTERM to Claude processes, wait 5 seconds, then SIGKILL if still alive
- Double Ctrl+C skips the graceful window and force-kills immediately (npm-style pattern)
- Mark interrupted stories as 'interrupted' with attempt count preserved — not reset to 'pending'

### Post-crash recovery
- `william start` auto-detects orphaned processes from PID registry and cleans them up — no manual `william stop` required
- Auto-repair state.json inconsistencies: reset 'running' stories to 'pending' if their process is dead
- Brief notice on stale PID cleanup (e.g., "Cleaned up stale PID registry from previous run"), then continue

### Safety feedback
- Minimal shutdown reporting — one summary line (e.g., "Shutting down... killed 3 agents, state saved.")
- Warn if file lock wait exceeds a threshold (helps debug rare contention issues)
- Warn specifically on force-kill: "Agent [story-1] did not respond to graceful shutdown, force-killed."
- `william status` includes safety info: active agents with PIDs, lock status, last state write time

### Claude's Discretion
- PID registry storage location (workspace-level vs global)
- File locking implementation (library choice, lock file format)
- Exact lock wait threshold before warning
- Signal handling specifics (which signals beyond SIGINT/SIGTERM)

</decisions>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches.

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/prd/tracker.ts`: Current state persistence — immutable updates via spread operators. File locking wraps around this.
- `src/adapters/claude.ts`: `spawnCapture()` spawns Claude processes via execa — PID tracking hooks into this.
- `src/workspace.ts`: Workspace lifecycle (create/start/stop) — shutdown and recovery logic extends this.

### Established Patterns
- State loaded fresh on each iteration (`tracker.ts`) — supports resume after interruption
- Child process spawning via execa with stdio pipe mode for streaming capture
- Error handling: exceptions bubble to CLI, caught and logged with descriptive messages
- Console logging with `[william]` prefix for warnings/errors

### Integration Points
- `runner.ts`: Agent execution loop — PID registration happens when spawning, cleanup on completion/error
- `cli.ts` `start` command: Auto-cleanup on startup, signal handler registration
- `cli.ts` `stop` command: Reads PID registry, sends SIGTERM/SIGKILL
- `cli.ts` `status` command: Display safety info (PIDs, lock state) alongside story progress

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 01-safety-infrastructure*
*Context gathered: 2026-03-03*
