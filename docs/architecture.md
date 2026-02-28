# Architecture

## Project-Level Configuration

William supports optional per-project configuration via a `.william/config.json` file in the project root. This eliminates repeated data entry when creating workspaces for the same project.

### Discovery

`loadProjectConfig(dir)` (in `src/config.ts`) looks for `<dir>/.william/config.json`. There is no upward directory traversal — the config must be in the specified directory. If the file is missing or contains invalid JSON, the function returns `null` and William falls back to default behavior.

### Config Fields

All fields are optional:

| Field | Type | Description |
|-------|------|-------------|
| `projectName` | `string` | Default project name for new workspaces |
| `branchPrefix` | `string` | Prefix prepended to branch names (e.g. `feature/`) |
| `prdOutput` | `string` | Relative path for PRD output directory |
| `skipDefaults` | `boolean` | When `true`, the wizard skips prompts that have config-provided values |
| `setupCommands` | `string[]` | Shell commands to run in new worktrees after dependency installation |

### Scaffolding

`william init` interactively creates `.william/config.json` by prompting for each field. It warns before overwriting an existing config and offers to add `.william/` to the project's `.gitignore`.

### Integration Points

**Wizard (`william new`)** — When project config exists, configured values are used as prompt defaults. If `skipDefaults` is `true`, prompts with config-provided values are skipped entirely.

**PRD output (`william prd`)** — When config exists with `prdOutput` set, that path (resolved relative to cwd) is used as the default output directory. When config exists but `prdOutput` is unset, defaults to `.william/prds/`. The `-o`/`--output` CLI flag always overrides config-derived paths.

**`--prd` flag (`william new --prd <path>`)** — Bypasses the interactive wizard entirely. Derives workspace name from the PRD filename, project name from config or cwd basename, and branch name from the config prefix + workspace name. Composes with project config for `projectName`, `branchPrefix`, and `setupCommands`.

**Worktree setup commands** — After worktree creation and dependency installation, `createWorkspace()` reads project config from the target directory and runs each `setupCommands` entry sequentially via `spawnSync` with `shell: true`. Failures log a warning but do not abort workspace creation.

### Backward Compatibility

Projects without a `.william/` directory work identically to before — no config means no changes to existing behavior.
