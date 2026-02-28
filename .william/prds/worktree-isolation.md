# PRD: Worktree Isolation for Parallel Sessions

## Introduction

When a user runs two `william` sessions against the same repository simultaneously, they conflict because both sessions operate on the same working directory. Files modified by one session get clobbered by the other, and git lock errors occur.

This feature makes William create a dedicated git worktree for each workspace during `william new`. The worktree gives each session its own isolated copy of the repo on its own branch. `william start` then runs the agent inside that worktree instead of the main working directory, eliminating all conflicts between parallel sessions.

## Goals

- Enable multiple `william` runs against the same repo to execute in parallel without directory or git conflicts
- Every workspace gets its own git worktree automatically (no opt-in required)
- Worktree lifecycle is fully managed by William: created on `william new`, removed on `william archive`
- If a worktree is missing when `william start` runs, error out clearly rather than silently falling back

## User Stories

### US-001: Add worktreePath field to WorkspaceState

**Description:** As a developer, I need to store the worktree path in workspace state so that `william start` and `william archive` know where the worktree lives.

**Acceptance Criteria:**

- [ ] `WorkspaceState` in `src/types.ts` includes a new `worktreePath: string` field
- [ ] `initStateFromPrd()` in `src/prd/tracker.ts` accepts and stores a `worktreePath` value when creating initial state
- [ ] Existing state loading (`loadState`) does not crash if `worktreePath` is missing (for backwards compatibility with older workspaces)
- [ ] Typecheck passes (`pnpm typecheck`)
- [ ] Lint passes (`pnpm lint`)

### US-002: Create git worktree during `william new`

**Description:** As a user, I want `william new` to automatically create a git worktree so that my workspace has an isolated copy of the repo from the start.

**Acceptance Criteria:**

- [ ] After workspace directory creation in `createWorkspace()` (`src/workspace.ts`), William runs `git worktree add <worktree-path> -b <branch-name>` against the target repository
- [ ] The worktree is created at `workspaces/<project>/<workspace>/worktree/` (inside the existing workspace directory)
- [ ] The branch name used is the same one the user provides during the wizard (the existing `branchName` field)
- [ ] If the branch already exists, William falls back to `git worktree add <worktree-path> <branch-name>` (without `-b`) to reuse the existing branch
- [ ] If `git worktree add` fails for other reasons (e.g., worktree already checked out for that branch), William prints a clear error and does not create a half-initialized workspace
- [ ] The resulting `worktreePath` is stored in `state.json`
- [ ] Typecheck passes (`pnpm typecheck`)
- [ ] Lint passes (`pnpm lint`)

### US-003: Use worktree as cwd when spawning agents in `william start`

**Description:** As a user running `william start`, I want the agent to operate inside the worktree so that file changes are isolated from the main working directory and other sessions.

**Acceptance Criteria:**

- [ ] `ClaudeAdapter.spawn()` in `src/adapters/claude.ts` uses `worktreePath` from state as the `cwd` instead of `targetDir`
- [ ] The runner in `src/runner.ts` passes the `worktreePath` to the adapter when spawning agents
- [ ] Stories execute sequentially within the worktree, commits land on the worktree's branch
- [ ] Two simultaneous `william start` runs against the same repo (different workspaces) do not produce file conflicts or git lock errors
- [ ] A single `william start` run still works correctly end-to-end
- [ ] Typecheck passes (`pnpm typecheck`)
- [ ] Lint passes (`pnpm lint`)

### US-004: Update agent instructions to remove branch checkout

**Description:** As a developer, I want to remove the manual `git checkout` from the agent instructions template since the worktree is already on the correct branch, and checking out a branch inside a worktree can cause conflicts.

**Acceptance Criteria:**

- [ ] The `git checkout {{branch_name}} || git checkout -b {{branch_name}}` block in `templates/agent-instructions.md` is removed
- [ ] The agent instructions still tell the agent which branch it's on (for context), but do not instruct it to switch branches
- [ ] A full `william start` run completes successfully with the updated template (agent commits to the correct branch)
- [ ] Typecheck passes (`pnpm typecheck`)
- [ ] Lint passes (`pnpm lint`)

### US-005: Validate worktree exists before starting

**Description:** As a user, I want a clear error if the worktree directory is missing so I know something is wrong instead of getting cryptic failures mid-run.

**Acceptance Criteria:**

- [ ] Before entering the iteration loop in `src/runner.ts` (or during workspace resolution in `src/workspace.ts`), William checks that `worktreePath` exists on disk
- [ ] If the worktree directory does not exist, William exits with a clear error message, e.g.: `Worktree not found at <path>. The worktree may have been manually deleted. Create a new workspace with "william new".`
- [ ] If `worktreePath` is not set in state.json (legacy workspace), William exits with a clear error message, e.g.: `Workspace "<name>" was created before worktree support. Create a new workspace with "william new".`
- [ ] Typecheck passes (`pnpm typecheck`)
- [ ] Lint passes (`pnpm lint`)

### US-006: Revision workspaces share parent worktree

**Description:** As a user running `william revise`, I want the revision workspace to reuse the parent workspace's worktree so that revisions operate on the same branch and see the same file state.

**Acceptance Criteria:**

- [ ] When `createRevisionWorkspace()` creates a child workspace, it copies the parent's `worktreePath` into the revision's `state.json` instead of creating a new worktree
- [ ] `william revise` runs the revision agent inside the parent's worktree (same `cwd`)
- [ ] No new git worktree is created for revision workspaces
- [ ] Revision agents can read and modify files committed by the parent workspace's stories
- [ ] Typecheck passes (`pnpm typecheck`)
- [ ] Lint passes (`pnpm lint`)

### US-007: Print worktree path on `william stop`

**Description:** As a user, I want `william stop` to print the worktree location so I know where my in-progress work lives and can inspect it manually.

**Acceptance Criteria:**

- [ ] When `william stop` writes the `.stopped` marker, it also prints the worktree path to stdout, e.g.: `Workspace stopped. Worktree with in-progress work is at: <path>`
- [ ] If the workspace has no `worktreePath` (legacy), the message is omitted
- [ ] Typecheck passes (`pnpm typecheck`)
- [ ] Lint passes (`pnpm lint`)

### US-008: Clean up worktree during `william archive`

**Description:** As a user, I want `william archive` to remove the git worktree so I don't accumulate stale worktrees over time.

**Acceptance Criteria:**

- [ ] `william archive` runs `git worktree remove <worktree-path>` against the target repository before deleting the workspace directory
- [ ] If the worktree has uncommitted changes, `william archive` prints a warning and does NOT force-remove (no `--force`); the user must commit or discard changes first
- [ ] If the worktree is already gone (user manually deleted it), `git worktree prune` is run to clean up stale references, and archive proceeds normally
- [ ] The archived workspace no longer references a worktree path (cleanup is complete)
- [ ] Typecheck passes (`pnpm typecheck`)
- [ ] Lint passes (`pnpm lint`)

## Functional Requirements

- FR-1: Add `worktreePath: string` field to `WorkspaceState` in `src/types.ts`
- FR-2: `createWorkspace()` in `src/workspace.ts` must run `git worktree add <path> -b <branchName>` with `cwd` set to the target repository. If the branch already exists, fall back to `git worktree add <path> <branchName>` (without `-b`) to reuse it
- FR-3: The worktree path stored in `state.json` must be an absolute path
- FR-4: `ClaudeAdapter.spawn()` must accept and use the worktree path as `cwd` instead of `targetDir`
- FR-5: `spawnCapture()` and `spawnInteractive()` must also use the worktree path as `cwd` when a worktree is present (for `william revise`, `william prd`, `william problem`)
- FR-6: The `git checkout` block in `templates/agent-instructions.md` must be removed
- FR-7: `william start` must validate that the worktree directory exists before entering the iteration loop
- FR-8: `william archive` must run `git worktree remove <path>` before deleting the workspace directory
- FR-9: If `git worktree remove` fails due to uncommitted changes, `william archive` must abort with a clear message (no `--force`)
- FR-10: If the worktree directory is already missing, `william archive` must run `git worktree prune` and continue
- FR-11: Revision workspaces created by `william revise` must inherit the parent workspace's `worktreePath` — no new worktree is created for revisions
- FR-12: `william stop` must print the worktree path to stdout so the user knows where in-progress work lives

## Non-Goals

- No opt-in/opt-out flag — every workspace always gets a worktree
- No automatic worktree recreation if deleted (error out instead)
- No per-story worktree isolation — stories within a single run remain sequential in the same worktree
- No migration of existing workspaces to worktrees (legacy workspaces just get an error message)
- No passing `--worktree` to Claude Code — William manages worktrees directly
- No automatic PR creation from worktree branches

## Technical Considerations

- Git worktrees are created with `git worktree add <path> -b <branch>`. The `<path>` becomes a full working copy with a `.git` file (not directory) that points back to the main repo's `.git` directory.
- The worktree path `workspaces/<project>/<workspace>/worktree/` lives inside William's own workspace directory, which is already gitignored. This keeps everything co-located and easy to clean up.
- If the branch already exists, `git worktree add -b` will fail. William should fall back to `git worktree add <path> <branch>` (without `-b`) to reuse the existing branch. This supports the case where a user creates a new workspace to continue work on an existing branch.
- The `cwd` option in `child_process.spawn()` determines where the agent operates. Changing it from `targetDir` to `worktreePath` is the key change that makes isolation work.
- `git worktree remove` requires a clean working tree (no uncommitted changes). This is intentional — we don't want `william archive` to silently discard work.
- The revision workflow (`william revise`) creates child workspaces. Revision workspaces share the parent's worktree — they inherit `worktreePath` from the parent's state. No new worktree is created for revisions since they operate on the same branch sequentially.

## Success Metrics

- Two simultaneous `william start` runs against the same repo complete without file conflicts or git errors
- No regression in single-run behavior (stories execute, commits land, state tracks correctly)
- `william archive` leaves no stale worktrees behind
- Clear error messages when worktree is missing or state is legacy

## Open Questions

None — all resolved.
