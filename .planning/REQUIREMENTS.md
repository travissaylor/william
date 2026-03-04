# Requirements: William

**Defined:** 2026-03-03
**Core Value:** Given a PRD, William autonomously produces a clean, tested PR with zero intervention — getting the right things done accurately the first time.

## v1 Requirements

Requirements for this milestone. Each maps to roadmap phases.

### Safety Infrastructure

- [ ] **SAFE-01**: Concurrent state.json writes are protected by file locking to prevent data loss during parallel execution
- [ ] **SAFE-02**: All spawned Claude processes are killed via SIGTERM when William exits (crash, Ctrl+C, or normal exit)

### Planning & Dependencies

- [ ] **PLAN-01**: William analyzes PRD stories and infers execution dependencies (which stories must complete before others can start)
- [ ] **PLAN-02**: Dependency inference uses story content, naming patterns, and shared data models — not manual declaration

### Parallel Execution

- [ ] **EXEC-01**: Independent stories run as concurrent Claude Code processes
- [ ] **EXEC-02**: User can configure max parallel agents (default 3-5) via .william/config.json
- [ ] **EXEC-03**: Each parallel story executes in its own isolated git worktree

### Quality Verification

- [ ] **QUAL-01**: After each story completes, William automatically runs tests, lint, and typecheck — re-queuing the story on failure
- [ ] **QUAL-02**: After quality checks pass, William evaluates whether the output matches the PRD story's acceptance criteria using AI

### Terminal UI

- [ ] **TUI-01**: Dashboard shows parallel agent status lanes with per-agent token cost, story state (blocked/running/complete)
- [ ] **TUI-02**: Stream events are debounced at 100ms intervals to prevent rendering artifacts at 3+ concurrent agents

### Token Efficiency

- [ ] **TOKN-01**: William uses structured context assembly to minimize tokens sent to agents (relevant code only, not full files)
- [ ] **TOKN-02**: User can configure which Claude model to use per pipeline stage (e.g., Haiku for implementation, Opus for planning)

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Cross-Agent Context

- **CTXT-01**: Parallel agents broadcast discovered patterns and learnings to other running agents
- **CTXT-02**: Progress.txt is extended to propagate cross-agent insights in real-time

### Pipeline Configuration

- **PIPE-01**: User can add/remove/reorder workflow steps via YAML or JSON config
- **PIPE-02**: Custom hooks can run at pipeline stage boundaries

### Quality Enhancements

- **QUAL-03**: User can configure per-project quality thresholds (test coverage, lint strictness)

### Visualization

- **VIS-01**: Dependency graph visualization in TUI
- **VIS-02**: Per-spawn wall-clock timeout with configurable limits

### Notifications

- **NOTF-01**: Enhanced operator notifications on failure with error summary and story-level details

## Out of Scope

| Feature | Reason |
|---------|--------|
| Agent-to-agent direct communication | High token cost, experimental in Claude Code Agent Teams; passive context sharing is architecturally superior |
| Web dashboard / remote monitoring | CLI-first by design; adds server infra and moves away from token-efficient architecture |
| Multi-model support (OpenAI, Gemini) | William orchestrates Claude Code specifically; model-agnostic orchestrators exist elsewhere |
| Real-time collaboration / multi-user | Single-developer tool; multi-user adds auth and conflict resolution complexity |
| Agent prompt customization | Undermines "walk away" value; pipeline and quality rules are the right abstraction |
| Deployment / post-PR automation | Deployment is project-specific; PR creation is the right finish line |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| SAFE-01 | — | Pending |
| SAFE-02 | — | Pending |
| PLAN-01 | — | Pending |
| PLAN-02 | — | Pending |
| EXEC-01 | — | Pending |
| EXEC-02 | — | Pending |
| EXEC-03 | — | Pending |
| QUAL-01 | — | Pending |
| QUAL-02 | — | Pending |
| TUI-01 | — | Pending |
| TUI-02 | — | Pending |
| TOKN-01 | — | Pending |
| TOKN-02 | — | Pending |

**Coverage:**
- v1 requirements: 13 total
- Mapped to phases: 0
- Unmapped: 13

---
*Requirements defined: 2026-03-03*
*Last updated: 2026-03-03 after initial definition*
