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
# 1. Create a workspace with the interactive wizard
william new

# 2. Start the iteration loop
william start my-feature
```

The wizard prompts for the PRD file, target project directory, branch name, and project name. Once created, `william start` picks up the stored config and begins iterating through stories.

## Commands

### `william new`

Interactive wizard to create a new workspace. Prompts for:

- **PRD file path** — must be a `.md` file
- **Workspace name** — defaults to the PRD filename
- **Target project directory** — must be a git repository
- **Project name** — defaults to the target directory basename
- **Branch name** — defaults to the workspace name

The workspace is stored under `workspaces/<project>/<name>/`.

### `william start <workspace-name>`

Start (or resume) an existing workspace. Create one first with `william new`.

| Flag | Required | Description |
|------|----------|-------------|
| `--max-iterations <n>` | no | Max iterations before stopping (default: 20) |
| `--tool <adapter>` | no | AI tool adapter (default: `claude`) |

### `william stop <workspace-name>`

Gracefully stop a running workspace after the current iteration.

### `william status [workspace-name]`

With a name: detailed story-by-story breakdown. Without: summary of all workspaces grouped by project.

### `william list [project-name]`

List workspaces grouped by project. Optionally filter to a single project.

```
$ william list
my-app/
  auth-feature [completed] — 5/5
  dark-mode [running] — 2/4
other-project/
  api-refactor [stopped] — 3/6
```

### `william archive <workspace-name>`

Archive a stopped workspace to `archive/`. Copies state, logs, progress, and the source PRD. Removes the workspace directory.

### `william migrate`

One-time migration to move existing flat workspaces (`workspaces/<name>/`) into the project-grouped structure (`workspaces/<project>/<name>/`). Creates a timestamped backup before migrating.

## PRD format

William parses these markdown sections from your PRD file:

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

## Workspace resolution

Workspaces are stored in a project-grouped structure: `workspaces/<project>/<name>/`. When referencing a workspace, you can use either:

- **Just the name** — `william start my-feature` (works if the name is unique across projects)
- **Project/name** — `william start my-app/my-feature` (required if the name exists under multiple projects)

## Project layout

```
william/
├── src/
│   ├── cli.ts              # CLI entry point
│   ├── runner.ts            # Core iteration loop
│   ├── workspace.ts         # Workspace lifecycle & resolution
│   ├── wizard.ts            # Interactive workspace creation wizard
│   ├── migrate.ts           # Flat → grouped migration
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
├── workspaces/              # Runtime state (gitignored)
│   └── <project>/
│       └── <workspace>/     # Individual workspace state
└── archive/                 # Archived workspaces (gitignored)
```

## Development

```sh
pnpm test          # run tests (vitest)
pnpm typecheck     # type check (tsc --noEmit)
```
