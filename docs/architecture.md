# Architecture

## High-Level Flow

```
PRD (.md) → Parser → Workspace → Agent Runner → Commit
```

1. **Parse** — `src/prd/parser.ts` splits a markdown PRD into structured sections and individual user stories (with IDs, descriptions, and acceptance criteria).
2. **Create workspace** — `src/workspace.ts` sets up a workspace directory under `workspaces/<project>/<name>/` with initial state, a progress file, and a copy of the PRD.
3. **Run loop** — `src/runner.ts` iterates through stories one at a time. For each story it assembles a prompt (via context builder + template placeholders), spawns a Claude Code agent, streams the output, and checks for completion signals (`<promise>STORY_COMPLETE</promise>` / `ALL_COMPLETE`).
4. **Stuck detection** — Inline in the runner. Detects tool loops, zero progress, and high error rates. Escalates through hint → skip → pause.
5. **Commit** — The spawned agent is responsible for committing its own changes in the target repo.

## Component Roles

| Component | File(s) | Role |
|-----------|---------|------|
| CLI | `src/cli.ts` | Commander-based entry point. Commands: `new`, `start`, `stop`, `status`, `list`, `archive`, `migrate`, `prd`. |
| Runner | `src/runner.ts` | Core iteration loop. Loads state, builds prompts, spawns agents, processes results, runs stuck detection. |
| Workspace | `src/workspace.ts` | Creates, resolves, starts, stops, and lists workspaces. Manages the TUI lifecycle. |
| Wizard | `src/wizard.ts` | Interactive prompts (Inquirer) to collect workspace config from the user. |
| PRD Parser | `src/prd/parser.ts` | Parses markdown PRDs into `ParsedPrd` structs with typed story objects. |
| State Tracker | `src/prd/tracker.ts` | Manages `state.json` — story pass/fail/skip status, attempts, current story pointer. |
| Context Builder | `src/prd/context-builder.ts` | Assembles the prompt context sent to each agent. Handles small vs large PRDs, injects codebase patterns, recent progress, stuck hints, and chain context. |
| Template Engine | `src/template.ts` | Simple `{{placeholder}}` replacement for agent instruction templates. |
| Claude Adapter | `src/adapters/claude.ts` | Spawns `claude` CLI with `--dangerously-skip-permissions` and `--output-format stream-json`. Parses completion signals from output. |
| Stream Consumer | `src/stream/consume.ts` | Reads NDJSON stream from the Claude process, extracts tool uses, costs, and tokens. |
| Chain Context | `src/stream/chain.ts` | Extracts context (files modified, commands run, errors, decisions) from a completed session to pass to the next story's agent. |
| Notifier | `src/notifier.ts` | macOS desktop notifications (via `osascript`) for stuck/skip/pause events. |
| Archive | `src/archive.ts` | Copies workspace artifacts to `archive/` and removes the workspace directory. |
| TUI | `src/ui/` | React/Ink terminal UI — dashboard, log area, story banners, spinners. |
| Migrate | `src/migrate.ts` | One-time migration from flat workspace layout to project-grouped layout. |

## Key Directories

```
src/              — All source code
  adapters/       — Tool adapter interface + Claude implementation
  prd/            — PRD parsing, state tracking, context building
  stream/         — NDJSON stream consumer and chain context extraction
  types/          — Shared TypeScript type definitions
  ui/             — React/Ink TUI components
templates/        — Markdown templates for agent instructions and PRD generation
workspaces/       — Runtime workspace data (state, logs, progress)
archive/          — Archived workspace snapshots
```

## Data Flow Per Iteration

1. Load `state.json` from workspace directory
2. Find the first story with `passes === false` (current story)
3. Read PRD, build context via `context-builder.ts`
4. Fill `templates/agent-instructions.md` with `template.ts` placeholders
5. Spawn Claude agent via adapter, pipe prompt to stdin
6. Stream and parse NDJSON output (tool uses, tokens, cost)
7. Check for `STORY_COMPLETE` / `ALL_COMPLETE` in output
8. Update state: mark complete or increment attempts
9. Run stuck detection; escalate if needed (hint → skip → pause)
10. Extract chain context for next iteration
