<prd>
# PRD: Optional Git Worktrees

## Introduction

Currently, `william new` always creates a git worktree for each workspace. This feature makes worktrees optional by introducing a `git.workflow` setting that supports two modes: `"worktree"` (current behavior, remains the default) and `"branch"` (creates a new branch in the current repo without a worktree). Git-related settings are grouped under a `git` object in `.william/config.json`. The workflow can be overridden per-workspace via a `--git-workflow` flag on `william new`.

## Goals

- Add a `git` namespace in `.william/config.json` to group all git-related settings
- Allow users to opt out of git worktrees on a per-project or per-workspace basis
- Default to `"worktree"` so existing behavior is unchanged
- Provide a `--git-workflow` CLI flag on `william new` to override the config for a single workspace
- Move `branchPrefix` into the `git` object and rename `setupCommands` to `git.worktreeSetupCommands`
- Ensure `"branch"` mode skips worktree creation, dependency installation, and setup commands

## User Stories

### US-001: Add `git` config object with `workflow` setting

**Description:** As a user, I want git-related settings grouped under a `git` object in `.william/config.json` so that configuration is well-organized and I can control my git workflow strategy.

**Acceptance Criteria:**

- [ ] `ProjectConfig` type includes a `git?` object with the shape: `{ workflow?: "worktree" | "branch"; branchPrefix?: string; worktreeSetupCommands?: string[] }`
- [ ] `git.workflow` defaults to `"worktree"` when not set
- [ ] `git.branchPrefix` replaces the top-level `branchPrefix` field
- [ ] `git.worktreeSetupCommands` replaces the top-level `setupCommands` field
- [ ] Backwards compatibility: if top-level `branchPrefix` or `setupCommands` exist and the `git` object equivalents do not, fall back to the top-level values with a deprecation warning logged to the console
- [ ] `william init` prompts for `git.workflow` and writes it under the `git` object
- [ ] Typecheck and lint pass

**Example config:**

```json
{
  "projectName": "my-app",
  "prdOutput": ".william/prds",
  "git": {
    "workflow": "worktree",
    "branchPrefix": "feature/",
    "worktreeSetupCommands": ["pnpm install"]
  }
}
```

### US-002: Add `--git-workflow` flag to `william new`

**Description:** As a user, I want to pass `--git-workflow <worktree|branch>` to `william new` so I can override the project config for a single workspace.

**Acceptance Criteria:**

- [ ] `william new --git-workflow branch` creates a workspace in branch mode regardless of config
- [ ] `william new --git-workflow worktree` creates a workspace in worktree mode regardless of config
- [ ] When flag is omitted, the value from `git.workflow` in `.william/config.json` is used (defaulting to `"worktree"`)
- [ ] Flag works in both interactive wizard mode and `--prd` mode
- [ ] Typecheck and lint pass

### US-003: Implement branch-mode workspace creation

**Description:** As a user, I want `"branch"` mode to create a new branch in the current repo and track workspace state without creating a worktree.

**Acceptance Criteria:**

- [ ] In branch mode, `createWorkspace` creates a new git branch (e.g. `git branch <branchName>`) in the target repo but does NOT check it out or create a worktree
- [ ] No worktree directory is created; `worktreePath` in `WorkspaceState` is `null` or omitted
- [ ] Dependency installation (`installWorktreeDeps`) is skipped
- [ ] `git.worktreeSetupCommands` are skipped
- [ ] Workspace directory structure (state.json, prd.md, logs/, etc.) is still created under `~/.william/workspaces/`
- [ ] The `gitWorkflow` mode is persisted in `WorkspaceState` so downstream commands know how the workspace was created
- [ ] Typecheck and lint pass

### US-004: Update `william start` for branch-mode workspaces

**Description:** As a user, I want `william start` to work correctly for branch-mode workspaces, running the agent in the target repo directory instead of a worktree path.

**Acceptance Criteria:**

- [ ] When starting a branch-mode workspace, the agent's working directory is set to the target repo (`targetDir`) instead of a worktree path
- [ ] The agent is instructed to work on the workspace's branch
- [ ] Existing worktree-mode workspaces continue to work as before
- [ ] Typecheck and lint pass

### US-005: Update `william archive` for branch-mode workspaces

**Description:** As a user, I want `william archive` to handle branch-mode workspaces correctly by skipping worktree removal.

**Acceptance Criteria:**

- [ ] Archiving a branch-mode workspace skips the `git worktree remove` step
- [ ] The workspace directory under `~/.william/workspaces/` is still moved to the archive
- [ ] Archiving a worktree-mode workspace continues to work as before
- [ ] Typecheck and lint pass

### US-006: Update CLAUDE.md documentation

**Description:** As a developer, I want CLAUDE.md updated to document the new `git` config object structure.

**Acceptance Criteria:**

- [ ] `CLAUDE.md` documents the `git` config object with `workflow`, `branchPrefix`, and `worktreeSetupCommands`
- [ ] Old top-level `branchPrefix` and `setupCommands` references are updated

## Functional Requirements

- FR-1: Add `git` object to `ProjectConfig` type with fields: `workflow?: "worktree" | "branch"`, `branchPrefix?: string`, `worktreeSetupCommands?: string[]`
- FR-2: Resolve `git.workflow` with precedence: CLI flag > `git.workflow` in config > default `"worktree"`
- FR-3: Add `--git-workflow <worktree|branch>` option to the `william new` CLI command
- FR-4: Pass the resolved `gitWorkflow` value through the wizard result into `createWorkspace`
- FR-5: In `createWorkspace`, when `gitWorkflow` is `"branch"`: create the branch with `git branch <name>` but do not create a worktree, do not install dependencies, and do not run setup commands
- FR-6: Store the `gitWorkflow` value in `WorkspaceState` so `start`, `archive`, and other commands can check it
- FR-7: In `startWorkspace`, use `targetDir` as the agent working directory for branch-mode workspaces
- FR-8: In `archiveWorkspace`, skip `git worktree remove` for branch-mode workspaces
- FR-9: Backwards-compatible fallback: read top-level `branchPrefix` and `setupCommands` if `git.*` equivalents are absent, with deprecation warning
- FR-10: Update `william init` to prompt for `git.workflow` and write the `git` object

## Non-Goals

- No new git workflow modes beyond `"worktree"` and `"branch"` (e.g. no "clone" or "stash" mode)
- No automatic branch checkout in branch mode — the user/agent manages checkout themselves
- No migration tool for existing configs — backwards-compatible fallback is sufficient
- No changes to revision workspace behavior (revisions already reuse the parent's worktree)

## Technical Considerations

- `WorkspaceState` in `src/types.ts` needs a `gitWorkflow` field so downstream commands can branch on mode
- The wizard result type needs to carry `gitWorkflow` through to `createWorkspace`
- Branch-mode workspaces have no `worktreePath`, so any code that reads `state.worktreePath` must handle it being undefined
- The `--git-workflow` flag should validate input to only accept `"worktree"` or `"branch"`
- Config loading in `src/config.ts` needs to merge top-level legacy fields into the `git` object for backwards compatibility

## Success Metrics

- Users can create branch-mode workspaces with zero worktree-related filesystem overhead
- Existing worktree-mode behavior is completely unchanged when `git.workflow` is unset or set to `"worktree"`
- No regressions in typecheck or lint

## Open Questions

- Should `william list` display which git workflow mode each workspace uses?
- Should branch-mode workspaces support revision workspaces, or should that be worktree-only?
</prd>
