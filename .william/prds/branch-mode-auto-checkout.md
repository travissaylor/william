<prd>
# PRD: Branch-Mode Auto-Checkout

## Introduction

When using William in branch mode (`git.workflow: "branch"`), the `william start` command does not switch the user to the workspace branch before running agents. The user stays on whatever branch they were on, and any work the agent does lands on the wrong branch. This PRD covers fixing `william start`, auditing all other commands for similar gaps, and extracting a shared auto-checkout utility so branch-mode switching is consistent everywhere.

## Goals

- Ensure `william start` checks out the workspace branch before running agents in branch mode
- Audit and fix all commands (`start`, `revise`, `pr`, `archive`, `list`) so branch mode works correctly end-to-end
- Extract a shared auto-checkout helper to eliminate duplicated checkout logic
- Automatically stash uncommitted changes when switching branches, with a clear log message
- Always print a confirmation message (e.g., `Switched to branch feature/my-workspace`) when a branch switch occurs

## User Stories

### US-001: Extract shared branch-checkout utility

**Description:** As a developer, I need a single reusable function that handles branch-mode checkout (stash, switch, log) so checkout logic is consistent across all commands.

**Acceptance Criteria:**

- [ ] A new helper function (e.g., `ensureBranchCheckout(branchName, cwd)`) exists that:
  - Reads the current branch via `git rev-parse --abbrev-ref HEAD`
  - If already on the correct branch, returns early (no log message)
  - If not on the correct branch, stashes uncommitted changes via `git stash` (if working tree is dirty), then runs `git checkout <branchName>`
  - Logs `Switched to branch <branchName>` to the console on successful switch
  - If stashing occurred, logs that changes were stashed (e.g., `Stashed uncommitted changes on <previousBranch>`)
  - Throws a clear error if the checkout fails (e.g., branch doesn't exist)
- [ ] The helper is exported and importable by all command modules
- [ ] Typecheck and lint pass

### US-002: Auto-checkout on `william start` in branch mode

**Description:** As a user, I want `william start` to automatically switch to the workspace branch so my agent works on the correct branch.

**Acceptance Criteria:**

- [ ] When `william start <workspace>` runs for a branch-mode workspace, the CLI calls the shared checkout helper before spawning the agent
- [ ] If the user is already on the correct branch, no switch or log occurs
- [ ] If the user is on a different branch with uncommitted changes, changes are stashed and the branch is switched
- [ ] The agent runs on the workspace branch (verified by checking `git rev-parse --abbrev-ref HEAD` in the agent's working directory)
- [ ] A confirmation message is printed: `Switched to branch <branchName>`
- [ ] Typecheck and lint pass

### US-003: Auto-checkout on `william revise` in branch mode

**Description:** As a user, I want revision workspaces to also auto-checkout the correct branch so revisions apply to the right branch.

**Acceptance Criteria:**

- [ ] When a revision workspace starts in branch mode, the CLI calls the shared checkout helper before spawning the agent
- [ ] The revision agent runs on the revision branch, not the parent branch or main
- [ ] A confirmation message is printed on branch switch
- [ ] Typecheck and lint pass

### US-004: Refactor `william pr` to use shared checkout helper

**Description:** As a developer, I want the PR command to use the same shared checkout utility instead of its inline implementation so we have one code path for branch switching.

**Acceptance Criteria:**

- [ ] The inline checkout logic in `pr.ts` (around lines 336-363) is replaced with a call to the shared checkout helper
- [ ] Existing PR branch-mode behavior is unchanged (same stash + switch + log behavior)
- [ ] Existing PR branch-mode tests still pass
- [ ] Typecheck and lint pass

### US-005: Add tests for branch-mode auto-checkout

**Description:** As a developer, I need tests verifying that branch-mode auto-checkout works for `start`, `revise`, and the shared helper.

**Acceptance Criteria:**

- [ ] Test: shared helper switches branch when on a different branch
- [ ] Test: shared helper stashes dirty working tree before switching
- [ ] Test: shared helper is a no-op when already on the correct branch
- [ ] Test: shared helper throws when branch doesn't exist
- [ ] Test: `startWorkspace` calls checkout helper for branch-mode workspaces
- [ ] Test: `startWorkspace` does NOT call checkout for worktree-mode workspaces
- [ ] Test: revision workspace calls checkout helper in branch mode
- [ ] All tests pass, typecheck and lint pass

## Functional Requirements

- FR-1: A shared `ensureBranchCheckout(branchName: string, cwd: string)` function must be created that handles: checking current branch, stashing dirty state, switching branches, and logging the result
- FR-2: `startWorkspace()` in `workspace.ts` must call `ensureBranchCheckout` before spawning the agent when `gitWorkflow === "branch"`
- FR-3: Revision workspace startup must call `ensureBranchCheckout` before spawning the agent when the parent workspace is branch-mode
- FR-4: `prCommand()` in `pr.ts` must be refactored to call `ensureBranchCheckout` instead of its inline checkout logic
- FR-5: When `git stash` is run, the CLI must log: `Stashed uncommitted changes on <previousBranch>`
- FR-6: When a branch switch occurs, the CLI must log: `Switched to branch <branchName>`
- FR-7: If `git checkout` fails (e.g., branch deleted), the CLI must throw an error with a clear message including the branch name and underlying git error
- FR-8: If the user is already on the correct branch, no stash, switch, or log should occur

## Non-Goals

- No changes to worktree-mode behavior — worktree mode is unaffected
- No automatic `git stash pop` after the agent finishes (user manages their stash)
- No interactive prompts asking the user whether to switch — always auto-switch
- No changes to `william new` (branch is created but checkout is not needed until `start`)
- No changes to `william archive` or `william list` (these don't require being on the workspace branch)

## Technical Considerations

- The shared helper should live in a utility file (e.g., `src/git.ts` or alongside existing git helpers) so it can be imported by `workspace.ts`, `pr.ts`, and any future commands
- The existing auto-checkout logic in `pr.ts` (lines 336-363) is the reference implementation — the shared helper should match its behavior plus add stashing
- `runner.ts` validates the working directory exists for branch mode but does not checkout — the checkout should happen before the runner is called
- Stashing should only occur if `git status --porcelain` reports a dirty working tree (avoid empty stashes)

## Success Metrics

- `william start` in branch mode always lands the agent on the correct branch
- `william revise` in branch mode always lands the revision agent on the correct branch
- Zero duplicated checkout logic across commands (single shared helper)
- All existing tests continue to pass with no regressions

## Open Questions

- Should `git stash pop` be run automatically when the workspace is stopped, to restore the user's previous work? (Currently out of scope — users manage their stash manually.)
</prd>
