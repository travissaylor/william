# PRD: Workspace Wizard & Project-Grouped Workspaces

## Introduction

The `william start` command currently requires too many flags (`--target`, `--prd`, `--branch`, `--project`) every time it's run. This feature introduces `william new` — an interactive wizard that captures workspace configuration once — and restructures workspace storage to group by project (`workspaces/{project-name}/{workspace-name}/`). After setup, `william start <workspace-name>` needs no required flags. A one-time migration script moves existing workspaces into the new structure.

## Goals

- Eliminate required flags from `william start` by moving configuration to a one-time `william new` wizard
- Group workspaces by project for better organization and traversal
- Migrate existing flat workspaces to the new grouped structure with a backup
- Update `william list` to display workspaces grouped by project, with optional project filtering
- Store both a copy of the PRD and a reference to the original path

## User Stories

### US-001: Add `william new` command with interactive wizard

**Description:** As a user, I want to run `william new` and answer a series of prompts so that my workspace is fully configured without remembering CLI flags.

**Acceptance Criteria:**

- [ ] Running `william new` launches an interactive prompt sequence using `@inquirer/prompts`
- [ ] Wizard asks in this order: PRD path, workspace name, target project directory, project name, branch name
- [ ] Workspace name defaults to the PRD filename without the `.md` extension (e.g., `prds/beautiful-tui.md` → `beautiful-tui`)
- [ ] Target project directory defaults to the current working directory
- [ ] Project name defaults to the basename of the target project directory
- [ ] Branch name defaults to the workspace name
- [ ] Each prompt shows its default value and accepts Enter to use it
- [ ] Wizard validates that: target dir exists and is a git repo, PRD file exists and is a `.md` file
- [ ] On completion, prints a summary of the created workspace and a hint like `Run: william start <workspace-name>`
- [ ] Typecheck/lint passes

### US-002: Create workspace directory in project-grouped structure

**Description:** As a user, I want my workspaces organized under their project name so that I can easily find related workspaces later.

**Acceptance Criteria:**

- [ ] `william new` creates the workspace at `workspaces/{project-name}/{workspace-name}/`
- [ ] The workspace directory contains `state.json`, `progress.txt`, and `logs/` as before
- [ ] `state.json` stores all wizard-provided config: workspace name, project name, target dir, branch name, PRD source path
- [ ] The PRD file is copied into the workspace directory (e.g., `workspaces/{project}/{workspace}/prd.md`)
- [ ] The original PRD path is also stored in `state.json` as `sourceFile`
- [ ] If a workspace with the same name already exists under that project, the wizard shows an error and does not overwrite
- [ ] Typecheck/lint passes

### US-003: Update `william start` to use stored workspace config

**Description:** As a user, I want to run `william start <workspace-name>` with no required flags so that starting work is fast and simple.

**Acceptance Criteria:**

- [ ] `william start <workspace-name>` locates the workspace by scanning `workspaces/{project}/{workspace-name}/` directories
- [ ] If the workspace name is ambiguous (exists under multiple projects), print an error listing the matches and ask the user to specify `william start <project>/<workspace>`
- [ ] `william start` also accepts `<project-name>/<workspace-name>` for explicit targeting
- [ ] The `--target`, `--prd`, `--branch`, and `--project` flags are removed from `william start`
- [ ] `--max-iterations` and `--tool` remain as optional flags on `william start` with their current defaults
- [ ] All existing workspace functionality (resume, stuck detection, story iteration) works unchanged
- [ ] Typecheck/lint passes

### US-004: Update `william list` to show project-grouped workspaces

**Description:** As a user, I want `william list` to show workspaces grouped by project so I can see how my work is organized.

**Acceptance Criteria:**

- [ ] `william list` displays workspaces grouped under project name headers
- [ ] Each workspace entry shows: name, status (running/stopped/paused/completed), story progress (e.g., 3/5)
- [ ] `william list <project-name>` filters to only show workspaces under that project
- [ ] If a project name doesn't match any group, print a message like `No workspaces found for project "<name>"`
- [ ] Typecheck/lint passes

### US-005: Migrate existing workspaces to new directory structure

**Description:** As a developer, I want a migration script that moves existing flat workspaces into the project-grouped structure so that no data is lost.

**Acceptance Criteria:**

- [ ] A script (e.g., `src/migrate.ts` or a `william migrate` command) handles the migration
- [ ] Before any changes, creates a full backup of `workspaces/` at `workspaces-backup-{timestamp}/`
- [ ] For each existing workspace in `workspaces/<name>/`, reads `state.json` to get the `project` field
- [ ] Moves the workspace directory to `workspaces/{project}/{name}/`
- [ ] Prints a summary of what was moved (e.g., `Moved beautiful-tui → william/beautiful-tui`)
- [ ] If a workspace's `state.json` has no `project` field, prompts the user or uses a fallback like `unknown`
- [ ] The script is a one-time utility that can be deleted after migration
- [ ] Typecheck/lint passes

### US-006: Update `william status` and `william stop` for new structure

**Description:** As a user, I want `status` and `stop` commands to work with the new project-grouped directory layout.

**Acceptance Criteria:**

- [ ] `william status` shows all workspaces across all projects with project grouping
- [ ] `william status <workspace-name>` finds the workspace by scanning project directories (same lookup as `start`)
- [ ] `william status <project>/<workspace>` works for explicit targeting
- [ ] `william stop <workspace-name>` finds and stops the correct workspace using the same lookup
- [ ] `william stop <project>/<workspace>` works for explicit targeting
- [ ] `william archive <workspace-name>` works with the new structure
- [ ] Typecheck/lint passes

## Functional Requirements

- FR-1: Add `@inquirer/prompts` as a dependency for the interactive wizard
- FR-2: `william new` must prompt in order: PRD path, workspace name (default: PRD filename without `.md`), target project dir (default: cwd), project name (default: target dir basename), branch name (default: workspace name)
- FR-3: Workspaces must be stored at `workspaces/{project-name}/{workspace-name}/`
- FR-4: The PRD file must be copied into the workspace directory as `prd.md` AND the original path stored in `state.json` as `sourceFile`
- FR-5: `william start <name>` must resolve the workspace by scanning all project directories under `workspaces/`
- FR-6: `william start` must accept `<project>/<workspace>` syntax for disambiguation
- FR-7: `william start` must only accept `--max-iterations` and `--tool` as optional flags — all other config comes from `state.json`
- FR-8: `william list` must display workspaces grouped by project name headers
- FR-9: `william list <project-name>` must filter output to a single project group
- FR-10: The migration script must back up the entire `workspaces/` directory before restructuring
- FR-11: The migration script must read each workspace's `state.json` to determine its project name
- FR-12: Workspace name lookup must error with a helpful message if the name matches workspaces in multiple projects

## Non-Goals

- No changes to the TUI, runner, stuck detection, or story iteration logic
- No changes to the agent prompt template or PRD parser
- No interactive editing of existing workspace config (no `william edit` command)
- No automatic PRD re-sync from the original path on `william start` (just store the reference for now)
- No renaming or restructuring of the `archive/` directory

## Technical Considerations

- The workspace lookup function (scan `workspaces/*/` for a matching workspace name) will be used by `start`, `stop`, `status`, and `archive` — extract it as a shared utility
- `createWorkspace()` in `workspace.ts` currently takes `CreateWorkspaceOpts` and builds the path as `workspaces/<name>` — this needs to change to `workspaces/<project>/<name>`
- `state.json` already has a `project` field, which the migration can use
- The `@inquirer/prompts` package supports input prompts with defaults, validation, and confirmation — no need for a full Ink-based UI
- The migration script should be in `src/migrate.ts` and can be run directly with `tsx src/migrate.ts` or wired as a temporary CLI command

## Success Metrics

- `william start <workspace-name>` requires zero flags for normal operation
- `william new` captures all required config in under 30 seconds
- All existing workspaces are migrated without data loss
- `william list` clearly shows project groupings

## Open Questions

- Should `william new` also offer to create the git branch immediately, or leave that to `william start`?
- Should workspace names be globally unique, or only unique within a project?
