# William

PRD-to-code orchestrator: parses markdown PRDs, spawns AI agents per user story, tracks state, runs quality checks.

## Rules

- Package manager: **pnpm** — never use npm or yarn
- Run `pnpm typecheck` and `pnpm lint` before committing

## Key Components

Code is organized into `src/lib/` (shared library) and `src/cli/` (CLI-specific):

### Shared Library (`src/lib/`)

| File | Role |
|------|------|
| `src/lib/config.ts` | Project-level config loader — reads `.william/config.json` for per-project defaults |
| `src/lib/git.ts` | Git utilities — branch checkout, worktree management |
| `src/lib/types.ts` | Shared TypeScript types (`WorkspaceState`, `StoryState`, etc.) |
| `src/lib/paths.ts` | Template path resolution (dev vs dist mode) |
| `src/lib/template.ts` | Template placeholder replacement |
| `src/lib/migrate.ts` | State file migration utilities |
| `src/lib/prd/parser.ts` | PRD markdown parser — extracts stories, metadata |
| `src/lib/prd/tracker.ts` | State tracker — load/save `state.json` with file locking |
| `src/lib/prd/context-builder.ts` | Builds agent context from workspace state |

### CLI (`src/cli/`)

| File | Role |
|------|------|
| `src/cli/cli.ts` | CLI entry point — registers commands (`new`, `init`, `prd`, etc.) via Commander |
| `src/cli/wizard.ts` | Interactive wizard for `william new` — collects workspace parameters; supports `--git-workflow` flag |
| `src/cli/init.ts` | `william init` command — interactively scaffolds `.william/config.json` |
| `src/cli/workspace.ts` | Workspace lifecycle — create, start, stop, list, archive; supports worktree and branch modes |
| `src/cli/runner.ts` | Agent runner — spawns AI agents per user story, manages streaming output |
| `src/cli/prd-prompt.ts` | PRD generation — builds prompts and resolves output directory from project config |

## Git Config

Git-related settings are grouped under the `git` object in `.william/config.json`:

```json
{
  "git": {
    "workflow": "worktree" | "branch",
    "branchPrefix": "feature/",
    "worktreeSetupCommands": ["pnpm install"]
  }
}
```

| Field | Default | Description |
|-------|---------|-------------|
| `git.workflow` | `"worktree"` | `"worktree"` creates a git worktree per workspace; `"branch"` creates a branch without a worktree |
| `git.branchPrefix` | `""` | Prefix for workspace branch names |
| `git.worktreeSetupCommands` | `[]` | Commands run after worktree creation (skipped in branch mode) |

The workflow can be overridden per-workspace via `william new --git-workflow <worktree|branch>`.

Legacy top-level `branchPrefix` and `setupCommands` fields are still read as fallbacks but are deprecated.

## CI

Pull requests targeting `main` automatically run `pnpm typecheck`, `pnpm lint`, and `pnpm test` via GitHub Actions. All checks must pass before merging.
