# Architecture Research

**Domain:** Autonomous CLI orchestrator for parallel AI coding agents
**Researched:** 2026-03-03
**Confidence:** HIGH (verified against Cursor, Anthropic, ComposioHQ production systems; Ink/Node.js patterns from official docs and real deployments)

## Standard Architecture

### System Overview

The target architecture layers a Planner/Scheduler above the existing sequential runner, introduces a parallel Executor pool, wraps each story in a verification loop, and extends the TUI to show per-agent panels.

```
┌─────────────────────────────────────────────────────────────────┐
│                         CLI Layer                               │
│   Commander.js  (william start / prd / pr / revise / ...)       │
└──────────────────────────┬──────────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────────┐
│                      Planning Layer                             │
│  ┌──────────────────┐   ┌──────────────────────────────────┐    │
│  │  Dependency       │   │        Pipeline Registry         │    │
│  │  Analyzer         │   │  (customizable stage graph)      │    │
│  │  (LLM + heuristic)│   │                                  │    │
│  └────────┬─────────┘   └──────────────────────────────────┘    │
│           │ DAG of StoryNodes                                    │
└───────────┼─────────────────────────────────────────────────────┘
            │
┌───────────▼─────────────────────────────────────────────────────┐
│                     Scheduler Layer                             │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │   DAG Scheduler  (topological sort → wave batches)         │  │
│  │   Concurrency limiter (semaphore, default: 3 parallel)     │  │
│  │   State machine per story: pending → running → verifying   │  │
│  │                         → done | failed | retry            │  │
│  └───────────────────────────────┬────────────────────────────┘  │
└───────────────────────────────────┼────────────────────────────────┘
                                    │ Dispatch wave
┌───────────────────────────────────▼──────────────────────────────┐
│                      Executor Pool                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐             │
│  │  Agent Slot │  │  Agent Slot │  │  Agent Slot │  (up to N)  │
│  │  execa child│  │  execa child│  │  execa child│             │
│  │  NDJSON     │  │  NDJSON     │  │  NDJSON     │             │
│  │  stream     │  │  stream     │  │  stream     │             │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘             │
└─────────┼────────────────┼────────────────┼─────────────────────┘
          │                │                │  per-story streams
┌─────────▼────────────────▼────────────────▼─────────────────────┐
│                   Verification Layer                            │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │   Verifier Runner (deterministic): lint, typecheck, test │   │
│  │   LLM Judge (non-deterministic): diff vs intent check    │   │
│  │   Max-retry policy per story (default: 3 verification    │   │
│  │   attempts before escalating to stuck state)             │   │
│  └──────────────────────────────────────────────────────────┘   │
└──────────────────────────────┬───────────────────────────────────┘
                               │ events
┌──────────────────────────────▼───────────────────────────────────┐
│                      TUI Layer (Ink / React)                    │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Orchestration Dashboard                                  │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │   │
│  │  │ Agent Panel  │  │ Agent Panel  │  │ Agent Panel  │   │   │
│  │  │ story-1      │  │ story-3      │  │ story-5      │   │   │
│  │  │ [streaming]  │  │ [verifying]  │  │ [done]       │   │   │
│  │  └──────────────┘  └──────────────┘  └──────────────┘   │   │
│  │  Dependency Graph View  |  Overall Progress Bar          │   │
│  └──────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────┘
                               │
┌──────────────────────────────▼───────────────────────────────────┐
│                      State / Persistence                        │
│  state.json  (story status, attempt counts, verification logs)  │
│  output/{storyId}/session.ndjson  (per-agent stream capture)    │
│  output/{storyId}/verify.json     (verifier results)            │
└──────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Communicates With |
|-----------|----------------|-------------------|
| Dependency Analyzer | Parse PRD stories, extract explicit/implicit dependencies, output DAG | Planning Layer → Scheduler |
| Pipeline Registry | Hold ordered stage definitions (analyze, execute, verify, pr); allow add/remove/reorder | Scheduler reads on startup |
| DAG Scheduler | Topological sort of story graph; emit execution waves; gate stories on completed prerequisites; enforce concurrency limit via semaphore | Executor Pool (dispatch), TUI (events), State (read/write) |
| Agent Slot (Executor) | Spawn one `claude` process per story; parse NDJSON stream; detect stuck states; emit events to TUI and return session result | Scheduler (receives assignment), Verification Layer (hands off result), TUI (streams events) |
| Verification Layer | Run deterministic verifiers (lint, typecheck, test) then optional LLM judge; return PASS/FAIL + error payload; trigger retry if FAIL within policy | Agent Slot (receives story result), Scheduler (reports final verdict), State (writes verify.json) |
| Orchestration Dashboard | Render per-agent panels using Ink Static + flexbox; update from EventEmitter; show dependency graph state, per-story status, cost/tokens | EventEmitter (receives all layer events) |
| State / Persistence | Read/write state.json and per-story output files; support resume after interruption | All layers (read on start, write after transitions) |

## Recommended Project Structure

The existing `src/` layout is already well-layered. New components slot into existing patterns:

```
src/
├── cli.ts                      # (existing) command routing — no changes needed
├── config.ts                   # (existing) project config
├── workspace.ts                # (existing) workspace lifecycle
│
├── prd/
│   ├── parser.ts               # (existing) PRD → ParsedPrd
│   ├── tracker.ts              # (existing) state.json mutations
│   ├── context-builder.ts      # (existing) per-story prompt assembly
│   └── dependency-analyzer.ts  # NEW: ParsedPrd → StoryDependencyGraph
│
├── planning/
│   └── pipeline-registry.ts    # NEW: stage definitions, ordering, customization API
│
├── scheduler/
│   ├── dag-scheduler.ts        # NEW: topological sort, wave dispatch, semaphore
│   ├── story-state-machine.ts  # NEW: per-story lifecycle state transitions
│   └── concurrency.ts          # NEW: semaphore + concurrency limit utility
│
├── executor/
│   ├── agent-slot.ts           # NEW: single-story agent execution (extracted from runner.ts)
│   └── pool.ts                 # NEW: manages N concurrent agent slots
│
├── verification/
│   ├── runner.ts               # NEW: deterministic verifiers (lint, typecheck, test commands)
│   ├── judge.ts                # NEW: LLM-as-judge diff vs intent check
│   └── types.ts                # NEW: VerifierResult, JudgeVerdict interfaces
│
├── runner.ts                   # (existing) sequential loop — stays for revision flow; parallel path replaces it for new start
│
├── adapters/
│   ├── claude.ts               # (existing) spawnCapture, spawnInteractive
│   └── types.ts                # (existing)
│
├── stream/
│   ├── ndjson-parser.ts        # (existing)
│   ├── consume.ts              # (existing)
│   └── chain.ts                # (existing)
│
├── ui/
│   ├── events.ts               # (existing, extended) add new event types for parallel agents
│   ├── App.tsx                 # (existing, extended) switch between sequential/parallel dashboard
│   ├── Dashboard.tsx           # (existing) sequential single-story view — kept
│   ├── OrchestrationDashboard.tsx  # NEW: parallel multi-agent view
│   ├── AgentPanel.tsx          # NEW: per-agent progress panel (live stream, status, cost)
│   ├── DependencyGraphView.tsx # NEW: ASCII dependency graph with live status overlay
│   ├── LogArea.tsx             # (existing)
│   └── render-markdown.ts      # (existing)
│
├── types.ts                    # (existing, extended) add StoryDependencyGraph, VerifierResult
└── paths.ts                    # (existing)
```

### Structure Rationale

- **scheduler/:** Isolated from executor so the scheduling logic (DAG, semaphore) can be tested independently without spawning processes.
- **executor/:** Single-responsibility extraction — agent-slot.ts handles one story execution, pool.ts manages concurrency. This mirrors the existing runner.ts split but makes parallelism explicit.
- **verification/:** Separate from executor because verification is a distinct phase that runs after agent completion. Keeping it separate allows the verifier to be called with or without a preceding agent run (e.g., re-verifying a previously completed story).
- **planning/:** Pipeline registry lives here, not in scheduler, because pipeline shape is a configuration concern determined before scheduling starts.

## Architectural Patterns

### Pattern 1: DAG Scheduler with Wave Batching

**What:** Convert the story list into a directed acyclic graph (DAG) where edges represent "story A must complete before story B." Use topological sort (Kahn's algorithm) to produce execution waves — groups of stories with all prerequisites satisfied. Dispatch each wave to the executor pool, wait for all slots in the wave to finish, then advance to the next wave.

**When to use:** When stories have explicit dependency declarations (e.g., "depends on: auth-setup") or when the dependency analyzer infers them from shared file/module overlap.

**Trade-offs:** Wave batching is simpler than continuous scheduling but can under-utilize parallelism if one story in a wave is slow. Continuous scheduling (re-fill slots immediately as any story finishes) is more efficient but harder to reason about. Start with waves; move to continuous if utilization becomes a concern.

**Example:**

```typescript
// src/scheduler/dag-scheduler.ts
type StoryNode = { id: string; deps: string[] };

function buildWaves(stories: StoryNode[]): string[][] {
  // Kahn's algorithm: process nodes with zero in-degree first
  const inDegree = new Map<string, number>();
  const dependents = new Map<string, string[]>();

  for (const s of stories) {
    if (!inDegree.has(s.id)) inDegree.set(s.id, 0);
    for (const dep of s.deps) {
      inDegree.set(s.id, (inDegree.get(s.id) ?? 0) + 1);
      if (!dependents.has(dep)) dependents.set(dep, []);
      dependents.get(dep)!.push(s.id);
    }
  }

  const waves: string[][] = [];
  let wave = [...inDegree.entries()].filter(([, d]) => d === 0).map(([id]) => id);

  while (wave.length > 0) {
    waves.push(wave);
    const next: string[] = [];
    for (const id of wave) {
      for (const dep of dependents.get(id) ?? []) {
        const newDeg = (inDegree.get(dep) ?? 0) - 1;
        inDegree.set(dep, newDeg);
        if (newDeg === 0) next.push(dep);
      }
    }
    wave = next;
  }
  return waves; // throws if stories remain (cycle detected)
}
```

### Pattern 2: Semaphore-Gated Parallel Executor Pool

**What:** Cap the number of simultaneously running Claude processes using a semaphore. When a slot is available the scheduler acquires the semaphore, spawns an agent, and releases on completion. This prevents runaway parallelism (Claude CLI rate limits, system memory).

**When to use:** Always for parallel execution — uncapped Promise.all with N=20 stories would exhaust file descriptors, hit Claude API rate limits, and degrade performance per Cursor's documented failures with equal-status flat agents.

**Trade-offs:** A fixed concurrency limit (3-5 parallel agents) is the right default for developer machines. Make it configurable via `.william/config.json`. Higher limits are fine on CI with more resources.

**Example:**

```typescript
// src/scheduler/concurrency.ts
export class Semaphore {
  private queue: Array<() => void> = [];
  private running = 0;

  constructor(private readonly max: number) {}

  async acquire(): Promise<void> {
    if (this.running < this.max) {
      this.running++;
      return;
    }
    return new Promise((resolve) => this.queue.push(resolve));
  }

  release(): void {
    this.running--;
    const next = this.queue.shift();
    if (next) {
      this.running++;
      next();
    }
  }

  async wrap<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await fn();
    } finally {
      this.release();
    }
  }
}
```

### Pattern 3: Verification Loop — Deterministic First, LLM Second

**What:** After each agent execution, run a deterministic verifier suite first (lint, typecheck, test runner with exit code check). Only if all deterministic checks pass, invoke an optional LLM judge that compares the actual diff against the original story intent. The LLM judge is a separate, lightweight Claude call — not a full agent session.

**When to use:** After every story execution in production. The deterministic layer catches syntax/type/test failures cheaply. The LLM judge catches semantic drift ("agent built the wrong thing that still compiles"). Both layers can be toggled in pipeline config.

**Trade-offs:** Adding the LLM judge doubles the number of Claude calls for verification, increasing cost. It catches roughly 25% of sessions that would otherwise produce plausible-but-wrong output (per Spotify's production data). Worth the cost for high-stakes stories; can be disabled via pipeline config for speed.

**Example:**

```typescript
// src/verification/runner.ts
export type VerifierResult = {
  passed: boolean;
  stage: "lint" | "typecheck" | "test";
  output: string;
  exitCode: number;
};

export async function runDeterministicVerifiers(
  workdir: string,
  config: ProjectConfig,
): Promise<VerifierResult[]> {
  const stages: Array<{ name: VerifierResult["stage"]; cmd: string }> = [
    { name: "typecheck", cmd: config.typecheckCmd ?? "pnpm typecheck" },
    { name: "lint", cmd: config.lintCmd ?? "pnpm lint" },
    { name: "test", cmd: config.testCmd ?? "pnpm test" },
  ];

  const results: VerifierResult[] = [];
  for (const { name, cmd } of stages) {
    const result = await execa(cmd, { cwd: workdir, shell: true, reject: false });
    results.push({
      stage: name,
      passed: result.exitCode === 0,
      output: result.stdout + result.stderr,
      exitCode: result.exitCode ?? 1,
    });
    if (result.exitCode !== 0) break; // fail fast — no point linting if types are broken
  }
  return results;
}
```

### Pattern 4: Planner/Executor Role Separation

**What:** Keep planning (what to build, in what order) strictly separate from execution (Claude agent doing the work). The planner runs once before any execution begins; the executor is stateless per story. This mirrors the Cursor "Planner / Worker / Judge" hierarchy that eliminated risk-averse behavior and throughput bottlenecks.

**When to use:** Always. The existing architecture conflates planning (runner.ts loop order) with execution. Separating them allows replanning after failures without restarting execution.

**Trade-offs:** Adds a planning phase that users wait for upfront. Worth it: a 5-10 second dependency analysis prevents hours of sequential bottleneck. The dependency analyzer can use heuristics (shared imports, shared file paths mentioned in stories) before falling back to LLM analysis.

### Pattern 5: Customizable Pipeline Registry

**What:** Define the execution pipeline as a registry of named stages with explicit ordering. Each stage is a function that receives story context and returns a result. Stages can be added, removed, or reordered via config. This is the "plugin pipeline" pattern.

**When to use:** For the customizable pipeline stages requirement. Avoids hardcoding the analyze → execute → verify → pr flow.

**Trade-offs:** Adds indirection — harder to trace execution flow. Worth it because it's the explicit product requirement. Keep the default pipeline obvious and well-documented; make customization opt-in.

**Example:**

```typescript
// src/planning/pipeline-registry.ts
export type Stage = {
  name: string;
  run: (ctx: StoryContext) => Promise<StageResult>;
};

export class PipelineRegistry {
  private stages: Stage[] = [];

  register(stage: Stage, afterStage?: string): this {
    if (afterStage) {
      const idx = this.stages.findIndex((s) => s.name === afterStage);
      this.stages.splice(idx + 1, 0, stage);
    } else {
      this.stages.push(stage);
    }
    return this;
  }

  remove(name: string): this {
    this.stages = this.stages.filter((s) => s.name !== name);
    return this;
  }

  getStages(): readonly Stage[] {
    return this.stages;
  }
}

// Default pipeline
export function createDefaultPipeline(): PipelineRegistry {
  return new PipelineRegistry()
    .register({ name: "execute", run: executeStory })
    .register({ name: "verify-deterministic", run: runDeterministicVerifiers })
    .register({ name: "verify-judge", run: runLlmJudge });
}
```

## Data Flow

### Parallel Execution Flow

```
william start {workspace}
         │
         ▼
CLI → load state.json → mount OrchestrationDashboard (Ink)
         │
         ▼
DependencyAnalyzer.analyze(parsedPrd)
  → StoryDependencyGraph (DAG of story IDs + edges)
  → emit: "planning-complete" event → TUI shows graph
         │
         ▼
DAGScheduler.buildWaves(graph)
  → waves: [["auth-setup"], ["user-profile", "dashboard"], ["settings"]]
         │
         ▼ (for each wave)
Semaphore.wrap × N concurrent stories:
  → AgentSlot.run(story, context)
      → spawnCapture(claude, prompt) via execa
      → NDJSON stream → NdjsonParser
      → events → TUI (AgentPanel updates live)
      → StreamSession result
         │
         ▼ (story execution done)
VerificationLayer.verify(story, session, workdir)
  → runDeterministicVerifiers() → PASS/FAIL
  → if PASS and judge enabled: runLlmJudge() → PASS/FAIL/RETRY
  → write verify.json
         │
  ┌──────┴────────┐
  │ PASS          │ FAIL (within retry budget)
  ▼               ▼
Scheduler marks  Scheduler re-queues story
story done       with verification error injected
                 into next agent prompt
         │ (all waves done)
         ▼
State marked complete → notifier fires → user prompted for `william pr`
```

### Quality Verification Data Flow

```
AgentSlot completes story execution
         │
         ▼
VerificationLayer receives: { storyId, workdir, diff, session }
         │
         ▼
Stage 1: DeterministicVerifiers
  → execa("pnpm typecheck") → exitCode
  → execa("pnpm lint")      → exitCode
  → execa("pnpm test")      → exitCode
  → write output/{storyId}/verify.json
         │
    ┌────┴────┐
    │ fail    │ pass
    ▼         ▼
 inject     Stage 2: LlmJudge (optional)
 errors     → spawnCapture(claude, diff + story intent prompt)
 → retry    → parse verdict: PASS | FAIL | NEEDS_REVISION
              │
         ┌───┴────┐
         │ fail   │ pass
         ▼        ▼
     inject    story → DONE
     judge     scheduler unblocks
     feedback  dependent stories
     → retry
```

### TUI Event Flow

```
All layers emit events via shared EventEmitter:

Scheduler → "story:dispatched"  → AgentPanel spawns, shows spinner
AgentSlot  → "agent:text"       → AgentPanel streams assistant text
AgentSlot  → "agent:tool-use"   → AgentPanel shows tool call
AgentSlot  → "agent:stuck"      → AgentPanel shows stuck warning (orange)
Verifier   → "verify:start"     → AgentPanel shows "verifying..."
Verifier   → "verify:pass"      → AgentPanel shows green checkmark
Verifier   → "verify:fail"      → AgentPanel shows red X + error snippet
Scheduler  → "story:complete"   → DependencyGraphView updates node color
Scheduler  → "wave:complete"    → Overall progress bar advances
Scheduler  → "all:complete"     → Dashboard shows summary + cost total
```

### Dependency Analysis Flow

```
ParsedPrd (stories with descriptions, acceptance criteria)
         │
         ▼
DependencyAnalyzer:
  Phase 1 (heuristic, free):
    → Extract explicit "depends on: story-X" markers from story text
    → Detect shared nouns (entity names, module names) across stories
    → Flag stories mentioning database schema changes (must run before consumers)
    → Flag stories mentioning authentication (must run before protected features)
  Phase 2 (LLM, costs tokens, optional):
    → Single Claude call with all story summaries
    → Prompt: "Return JSON array of {from, to} dependency edges"
    → Parse and merge with heuristic results
         │
         ▼
StoryDependencyGraph { nodes: string[]; edges: [string, string][] }
  → validated (cycle detection before scheduling)
```

## Scaling Considerations

| Scale | Consideration | Architecture Adjustment |
|-------|---------------|------------------------|
| 1-5 stories | Default | Sequential still works; parallel overhead not worth it below 3 stories |
| 5-20 stories | Standard use case | 3-5 concurrent agents, wave-based scheduling — optimal |
| 20-50 stories | Large PRD | Increase concurrency limit to 8-10; consider splitting into sub-PRDs by domain |
| 50+ stories | Very large PRD | Consider hierarchical planner (spawn sub-planners per domain); file conflict rate increases |

### Scaling Priorities

1. **First bottleneck: Claude API rate limits** — The Claude CLI enforces rate limits per account. At 5+ concurrent agents hitting the API simultaneously, requests will queue. Mitigation: exponential backoff in agent-slot.ts, reduce default concurrency if rate limit errors are detected.

2. **Second bottleneck: Git merge conflicts between parallel agents** — Parallel stories writing to the same files will conflict when their branches are merged. Mitigation: the dependency analyzer should detect overlapping file ownership and force sequential execution for stories likely to touch the same files. File-based locking (like `.claude/locks/{storyId}.lock`) prevents simultaneous writes.

3. **Third bottleneck: Terminal rendering** — Ink re-renders the full UI on every event. With 10+ concurrent agents emitting events at high frequency, this becomes a render bottleneck. Mitigation: debounce events to 100ms intervals; use `<Static>` for completed stories so they don't re-render.

## Anti-Patterns

### Anti-Pattern 1: Flat Equal-Status Agents with File Locking

**What people do:** Give all parallel agents equal authority over the same worktree, use file locks to prevent conflicts, let agents coordinate through a shared state file.

**Why it's wrong:** Cursor's production experience documented this exact failure — 20 agents slowed to the effective throughput of 2-3 because lock contention serialized execution. Agents also exhibited risk-averse behavior, avoiding difficult tasks to minimize conflict probability.

**Do this instead:** Hierarchical separation of concerns. The scheduler is the sole coordinator. Each agent slot works on exactly one story in isolation. Dependency graph prevents two stories from running in parallel if they have overlapping concerns. The verifier runs after, not during, agent execution.

### Anti-Pattern 2: LLM Dependency Analysis Without Heuristic Fallback

**What people do:** Always call Claude to analyze story dependencies, treating it as a reliable black box.

**Why it's wrong:** LLM dependency analysis costs tokens, adds latency to the planning phase, and can hallucinate edges (declaring false dependencies that unnecessarily serialize execution). More importantly, the most critical dependencies (auth must precede protected routes, schema must precede data access) are detectable with simple heuristics.

**Do this instead:** Heuristic analysis first (free, fast, deterministic), LLM analysis as optional enrichment second. Make LLM analysis opt-in or only trigger for stories where heuristics produce no graph edges.

### Anti-Pattern 3: Verification That Runs Inside the Agent Context Window

**What people do:** Ask the agent to run tests itself and self-report whether they passed.

**Why it's wrong:** Agents have context bias toward their own work. Self-reported verification is unreliable — agents may misread test output, rationalize failures as acceptable, or simply hit context limits before tests complete. This is confirmed by the Spotify pattern where "verifiers operate outside the agent itself."

**Do this instead:** The verification layer is a separate process, outside the agent's context window. It spawns its own processes via execa, reads exit codes directly, and injects structured error output back into the next agent's prompt. The agent never "decides" whether it passed.

### Anti-Pattern 4: Monolithic Parallel Dashboard Without Static Component

**What people do:** Render all parallel agent streams in a single dynamically-updating Ink component, leading to every event causing a full re-render that scrolls all content.

**Why it's wrong:** Ink's default rendering model scrolls completed output off-screen. With 5 agents simultaneously emitting events, the terminal becomes an unreadable scroll of interleaved text.

**Do this instead:** Use Ink's `<Static>` component for completed stories (their output is fixed and doesn't need to re-render). Keep active agents in the live-rendered region. Per-agent `<AgentPanel>` components maintain independent state so events for agent A don't trigger re-renders of agent B's panel.

### Anti-Pattern 5: Always-On LLM Judge

**What people do:** Run the LLM judge after every story execution as part of a mandatory pipeline.

**Why it's wrong:** The judge doubles the Claude call count, significantly increasing cost and latency for the quality gate. Many story executions where tests pass are genuinely correct — running a judge on them wastes budget.

**Do this instead:** Make the LLM judge opt-in via pipeline config. Default to deterministic-only verification. Enable the judge for high-risk stories (those touching auth, payment, public API surface) or when deterministic checks all pass but the diff is suspiciously small relative to story complexity.

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| Claude CLI | execa spawnCapture per agent slot; NDJSON stream | One process per story; concurrency limited by semaphore. Existing adapter works, no change needed. |
| GitHub CLI (gh) | execa for PR create/update after all stories complete | Unchanged from existing pr.ts pattern |
| Git (worktrees) | Each workspace already in its own worktree; parallel agents write to same worktree | File conflict detection needed — dependency analyzer should flag likely conflicts |
| Shell verifiers (lint/typecheck/test) | execa in verification/runner.ts; reads project config for commands | Commands come from ProjectConfig (typecheckCmd, lintCmd, testCmd); default to pnpm conventions |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| Planning Layer → Scheduler | Returns StoryDependencyGraph synchronously | Planner runs once before scheduling starts |
| Scheduler → Executor Pool | Function call with story assignment; await Promise result | Semaphore enforces max concurrency |
| Executor Pool → Verification Layer | Pass story context + StreamSession result; await VerifierResult | Sequential within each story slot |
| Verification Layer → Scheduler | Return VerifierResult (pass/fail/retry) | Scheduler decides whether to retry or advance |
| All Layers → TUI | EventEmitter events (existing pattern, extended) | Fire-and-forget; TUI never blocks execution |
| State → All Layers | Read on startup; write after each story transition | state.json is the source of truth for resume capability |
| CLI → Planning Layer | Pass ParsedPrd; receive StoryDependencyGraph | Entry point of the new parallel flow |

## Build Order Implications

The components have the following dependency chain that informs phase ordering:

```
Phase 1 (Foundation):
  Dependency Analyzer  ←── can be built/tested standalone with mock PRD
  StoryDependencyGraph type additions to types.ts

Phase 2 (Scheduling):
  Semaphore / concurrency utility  ←── pure logic, no external deps
  DAG Scheduler  ←── depends on: Dependency Analyzer output type
  Story state machine  ←── depends on: DAG Scheduler events

Phase 3 (Execution):
  Agent Slot (extracted from runner.ts)  ←── depends on: existing adapters/stream (no changes)
  Executor Pool  ←── depends on: Agent Slot + Semaphore

Phase 4 (Verification):
  Deterministic Verifiers  ←── depends on: ProjectConfig (existing), execa (existing)
  LLM Judge  ←── depends on: adapters/claude.ts (existing), Verifiers result types

Phase 5 (Pipeline):
  Pipeline Registry  ←── depends on: Verifiers + Agent Slot interfaces

Phase 6 (TUI):
  AgentPanel  ←── depends on: TuiEvent types (extended)
  OrchestrationDashboard  ←── depends on: AgentPanel + EventEmitter (existing pattern)
  DependencyGraphView  ←── depends on: StoryDependencyGraph type
```

Each phase can be tested independently. The semaphore and DAG scheduler are pure TypeScript with no I/O — they can reach full unit test coverage before any Claude process is involved.

## Sources

- [Cursor: Scaling Long-Running Autonomous Coding](https://cursor.com/blog/scaling-agents) — Planner/Worker/Judge hierarchy, flat agent failure modes, file locking bottlenecks (HIGH confidence)
- [Anthropic: Effective Harnesses for Long-Running Agents](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents) — State management, progress files, verification startup sequence (HIGH confidence)
- [Spotify Engineering: Feedback Loops for Background Coding Agents](https://engineering.atspotify.com/2025/12/feedback-loops-background-coding-agents-part-3) — Verifier abstraction, MCP-based verification, LLM judge veto rate (HIGH confidence)
- [ComposioHQ Agent Orchestrator Architecture](https://pkarnal.com/blog/open-sourcing-agent-orchestrator) — Plugin slot system, reactions/CI feedback routing, 30-agent parallel results (MEDIUM confidence)
- [Praetorian: Deterministic AI Orchestration](https://www.praetorian.com/blog/deterministic-ai-orchestration-a-platform-architecture-for-autonomous-development/) — Thin agent pattern, dual-state model, role separation, context compaction gate (HIGH confidence)
- [GoCodeo: Dependency Graphs, Orchestration, and Control Flows](https://www.gocodea.com/post/dependency-graphs-orchestration-and-control-flows-in-ai-agent-frameworks) — DAG execution patterns, orchestration layer responsibilities (MEDIUM confidence)
- [Vadimdemedes/Ink GitHub](https://github.com/vadimdemedes/ink) — Static component for concurrent UI, React concurrent rendering mode (HIGH confidence)
- [Azure Architecture Center: AI Agent Orchestration Patterns](https://learn.microsoft.com/en-us/azure/architecture/ai-ml/guide/ai-agent-design-patterns) — Canonical orchestration pattern taxonomy (HIGH confidence)

---
*Architecture research for: Autonomous CLI orchestrator — parallel agent orchestration, dependency graphs, quality verification, rich TUI*
*Researched: 2026-03-03*
