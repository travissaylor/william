# Phase 2: Dependency Analysis - Research

**Researched:** 2026-03-03
**Domain:** Directed acyclic graphs, topological sort, cycle detection, text-based dependency inference
**Confidence:** HIGH

## Summary

Phase 2 adds a dependency analysis step that runs before any agent is dispatched. It reads a parsed PRD, infers which stories depend on which other stories using content and naming heuristics, builds a directed acyclic graph (DAG), detects any cycles (halting with a clear error if found), and prints a dependency report to the user.

The algorithm is straightforward and requires zero new npm dependencies. Kahn's algorithm (BFS-based topological sort) detects cycles in O(n + m) time and naturally produces an execution order. Dependency inference relies on three heuristics applied to story IDs, titles, and descriptions: explicit ID references (e.g., "US-001"), semantic keywords ("requires", "depends on", "after", "uses the endpoint from"), and phase-ordering patterns (stories in later phases depend on all stories in earlier phases). No NLP library, no ML model, no external package — pure TypeScript text matching.

The output surface is a pre-run print to stdout showing which stories are "ready" (no unresolved dependencies) versus "blocked" (one or more dependencies must complete first), followed by normal agent dispatch using the existing runner. No changes to WorkspaceState schema are required for Phase 2 — dependency data is transient, computed at startup.

**Primary recommendation:** Implement `src/prd/dependency-analyzer.ts` as a pure module with `inferDependencies(stories)` and `buildExecutionGraph(stories, deps)` functions. Wire the pre-run print into `workspace.ts` `createWorkspace` flow and the `runner.ts` dispatch decision. All logic is testable with vitest unit tests using synthetic ParsedStory arrays.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| PLAN-01 | William analyzes PRD stories and infers execution dependencies (which stories must complete before others can start) | Kahn's algorithm on ParsedStory[] builds topological order; `inferDependencies` computes edges; graph printed before first agent spawn |
| PLAN-02 | Dependency inference uses story content, naming patterns, and shared data models — not manual declaration | Three-heuristic engine: ID references in text, semantic keywords, phase-group ordering — no config file required |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| (built-in TypeScript) | n/a | DAG, cycle detection, topological sort | Kahn's algorithm is ~60 lines; no external dep warranted for this problem size |
| vitest | 2.x (already installed) | Unit tests for inference and graph logic | Existing test infrastructure; all tests in `src/` use vitest |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| (none new) | n/a | — | The existing `ParsedStory` type from `src/prd/parser.ts` provides all inputs needed |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Hand-rolled Kahn's | `topological-sort` npm (0.3.0, no deps) | topological-sort adds a tiny dep but handles the same cases; not worth a new dependency for 60 lines of well-understood algorithm |
| Hand-rolled Kahn's | `typescript-graph` npm (0.3.0, 1 dep) | Has richer API but brings `object-hash` as a transitive dep; overkill for this use case |
| Hand-rolled Kahn's | `graphology` npm (0.26.0, 1 dep) | 2.7MB unpacked, designed for complex graph analysis; far too heavy |
| Heuristic text matching | LLM call for inference | LLM call adds latency and cost to every `william new`; heuristics are deterministic and fast; LLM inference is a Phase 3+ concern |

**Installation:**
```bash
# No new packages required
```

## Architecture Patterns

### Recommended Project Structure
```
src/
├── prd/
│   ├── parser.ts              # Existing — provides ParsedStory[]
│   ├── tracker.ts             # Existing
│   ├── context-builder.ts     # Existing
│   └── dependency-analyzer.ts # NEW — inference + graph + cycle detection
├── workspace.ts               # Modify — call analyzer before first run, print report
└── runner.ts                  # Modify — getCurrentStory respects blocked status
```

### Pattern 1: Dependency Inference (Three-Heuristic Engine)

**What:** Three heuristics applied in order to each story pair to infer directed edges.

**When to use:** Applied once at workspace creation and at each `william start` before dispatch begins.

**Heuristic 1 — Explicit ID Reference:** Story B's description or title contains story A's ID string (e.g., "US-003"). This is the highest-confidence signal.

**Heuristic 2 — Semantic Keyword Patterns:** Story B's description matches phrases like "requires [X]", "depends on [X]", "after [X] is complete", "uses the [X] endpoint", "builds on [X]". Keywords mapped to dependency relationships.

**Heuristic 3 — Phase-Group Ordering:** The PRD parser already recognizes `### Phase N:` headers and groups stories under them. Stories in Phase N implicitly depend on all stories in Phase N-1. The parser's story ordering encodes this; a simple index-based grouping extracts it.

**Example:**
```typescript
// Source: designed for this codebase using ParsedStory from src/prd/parser.ts

export interface StoryDependency {
  storyId: string;      // the story that must complete first
  dependentId: string;  // the story that depends on it
  reason: string;       // human-readable explanation for the report
  confidence: 'explicit' | 'semantic' | 'phase-order';
}

export function inferDependencies(stories: ParsedStory[]): StoryDependency[] {
  const deps: StoryDependency[] = [];
  const ids = new Set(stories.map(s => s.id));

  for (const story of stories) {
    const text = `${story.title} ${story.description} ${story.acceptanceCriteria.join(' ')}`.toLowerCase();

    // Heuristic 1: explicit ID reference
    for (const otherId of ids) {
      if (otherId === story.id) continue;
      if (text.includes(otherId.toLowerCase())) {
        deps.push({
          storyId: otherId,
          dependentId: story.id,
          reason: `"${story.id}" references "${otherId}" in its text`,
          confidence: 'explicit',
        });
      }
    }

    // Heuristic 2: semantic keywords referencing other story titles
    const DEPENDS_PATTERNS = [
      /\brequires?\b/i,
      /\bdepends? on\b/i,
      /\bafter\b.*\bcomplete[sd]?\b/i,
      /\bbuilds? on\b/i,
      /\buses?\b.*\bfrom\b/i,
    ];
    // ... match against other story titles
  }

  // Heuristic 3: phase-group ordering (stories grouped by PRD phase order)
  // Use story array index groups derived from phase headers in rawMarkdown
  return deps;
}
```

### Pattern 2: Kahn's Algorithm (Cycle Detection + Topological Sort)

**What:** BFS-based topological sort. If all nodes are processed, the graph is acyclic. If nodes remain with in-degree > 0, those nodes form one or more cycles.

**When to use:** Run immediately after `inferDependencies`. Halt with error if cycle detected; proceed to print report if clean.

**Example:**
```typescript
// Source: algorithm description from https://en.wikipedia.org/wiki/Topological_sorting#Kahn's_algorithm

export interface ExecutionGraph {
  order: string[];           // topological order of story IDs (leaves-first)
  parallelGroups: string[][]; // stories that can run concurrently (same depth level)
  cycles: string[][];        // each inner array is a cycle — empty means no cycles
}

export function buildExecutionGraph(
  stories: ParsedStory[],
  deps: StoryDependency[],
): ExecutionGraph {
  const storyIds = stories.map(s => s.id);

  // Build adjacency: prereq -> dependents
  const adjList = new Map<string, string[]>();
  const inDegree = new Map<string, number>();
  for (const id of storyIds) {
    adjList.set(id, []);
    inDegree.set(id, 0);
  }
  for (const dep of deps) {
    adjList.get(dep.storyId)!.push(dep.dependentId);
    inDegree.set(dep.dependentId, (inDegree.get(dep.dependentId) ?? 0) + 1);
  }

  // Kahn's BFS
  const queue: string[] = [];
  for (const [id, deg] of inDegree) {
    if (deg === 0) queue.push(id);
  }

  const order: string[] = [];
  const parallelGroups: string[][] = [];

  while (queue.length > 0) {
    // All items currently in queue are at the same depth (can run in parallel)
    const currentGroup = [...queue];
    parallelGroups.push(currentGroup);
    queue.length = 0;

    for (const node of currentGroup) {
      order.push(node);
      for (const neighbor of (adjList.get(node) ?? [])) {
        const newDeg = (inDegree.get(neighbor) ?? 0) - 1;
        inDegree.set(neighbor, newDeg);
        if (newDeg === 0) queue.push(neighbor);
      }
    }
  }

  // Cycle detection: any node not in order is part of a cycle
  const cycleNodes = storyIds.filter(id => !order.includes(id));
  const cycles = cycleNodes.length > 0 ? [cycleNodes] : [];

  return { order, parallelGroups, cycles };
}
```

### Pattern 3: Dependency Report (CLI Output)

**What:** Print to stdout before dispatching any agent. Shows two sections: "Ready to run" (stories with no dependencies) and "Blocked" (stories with pending dependencies). Halts with a non-zero exit code if cycles are detected.

**Example:**
```typescript
export function printDependencyReport(
  stories: ParsedStory[],
  graph: ExecutionGraph,
  deps: StoryDependency[],
): void {
  if (graph.cycles.length > 0) {
    const cycleStr = graph.cycles.map(c => c.join(' → ')).join('\n  ');
    console.error(`[william] ERROR: Circular dependencies detected. Cannot proceed.\n  ${cycleStr}`);
    process.exit(1);
  }

  const storyById = new Map(stories.map(s => [s.id, s]));
  const depsById = new Map<string, StoryDependency[]>();
  for (const dep of deps) {
    const arr = depsById.get(dep.dependentId) ?? [];
    arr.push(dep);
    depsById.set(dep.dependentId, arr);
  }

  console.log('[william] Dependency analysis complete.\n');

  for (const group of graph.parallelGroups) {
    const ready = group.filter(id => !depsById.has(id));
    const blocked = group.filter(id => depsById.has(id));
    if (ready.length > 0) {
      console.log(`  Ready: ${ready.map(id => `${id} — ${storyById.get(id)?.title}`).join(', ')}`);
    }
    if (blocked.length > 0) {
      for (const id of blocked) {
        const prereqs = (depsById.get(id) ?? []).map(d => d.storyId).join(', ');
        console.log(`  Blocked: ${id} — ${storyById.get(id)?.title} (requires: ${prereqs})`);
      }
    }
  }
  console.log('');
}
```

### Pattern 4: Integration with Existing Workspace Flow

**What:** Call the analyzer in `workspace.ts` `createWorkspace` and at the start of `startWorkspace`. In Phase 2, execution is still sequential (parallel dispatch is Phase 3). The output of the graph determines print order only — `getCurrentStory` in `tracker.ts` continues to work as before (sequential, first-not-complete story wins).

**When to use:** Called in `startWorkspace` before the `runWorkspace` loop begins, after loading state.

**Wiring point:**
```typescript
// workspace.ts — in startWorkspace(), before runWorkspace():
const rawMarkdown = fs.readFileSync(initialState.sourceFile, 'utf-8');
const parsedPrd = parsePrd(rawMarkdown);
const deps = inferDependencies(parsedPrd.stories);
const graph = buildExecutionGraph(parsedPrd.stories, deps);
printDependencyReport(parsedPrd.stories, graph, deps);
// If cycles → printDependencyReport calls process.exit(1); never reaches here
await runWorkspace(/* ... */);
```

### Anti-Patterns to Avoid

- **Persisting dependency graph in state.json:** Dependencies are computed from the PRD; they never need to be saved. State bloat with no benefit.
- **Requiring explicit dependency annotations in the PRD:** PLAN-02 explicitly forbids manual config. Inference must be automatic.
- **Blocking on inferred dependencies during Phase 2 execution:** Phase 2 is report-only. The runner still dispatches stories in sequential order (Phase 3 adds parallel dispatch). Don't conflate printing the graph with enforcing it yet.
- **Using LLM for inference in Phase 2:** LLM adds latency, cost, and non-determinism. Text heuristics are deterministic, testable, and sufficient for the common case.
- **Detecting false dependency cycles from duplicate ID references:** If story US-002 says "builds the route for US-001's data model", that is a forward reference — it should create an edge US-001 -> US-002, not US-002 -> US-001. Direction must be inferred correctly: the story that mentions another ID depends ON the mentioned story (the mentioned story must complete first).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Cycle detection | Ad-hoc "visited" flags, DFS with complex state | Kahn's algorithm (queue + in-degree) | Kahn's is simpler to implement correctly, directly detects cycles as a side effect, and produces topological order in the same pass |
| Parallel group extraction | Separate BFS pass | Kahn's natural level-by-level queue flushing | Kahn's natural wave structure gives parallel groups for free — nodes in the same BFS wave have no dependencies on each other |
| Dependency edge deduplication | Manual Set tracking during inference | Build the edge Set first, then deduplicate before graph construction | Prevents duplicate edges from inflating in-degree counts and producing incorrect results |

**Key insight:** A 60-line Kahn's implementation handles both topological ordering and cycle detection in one pass. Do not split these into separate algorithms.

## Common Pitfalls

### Pitfall 1: Wrong Edge Direction
**What goes wrong:** Dependency edge is added in the wrong direction — story A is marked as depending on B when B actually depends on A.
**Why it happens:** Confusing "A mentions B" with "A depends on B". If A's description says "uses the endpoint from US-002", then A depends on US-002 (US-002 must run first), so the edge is US-002 -> A.
**How to avoid:** Edge direction is always: mentioned story -> mentioning story. "B's text mentions A" means edge A -> B (A must finish before B can run).
**Warning signs:** Topological order is reversed — later stories appear before their prerequisites.

### Pitfall 2: Self-Referential ID False Positives
**What goes wrong:** A story's own ID appears in its description (e.g., US-001 says "This story, US-001, implements...") creating a self-loop.
**Why it happens:** Heuristic 1 matches every ID including the current story.
**How to avoid:** Skip the check when `otherId === story.id`.
**Warning signs:** Every story has an edge pointing to itself, cycle detection fires for every PRD.

### Pitfall 3: Phase-Order Heuristic Creates Too Many Edges
**What goes wrong:** Adding a full dependency from every story in Phase N to every story in Phase N+1 creates O(n²) edges. In a 10-story PRD with 5 phases, this becomes 25+ edges that may obscure real parallelism within a phase.
**Why it happens:** Naive phase grouping adds cross-phase edges without considering intra-phase independence.
**How to avoid:** Phase-order heuristic should only create one representative "phase boundary" edge per phase group, or only edges from the LAST story in Phase N to the FIRST story in Phase N+1. Mark these as `confidence: 'phase-order'` with low weight.
**Warning signs:** Dependency report shows every story blocked, even when stories in the same phase are clearly independent.

### Pitfall 4: Cycle Error Message Doesn't Name the Cycle
**What goes wrong:** "Circular dependency detected" with no story IDs — user cannot fix the PRD.
**Why it happens:** Kahn's algorithm identifies which nodes are in cycles but not the specific cycle path.
**How to avoid:** After Kahn's completes, if cycle nodes exist, run a DFS on the subgraph of cycle nodes to reconstruct the path. Print: `[william] ERROR: Cycle: US-003 → US-005 → US-003`.
**Warning signs:** User can't tell which stories to reorder in the PRD.

### Pitfall 5: Inference Runs on Every Agent Iteration
**What goes wrong:** `inferDependencies` is called inside the `runWorkspace` loop, adding latency to each iteration.
**Why it happens:** Placing the call in the wrong location — inside the loop rather than before it.
**How to avoid:** Run inference exactly once per workspace start, before the loop. Results are deterministic given the same PRD. Cache in local variable.
**Warning signs:** Noticeable startup delay on each story attempt.

## Code Examples

Verified patterns from official sources:

### Complete Kahn's Algorithm with Parallel Groups
```typescript
// Source: algorithm from https://en.wikipedia.org/wiki/Topological_sorting#Kahn's_algorithm
// TypeScript adaptation — no external dependencies

export function topoSortWithGroups(
  nodeIds: string[],
  edges: Array<{ from: string; to: string }>,
): { groups: string[][]; cycleNodes: string[] } {
  const inDegree = new Map<string, number>(nodeIds.map(id => [id, 0]));
  const adj = new Map<string, string[]>(nodeIds.map(id => [id, []]));

  for (const { from, to } of edges) {
    adj.get(from)!.push(to);
    inDegree.set(to, (inDegree.get(to) ?? 0) + 1);
  }

  let frontier = nodeIds.filter(id => inDegree.get(id) === 0);
  const groups: string[][] = [];
  const processed = new Set<string>();

  while (frontier.length > 0) {
    groups.push([...frontier]);
    const next: string[] = [];
    for (const node of frontier) {
      processed.add(node);
      for (const neighbor of adj.get(node) ?? []) {
        const deg = (inDegree.get(neighbor) ?? 0) - 1;
        inDegree.set(neighbor, deg);
        if (deg === 0) next.push(neighbor);
      }
    }
    frontier = next;
  }

  const cycleNodes = nodeIds.filter(id => !processed.has(id));
  return { groups, cycleNodes };
}
```

### ID Reference Heuristic (Explicit Confidence)
```typescript
// Identifies when story B's text explicitly references story A's ID
function findExplicitIdDeps(stories: ParsedStory[]): StoryDependency[] {
  const deps: StoryDependency[] = [];
  const ids = stories.map(s => s.id);

  for (const story of stories) {
    const text = [story.title, story.description, ...story.acceptanceCriteria].join(' ');
    for (const otherId of ids) {
      if (otherId === story.id) continue;
      // Use word-boundary match to avoid "US-001" matching in "US-0010"
      const pattern = new RegExp(`\\b${otherId.replace('-', '\\-')}\\b`, 'i');
      if (pattern.test(text)) {
        deps.push({
          storyId: otherId,   // otherId must complete first
          dependentId: story.id,
          reason: `${story.id} text references ${otherId}`,
          confidence: 'explicit',
        });
      }
    }
  }
  return deps;
}
```

### Semantic Keyword Heuristic
```typescript
// Matches phrases that indicate a dependency relationship
const DEPENDENCY_PHRASES = [
  { pattern: /\brequires?\s+(?:the\s+)?(?:completion\s+of\s+)?(.+?)(?:\.|,|$)/i, label: 'requires' },
  { pattern: /\bdepends?\s+on\s+(.+?)(?:\.|,|$)/i, label: 'depends on' },
  { pattern: /\bafter\s+(.+?)\s+(?:is\s+)?(?:complete[sd]?|done|built|implemented)/i, label: 'after' },
  { pattern: /\bbuilds?\s+on\s+(.+?)(?:\.|,|$)/i, label: 'builds on' },
  { pattern: /\buses?\s+(?:the\s+)?(?:endpoint|api|data|model|hook)\s+(?:from\s+)?(.+?)(?:\.|,|$)/i, label: 'uses' },
];

// Match the captured group against known story titles to resolve the edge target
```

### Phase-Group Ordering Heuristic
```typescript
// Extracts phase boundaries from rawMarkdown (phase headers survive in story.rawMarkdown neighborhood)
// Simpler: use story array index ranges corresponding to phase header positions in the original PRD
function findPhaseGroupDeps(stories: ParsedStory[]): StoryDependency[] {
  // The parsePrd function maintains story order; phase headers are group boundaries.
  // Strategy: scan for phase markers in rawMarkdown sections by checking if prior siblings
  // have the same phase group prefix. Group stories by their Phase N marker from the PRD,
  // then add dependency edges from last story of Phase N to first story of Phase N+1.
  // This is 'phase-order' confidence — lower weight than explicit references.
  // ...
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| No dependency analysis (current) | Pre-run report with inferred DAG | Phase 2 | User sees blocked/ready status before agents start; circular PRDs fail fast |
| Sequential dispatch, no ordering (current) | Topological order used for sequential dispatch | Phase 2 | Stories always run in valid dependency order |
| No cycle protection (current) | Kahn's cycle detection halts with named cycle error | Phase 2 | Malformed PRDs cannot cause infinite loops or wrong ordering |

**Not changing in Phase 2:**
- `WorkspaceState` schema — dependency data is transient, not persisted
- `getCurrentStory` in `tracker.ts` — still returns first incomplete story sequentially
- Parallel agent dispatch — that is Phase 3; Phase 2 only adds the analysis and report

## Open Questions

1. **Phase-group detection without exposing phase-group metadata from the parser**
   - What we know: The parser already skips `### Phase N:` headers and groups stories under them, but does not expose which phase group each story belongs to.
   - What's unclear: Should we add `phaseGroup?: number` to `ParsedStory`, or infer phase groups in the dependency analyzer from rawMarkdown patterns?
   - Recommendation: Add `phaseGroup?: number` to `ParsedStory` in the parser. The parser already detects phase headers; tracking the current group index is a one-line addition. This is cleaner than re-parsing rawMarkdown in the analyzer.

2. **Dependency display format for the CLI report**
   - What we know: The success criteria say "William prints which stories are independent and which are blocked." No specific format is defined.
   - What's unclear: Should blocked stories show their specific blockers, or just a status flag?
   - Recommendation: Show blocked stories with their blocker IDs inline. Example: `  Blocked: US-005 — Data hooks (requires: US-001, US-002)`. This is actionable.

3. **How to handle PRDs with no phase headers and no explicit ID references**
   - What we know: Some PRDs (especially short ones) have no phase structure and no cross-referencing. All stories would show as "ready."
   - What's unclear: Should this emit a notice ("No dependencies inferred") or be silent?
   - Recommendation: If zero dependencies are inferred, print: `[william] No dependencies inferred — all stories are independent.` Then proceed. This is informative without being alarming.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 2.x |
| Config file | none — uses package.json defaults |
| Quick run command | `pnpm vitest run src/prd/dependency-analyzer.test.ts` |
| Full suite command | `pnpm vitest run src/` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PLAN-01 | `buildExecutionGraph` returns correct topological order for a linear chain | unit | `pnpm vitest run src/prd/dependency-analyzer.test.ts` | Wave 0 |
| PLAN-01 | `buildExecutionGraph` detects cycle and returns cycleNodes | unit | `pnpm vitest run src/prd/dependency-analyzer.test.ts` | Wave 0 |
| PLAN-01 | `buildExecutionGraph` groups independent stories in the same parallel wave | unit | `pnpm vitest run src/prd/dependency-analyzer.test.ts` | Wave 0 |
| PLAN-01 | `printDependencyReport` calls `process.exit(1)` when cycles present | unit | `pnpm vitest run src/prd/dependency-analyzer.test.ts` | Wave 0 |
| PLAN-02 | `inferDependencies` returns edge when story B's text mentions story A's ID | unit | `pnpm vitest run src/prd/dependency-analyzer.test.ts` | Wave 0 |
| PLAN-02 | `inferDependencies` returns no self-loop for a story that mentions its own ID | unit | `pnpm vitest run src/prd/dependency-analyzer.test.ts` | Wave 0 |
| PLAN-02 | `inferDependencies` uses phase-order heuristic when phase groups are present | unit | `pnpm vitest run src/prd/dependency-analyzer.test.ts` | Wave 0 |
| PLAN-02 | `inferDependencies` returns empty array for PRD with no discernible deps | unit | `pnpm vitest run src/prd/dependency-analyzer.test.ts` | Wave 0 |
| PLAN-01 | Integration: `startWorkspace` prints report and exits cleanly on cycle-free PRD | manual-only | N/A — requires workspace lifecycle | manual |
| PLAN-01 | Integration: `startWorkspace` exits with error on circular PRD | manual-only | N/A — requires workspace lifecycle | manual |

### Sampling Rate
- **Per task commit:** `pnpm vitest run src/prd/dependency-analyzer.test.ts`
- **Per wave merge:** `pnpm vitest run src/`
- **Phase gate:** Full suite green (262 existing + new tests) before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `src/prd/dependency-analyzer.ts` — new module; no file yet
- [ ] `src/prd/dependency-analyzer.test.ts` — covers PLAN-01 and PLAN-02
- [ ] Optional: add `phaseGroup?: number` field to `ParsedStory` in `parser.ts` and update `parser.test.ts`

*(Existing test infrastructure covers all other test setup — no new framework installation needed.)*

## Sources

### Primary (HIGH confidence)
- [Topological sorting — Wikipedia (Kahn's algorithm)](https://en.wikipedia.org/wiki/Topological_sorting#Kahn's_algorithm) — algorithm correctness, cycle detection via in-degree remainder
- [Cycle detection in graphs with Kahn's algorithm](https://gaultier.github.io/blog/kahns_algorithm.html) — implementation walkthrough confirming the "remaining in-degree > 0 nodes are cycle members" property
- `pnpm info topological-sort` — confirmed 0 external deps, 45KB unpacked, last published over a year ago; not maintained actively enough to prefer over hand-rolled
- `pnpm info typescript-graph` — 1 transitive dep, 187KB; confirmed not warranted for this scope
- `src/prd/parser.ts` (codebase) — `ParsedStory` interface has `id`, `title`, `description`, `acceptanceCriteria`, `rawMarkdown` — all inputs available for inference

### Secondary (MEDIUM confidence)
- [topological-sort-group npm](https://www.npmjs.com/search?q=topological+sort) — confirmed existence of grouping-capable libraries; reinforces that the "parallel waves" concept is a known pattern
- [Extracting conceptual models from user stories via NLP (Springer)](https://link.springer.com/article/10.1007/s00766-017-0270-1) — confirmed that keyword/heuristic approaches are standard for story dependency inference in academic literature; LLM approach not necessary

### Tertiary (LOW confidence)
- WebSearch results on "dependency between user stories" — Scrum.org forum and DZone articles confirm that common dependency signals are explicit story references and "before/after" language; not verified against a primary spec

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — Kahn's algorithm is classical CS with no library risk; parser types verified against codebase
- Architecture: HIGH — integration points confirmed by reading workspace.ts and runner.ts directly
- Pitfalls: HIGH — self-loop, edge direction, and phase-order issues are derived directly from the algorithm and inference logic reviewed above
- Inference heuristics: MEDIUM — text heuristics are pragmatic; edge cases exist (false positives on partial title matches) but are acceptable for v1

**Research date:** 2026-03-03
**Valid until:** 2027-03-03 (Kahn's algorithm is ~50 years old; ParsedStory types are project-internal; no external dependency to drift)
