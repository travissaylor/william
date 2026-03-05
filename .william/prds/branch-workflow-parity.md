# PRD: Branch Workflow Parity

## Introduction

William supports two git workflows: `worktree` (creates an isolated git worktree per workspace) and `branch` (creates a branch ref without a separate directory). Several commands — most notably `pr` — only work with worktree-mode workspaces and fail with branch-mode ones. This feature brings all commands to full parity so users can use either git workflow interchangeably.

## Goals

- Make `william pr` work with branch-mode workspaces
- Make `william revise` produce revision workspaces that work correctly in branch mode (including subsequent `pr` calls)
- Auto-checkout the workspace branch in branch mode before running git operations
- Zero breaking changes to existing worktree-mode behavior

## User Stories

### US-001: Resolve working directory for branch-mode workspaces in pr command

**Description:** As a developer using branch-mode workspaces, I want `william pr` to use `targetDir` as the git working directory so the command doesn't fail when `worktreePath` is absent.

**Acceptance Criteria:**

- [ ] `pr` command no longer throws when `state.worktreePath` is undefined
- [ ] In branch mode, all git/gh commands use `state.targetDir` as their `cwd`
- [ ] In worktree mode, behavior is unchanged — `state.worktreePath` is still used
- [ ] Introduce a helper (e.g. `getWorkingDir(state)`) that returns `state.worktreePath ?? state.targetDir` to standardize this pattern
- [ ] Typecheck passes (`pnpm typecheck`)
- [ ] Lint passes (`pnpm lint`)

### US-002: Auto-checkout workspace branch in branch mode before pr operations

**Description:** As a developer using branch-mode workspaces, I want `william pr` to automatically check out my workspace branch before pushing so I don't have to do it manually.

**Acceptance Criteria:**

- [ ] Before pushing, `pr` detects the current branch in `targetDir`
- [ ] If the current branch does not match `state.branchName`, run `git checkout <branchName>` in `targetDir`
- [ ] If checkout fails (e.g. uncommitted changes blocking it), surface a clear error message telling the user to commit or stash changes first
- [ ] In worktree mode, skip auto-checkout (the worktree is always on the correct branch)
- [ ] Typecheck passes (`pnpm typecheck`)
- [ ] Lint passes (`pnpm lint`)

### US-003: Update all pr helper functions to accept working directory instead of worktreePath

**Description:** As a developer, I want the internal pr helper functions to use a generic "working directory" parameter so they work with both workflow modes.

**Acceptance Criteria:**

- [ ] `pushBranch` parameter renamed/changed from `worktreePath` to a generic working dir (e.g. `cwd` or `workingDir`)
- [ ] `findExistingPr` parameter updated similarly
- [ ] `getGitDiff` parameter updated similarly
- [ ] `getGitLog` parameter updated similarly
- [ ] `createOrUpdatePr` parameter updated similarly
- [ ] `generatePrDescription` updated to resolve working dir from state without throwing on missing `worktreePath`
- [ ] All callers pass the resolved working directory (worktreePath for worktree mode, targetDir for branch mode)
- [ ] Typecheck passes (`pnpm typecheck`)
- [ ] Lint passes (`pnpm lint`)

### US-004: Fix revise command to propagate gitWorkflow correctly for branch-mode parents

**Description:** As a developer using branch-mode workspaces, I want revision workspaces to inherit the correct `gitWorkflow` and `targetDir` so that `william pr` works on revision workspaces too.

**Acceptance Criteria:**

- [ ] `createRevisionWorkspace` in `src/workspace.ts` sets `gitWorkflow` from the parent state
- [ ] For branch-mode parents, the revision workspace's `worktreePath` remains undefined (not copied from parent)
- [ ] For branch-mode parents, revision workspace uses `targetDir` as working directory
- [ ] Running `william pr` on a revision of a branch-mode workspace succeeds
- [ ] Typecheck passes (`pnpm typecheck`)
- [ ] Lint passes (`pnpm lint`)

### US-005: Add tests for branch-mode pr and revise flows

**Description:** As a developer, I want tests covering the branch-mode paths so regressions are caught in CI.

**Acceptance Criteria:**

- [ ] Test that `pr` command resolves working directory to `targetDir` when `worktreePath` is absent and `gitWorkflow` is `"branch"`
- [ ] Test that auto-checkout runs when current branch doesn't match workspace branch in branch mode
- [ ] Test that auto-checkout is skipped in worktree mode
- [ ] Test that revision workspaces of branch-mode parents have correct state (no `worktreePath`, correct `gitWorkflow`)
- [ ] All tests pass (`pnpm test`)
- [ ] Typecheck passes (`pnpm typecheck`)
- [ ] Lint passes (`pnpm lint`)

## Functional Requirements

- FR-1: The `pr` command must resolve the git working directory as `state.worktreePath ?? state.targetDir`
- FR-2: In branch mode, the `pr` command must auto-checkout `state.branchName` in `targetDir` if the current branch differs
- FR-3: If auto-checkout fails due to uncommitted changes, the error message must instruct the user to commit or stash first
- FR-4: All pr helper functions (`pushBranch`, `findExistingPr`, `getGitDiff`, `getGitLog`, `createOrUpdatePr`) must accept a generic working directory parameter instead of requiring `worktreePath`
- FR-5: `generatePrDescription` must resolve working directory from workspace state without requiring `worktreePath`
- FR-6: `createRevisionWorkspace` must propagate `gitWorkflow` from the parent workspace state
- FR-7: Revision workspaces of branch-mode parents must not have a `worktreePath` value
- FR-8: All existing worktree-mode behavior must remain unchanged

## Non-Goals

- No changes to how workspaces are created (`william new` already handles both workflows)
- No changes to `start`, `stop`, `status`, `list`, `archive`, `init`, `migrate`, or `prd` commands (these already work with both workflows)
- No concurrent branch-mode workspace support (branch mode inherently shares a single directory)
- No automatic stashing of uncommitted changes during auto-checkout

## Technical Considerations

- The core pattern is `state.worktreePath ?? state.targetDir` — this should be extracted into a reusable helper to avoid repeating the logic
- Branch-mode workspaces share `targetDir` (the original repo), so concurrent operations on multiple branch-mode workspaces targeting the same repo will still conflict — this is an inherent limitation of branch mode and is out of scope
- The auto-checkout uses `git rev-parse --abbrev-ref HEAD` to detect the current branch and `git checkout <branchName>` to switch — standard git operations
- All `execSync` calls in `src/pr.ts` that currently use `worktreePath` as `cwd` need updating

## Success Metrics

- `william pr <workspace>` succeeds for branch-mode workspaces without manual git operations
- `william revise <workspace>` + `william pr <revision>` works end-to-end for branch-mode workspaces
- Zero regressions in worktree-mode behavior
- All CI checks pass (typecheck, lint, test)

## Open Questions

- None — the approach is straightforward and the scope is well-defined.
