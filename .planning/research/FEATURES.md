# Feature Research

**Domain:** Autonomous CLI orchestrator for AI coding agents (PRD-to-PR pipeline)
**Researched:** 2026-03-03
**Confidence:** HIGH — Multiple verified sources including Claude Code official docs, ComposioHQ open-source orchestrator, Factory AI technical reports, GitHub engineering blog, and current ecosystem surveys.

---

## Feature Landscape

### Table Stakes (Users Expect These)

Features users assume exist. Missing these = product feels incomplete or broken for an autonomous coding orchestrator.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Parallel story execution | Waiting for independent stories to run sequentially wastes time by definition; every competing orchestrator (ComposioHQ, Superset IDE, Cursor Cloud) runs parallel agents by default | HIGH | Each story in its own git worktree and Claude process; concurrency limit configurable; dependent stories must block until prerequisites complete |
| Story dependency analysis | Without ordering, agents overwrite each other or build on top of unfinished work; the "agents struggle with meta-level decisions about workflow sequencing" problem is well-documented | HIGH | Static analysis of acceptance criteria + naming heuristics; DAG-based; computed at PRD parse time, not runtime |
| Post-story quality verification loop | Over 70% of AI-generated code requires rework before production; quality gates are the only automated signal that output matched intent | HIGH | Run tests + lint + typecheck after each story completion; re-queue story if checks fail; configurable pass thresholds per project |
| Persistent state with resume capability | Users lose work if the process crashes; Claude Code sessions and every competing tool support session resumption | MEDIUM | Already exists in William (state.json); must survive parallel process crashes too |
| Live multi-agent progress UI | Operators need to see which agents are running, which stories are blocked, token costs, and errors in real-time; blind operation is a non-starter | MEDIUM | Already exists for sequential; must scale to N concurrent agents with per-agent status lanes |
| Stuck detection and recovery | Agents loop on tool calls, produce zero-diff output, or hit error cascades; without detection the loop spins indefinitely wasting tokens | MEDIUM | Already exists in William; must work per-agent in parallel mode |
| PR generation with AI-authored description | The workflow ends at a PR; manually writing PR descriptions after automated execution defeats the purpose | LOW | Already exists in William (gh CLI + Claude diff summarization) |
| Clear cost/token tracking | Autonomous agents burn tokens unattended; users need visibility to catch runaway costs | LOW | Already exists in William TUI; must aggregate across parallel agents |

### Differentiators (Competitive Advantage)

Features that set William apart. Not required, but deliver the core value proposition.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Intent verification (PRD-to-output matching) | Tests passing is not the same as PRD intent satisfied; the emerging "intent is source of truth" paradigm (GitHub Spec Kit, Kiro) requires an explicit verify-against-spec pass | HIGH | Post-story step: Claude reads story acceptance criteria + diff, returns PASS/FAIL with rationale; distinct from running tests (which verify code correctness, not PRD alignment) |
| Intelligent dependency graph from PRD | Most orchestrators require manual dependency declaration; William should infer dependencies from PRD structure, shared data models, and naming patterns — reducing human configuration burden | HIGH | AST-aware analysis of acceptance criteria; story title NLP; graph visualized in TUI |
| Token efficiency via native CLI for deterministic tasks | ComposioHQ and Composio-style tools route everything through AI; William's explicit decision to use git/file I/O/template rendering for deterministic steps is a meaningful cost advantage at scale | MEDIUM | Already a design principle; implement structured context assembly (function signatures, not full files) using tree-sitter-style extraction; inject only what the story needs |
| Customizable pipeline stages | Developers have different workflows: some want a deploy hook, some want to skip review, some want a custom formatter gate; pipeline-as-config (add/remove/reorder stages) makes William fit diverse teams | MEDIUM | YAML-defined pipeline with named stages (plan, implement, verify, review, pr); hooks at stage boundaries; per-project in .william/config.json |
| Customizable quality rules per project | "Good enough" varies: one project requires 90% test coverage, another only needs lint passing; hardcoded thresholds are a blocker for adoption | MEDIUM | Config-driven: testCoverageThreshold, requireLint, requireTypecheck, requireTests; per-project in .william/config.json |
| Cross-agent context propagation | When agent A discovers a design pattern or constraint, agent B should benefit from it without re-discovering it; this is the "amnesia problem" that costs 80% of tokens in multi-session setups | MEDIUM | progress.txt chain already partially addresses this; extend to broadcast key learnings across parallel agents via shared workspace context file |
| Operator notification on completion/failure | Walk-away workflows need async notification; developers want to be paged when William finishes or hits a blocker, not poll a terminal | LOW | Already exists partially (notifier.ts); extend to failure cases with error summary |
| Model selection per stage | Expensive models (Opus) for planning/intent verification; cheaper models (Haiku/Sonnet) for implementation; this is a documented cost optimization pattern from the Mike Mason / Cursor architecture analysis | LOW | Pass --model flag to Claude CLI per stage; config-driven per pipeline stage |

### Anti-Features (Commonly Requested, Often Problematic)

Features that seem good but create problems for William's core value proposition.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Agent-to-agent direct communication (Claude Code Agent Teams style) | Looks like smarter coordination — teammates debate and converge | Adds significant token cost (each message is a full LLM call), adds coordination overhead, and Claude Code Agent Teams are explicitly "experimental with known limitations"; William's value is autonomous completion, not agent collaboration | Use shared task list + progress.txt for passive coordination; agents don't need to talk, they need to not conflict |
| Web dashboard / remote monitoring UI | Visual appeal; useful for teams | Requires running a server, adds infra dependency, moves away from CLI-first design, and adds significant complexity for no token efficiency gain; Composio's web dashboard is a differentiator for them, not for a CLI tool | Rich TUI in terminal is sufficient; use system notifications for async alerts |
| Multi-model support (OpenAI, Gemini, Codex) | Model flexibility sounds better than lock-in | William orchestrates Claude Code CLI specifically; adapting to other CLIs with different NDJSON schemas and capability sets fractures the adapter layer and doubles testing surface; model-agnostic orchestrators (ComposioHQ) exist and compete on that axis | Use model selection (Opus/Sonnet/Haiku) within Claude ecosystem; that's sufficient flexibility |
| Real-time collaboration / multi-user | Teams want shared workspaces | William is a single-developer autonomous tool; multi-user adds auth, conflict resolution, and session ownership complexity that is out of scope; Composio and Factory target teams, William targets individual developers | Single-developer model is a feature (zero coordination overhead); share PRs for collaboration |
| Agent prompt customization | Power users want to tune agent behavior | Prompt micromanagement undermines the "walk away" value; users who tune prompts become operators, defeating automation; pipeline and quality rules are the right abstraction for customization | Expose pipeline stages and quality rules, not agent internals; CLAUDE.md in the project provides implicit guidance |
| Deployment / post-PR automation | End-to-end automation sounds complete | Deployment is project-specific (Vercel, AWS, Kubernetes) and requires credentials/infra access that William shouldn't hold; PR creation is the right finish line | Document that deployment hooks belong in CI/CD, not William; provide clear handoff point |

---

## Feature Dependencies

```
[Story Dependency Analysis]
    └──required by──> [Parallel Story Execution]
                          └──required by──> [Multi-Agent Progress UI (parallel lanes)]
                          └──required by──> [Cross-Agent Context Propagation]

[Post-Story Quality Verification Loop]
    └──required by──> [Intent Verification (PRD matching)]
                          └──enhances──> [Story Dependency Analysis] (verification failures inform reorder)

[Customizable Pipeline Stages]
    └──required by──> [Model Selection Per Stage]
    └──required by──> [Customizable Quality Rules]

[Token Efficiency (native CLI)]
    └──enhances──> [Cross-Agent Context Propagation] (structured context assembly)

[Operator Notification]
    └──enhances──> [Parallel Story Execution] (walk-away workflows need async signal)

[Persistent State / Resume]
    └──required by──> [Parallel Story Execution] (crash recovery per agent)
```

### Dependency Notes

- **Story Dependency Analysis requires nothing new** — it is computed at PRD parse time using existing ParsedPrd structure; it is a prerequisite for safe parallelism.
- **Parallel Execution requires Dependency Analysis** — running stories in parallel without dependency ordering causes agents to build on top of incomplete code, creating cascading failures.
- **Intent Verification requires Quality Verification Loop** — it runs as an additional stage after tests pass; tests confirm correctness, intent verification confirms PRD alignment. Neither replaces the other.
- **Pipeline Customization requires no prerequisites** — it is a configuration layer over existing stages; it can be added after core parallel execution is working.
- **Model Selection Per Stage requires Pipeline Customization** — without named stages, there is no configuration surface for per-stage model assignment.
- **Cross-Agent Context Propagation conflicts with Agent-to-Agent Communication** — passive context sharing (progress.txt broadcast) achieves coordination without LLM call overhead; adding direct messaging replaces the efficient model with an expensive one.

---

## MVP Definition

### Launch With (v1 — milestone scope)

Minimum viable set to deliver the three stated gaps from PROJECT.md.

- [ ] **Story dependency analysis** — infer execution order from PRD; block dependent stories until prerequisites pass
- [ ] **Parallel story execution** — run independent stories as concurrent Claude Code processes in separate worktrees; configurable concurrency limit
- [ ] **Post-story quality verification loop** — run tests + lint + typecheck after each story; re-queue on failure; project-configurable thresholds
- [ ] **Multi-agent progress UI** — extend existing TUI to show parallel agent status lanes, per-agent token cost, blocked/running/complete story states

### Add After Validation (v1.x)

Add once parallel execution is stable and users are trusting William with real PRDs.

- [ ] **Intent verification (PRD matching)** — trigger: users report tests pass but output misses the point; adds an AI-evaluated pass against acceptance criteria
- [ ] **Cross-agent context propagation** — trigger: users report parallel agents duplicating architectural discovery work; extend progress.txt to broadcast patterns across concurrent agents
- [ ] **Customizable quality rules** — trigger: users on projects with no tests or different lint configs find default thresholds block workflow; add per-project config surface

### Future Consideration (v2+)

Defer until core parallel pipeline is proven and user feedback shapes priorities.

- [ ] **Customizable pipeline stages** — trigger: users want to add deploy hooks or remove review stages; requires stable stage abstraction first
- [ ] **Model selection per stage** — trigger: token costs become a primary complaint; use cheaper models for implementation, expensive for planning
- [ ] **Operator notification enhancements** — trigger: users running William overnight and missing failures; extend notifier to include error summaries and story-level details

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Story dependency analysis | HIGH | MEDIUM | P1 |
| Parallel story execution | HIGH | HIGH | P1 |
| Post-story quality verification loop | HIGH | MEDIUM | P1 |
| Multi-agent progress UI (parallel) | HIGH | MEDIUM | P1 |
| Intent verification (PRD matching) | HIGH | HIGH | P2 |
| Cross-agent context propagation | MEDIUM | MEDIUM | P2 |
| Customizable quality rules | MEDIUM | LOW | P2 |
| Customizable pipeline stages | MEDIUM | HIGH | P3 |
| Model selection per stage | MEDIUM | LOW | P3 |
| Operator notification enhancements | LOW | LOW | P3 |

**Priority key:**
- P1: Must have for this milestone — directly addresses the three stated gaps
- P2: Should have, add when P1 is stable
- P3: Nice to have, future milestone

---

## Competitor Feature Analysis

| Feature | ComposioHQ Agent Orchestrator | Claude Code Agent Teams | Factory Droid | William (current/planned) |
|---------|-------------------------------|------------------------|---------------|--------------------------|
| Parallel agents | Yes — 30+ concurrent, git worktrees | Yes — experimental, tmux/in-process | Yes — specialized Droids | Planned (P1) |
| Dependency management | Implicit (worktree isolation) | Shared task list + file locking | Role-based (Code/Knowledge/Reliability Droids) | Planned: DAG from PRD |
| Quality verification | CI integration — agent auto-fixes failures | TeammateIdle + TaskCompleted hooks | Reliability Droid for production | Planned: post-story test + lint loop |
| Intent verification | No | No | Partial (Reliability Droid) | Planned (P2) |
| Live progress UI | Web dashboard at localhost:3000 | Split pane (tmux/iTerm2) | Unknown | Existing TUI, extending for parallel |
| Token efficiency | Plugin swapping for lighter agents | High token cost (known limitation) | Model-agnostic, cheaper models beat frontier | Native CLI for deterministic tasks |
| Pipeline customization | YAML reactions (CI-fail, review, approve modes) | Hooks (TeammateIdle, TaskCompleted) | Specialized Droid types | Planned (P3) |
| CLI-first | Yes (ao CLI + web) | No (interactive Claude sessions) | Yes (Terminal-first) | Yes |

---

## Sources

- [Claude Code Agent Teams official documentation](https://code.claude.com/docs/en/agent-teams) — HIGH confidence, official Anthropic docs
- [ComposioHQ agent-orchestrator GitHub](https://github.com/ComposioHQ/agent-orchestrator) — HIGH confidence, open-source codebase
- [Open-Sourcing Agent Orchestrator: Effectively Manage 30 Parallel Agents](https://pkarnal.com/blog/open-sourcing-agent-orchestrator) — MEDIUM confidence, author blog with implementation detail
- [Multi-agent workflows often fail. Here's how to engineer ones that don't.](https://github.blog/ai-and-ml/generative-ai/multi-agent-workflows-often-fail-heres-how-to-engineer-ones-that-dont/) — HIGH confidence, GitHub engineering blog
- [Optimizing AI Coding Agents: A Case Study in 65% Token Reduction](https://earezki.com/ai-news/2026-02-26-how-i-cut-my-ai-coding-agents-token-usage-by-65-without-changing-models/) — MEDIUM confidence, practitioner case study with specific numbers
- [AI Coding Agents in 2026: Coherence Through Orchestration](https://mikemason.ca/writing/ai-coding-agents-jan-2026/) — MEDIUM confidence, senior practitioner analysis
- [Kiro Agent Hooks documentation](https://kiro.dev/blog/automate-your-development-workflow-with-agent-hooks/) — HIGH confidence, official Kiro product docs
- [Factory AI Code Droid Technical Report](https://factory.ai/news/code-droid-technical-report) — HIGH confidence, official Factory.ai technical report
- [Autonomous Quality Gates: AI-Powered Code Review](https://www.augmentcode.com/guides/autonomous-quality-gates-ai-powered-code-review) — MEDIUM confidence, Augment Code product guide
- [Why Your AI Agent Needs a Quality Gate (Not Just Tests)](https://dev.to/yurukusa/why-your-ai-agent-needs-a-quality-gate-not-just-tests-42eo) — MEDIUM confidence, practitioner article
- [2026 Agentic Coding Trends - Implementation Guide](https://huggingface.co/blog/Svngoku/agentic-coding-trends-2026) — MEDIUM confidence, HuggingFace community guide

---

*Feature research for: autonomous CLI orchestrator for AI coding agents (PRD-to-PR pipeline)*
*Researched: 2026-03-03*
