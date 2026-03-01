# William — Product Ideas

## Phase 1: 50 Ideas (Brainstorm)

### Core Workflow Improvements
1. **Parallel Story Execution** — Run multiple user stories simultaneously across separate worktrees instead of serial execution. Could cut total time by 3–5x for independent stories.
2. **PRD Validator** — Pre-flight analysis of PRD quality before spawning agents. Checks for ambiguity, missing acceptance criteria, unrealistic scope, conflicting requirements.
3. **Smart Context Injection (RAG)** — Use embeddings + retrieval to inject only the most relevant codebase files into agent context, replacing the current "inject raw PRD if < 10KB" heuristic.
4. **Story Dependency Graph** — Let PRD authors declare dependencies between stories (e.g., US-003 depends on US-001). William respects ordering and passes dependency context forward.
5. **Test-First Mode** — Agent writes failing tests from acceptance criteria *before* writing implementation code. Red-green-refactor enforced by orchestrator.
6. **Interactive Agent Mode** — Let users send messages to a running agent mid-execution. "Use the existing AuthService instead of creating a new one."
7. **Adaptive Retry Strategies** — Instead of fixed 3/5/7 failure thresholds, analyze *why* the agent is stuck and choose a recovery strategy (simplify story, provide example code, switch approach).
8. **Checkpoint & Resume** — Save agent state at each tool call so crashed sessions resume exactly where they left off, not from scratch.
9. **Story Splitting** — If an agent struggles, automatically decompose the story into smaller substories and attempt each independently.
10. **Progress Diffing** — Show a structured diff of what each iteration changed, not just raw logs.

### Input Sources & PRD Generation
11. **GitHub Issue → PRD** — Convert GitHub issues (with comments, labels, linked PRs) into structured PRDs automatically.
12. **Figma → PRD** — Extract design specs from Figma files and generate frontend PRDs with visual references.
13. **API Spec → PRD** — Convert OpenAPI/GraphQL schemas into implementation PRDs for backend features.
14. **Voice PRD** — Dictate feature requirements via voice, transcribed and structured into PRD format.
15. **PRD from Conversation** — Chat with William about what you want, and it assembles a PRD from the conversation.
16. **Bug Report → PRD** — Convert bug reports (from Sentry, GitHub Issues, support tickets) into fix PRDs with reproduction steps.
17. **Template Library** — Curated PRD templates for common patterns: CRUD API, auth flow, payment integration, search feature, etc.
18. **PRD Versioning** — Track PRD revisions over time; diff between versions; re-run only changed stories.

### Quality & Reliability
19. **Acceptance Test Runner** — Auto-generate executable tests from acceptance criteria in the PRD, run them after implementation, report pass/fail per criterion.
20. **Architecture Guard** — Define architectural rules (e.g., "no direct DB calls from controllers," "all API routes go through middleware") and enforce them during generation.
21. **Security Scanning** — Run automated security analysis (SAST) on generated code; flag OWASP Top 10 vulnerabilities before committing.
22. **Code Quality Scoring** — Score each story's output on maintainability, test coverage, complexity, and adherence to project conventions.
23. **Regression Detection** — Run the full test suite before and after each story; flag any regressions immediately.
24. **Codebase Analyzer** — Pre-analyze the target codebase to build a structured map (components, patterns, conventions, dependencies) that agents reference.
25. **Design System Compliance** — For frontend stories, validate generated UI against the project's design system tokens and component library.

### Developer Experience
26. **Web Dashboard** — Browser-based UI showing all workspaces, real-time progress, logs, cost tracking, and story status across projects.
27. **Diff Preview** — Preview all changes before committing. "Here's what the agent wants to do — approve, modify, or reject."
28. **Code Review Mode** — Human-in-the-loop after each story: review diff, leave comments, agent addresses feedback before moving on.
29. **Cost Budgets** — Set per-workspace or per-project cost limits. William pauses and asks before exceeding budget.
30. **Changelog Generator** — Auto-generate user-facing changelogs from completed workspaces, grouped by feature.
31. **Documentation Generator** — Auto-generate or update docs (README, API docs, component docs) based on implemented code.
32. **Workspace Comparison** — Compare two workspace runs side-by-side to see how different approaches turned out.

### Multi-Agent & Collaboration
33. **Multi-Agent Collaboration** — Specialized agents per concern: frontend agent, backend agent, test agent, docs agent — working on the same story in coordinated phases.
34. **Agent Memory** — Persistent knowledge base across workspaces: "In this project, we always use Zod for validation" — agents learn project conventions over time.
35. **Workspace Sharing** — Share workspace state (PRD, progress, config) with teammates. Multiple people can run/review the same workspace.
36. **Agent Marketplace** — Community-contributed agent prompt templates optimized for specific frameworks, languages, or patterns.

### Integrations
37. **Slack/Discord Notifications** — Real-time alerts: story completed, agent stuck, workspace finished, PR ready.
38. **CI/CD Trigger** — Trigger William workspaces from CI pipelines: merge to `develop` → auto-generate implementation for linked issues.
39. **Jira/Linear Sync** — Sync story status back to project management tools. Story completed in William → ticket moved to "Done."
40. **VS Code Extension** — Monitor workspace progress, view diffs, approve changes, all from within the editor.

### Specialized Modes
41. **Migration Mode** — Specialized workflow for code migrations: framework upgrades, API version bumps, dependency replacements, with before/after validation.
42. **Refactor Mode** — Point at a module and describe the desired architecture; William plans and executes the refactoring across files.
43. **Monorepo Support** — Handle monorepo-specific concerns: package boundaries, shared dependencies, workspace-aware builds.
44. **Database Schema Agent** — Specialized agent for schema changes: generates migrations, updates models, handles data backfill.
45. **i18n Mode** — Automatically extract strings, generate translation keys, and implement internationalization.

### Analytics & Learning
46. **Agent Benchmarking** — Track agent performance metrics over time: stories/hour, cost/story, success rate, common failure patterns.
47. **Story Estimation** — AI-powered complexity estimation before execution: "This story will likely take 3 iterations and cost ~$2.40."
48. **Failure Pattern Analysis** — Analyze logs across all workspaces to identify common failure patterns and proactively avoid them.
49. **A/B Implementation** — Generate two implementations of the same story with different approaches; user picks the better one.
50. **ROI Calculator** — Track time/cost saved vs. manual implementation; generate reports for team leads.

---

## Phase 2: Distill to Top 10

### Evaluation Criteria

| Criterion | Weight | Description |
|-----------|--------|-------------|
| **User Pain** | 30% | How acute is the problem this solves? |
| **Frequency** | 20% | How often do users encounter this pain? |
| **Differentiation** | 20% | Does this set William apart from competitors? |
| **Feasibility** | 15% | Can we build this in a reasonable timeframe? |
| **Growth Potential** | 15% | Does this expand the addressable market? |

### Scoring (1–5 scale)

| # | Idea | Pain | Freq | Diff | Feas | Growth | **Weighted** |
|---|------|------|------|------|------|--------|-------------|
| 1 | Parallel Story Execution | 5 | 5 | 4 | 3 | 4 | **4.25** |
| 2 | PRD Validator | 5 | 5 | 3 | 5 | 3 | **4.30** |
| 3 | Smart Context Injection (RAG) | 5 | 5 | 5 | 2 | 4 | **4.35** |
| 6 | Interactive Agent Mode | 4 | 3 | 4 | 3 | 3 | **3.50** |
| 11 | GitHub Issue → PRD | 4 | 4 | 4 | 4 | 5 | **4.15** |
| 12 | Figma → PRD | 3 | 3 | 5 | 3 | 5 | **3.70** |
| 19 | Acceptance Test Runner | 5 | 5 | 5 | 3 | 4 | **4.50** |
| 24 | Codebase Analyzer | 5 | 5 | 4 | 3 | 3 | **4.15** |
| 26 | Web Dashboard | 4 | 5 | 3 | 3 | 4 | **3.85** |
| 33 | Multi-Agent Collaboration | 4 | 4 | 5 | 2 | 5 | **4.05** |
| 34 | Agent Memory | 4 | 4 | 5 | 3 | 4 | **4.05** |
| 41 | Migration Mode | 4 | 3 | 4 | 4 | 5 | **3.90** |
| 20 | Architecture Guard | 4 | 4 | 4 | 3 | 4 | **3.85** |
| 28 | Code Review Mode | 4 | 4 | 3 | 4 | 3 | **3.65** |
| 46 | Agent Benchmarking | 3 | 3 | 3 | 4 | 3 | **3.15** |

### Top 10 (sorted by weighted score)

1. **Acceptance Test Runner** (4.50) — Auto-generates executable tests from PRD acceptance criteria, runs them after implementation, closes the verification loop.
2. **Smart Context Injection** (4.35) — RAG-powered context: embeds the codebase, retrieves only relevant files per story, dramatically improves agent output quality.
3. **PRD Validator & Optimizer** (4.30) — Pre-flight analysis catches ambiguity, missing criteria, scope issues before agents waste tokens on bad input.
4. **Parallel Story Execution** (4.25) — Run independent stories concurrently across worktrees. The single biggest lever for reducing wall-clock time.
5. **GitHub Issue → PRD Pipeline** (4.15) — Auto-convert GitHub issues into structured PRDs. Eliminates the manual PRD authoring bottleneck.
6. **Codebase Analyzer** (4.15) — Pre-analyze target repo to build a structured map of patterns, conventions, and architecture that every agent references.
7. **Multi-Agent Collaboration** (4.05) — Specialized agents (frontend, backend, test, docs) work in coordinated phases on each story.
8. **Agent Memory** (4.05) — Persistent cross-workspace knowledge: agents learn project conventions, avoid repeated mistakes, improve over time.
9. **Migration Mode** (3.90) — Specialized workflow for framework upgrades, dependency migrations, and API version bumps with before/after validation.
10. **Web Dashboard** (3.85) — Browser-based monitoring: workspace status, real-time logs, cost tracking, story progress across all projects.

---

## Phase 3: Top 5 Selection — Detailed Competition

### Head-to-Head Analysis

#### Round 1: Core Value Proposition Alignment

William's core promise is: **"Turn PRDs into working code, autonomously."**

Each idea is scored on how directly it strengthens that promise:

| Idea | Strengthens Core Promise | Reasoning |
|------|-------------------------|-----------|
| Acceptance Test Runner | **Direct** | Validates that code actually meets the PRD — closes the loop on "working code" |
| Smart Context Injection | **Direct** | Better context → better code — directly improves output quality |
| PRD Validator | **Direct** | Better input → better output — prevents garbage-in/garbage-out |
| Parallel Execution | **Indirect** | Same quality, faster — performance improvement, not quality |
| GitHub Issue → PRD | **Indirect** | Expands input funnel, but doesn't improve code quality |
| Codebase Analyzer | **Direct** | Agents that understand the codebase write better code |
| Multi-Agent Collab | **Direct** | Specialized agents produce higher-quality, more complete output |
| Agent Memory | **Direct** | Agents that learn produce better code over time |
| Migration Mode | **Tangential** | New use case, not a strengthening of the core flow |
| Web Dashboard | **Tangential** | Monitoring improvement, doesn't affect code quality |

**Cut after Round 1:** Migration Mode, Web Dashboard (both valuable but don't strengthen core promise)

#### Round 2: Build Order Dependencies

Some ideas compound when built together. Which ideas *enable* others?

```
Codebase Analyzer ──→ Smart Context Injection
    (analyzer produces the embeddings that RAG uses)

PRD Validator ──→ Acceptance Test Runner
    (validated PRDs have better criteria for test generation)

Agent Memory ──→ Multi-Agent Collaboration
    (shared memory enables agents to coordinate)
```

**Key insight:** Codebase Analyzer is a *prerequisite* for Smart Context Injection. They're effectively one initiative. Merge them.

**Revised list (8 candidates):**
1. Acceptance Test Runner
2. Smart Context + Codebase Analyzer (merged)
3. PRD Validator
4. Parallel Execution
5. GitHub Issue → PRD
6. Multi-Agent Collaboration
7. Agent Memory

#### Round 3: Impact × Effort Quadrant

```
                        HIGH IMPACT
                            │
     ┌──────────────────────┼──────────────────────┐
     │                      │                      │
     │  Smart Context+      │  PRD Validator       │
     │  Codebase Analyzer   │  Acceptance Test     │
     │                      │  Runner              │
     │  Multi-Agent Collab  │                      │
HIGH │                      │                      │ LOW
EFFORT                      │                      EFFORT
     │                      │                      │
     │  Agent Memory        │  Parallel Execution  │
     │                      │  GitHub Issue → PRD  │
     │                      │                      │
     └──────────────────────┼──────────────────────┘
                            │
                        LOW IMPACT
```

**Observations:**
- **PRD Validator** and **Acceptance Test Runner** are high-impact, low-effort — clear wins.
- **Parallel Execution** is moderate-impact, low-effort — good ROI.
- **Smart Context + Analyzer** is highest impact but highest effort.
- **GitHub Issue → PRD** is moderate on both axes.
- **Agent Memory** is high effort for uncertain payoff (needs lots of data to be useful).
- **Multi-Agent Collab** is transformative but complex — better as a v2 bet.

#### Round 4: User Journey Impact

Map each idea to where it improves the user journey:

```
Define → Validate → Execute → Verify → Ship
  │         │          │         │        │
  │    PRD Validator   │    Acceptance    │
  │                    │    Test Runner   │
  │              Parallel Exec           │
  │              Smart Context           │
  │                                      │
  GitHub Issue → PRD               (existing: PR command)
```

**The gap:** William is weakest at **Validate** (no PRD quality check) and **Verify** (no automated acceptance testing). These are the two highest-leverage gaps.

#### Round 5: Final Ranking

| Rank | Idea | Why It Wins |
|------|------|-------------|
| **1** | **Acceptance Test Runner** | Closes the biggest gap in the current product. Users can't trust agent output without verification. Auto-generating tests from acceptance criteria and running them after each story creates a tight feedback loop that catches failures *during* execution, not after. This also feeds back into the agent — if tests fail, the agent can fix them immediately. |
| **2** | **PRD Validator & Optimizer** | Garbage in, garbage out. Every bad PRD wastes $5–50 in agent compute and produces throwaway code. A validator that catches ambiguity, missing acceptance criteria, conflicting requirements, and scope creep *before* agents run saves time, money, and frustration. It can also *suggest improvements* — "Story US-004 has no acceptance criteria; here are 3 suggested criteria based on the description." |
| **3** | **Smart Context Injection + Codebase Analyzer** | The #1 quality lever. Current agents get either the full PRD (if small) or a truncated summary. They search the codebase blindly. A pre-built codebase index (components, patterns, conventions, file relationships) combined with RAG retrieval means agents get *exactly* the relevant context for each story. This turns "sometimes good" output into "consistently good" output. |
| **4** | **Parallel Story Execution** | The #1 performance lever. Currently, a 10-story PRD runs serially — each story waits for the previous one to finish. For independent stories (which most are), parallel execution across separate worktrees could cut wall-clock time from hours to minutes. Combined with a dependency graph, even dependent stories can pipeline efficiently. |
| **5** | **Multi-Agent Collaboration** | The boldest differentiator. Instead of one generalist agent per story, decompose into specialized agents: a *planner* that designs the approach, an *implementer* that writes the code, a *tester* that writes tests, and a *reviewer* that checks quality. Each agent is smaller, more focused, and better at its specific task. This mirrors how real engineering teams work and produces higher-quality output than any single agent. |

---

## Top 5 — Detailed Breakdown

### 1. Acceptance Test Runner

**Problem:** Users have no automated way to verify that agent output actually satisfies the PRD's acceptance criteria. They manually review diffs and hope.

**Solution:** Parse acceptance criteria from each user story, generate executable test cases (unit, integration, or E2E depending on the criterion), run them after implementation, and feed failures back to the agent for immediate fixing.

**How it works:**
1. During PRD parsing, extract each `- [ ] criterion` as a testable assertion
2. Before the implementation agent runs, a test-generation agent converts criteria into executable tests
3. After implementation, tests run automatically
4. Failures feed back into the agent's next iteration as specific, actionable errors
5. Story only marked "complete" when all generated tests pass

**Key metrics:**
- % of acceptance criteria with auto-generated tests
- Test pass rate on first implementation attempt
- Reduction in revision requests after workspace completion

**Risks:** Some acceptance criteria are inherently subjective ("UI should feel responsive") and hard to test automatically. Mitigation: classify criteria as testable/non-testable and flag non-testable ones for human review.

---

### 2. PRD Validator & Optimizer

**Problem:** Bad PRDs are the #1 cause of wasted compute and poor output. Users don't know what makes a good PRD for AI consumption.

**Solution:** Analyze PRDs before execution, score them on clarity/completeness/feasibility, and suggest specific improvements.

**How it works:**
1. `william validate <prd>` or auto-run before `william start`
2. Check for: missing sections, vague stories, no acceptance criteria, conflicting requirements, unrealistic scope, missing technical context
3. Score each story on "AI implementability" (1–5)
4. Suggest concrete improvements: "US-003 says 'handle errors gracefully' — suggest adding specific error cases as acceptance criteria"
5. Estimate total cost and iteration count
6. Optional: auto-optimize mode that rewrites the PRD with improvements

**Key metrics:**
- PRD quality score correlation with workspace success rate
- Reduction in stuck/skipped stories after validation
- User adoption of suggested improvements

**Risks:** Over-optimization could make PRDs feel formulaic. Mitigation: position as suggestions, not requirements. Let users override.

---

### 3. Smart Context Injection + Codebase Analyzer

**Problem:** Agents waste tokens searching the codebase and often miss relevant files, patterns, or conventions. The current context injection is either "dump everything" or "truncate and hope."

**Solution:** Pre-analyze the codebase to build a structured index, then use retrieval-augmented generation to inject only the most relevant context per story.

**How it works:**
1. `william analyze` (or auto-run on first workspace for a project) scans the codebase
2. Builds: component graph, pattern catalog (naming conventions, file structure, common abstractions), dependency map, test patterns
3. Stores as `.william/index.json` (updated incrementally)
4. When an agent starts a story, the orchestrator queries the index: "What files/patterns are relevant to 'implement user authentication'?"
5. Injects a focused context block: "In this project, auth uses JWT tokens stored in HttpOnly cookies. See `src/middleware/auth.ts` for the pattern. Related files: `src/routes/auth.ts`, `src/models/User.ts`."

**Key metrics:**
- Reduction in "file not found" / "wrong pattern" agent errors
- Decrease in average iterations per story
- Improvement in code review approval rate

**Risks:** Index staleness if codebase changes rapidly. Mitigation: incremental updates triggered by git commits. Also, initial analysis cost for large codebases — mitigate with sampling and progressive deepening.

---

### 4. Parallel Story Execution

**Problem:** A 10-story PRD takes 10× as long as a 1-story PRD, even when stories are independent. Users wait hours for results.

**Solution:** Detect independent stories and execute them in parallel across separate worktrees, then merge results.

**How it works:**
1. Parse story dependency graph (explicit via `depends: US-001` or inferred via overlap analysis)
2. Identify independent story clusters that can run in parallel
3. Create a worktree per parallel track
4. Execute stories concurrently (up to configurable parallelism limit)
5. When a parallel track completes, merge its worktree into the main workspace branch
6. Handle merge conflicts: if auto-merge fails, spawn a conflict-resolution agent
7. Dependent stories queue behind their dependencies

**Key metrics:**
- Wall-clock time reduction (target: 3–5× for typical PRDs)
- Merge conflict rate and auto-resolution success rate
- Cost per story (should be similar; parallelism doesn't increase per-story cost)

**Risks:** Merge conflicts between parallel stories. Mitigation: dependency analysis reduces this; conflict-resolution agent handles the rest. Also, resource contention (API rate limits, CPU) — mitigate with configurable concurrency.

---

### 5. Multi-Agent Collaboration

**Problem:** A single generalist agent must plan, implement, test, and review — it can't be expert at all of these. Complex stories suffer from lack of specialization.

**Solution:** Decompose each story into phases handled by specialized agents that pass structured context to each other.

**How it works:**
1. **Planner Agent** reads the story + codebase context, produces an implementation plan (files to create/modify, approach, edge cases)
2. **Implementer Agent** receives the plan, writes the code, makes it compile/lint
3. **Test Agent** receives the implementation, writes comprehensive tests, ensures they pass
4. **Reviewer Agent** reviews the complete changeset against the PRD criteria, project conventions, and common pitfalls — flags issues for the implementer to fix
5. If the reviewer flags issues, loop back to the implementer with specific feedback
6. Each agent has a focused system prompt optimized for its role

**Key metrics:**
- Code quality score comparison: single-agent vs. multi-agent
- Test coverage of generated code
- Number of revision requests post-completion
- Per-story cost (expected: higher per story, but fewer revisions = lower total cost)

**Risks:** Coordination overhead could exceed the quality gains for simple stories. Mitigation: use multi-agent only for stories above a complexity threshold (auto-detected or user-configured). Simple stories continue with the single-agent path.

---

## Summary Matrix

| Rank | Idea | Impact | Effort | When to Build |
|------|------|--------|--------|---------------|
| 1 | Acceptance Test Runner | Highest | Medium | Now — immediate quality win |
| 2 | PRD Validator & Optimizer | High | Low | Now — fastest ROI |
| 3 | Smart Context + Codebase Analyzer | Highest | High | Next — foundational improvement |
| 4 | Parallel Story Execution | High | Medium | Next — performance unlock |
| 5 | Multi-Agent Collaboration | Transformative | High | Later — bold bet on quality |

**Recommended build order:** Start with #2 (PRD Validator — quick win, builds understanding of what makes PRDs succeed), then #1 (Acceptance Test Runner — closes the verification gap), then #3 and #4 in parallel, with #5 as the ambitious v2 initiative.
