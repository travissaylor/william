# PRD: Revision System

## Introduction

After William completes a workspace's stories, the user tests the output manually and may find issues — bugs, missing behavior, or rough edges. The revision system lets the user run `william revise <workspace-name>` to describe problems, have Claude decompose them into discrete revision items, approve a plan, and then execute those items using the standard runner loop. Each revision creates a child workspace inside the parent, shares the same git branch, and is fully repeatable.

## Goals

- Let users describe problems with completed work and get them fixed in a structured, automated flow
- Reuse the existing runner loop and agent infrastructure — no parallel execution model
- Produce discrete, independently-committable revision items that follow the same format as user stories
- Support repeatable revisions (`revision-1`, `revision-2`, etc.) on the same parent workspace
- Surface revision workspaces in `william list` and `william status` with clear parent linkage

## User Stories

### US-001: CLI command registration

**Description:** As a user, I want to run `william revise <workspace-name>` so that I can start a revision flow for a completed workspace.

**Acceptance Criteria:**

- [ ] `william revise <workspace-name>` command is registered in `src/cli.ts`
- [ ] Command resolves the workspace using `resolveWorkspace()` (supports both `name` and `project/name` forms)
- [ ] If the workspace has pending (incomplete, non-skipped) stories, print a warning like "Warning: 3 stories still pending" but do NOT block execution
- [ ] If no `state.json` exists for the workspace, exit with an error
- [ ] Typecheck and lint pass

### US-002: Revision wizard — problem collection

**Description:** As a user, I want a minimal interactive prompt that collects my problems/observations one at a time so that I can describe everything that needs fixing.

**Acceptance Criteria:**

- [ ] After the command resolves the workspace, an interactive loop starts
- [ ] Each iteration prompts: "Describe a problem (or press Enter to finish):"
- [ ] User types a free-text problem description and presses Enter to add it
- [ ] Pressing Enter on an empty input ends the collection loop
- [ ] At least one problem is required — if the user presses Enter immediately with no problems collected, show "At least one problem is required" and re-prompt
- [ ] After collection ends, the list of problems is displayed back to the user for confirmation before proceeding
- [ ] Typecheck and lint pass

### US-003: Plan generation via Claude

**Description:** As a user, I want Claude to analyze my problems alongside the full workspace context and generate a revision plan so that problems are decomposed into actionable items.

**Acceptance Criteria:**

- [ ] A revision prompt template is created at `templates/revision-plan-instructions.md`
- [ ] The prompt includes: the user's problem list, `progress.txt` content, git diff (from the workspace branch vs its base), the original PRD content, and `.stuck-hint.md` content if it exists
- [ ] Claude is spawned the same way as the `william prd` command — via `spawn("claude", [prompt])` with `stdio: "inherit"` for interactive use, or with `stdin` pipe for long prompts (see `src/cli.ts` lines 335-347). No `--dangerously-skip-permissions` or `--output-format` flags — this is an interactive session, not a headless runner invocation
- [ ] The spawn logic should be extracted into the Claude adapter (`src/adapters/claude.ts`) as a reusable method (e.g., `spawnInteractive(prompt, opts)`) rather than duplicating the inline pattern from the `prd` command
- [ ] The template instructs Claude to output revision items wrapped in `<revision-plan>...</revision-plan>` XML tags
- [ ] Each revision item follows the user story format: `### RI-001: Title`, `**Description:**`, and `**Acceptance Criteria:**` with checkboxes
- [ ] Descriptions must be explicit about what's wrong and what needs to change (not vague)
- [ ] The generated plan is parsed from the Claude output (extract content between the XML tags)
- [ ] Typecheck and lint pass

### US-004: Plan approval loop

**Description:** As a user, I want to review the generated plan and give conversational feedback so that I can refine it before execution starts.

**Acceptance Criteria:**

- [ ] After plan generation, the full plan is printed to the terminal in formatted markdown
- [ ] User is prompted: "Approve this plan? (yes / or give feedback):"
- [ ] If the user types "yes", "y", or "approve" (case-insensitive), the plan is accepted and the flow continues to execution
- [ ] If the user types anything else, their feedback is appended to the context and Claude is re-invoked to regenerate the plan
- [ ] The regeneration loop continues until the user approves
- [ ] Claude receives the original problems, the previous plan, and the user's feedback on each regeneration
- [ ] Typecheck and lint pass

### US-005: Revision workspace creation

**Description:** As a developer, I need a child workspace created inside the parent workspace directory so that revision state is tracked independently.

**Acceptance Criteria:**

- [ ] When the user approves a plan, a child workspace is created at `<parent-workspace>/revision-N/` where N is the next available number (1, 2, 3, etc.)
- [ ] The child workspace contains: `state.json`, `progress.txt`, `prd.md` (the approved revision plan), and a `logs/` directory
- [ ] `state.json` follows the existing `WorkspaceState` structure but with an additional `parentWorkspace` field pointing to the parent workspace path and a `revisionNumber` field
- [ ] The `branchName` in `state.json` is the same as the parent's branch — revisions commit to the same branch
- [ ] Stories in `state.json` use `RI-XXX` IDs parsed from the plan (using the existing PRD parser since the format is identical)
- [ ] `progress.txt` is initialized with the standard format: `## Codebase Patterns\n(none yet)\n\n---\n`
- [ ] Typecheck and lint pass

### US-006: Revision execution via runner

**Description:** As a user, I want revision items executed sequentially by the standard runner loop so that each item gets its own agent and commit.

**Acceptance Criteria:**

- [ ] After the child workspace is created, `runWorkspace()` is invoked on it automatically
- [ ] Each revision item is processed as a story — one agent per item, sequential execution
- [ ] Agents receive the full original PRD as context so they understand why they're fixing things (via context-builder)
- [ ] Agents commit with `[Revision] <description>` style commit messages — the agent-instructions template (or a revision-specific variant) instructs this commit message format
- [ ] Each agent outputs `<promise>STORY_COMPLETE</promise>` or `<promise>ALL_COMPLETE</promise>` on completion, same as normal stories
- [ ] Typecheck and lint pass

### US-007: Conservative stuck detection for revisions

**Description:** As a developer, I need revision workspaces to use lower stuck-detection thresholds so that problems are caught earlier and items are never skipped.

**Acceptance Criteria:**

- [ ] When the runner detects it's processing a revision workspace (via `parentWorkspace` field in state), it uses revision-specific thresholds
- [ ] Hint threshold is lowered to attempts >= 2 (from 3)
- [ ] Pause threshold is lowered to attempts >= 4 (from 7)
- [ ] Skip is disabled — revision items are never skipped, the workspace pauses instead at the pause threshold
- [ ] Typecheck and lint pass

### US-008: Parent workspace state update on revision completion

**Description:** As a user, I want the parent workspace to reflect that a revision has been completed so that I can see the revision history at a glance.

**Acceptance Criteria:**

- [ ] When all revision items complete, the parent workspace's `state.json` is updated with a `revisions` array field
- [ ] Each entry in the array contains: `{ number: N, completedAt: string, itemCount: number, path: string }` where `path` is the relative path to the child workspace directory
- [ ] The parent workspace's status display reflects completed revisions (e.g., "[1 revision]" or "[2 revisions]" appended to the summary line)
- [ ] Typecheck and lint pass

### US-009: Display revision workspaces in list and status

**Description:** As a user, I want revision workspaces to appear in `william list` and `william status` so that I can track their progress.

**Acceptance Criteria:**

- [ ] `william list` shows revision workspaces as flat entries under the same project, formatted as `workspace-name/revision-N` with a `[revision]` tag
- [ ] Example: `  my-feature/revision-1 [revision] [completed] — 3/3`
- [ ] `william status my-feature/revision-1` shows full detailed status for the revision workspace, same format as regular workspaces
- [ ] `william status my-feature` (the parent) includes a "Revisions" section listing all child revisions with their status
- [ ] Typecheck and lint pass

### US-010: Update TypeScript types

**Description:** As a developer, I need the TypeScript types in `src/types.ts` to support the revision system fields so that the codebase stays type-safe.

**Acceptance Criteria:**

- [ ] `WorkspaceState` type is extended with optional fields: `parentWorkspace?: string`, `revisionNumber?: number`, `revisions?: RevisionEntry[]`
- [ ] `RevisionEntry` type is defined: `{ number: number, completedAt: string, itemCount: number, path: string }`
- [ ] All existing code continues to typecheck with the new optional fields
- [ ] Typecheck and lint pass

## Functional Requirements

- FR-1: `william revise <workspace-name>` command resolves the workspace via `resolveWorkspace()` and warns (but does not block) if stories are still pending
- FR-2: An interactive loop collects free-text problems from the user, requiring at least one
- FR-3: Claude is invoked interactively (same spawn pattern as `william prd`) with a revision-plan prompt template containing the problems, `progress.txt`, git diff, original PRD, and stuck hints to generate a plan of revision items
- FR-4: The plan is displayed and the user can approve or give feedback to regenerate in a conversational loop
- FR-5: On approval, a child workspace is created at `<parent>/revision-N/` with `state.json`, `progress.txt`, `prd.md`, and `logs/`
- FR-6: The child workspace uses the same git branch as the parent
- FR-7: Revision items use `RI-XXX` identifiers and follow the same story format (`### RI-001: Title`, `**Description:**`, `**Acceptance Criteria:**`)
- FR-8: The standard `runWorkspace()` loop executes revision items sequentially, one agent per item
- FR-9: Agents receive the original PRD as context and commit with `[Revision] ...` message prefixes
- FR-10: Stuck detection uses lower thresholds for revision workspaces: hint at 2 attempts, pause at 4 attempts, never skip
- FR-11: On completion, the parent's `state.json` is updated with a `revisions` array entry
- FR-12: `william list` and `william status` display revision workspaces as flat entries with `[revision]` tags and parent references

## Non-Goals

- No auto-detection of what needs revision (e.g., from test failures)
- No reverting or rolling back a revision
- No partial revision execution (pause and resume individual items mid-run)
- No separate git branches for revision workspaces — they share the parent's branch
- No `william revise` on a revision workspace (no nested revisions)

## Technical Considerations

- The existing PRD parser (`src/prd/parser.ts`) can parse revision plans since they use the same `### RI-XXX: Title` format — it just needs to handle `RI-` prefixes in addition to `US-`
- The context builder (`src/prd/context-builder.ts`) needs to include the original PRD for revision agents, not just the revision plan
- The `resolveWorkspace()` function in `src/workspace.ts` needs to handle `workspace-name/revision-N` paths for status/list commands
- Git diff for plan generation should be `git diff main...<branch-name>` (or the branch's merge base) to show all changes made by the workspace
- The revision prompt template should emphasize that descriptions must explain what's wrong and what the fix should look like — not just restate the user's problem
- The `spawn()` call for plan generation follows the same interactive pattern as `william prd` in `src/cli.ts` (lines 335-347): `spawn("claude", [prompt])` with `stdio: "inherit"`, or stdin pipe for long prompts. This logic should be extracted into the Claude adapter as a reusable method rather than duplicated inline

## Success Metrics

- User can go from `william revise` to executing revision items in under 3 minutes (wizard + plan approval)
- Revision items are specific enough that agents complete them in 1-2 attempts on average
- No regressions to existing `william new`, `william start`, `william status`, or `william list` commands

## Open Questions

- Should `william revise` auto-start execution after plan approval, or should the user run `william start` separately on the revision workspace?
- Should the revision plan template instruct Claude to check for related issues beyond what the user explicitly reported?
- What should happen if the user runs `william revise` on a workspace that already has an in-progress (incomplete) revision?
