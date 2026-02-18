# William

Autonomous orchestrator that turns markdown PRDs into implemented code by spawning a fresh AI agent for each user story.

## How it works

1. You write a PRD with user stories in markdown
2. William parses the PRD and tracks each story independently
3. For each story, it spawns a Claude agent with full PRD context, progress history, and codebase patterns
4. The agent implements the story in your target project, runs quality checks, and commits
5. If the agent gets stuck, William detects it and escalates through a recovery chain
6. When all stories pass (or you stop it), archive the workspace for a full audit trail

## Prerequisites

- **Node.js** (ES2022+)
- **pnpm**
- **Claude CLI** — `claude` must be available on your PATH

## Install

```sh
git clone <repo-url> ~/projects/william
cd ~/projects/william
pnpm install
pnpm link --global
```

Verify: `william --help`

## Quick start

```sh
william start my-feature \
  --target ~/projects/my-app \
  --prd my-feature-prd.md \
  --branch feature/my-feature
```

This creates a workspace, parses the PRD from `tasks/my-feature-prd.md`, and starts iterating through stories against your target project.

## Commands

### `william start <workspace-name>`

Create a workspace (or resume an existing one) and start the iteration loop.

| Flag | Required | Description |
|------|----------|-------------|
| `--target <dir>` | yes | Target project directory |
| `--prd <file>` | yes | PRD markdown file (must exist in `tasks/`) |
| `--branch <name>` | yes | Git branch to work on |
| `--project <name>` | no | Project name (defaults to target dir basename) |
| `--max-iterations <n>` | no | Max iterations before stopping (default: 20) |
| `--tool <adapter>` | no | AI tool adapter (default: `claude`) |

### `william stop <workspace-name>`

Gracefully stop a running workspace after the current iteration.

### `william status [workspace-name]`

With a name: detailed story-by-story breakdown. Without: summary of all workspaces.

### `william list`

List all workspaces and their status (running / stopped / paused).

### `william archive <workspace-name>`

Archive a stopped workspace to `archive/`. Copies state, logs, progress, and the source PRD. Removes the workspace directory.

## PRD format

Place PRD files in `tasks/`. William parses these markdown sections:

```markdown
# Feature Name

## Introduction
What this feature is and why it matters.

## Goals
- Goal 1
- Goal 2

## Non-Goals
- Out of scope item

## Technical Considerations
Implementation details, constraints.

## User Stories

### US-001: Story title
**Description:** What needs to be built.
**Acceptance Criteria:**
- [ ] Criterion 1
- [ ] Criterion 2

### US-002: Another story
**Description:** ...
**Acceptance Criteria:**
- [ ] ...
```

Stories without explicit `US-XXX` IDs are auto-assigned sequential IDs. Sections like `Functional Requirements`, `Design Considerations`, `Success Metrics`, and `Open Questions` are also recognized if present.

## Stuck detection

William runs a watchdog after every iteration. If the agent is failing repeatedly:

- **3+ attempts** on a story — writes a `.stuck-hint.md` with error patterns and recovery suggestions
- **5+ attempts** with hint already present — auto-skips the story
- **7+ attempts** — pauses the workspace for manual intervention

macOS desktop notifications fire on escalation events.

## Project layout

```
william/
├── src/
│   ├── cli.ts              # CLI entry point
│   ├── runner.ts            # Core iteration loop
│   ├── workspace.ts         # Workspace lifecycle
│   ├── archive.ts           # Archive system
│   ├── watchdog.ts          # Stuck detection
│   ├── notifier.ts          # macOS notifications
│   ├── template.ts          # Placeholder replacement
│   ├── types.ts             # Shared types
│   ├── adapters/
│   │   ├── types.ts         # ToolAdapter interface
│   │   └── claude.ts        # Claude CLI adapter
│   └── prd/
│       ├── parser.ts        # Markdown PRD parser
│       ├── tracker.ts       # State management
│       └── context-builder.ts  # Prompt context assembly
├── templates/
│   └── agent-instructions.md   # Agent prompt template
├── tasks/                   # PRD markdown files (committed)
├── workspaces/              # Runtime state (gitignored)
└── archive/                 # Archived workspaces (gitignored)
```

## Development

```sh
pnpm test          # run tests (vitest)
pnpm typecheck     # type check (tsc --noEmit)
```
