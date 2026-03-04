# Roadmap: William

## Overview

William's existing foundation handles workspace lifecycle, sequential agent execution, TUI dashboards, and PR creation. This milestone layers four critical capabilities on top: safety infrastructure that makes parallel execution viable, dependency-aware scheduling that determines correct execution order, a parallel executor that runs independent stories concurrently, automated quality verification that gates each story's output, a multi-agent TUI that presents live parallel progress, and token efficiency features that minimize AI cost. Phases must execute in order — each phase is a hard prerequisite for the next.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Safety Infrastructure** - Protect state from concurrent writes and orphaned processes before any parallel agent is dispatched
- [ ] **Phase 2: Dependency Analysis** - Infer story execution order from PRD content so William knows what can run in parallel
- [ ] **Phase 3: Parallel Execution Engine** - Run independent stories as concurrent Claude Code processes in isolated worktrees
- [ ] **Phase 4: Quality Verification Loop** - Automatically verify each completed story against tests, lint, typecheck, and PRD acceptance criteria
- [ ] **Phase 5: Multi-Agent TUI** - Show live parallel agent status lanes with per-agent token cost and story state
- [ ] **Phase 6: Token Efficiency** - Reduce tokens sent to agents via structured context assembly and per-stage model selection

## Phase Details

### Phase 1: Safety Infrastructure
**Goal**: Concurrent state writes, orphaned processes, and token runaway are eliminated before any parallel agent is ever dispatched
**Depends on**: Nothing (first phase)
**Requirements**: SAFE-01, SAFE-02
**Success Criteria** (what must be TRUE):
  1. Three simultaneous story completions all write to state.json without data loss or corruption
  2. Pressing Ctrl+C or crashing William kills all active Claude processes with no orphaned PIDs remaining
  3. Running `william stop` after a crash terminates any processes listed in the PID registry
**Plans:** 1/2 plans executed
Plans:
- [ ] 01-01-PLAN.md — File locking for state.json writes and StoryState "interrupted" type extension
- [ ] 01-02-PLAN.md — PID registry, signal handlers, and process lifecycle management

### Phase 2: Dependency Analysis
**Goal**: William can analyze a PRD and produce a cycle-free execution graph that identifies which stories depend on which
**Depends on**: Phase 1
**Requirements**: PLAN-01, PLAN-02
**Success Criteria** (what must be TRUE):
  1. Given a multi-story PRD, William prints which stories are independent and which are blocked by others before starting any agent
  2. Dependency inference uses story content and naming — not a manually declared config file
  3. A PRD with circular story dependencies causes William to halt with a clear error before dispatching any agent
**Plans**: TBD

### Phase 3: Parallel Execution Engine
**Goal**: Independent stories execute as simultaneous Claude Code processes, each isolated in its own worktree, subject to a configurable concurrency cap
**Depends on**: Phase 2
**Requirements**: EXEC-01, EXEC-02, EXEC-03
**Success Criteria** (what must be TRUE):
  1. Running `william start` on a PRD with independent stories starts multiple Claude Code processes visibly running at the same time
  2. Each parallel story executes in its own git worktree with no file conflicts between agents
  3. Setting `maxParallelAgents` in `.william/config.json` caps how many agents run simultaneously — excess stories wait in queue
  4. Dependent stories do not start until all their upstream stories complete successfully
**Plans**: TBD

### Phase 4: Quality Verification Loop
**Goal**: Every completed story is automatically verified against tests, lint, typecheck, and PRD acceptance criteria — failures re-queue the story without user intervention
**Depends on**: Phase 3
**Requirements**: QUAL-01, QUAL-02
**Success Criteria** (what must be TRUE):
  1. After a story agent finishes, William automatically runs tests, lint, and typecheck — visible in the terminal — without any user action
  2. A story that fails quality checks is re-queued and the agent runs again; the retry is visible as a state transition in the terminal
  3. After quality checks pass, William evaluates whether the output matches the story's acceptance criteria and surfaces the result
**Plans**: TBD

### Phase 5: Multi-Agent TUI
**Goal**: The terminal dashboard shows one status lane per running agent with live token cost, story state, and stream output — with no rendering artifacts at 3+ concurrent agents
**Depends on**: Phase 4
**Requirements**: TUI-01, TUI-02
**Success Criteria** (what must be TRUE):
  1. Running `william start` with 3+ parallel stories shows a separate status panel per agent, each displaying the story name, current state (blocked/running/verifying/complete), and token cost
  2. The dashboard updates smoothly at 3+ concurrent agents — no visible flickering, no interleaved output between agents
  3. Completed agent panels persist in the display so the user can see which stories finished and at what cost
**Plans**: TBD

### Phase 6: Token Efficiency
**Goal**: William sends only relevant code context to agents and allows per-stage model selection so token spend is minimized across a full PRD run
**Depends on**: Phase 5
**Requirements**: TOKN-01, TOKN-02
**Success Criteria** (what must be TRUE):
  1. Agent prompts include only the code files relevant to the story being executed — not full repository contents — observable by inspecting the prompt sent to Claude
  2. Setting per-stage model configuration in `.william/config.json` changes which Claude model runs for that stage — verifiable by checking the model field in Claude API logs or agent output
**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Safety Infrastructure | 1/2 | In Progress|  |
| 2. Dependency Analysis | 0/? | Not started | - |
| 3. Parallel Execution Engine | 0/? | Not started | - |
| 4. Quality Verification Loop | 0/? | Not started | - |
| 5. Multi-Agent TUI | 0/? | Not started | - |
| 6. Token Efficiency | 0/? | Not started | - |
