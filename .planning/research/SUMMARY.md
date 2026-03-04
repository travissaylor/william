# Project Research Summary

**Project:** William — PRD-to-code orchestrator
**Domain:** Autonomous CLI orchestrator for parallel AI coding agents (PRD-to-PR pipeline)
**Researched:** 2026-03-03
**Confidence:** HIGH

## Executive Summary

William is a PRD-to-PR autonomous coding orchestrator, and the research is unambiguous about what the next milestone must deliver: parallel story execution with dependency-aware scheduling, automated quality verification, and a multi-agent TUI. Every credible competitor (ComposioHQ, Factory Droid, Claude Code Agent Teams) runs agents in parallel by default. Sequential execution is a fundamental throughput bottleneck that makes William unsuitable for real PRDs with 5+ stories. The path forward is to layer a Planner/Scheduler above the existing sequential runner, introduce a parallel Executor pool gated by a semaphore, wrap each story in a deterministic verification loop, and extend the TUI with per-agent panels — all built on existing foundations (Commander.js, execa, Ink, React) with targeted additions (Claude Agent SDK, p-limit, graph-data-structure, Zod).

The recommended implementation strategy follows a strict build order imposed by component dependencies: dependency analysis first (pure logic, testable in isolation), then scheduling infrastructure (semaphore + DAG scheduler), then parallel execution (executor pool extracted from runner.ts), then verification (deterministic checks before any LLM judge), then TUI extension. This order matters because you cannot safely dispatch parallel agents without cycle-free dependency graphs, and you cannot build a meaningful TUI before the execution and verification event model exists. The existing codebase's architecture maps cleanly to the target — no wholesale rewrites are needed, only additive components in new directories (scheduler/, executor/, verification/).

The key risks are operational, not architectural: concurrent writes to state.json will corrupt workspace state without a file lock or centralized state manager; orphaned Claude processes will continue burning tokens if SIGINT/SIGTERM handlers are absent; and the Claude Agent SDK requires ANTHROPIC_API_KEY where the existing codebase uses the Claude CLI's OAuth token storage, which may not be set for existing users. These three risks must be addressed before any parallel agent is dispatched. The architecture research is validated by Cursor, Anthropic, and Spotify's documented production experience — the patterns are well-understood and the tradeoffs are explicit.

## Key Findings

### Recommended Stack

The existing stack (TypeScript 5, Node.js 22, Commander.js, execa 9, Ink 5, React 18, Vitest 2) is solid and should not be replaced. The milestone requires four targeted additions and two upgrades. The most important addition is `@anthropic-ai/claude-agent-sdk` (v0.2.63) which provides a typed, stable contract for spawning Claude agents programmatically, replacing fragile NDJSON parsing tied to Claude CLI internals. However, the SDK requires `ANTHROPIC_API_KEY` while current users authenticate via `claude auth login` (OAuth) — this must be validated with users before switching, or a subprocess fallback must be maintained.

**Core technologies:**
- `@anthropic-ai/claude-agent-sdk` 0.2.63: Typed Claude agent execution — stable replacement for manual NDJSON parsing; verify ANTHROPIC_API_KEY requirement with users
- `p-limit` 7.3.0: Concurrency cap for parallel agents — prevents API rate limit exhaustion and resource overload; ESM-native, minimal dependency
- `graph-data-structure` 4.5.0: Story dependency DAG with topological sort and CycleError — TypeScript-native, purpose-built for task scheduling; avoids owning untested cycle-detection code
- `ink` 6.8.0 (upgrade from 5): Concurrent rendering support for parallel agent TUI — requires React 19 upgrade; has breaking changes, budget a migration spike before building new TUI components
- `zod` 4.3.6: Runtime config validation for pipeline/quality rules — verify compatibility with claude-agent-sdk which declares `zod ^3.24.1`; may need to stay on Zod 3 to avoid two Zod instances in bundle

See [STACK.md](.planning/research/STACK.md) for full alternatives analysis and version compatibility matrix.

### Expected Features

Research confirms the four P1 features from the PROJECT.md gaps are correct and non-negotiable for this milestone. Every major orchestrator ships parallel execution; without it William is categorically behind. Quality verification (execution-based, not LLM-based) is the mechanism that prevents the 70%+ AI code rework rate from becoming the user's problem. Intent verification (P2) is a meaningful differentiator but must wait until parallel execution is stable — it adds cost without value if the core pipeline is not proven.

**Must have (table stakes) — this milestone:**
- Story dependency analysis — infer DAG from PRD; block dependent stories; cycle detection before dispatch
- Parallel story execution — concurrent Claude processes in separate worktrees; configurable concurrency limit (default 3)
- Post-story quality verification loop — deterministic first (test + lint + typecheck); re-queue on failure; configurable thresholds
- Multi-agent progress UI — per-agent panels in TUI with live stream, status, token cost, blocked/running/done states

**Should have (competitive) — v1.x after validation:**
- Intent verification (PRD-to-output matching) — catches semantic drift that tests miss; costs extra tokens so should be opt-in
- Cross-agent context propagation — broadcasts discovered patterns to parallel agents via shared context file; prevents duplicate architectural discovery work
- Customizable quality rules per project — per-project config for test coverage thresholds, lint/typecheck toggles

**Defer (v2+):**
- Customizable pipeline stages — requires stable stage abstraction first
- Model selection per stage (Opus for planning, Haiku for implementation) — triggered by token cost complaints
- Agent-to-agent direct communication — an anti-feature; passive context propagation is sufficient and cheaper

See [FEATURES.md](.planning/research/FEATURES.md) for full competitor analysis and feature dependency graph.

### Architecture Approach

The target architecture adds four new layers above the existing foundations: Planning (Dependency Analyzer + Pipeline Registry), Scheduler (DAG Scheduler + Semaphore + Story State Machine), Executor Pool (Agent Slot extracted from runner.ts + Pool), and Verification (Deterministic Verifiers + optional LLM Judge). These layers communicate via an EventEmitter that all layers share — fire-and-forget events flow to the TUI without blocking execution. The existing `runner.ts` sequential loop stays for the revision flow; the new parallel path replaces it for `william start`.

**Major components:**
1. `prd/dependency-analyzer.ts` — Heuristics-first (shared nouns, explicit markers) + optional LLM pass; outputs StoryDependencyGraph; CycleError on circular deps
2. `scheduler/dag-scheduler.ts` — Kahn's algorithm for wave batches; semaphore-gated dispatch; story state machine (pending → running → verifying → done | failed | retry)
3. `executor/agent-slot.ts` — Single-story Claude process execution extracted from runner.ts; per-agent AbortController; orphan cleanup on exit
4. `verification/runner.ts` — Deterministic verifiers via execa; separate from agent context window (agents don't self-report); LLM judge is opt-in second stage
5. `ui/OrchestrationDashboard.tsx` + `AgentPanel.tsx` — Ink 6 parallel panels with debounced state updates; `<Static>` for completed agents to prevent full-tree rerenders

See [ARCHITECTURE.md](.planning/research/ARCHITECTURE.md) for full data flows, component boundaries, and anti-patterns.

### Critical Pitfalls

1. **Concurrent state.json writes corrupt workspace state** — Use `proper-lockfile` or a central state manager process that owns state.json and receives IPC updates from workers. Must be solved before any parallel agent is dispatched. Test by simulating 3 simultaneous story completions and verifying all 3 are recorded.

2. **Orphaned Claude processes after exit/crash** — Register `process.on('SIGINT')`, `process.on('SIGTERM')`, and `process.on('uncaughtException')` handlers that kill all active PIDs before exiting. Write active PIDs to `.running-pids` for `william stop` recovery. Without this, parallel agents run unattended at full token cost after William exits.

3. **Token runaway from Claude autocompaction loop** — Add wall-clock timeout per agent spawn (configurable, default 30 minutes) and per-spawn token budget (default 50K tokens). The existing `maxIterations` circuit breaker does not catch compaction-level loops. Kill with SIGTERM then SIGKILL after 5 seconds.

4. **Dependency analysis producing circular or underspecified graphs** — After LLM dependency analysis, always run deterministic cycle detection (topological sort; throw CycleError before dispatch). For parallel safety, treat "independent" as a claim requiring proof by file path non-overlap, not an assumption.

5. **Ink TUI full-tree rerenders under parallel stream load** — Debounce TUI updates to 100ms intervals per agent; use `React.memo` on per-agent components; use `<Static>` for completed stories. Without this, 3+ concurrent agents produce visible flickering and interleaved terminal artifacts.

See [PITFALLS.md](.planning/research/PITFALLS.md) for 7 critical pitfalls, recovery strategies, and a phase-to-pitfall mapping.

## Implications for Roadmap

Based on the component dependency chain from ARCHITECTURE.md and the pitfall-to-phase mapping from PITFALLS.md, the following phase structure is strongly recommended. Each phase can be built and tested independently; phases must be delivered in this order.

### Phase 1: Safety Infrastructure
**Rationale:** All parallel execution is unsafe without these foundations. Concurrent state.json writes, orphaned processes, and token runaway are CRITICAL pitfalls that will corrupt data or generate unexpected costs on the first real parallel run. Build these before any concurrent agent is ever spawned.
**Delivers:** Locked state writes (proper-lockfile or IPC), SIGINT/SIGTERM cleanup with PID registry, wall-clock timeout + token budget per agent spawn
**Addresses:** "Persistent state with resume capability" (table stakes), process lifecycle safety
**Avoids:** Pitfall 1 (state.json corruption), Pitfall 3 (token runaway), Pitfall 7 (orphaned processes)
**Research flag:** Standard patterns — file locking and signal handling are well-documented Node.js patterns; skip research-phase

### Phase 2: Dependency Analysis
**Rationale:** Dependency analysis is a hard prerequisite for safe parallelism. You cannot dispatch parallel agents until you know which stories can run concurrently without conflict. This is pure logic (no I/O) and can be built and unit-tested completely before any parallel execution code exists.
**Delivers:** `prd/dependency-analyzer.ts` — heuristics-first DAG construction, optional LLM pass, mandatory CycleError on circular deps; `StoryDependencyGraph` type in types.ts
**Addresses:** "Story dependency analysis" (P1 table stakes)
**Avoids:** Pitfall 4 (dependency cycle deadlock)
**Uses:** `graph-data-structure` 4.5.0 for topological sort + CycleError
**Research flag:** Standard patterns — DAG scheduling is well-documented; skip research-phase. However, the heuristic dependency detection (shared nouns, file paths in story text) may need a phase-specific research spike if accuracy proves insufficient.

### Phase 3: Parallel Execution Engine
**Rationale:** The core product capability. Build the scheduler, semaphore, agent slot extraction, and executor pool. This phase assumes Phase 1 (safe state writes, process cleanup) and Phase 2 (cycle-free dependency graph) are complete.
**Delivers:** `scheduler/dag-scheduler.ts`, `scheduler/concurrency.ts`, `scheduler/story-state-machine.ts`, `executor/agent-slot.ts`, `executor/pool.ts` — parallel stories dispatched in dependency-ordered waves with configurable concurrency cap
**Addresses:** "Parallel story execution" (P1 table stakes)
**Avoids:** Pitfall 2 (git index.lock collisions — add agent instruction constraints), Pitfall 4 (cycle deadlock — already handled by Phase 2)
**Uses:** `p-limit` 7.3.0 or custom Semaphore for concurrency cap; `@anthropic-ai/claude-agent-sdk` 0.2.63 (or subprocess fallback if API key unavailable)
**Research flag:** Needs research-phase — Claude Agent SDK auth model (ANTHROPIC_API_KEY vs OAuth) must be validated with real users before committing to SDK migration. Subprocess fallback path may need to stay permanently.

### Phase 4: Quality Verification Loop
**Rationale:** Automated quality gates are the mechanism that makes parallel execution safe for production code. Without verification, parallel agents may produce code that compiles but fails tests, or silently miss acceptance criteria. Deterministic verification (exit codes) must precede any LLM judge to avoid false positives.
**Delivers:** `verification/runner.ts` (deterministic: test + lint + typecheck), `verification/types.ts`, retry-on-failure integration with scheduler, `verification/judge.ts` (LLM judge, opt-in)
**Addresses:** "Post-story quality verification loop" (P1 table stakes), foundation for "Intent verification" (P2)
**Avoids:** Pitfall 5 (LLM verifier false positives — execution-based verification is primary)
**Uses:** `execa` (existing) for deterministic command execution; `zod` for VerifierConfig schema validation
**Research flag:** Standard patterns — shell command execution and exit code interpretation are well-documented; skip research-phase. LLM judge prompt design is less documented and may benefit from a phase-specific research spike.

### Phase 5: Multi-Agent TUI
**Rationale:** The existing TUI is built for single-agent sequential execution. Parallel agents require per-agent panels, dependency graph visualization, and debounced rendering to prevent Ink full-tree rerender artifacts. Build this after the execution and verification event model is stable so the TUI has real events to consume.
**Delivers:** `ui/OrchestrationDashboard.tsx`, `ui/AgentPanel.tsx`, `ui/DependencyGraphView.tsx`, extended `ui/events.ts` with parallel agent event types; debounced state updates, `<Static>` for completed agents
**Addresses:** "Live multi-agent progress UI" (P1 table stakes)
**Avoids:** Pitfall 6 (Ink TUI artifacts under parallel load)
**Uses:** `ink` 6.8.0 + `react` 19 (upgrade from current Ink 5 + React 18) — requires migration spike before building new components
**Research flag:** Needs research-phase — Ink 5 to Ink 6 breaking changes are not fully documented in public release notes. Budget a spike story to validate the upgrade doesn't break existing TUI before building parallel panels on top.

### Phase 6: Pipeline Configuration
**Rationale:** After the parallel pipeline is proven with real PRDs, expose it as configuration. Customizable quality rules (per-project thresholds) unblock adoption on projects with different test setups. Customizable pipeline stages are a v2 feature but the registry pattern should be scaffolded here to avoid rewriting stage wiring later.
**Delivers:** `planning/pipeline-registry.ts` (PipelineRegistry with register/remove/reorder), extended `.william/config.json` schema with qualityRules (testCoverageThreshold, requireLint, requireTypecheck, requireTests), Zod schema validation for config
**Addresses:** "Customizable quality rules" (P2), foundation for "Customizable pipeline stages" (P3)
**Uses:** `zod` 4.3.6 (verify SDK compat first) for config validation
**Research flag:** Standard patterns — config schema validation is well-documented; skip research-phase

### Phase Ordering Rationale

- Phases 1-2 are foundations that make Phase 3 safe. Skipping them and building parallel execution first is the most common mistake in multi-agent orchestrators — state corruption and orphaned processes are invisible until they occur in production.
- Phase 3 (execution) precedes Phase 4 (verification) because the verification layer needs real story execution results to integrate with; building verifiers in isolation without the executor API is speculative.
- Phase 5 (TUI) comes after Phases 3-4 because the event model (what events exist, at what frequency, with what payload) is determined by the execution and verification layers. Building TUI components before the event model is stable produces components that need rewriting.
- Phase 6 (pipeline config) is last because it wraps existing stages in configuration — it requires the stages themselves to exist and be stable first.

### Research Flags

Phases needing deeper research during planning:
- **Phase 3 (Parallel Execution):** Claude Agent SDK auth model (ANTHROPIC_API_KEY vs OAuth) needs hands-on validation before committing to SDK migration; subprocess fallback may be permanent
- **Phase 3 (Parallel Execution):** Zod version conflict (`claude-agent-sdk` declares `zod ^3.24.1`; if forced to Zod 3, revise Phase 6 config validation accordingly) — needs `pnpm ls zod` verification at implementation time
- **Phase 5 (Multi-Agent TUI):** Ink 5 to Ink 6 breaking changes must be enumerated before building new TUI components; spike story recommended

Phases with standard patterns (skip research-phase):
- **Phase 1 (Safety Infrastructure):** File locking, signal handling, and process cleanup are well-documented Node.js patterns
- **Phase 2 (Dependency Analysis):** DAG topological sort is well-documented; `graph-data-structure` library has clear API
- **Phase 4 (Quality Verification):** Deterministic shell command execution is well-documented; only LLM judge prompt design may need a focused spike
- **Phase 6 (Pipeline Config):** Zod schema validation is well-documented

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All versions verified on npm/GitHub releases; two version conflicts (Zod, Ink breaking changes) identified and flagged for implementation-time verification |
| Features | HIGH | Multiple verified sources including official Anthropic docs, open-source orchestrators (ComposioHQ), GitHub engineering blog, Factory AI technical report |
| Architecture | HIGH | Validated against Cursor, Anthropic, Spotify production systems; component boundaries and data flows are explicit and non-speculative |
| Pitfalls | HIGH | Sourced from confirmed GitHub issues (Claude autocompaction bugs), codebase code inspection, and documented production failures (Cursor lock contention, Spotify self-verification bias) |

**Overall confidence:** HIGH

### Gaps to Address

- **Claude Agent SDK auth model:** The SDK requires `ANTHROPIC_API_KEY`; existing users authenticate via `claude auth login` (OAuth). Validate whether existing users have API keys set before committing to SDK migration. If not, the subprocess approach (`claude -p`) must remain as fallback or primary path. Address in Phase 3 planning.

- **Zod version conflict:** `@anthropic-ai/claude-agent-sdk` declares `zod ^3.24.1` as a dependency. If pnpm resolves this as Zod 3, importing Zod 4 for William's config schemas creates two Zod instances and breaks instanceof checks. Run `pnpm ls zod` after SDK installation. If conflict exists, use Zod 3 for all William schemas. Address in Phase 3 planning before Phase 6 implementation.

- **Ink 5 to 6 breaking changes:** The full breaking change list between Ink 5 and 6 was not available at research time. Before building `OrchestrationDashboard.tsx`, run a migration spike to enumerate breaking changes and validate existing `App.tsx`, `Dashboard.tsx`, `LogArea.tsx` still work. Address at the start of Phase 5.

- **Heuristic dependency detection accuracy:** The dependency analyzer uses heuristics (shared nouns, explicit markers, file path overlap in story text) as the primary, free analysis pass. If accuracy is insufficient (too many false "independent" classifications causing parallel agents to write to the same files), a mandatory LLM pass becomes necessary, adding cost to every PRD processing run. Measure accuracy on real PRDs after Phase 2 delivery.

- **Progress.txt context growth:** At 15+ story projects, `progress.txt` can exceed 10K tokens when injected into each agent prompt. A trimming or summarization strategy is not in the current codebase. This is a future concern but should be designed into the cross-agent context propagation feature (P2) rather than retrofitted.

## Sources

### Primary (HIGH confidence)
- [Claude Agent SDK TypeScript Reference](https://platform.claude.com/docs/en/agent-sdk/typescript) — query() API, options, hooks, v0.2.63
- [Claude Agent SDK Overview](https://platform.claude.com/docs/en/agent-sdk/overview) — SDK vs subprocess tradeoffs
- [Claude Code Agent Teams official documentation](https://code.claude.com/docs/en/agent-teams) — parallel agent patterns, known limitations
- [Cursor: Scaling Long-Running Autonomous Coding](https://cursor.com/blog/scaling-agents) — Planner/Worker/Judge hierarchy, flat agent failure modes, file locking bottlenecks
- [Anthropic: Effective Harnesses for Long-Running Agents](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents) — state management, progress files, verification patterns
- [Spotify Engineering: Feedback Loops for Background Coding Agents](https://engineering.atspotify.com/2025/12/feedback-loops-background-coding-agents-part-3) — verifier abstraction, LLM judge veto rate, test homogenization
- [Factory AI Code Droid Technical Report](https://factory.ai/news/code-droid-technical-report) — specialized Droid roles, parallel execution patterns
- [GitHub engineering blog: Multi-agent workflows often fail](https://github.blog/ai-and-ml/generative-ai/multi-agent-workflows-often-fail-heres-how-to-engineer-ones-that-dont/) — failure modes and mitigations
- [Praetorian: Deterministic AI Orchestration](https://www.praetorian.com/blog/deterministic-ai-orchestration-a-platform-architecture-for-autonomous-development/) — thin agent pattern, role separation, context compaction gate
- [Azure Architecture Center: AI Agent Orchestration Patterns](https://learn.microsoft.com/en-us/azure/architecture/ai-ml/guide/ai-agent-design-patterns) — orchestration pattern taxonomy
- [Vadimdemedes/Ink GitHub](https://github.com/vadimdemedes/ink) — Static component, concurrent rendering in v6.7.0
- [Claude Code GitHub issue #6004](https://github.com/anthropics/claude-code/issues/6004) and [#9579](https://github.com/anthropics/claude-code/issues/9579) — confirmed autocompaction infinite loop bug, 96-108M token/day runaway

### Secondary (MEDIUM confidence)
- [ComposioHQ agent-orchestrator GitHub](https://github.com/ComposioHQ/agent-orchestrator) — 30-agent parallel results, plugin slot system
- [Open-Sourcing Agent Orchestrator blog](https://pkarnal.com/blog/open-sourcing-agent-orchestrator) — implementation detail for ComposioHQ
- [p-limit GitHub releases](https://github.com/sindresorhus/p-limit/releases) — v7.3.0, ESM-only
- [graph-data-structure GitHub](https://github.com/curran/graph-data-structure) — v4.5.0, topological sort API
- [Zod v4 release notes](https://zod.dev/v4) — stable since May 2025, v4.3.6 latest
- [Ink TUI rendering analysis](https://github.com/atxtechbro/test-ink-flickering/blob/main/INK-ANALYSIS.md) — full-tree traversal per state change
- [arxiv 2507.06920: Rethinking Verification for LLM Code Generation](https://arxiv.org/abs/2507.06920) — test homogenization and blind spots
- [Token efficiency case study: 65% reduction](https://earezki.com/ai-news/2026-02-26-how-i-cut-my-ai-coding-agents-token-usage-by-65-without-changing-models/) — structured context assembly patterns
- [Mike Mason: AI Coding Agents Jan 2026](https://mikemason.ca/writing/ai-coding-agents-jan-2026/) — senior practitioner analysis of orchestration patterns

### Tertiary (LOW confidence)
- [Kiro Agent Hooks documentation](https://kiro.dev/blog/automate-your-development-workflow-with-agent-hooks/) — pipeline hook patterns; product may change rapidly
- [Augment Code: Autonomous Quality Gates](https://www.augmentcode.com/guides/autonomous-quality-gates-ai-powered-code-review) — quality gate patterns; vendor-specific

---
*Research completed: 2026-03-03*
*Ready for roadmap: yes*
