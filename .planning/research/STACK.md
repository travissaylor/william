# Stack Research

**Domain:** Parallel autonomous CLI orchestrator with dependency-aware execution and live multi-agent terminal UI
**Researched:** 2026-03-03
**Confidence:** HIGH (all versions verified against npm/official docs/GitHub releases)

---

## Context: What Already Exists

The existing stack is solid and should not be replaced wholesale. This document covers **additions and upgrades** only.

| Existing | Version | Status |
|----------|---------|--------|
| TypeScript 5 | `^5` | Keep |
| Node.js 22 | runtime | Keep |
| Commander.js 12 | `^12` | Keep |
| Ink | `^5` | **Upgrade to 6** (see below) |
| React | `^18` | **Upgrade to 19** (required by Ink 6) |
| execa | `^9` (9.6.1 latest) | Keep — already the best choice |
| Vitest 2 | `^2` | Keep |
| tsup | `^8.5.1` | Keep |
| @inquirer/prompts | `^8.3.0` | Keep |

---

## Additions Required

### 1. Agent Execution: Replace execa subprocess with Claude Agent SDK

**Add:** `@anthropic-ai/claude-agent-sdk` (v0.2.63 latest, actively released — 4 days ago as of research date)

**Why:** The Claude Agent SDK (`@anthropic-ai/claude-agent-sdk`) is Anthropic's official TypeScript library for running Claude Code programmatically. It replaces the current pattern of spawning `claude -p` as a subprocess via execa and manually parsing NDJSON output.

The SDK provides:
- `query()` — async generator that yields typed `SDKMessage` objects (no more manual NDJSON parsing)
- `cwd` option — set working directory per-agent invocation, critical for worktree isolation
- `allowedTools` option — pre-approve tools without user prompts
- `hooks` callbacks (`PreToolUse`, `PostToolUse`) — audit, block, or log tool calls without parsing raw output
- `permissionMode: "acceptEdits"` — fully unattended execution
- Session continuity via `resume: sessionId` for multi-turn conversations

**Versus continuing with subprocess:** The current `spawnCapture()` approach works but requires William to maintain a fragile NDJSON parser tied to Claude's internal event format. The SDK provides a stable, typed contract that won't break when Claude changes its output format. The SDK also spawns Claude Code as a subprocess internally, so behavior is identical — but the interface is stable.

**Important constraint:** The SDK requires `ANTHROPIC_API_KEY` to be set. The current approach uses the `claude` CLI's own auth. Verify this with users before switching — the CLI stores auth differently than API keys. If users authenticate only via `claude auth login` (OAuth), they may not have an API key set. **Maintain subprocess fallback or document the API key requirement clearly.**

**Confidence:** HIGH — official Anthropic package, actively maintained, verified on npm and official docs.

---

### 2. Concurrency Control: p-limit

**Add:** `p-limit` (v7.3.0, released February 3, 2026)

**Why:** William needs to cap the number of simultaneously running Claude agent processes. Running 10 stories in parallel with 10 Claude processes would exhaust system resources and API rate limits. `p-limit` is the standard, minimal, ESM-native solution.

```typescript
import pLimit from 'p-limit';

const limit = pLimit(3); // max 3 concurrent agents

const results = await Promise.all(
  readyStories.map(story =>
    limit(() => runAgent(story, worktreeDir))
  )
);
```

**Why not p-queue:** `p-queue` (v9.1.0) adds priority queuing and pause/resume — useful if William needs to dynamically reprioritize stories during a run. For the current milestone scope (parallel execution with cap), `p-limit` is simpler and sufficient. Upgrade to `p-queue` when dynamic prioritization is needed.

**Why not native Promise.all with no limit:** No backpressure, would spawn unlimited agents simultaneously.

**Confidence:** HIGH — verified version 7.3.0 on GitHub releases, ESM-only (compatible with William's ESM codebase).

---

### 3. Dependency Graph: graph-data-structure

**Add:** `graph-data-structure` (v4.5.0, released March 5, 2025)

**Why:** William needs to analyze story dependencies and produce a valid execution order. `graph-data-structure` is a small, TypeScript-native (97.8% TypeScript) library that provides:
- `addNode()`, `addEdge()` — build the dependency graph
- `topologicalSort()` — produces a valid execution order (sources before dependents)
- Throws `CycleError` on circular dependencies — catches bad PRDs early

```typescript
import { graphDataStructure } from 'graph-data-structure';

const graph = graphDataStructure();
graph.addNode('story-1');
graph.addNode('story-2');
graph.addEdge('story-1', 'story-2'); // story-2 depends on story-1

const order = graph.topologicalSort();
// → ['story-1', 'story-2']
```

**Why not building it from scratch:** Topological sort with cycle detection is ~50 lines but tested, typed, and maintained. Not worth owning.

**Why not graphology:** Graphology is a full-featured graph library (think D3 for graphs) — far more than William needs. `graph-data-structure` is 4.5KB, purpose-built for task scheduling.

**Why not typescript-graph:** Less popular, fewer stars, last release is older. `graph-data-structure` is actively maintained (March 2025 release).

**Confidence:** MEDIUM — verified version and TypeScript support on GitHub. Less widely known than p-limit but well-suited for the problem. The topological sort and CycleError behavior verified in docs.

---

### 4. Terminal UI Upgrade: Ink 6 + React 19

**Upgrade:** `ink` from `^5` to `^6` (v6.8.0 latest), `react` from `^18` to `^19`

**Why Ink 6:** Ink 6 adds concurrent rendering support (v6.7.0) and synchronous string output (v6.8.0) — both directly relevant to displaying parallel agent streams. Ink 6 requires React 19 as a peer dependency.

**Why React 19:** Required by Ink 6. React 19 concurrent mode improvements (Suspense boundaries, Actions) make multi-stream rendering more reliable. Ink 5 + React 18 is what exists today; Ink 6 + React 19 is the upgrade path.

**Migration note:** Ink 6 has breaking changes from Ink 5. The specific breaking changes between versions need to be researched at implementation time (the changelog between v5 and v6 was not fully available at research time). Plan one migration spike before building new TUI components on top of it.

**What stays:** The existing `App.tsx`, `Dashboard.tsx`, and `LogArea.tsx` component structure is the right architecture. Ink 6 is additive for the parallel use case — each running agent maps to a React component that receives its stream events via props or context.

**Confidence:** MEDIUM — Ink 6 latest version (6.8.0) and React 19 requirement confirmed. Full breaking change list between Ink 5 and 6 not enumerated; needs implementation-time verification.

---

### 5. Configuration Schema Validation: Zod

**Add:** `zod` (v4.3.6 latest, stable since May 2025)

**Why:** The upcoming pipeline stages and quality rules features (from PROJECT.md) require user-defined configuration that must be validated at runtime. TypeScript interfaces don't catch malformed `.william/config.json` at runtime — Zod does.

```typescript
import { z } from 'zod';

const QualityRulesSchema = z.object({
  testCoverage: z.number().min(0).max(100).default(80),
  requireTypecheck: z.boolean().default(true),
  requireLint: z.boolean().default(true),
  customChecks: z.array(z.string()).default([]),
});

type QualityRules = z.infer<typeof QualityRulesSchema>;
```

**Why Zod 4 over Zod 3:** Zod 4 is significantly faster (up to 14x for schema parsing), has better TypeScript integration with fewer type inference edge cases, and ships Zod Mini for tree-shaking. No reason to start on Zod 3.

**Warning — dependency conflict:** `@anthropic-ai/claude-agent-sdk` declares `zod ^3.24.1` as a peer/required dependency. Verify compatibility before committing to Zod 4 — they may be incompatible. If the SDK locks to Zod 3, use Zod 3 for William's own validation schemas to avoid having two Zod versions in the bundle.

**Confidence:** MEDIUM — Zod 4.3.6 version confirmed on npm. The dependency conflict with claude-agent-sdk needs hands-on verification at implementation time.

---

## No New Additions Required For

### Quality Verification Execution

Quality verification (run tests, typecheck, lint after each story) requires no new libraries. Use execa's existing integration to run `pnpm test`, `pnpm typecheck`, and `pnpm lint` as child processes and parse their exit codes and stdout. This is what execa 9 is for.

```typescript
import { execa } from 'execa';

const result = await execa('pnpm', ['typecheck'], { cwd: worktreeDir, reject: false });
const passed = result.exitCode === 0;
```

No orchestration framework needed — just structured shell execution with exit code interpretation.

### AbortController / Process Cancellation

Node.js 22 has AbortController and AbortSignal built-in (no library needed). Use individual AbortControllers per agent process — one shared AbortController that kills all agents on any single failure is an anti-pattern discovered in research.

```typescript
const controller = new AbortController();
// pass signal to execa or agent SDK, cancel cleanly on timeout/stuck
```

### IPC Between Agents

William's agents are fully isolated by design (separate worktrees, separate context windows). No IPC library needed. Agents communicate only through the filesystem (state.json, progress.txt). This is the right design — shared state between agents would create race conditions.

---

## Recommended Stack Additions Summary

| Package | Version | Purpose | Add or Upgrade |
|---------|---------|---------|----------------|
| `@anthropic-ai/claude-agent-sdk` | 0.2.63 | Typed Claude agent execution (replaces raw NDJSON parsing) | Add |
| `p-limit` | 7.3.0 | Cap concurrent agent processes | Add |
| `graph-data-structure` | 4.5.0 | Dependency DAG + topological sort for story ordering | Add |
| `ink` | 6.8.0 | Concurrent rendering support for parallel agent TUI | Upgrade from 5 |
| `react` | 19 | Required peer dep for Ink 6 | Upgrade from 18 |
| `@types/react` | 19 | TypeScript types for React 19 | Upgrade from 18 |
| `zod` | 4.3.6 | Runtime config validation for pipeline/quality rules | Add (verify SDK compat first) |

---

## Installation

```bash
# New dependencies
pnpm add @anthropic-ai/claude-agent-sdk p-limit graph-data-structure zod

# Upgrades
pnpm add ink@latest react@19 @types/react@19
```

---

## Alternatives Considered

| Recommended | Alternative | Why Not |
|-------------|-------------|---------|
| `@anthropic-ai/claude-agent-sdk` | Continue with `execa` + `claude -p` | Fragile NDJSON parser tied to Claude internals; SDK provides stable typed contract |
| `p-limit` | `p-queue` | p-queue adds priority/pause that isn't needed yet; add when dynamic reprioritization is a feature |
| `p-limit` | Native `Promise.all` | No backpressure — would spawn unlimited agents simultaneously |
| `graph-data-structure` | Build topological sort from scratch | 50 lines of unowned, untested code; library is tiny and maintained |
| `graph-data-structure` | `graphology` | Graphology is a full graph visualization suite; overkill for task scheduling |
| Ink 6 + React 19 | Stay on Ink 5 + React 18 | Miss concurrent rendering improvements; Ink 5 is still maintained but Ink 6 is the active branch |
| `zod` 4 | `zod` 3 | Zod 3 is superseded; only consider if claude-agent-sdk forces a conflict |
| `zod` | `ajv` | AJV is JSON Schema based — more verbose, less ergonomic for TypeScript |
| execa (keep) | Node.js `child_process` directly | execa provides superior DX, error handling, and stream API that William already uses |

---

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `listr2` for parallel task display | listr2 has its own rendering system that conflicts with the existing Ink/React TUI. Mixing two rendering systems creates undefined behavior. | Extend existing Ink components with parallel-aware state |
| `blessed` / `blessed-contrib` | Low-level terminal widget library with no React integration — would require rewriting the entire TUI from scratch | Ink 6 (already chosen) |
| `concurrently` (npm package) | Designed for running CLI commands in parallel from shell scripts, not for programmatic orchestration of typed agent streams | execa + p-limit |
| Worker threads (`worker_threads`) | Agents are I/O-bound (spawning external processes), not CPU-bound. Worker threads add complexity without benefit for this use case | Async/await + p-limit with child processes |
| `@anthropic-ai/sdk` (Client SDK) | The Client SDK requires you to implement the tool execution loop yourself. William doesn't need to build a tool executor — Claude Code already has one. | `@anthropic-ai/claude-agent-sdk` (Agent SDK) |

---

## Version Compatibility Matrix

| Package | Requires | Compatible With | Notes |
|---------|----------|-----------------|-------|
| ink@6.x | react@^19 | react@19 | Breaking upgrade from ink@5 |
| ink@5.x | react@^18 | react@18 | Current, incompatible with react@19 |
| @anthropic-ai/claude-agent-sdk@0.2.x | node@18+, zod@^3.24.1 | node@22 | Verify Zod version conflict with Zod 4 |
| p-limit@7.x | ESM only | node@22, ESM | Pure ESM — fine for William's ESM codebase |
| graph-data-structure@4.x | TypeScript | node@22 | TypeScript-native, no @types package needed |
| zod@4.x | TypeScript 5.5+ | TypeScript@^5 | Works with William's TS5 setup |

---

## Key Implementation Risks

**Risk 1 — Claude Agent SDK auth model:** The SDK requires `ANTHROPIC_API_KEY`. The existing codebase spawns `claude` CLI which uses its own OAuth token storage. Users who set up Claude Code via `claude auth login` may not have `ANTHROPIC_API_KEY` set. Before switching, document the API key requirement or implement a detection check that falls back to subprocess mode.

**Risk 2 — Zod version conflict:** `@anthropic-ai/claude-agent-sdk` declares `zod ^3.24.1`. If pnpm resolves this to Zod 3, importing Zod 4 for William's own schemas will result in two Zod instances in the bundle, causing instanceof checks to fail. Verify with `pnpm ls zod` after installation.

**Risk 3 — Ink 5 to Ink 6 migration:** The full breaking change list between Ink 5 and Ink 6 is not documented in public release notes visible at research time. Budget one spike story to validate the upgrade doesn't break existing TUI components before building parallel agent panels on top.

---

## Sources

- [Claude Agent SDK TypeScript Reference](https://platform.claude.com/docs/en/agent-sdk/typescript) — `query()` API, message types, options, hooks
- [Claude Agent SDK Overview](https://platform.claude.com/docs/en/agent-sdk/overview) — SDK vs subprocess tradeoffs, version 0.2.63 confirmed
- [Run Claude Code programmatically](https://code.claude.com/docs/en/headless) — CLI `-p` flag vs SDK comparison
- [p-limit GitHub releases](https://github.com/sindresorhus/p-limit/releases) — v7.3.0 confirmed, ESM-only since v4.0.0
- [p-queue GitHub](https://github.com/sindresorhus/p-queue) — v9.1.0, priority/pause features, ESM-only
- [graph-data-structure GitHub](https://github.com/curran/graph-data-structure) — v4.5.0, TypeScript-native, topological sort + CycleError
- [Ink GitHub releases](https://github.com/vadimdemedes/ink/releases) — v6.8.0 latest, concurrent rendering in v6.7.0
- [Ink React 19 issue #688](https://github.com/vadimdemedes/ink/issues/688) — Ink 6 requires React 19, Ink 5 incompatible with React 19
- [Zod v4 release notes](https://zod.dev/v4) — stable since May 19, 2025; v4.3.6 latest on npm
- [execa npm](https://github.com/sindresorhus/execa) — v9.6.1 latest (keep existing)
- [listr2](https://listr2.kilic.dev) — v10.1.2, own rendering system (incompatible with Ink TUI)

---

*Stack research for: William — parallel agent orchestration milestone*
*Researched: 2026-03-03*
