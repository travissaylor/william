# William

## What This Is

An autonomous CLI orchestrator that takes an idea from concept to pull request. William parses PRDs into user stories, spawns parallel Claude Code agents with dependency awareness, verifies quality at every step, and presents it all through a rich, live terminal UI. It's built for developers who want to describe what they want and walk away.

## Core Value

Given a PRD, William autonomously produces a clean, tested PR with zero intervention — getting the right things done accurately the first time.

## Requirements

### Validated

<!-- Shipped and confirmed valuable. Inferred from existing codebase. -->

- ✓ CLI foundation with multi-command architecture (new, start, stop, status, archive, list, prd, problem, revise, pr) — existing
- ✓ Workspace management via git worktrees with project grouping — existing
- ✓ PRD parsing into structured user stories with acceptance criteria extraction — existing
- ✓ Agent execution loop per story with NDJSON stream parsing — existing
- ✓ Stuck detection (tool loops, zero progress, high error rate) with hint generation — existing
- ✓ React/Ink TUI dashboard with story progress, cost/token tracking — existing
- ✓ Context continuity via progress.txt and cross-story chain context — existing
- ✓ Revision workflow for iterative problem resolution — existing
- ✓ PR generation with Claude-authored descriptions via GitHub CLI — existing
- ✓ Per-project config (.william/config.json) for defaults — existing
- ✓ Shell completions (bash/zsh/fish) — existing
- ✓ Resume capability with persistent state.json — existing

### Active

<!-- Current scope. Building toward these. -->

- [ ] Deeper planning phase — intelligent story dependency analysis and execution ordering
- [ ] Parallel story execution — independent stories run simultaneously, dependent stories wait
- [ ] Quality verification loop — automated check that built code matches intent after each story
- [ ] Rich live progress UI — real-time multi-agent streaming with per-agent status, progress bars
- [ ] Token efficiency — caching, templating, and native CLI operations to minimize AI token usage
- [ ] Customizable pipeline stages — add/remove/reorder workflow steps (e.g., skip review, add deploy hook)
- [ ] Customizable quality rules — define "good enough" per project (test coverage, lint, type safety thresholds)

### Out of Scope

<!-- Explicit boundaries. Includes reasoning to prevent re-adding. -->

- Deployment/CI management — William's job ends at PR creation, deployment is a separate concern
- Web UI or desktop app — CLI-first by design for token efficiency and developer workflow fit
- Agent prompt customization — pipeline and quality rules are customizable, but agent internals stay opaque
- Multi-model support (OpenAI, etc.) — Claude Code is the execution engine, William orchestrates it
- Real-time collaboration — single-developer tool optimized for autonomous execution

## Context

William is a brownfield project with a solid TypeScript/Node.js foundation. The existing codebase handles workspace lifecycle, PRD parsing, sequential agent execution, TUI dashboards, and PR creation. The architecture (CLI → workspace → runner → adapter → stream → TUI) is well-layered and extensible.

Key technical context:
- **Runtime:** Node.js 22, ESM, TypeScript 5 strict
- **CLI:** Commander.js 12 with multi-command architecture
- **TUI:** React 18 + Ink 5 for terminal rendering
- **Agent comms:** Claude CLI spawned via execa, NDJSON stream parsing
- **Build:** tsup bundles to single `dist/cli.js`
- **Quality:** ESLint + Prettier + Vitest + Husky pre-commit hooks

The three biggest gaps from today's implementation:
1. **Planning is shallow** — `william prd` generates stories but doesn't analyze dependencies or determine execution order
2. **No quality verification** — agents run and produce output, but there's no automated check that the result matches the PRD intent
3. **Sequential execution only** — stories run one at a time even when they're independent

## Constraints

- **Package manager**: pnpm — never npm or yarn
- **Runtime**: Node.js 22+ with ESM
- **AI engine**: Claude Code CLI (`claude` command) — William orchestrates, Claude executes
- **Token budget**: Minimize AI token usage — prefer native CLI operations (git, file I/O, template rendering) over AI calls for deterministic tasks
- **External deps**: Requires `claude` CLI and `gh` CLI installed separately
- **Pre-commit**: Must pass `pnpm typecheck` and `pnpm lint` before every commit

## Key Decisions

<!-- Decisions that constrain future work. Add throughout project lifecycle. -->

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| CLI-first (not Claude Code extension) | Token efficiency — git ops, state tracking, templates don't need AI | — Pending |
| Parallel stories via separate Claude Code processes | Each story gets independent context window, no cross-contamination | — Pending |
| PR creation as finish line (not deployment) | Keeps scope focused, deployment is project-specific | — Pending |
| Pipeline/quality customization (not agent prompt customization) | Users should control workflow shape and quality gates, not micromanage AI prompts | — Pending |

---
*Last updated: 2026-03-03 after initialization*
