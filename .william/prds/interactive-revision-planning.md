# PRD: Interactive Revision Planning

## Introduction

The current `william revise` flow wraps Claude Code entirely during plan generation — it uses a non-interactive `spawnCapture()` call to generate a structured revision plan, then presents an approve/reject loop. This prevents the user from leveraging Claude Code's interactive capabilities: skills like `/grill-me` to stress-test the plan, `/simplify` to refine it, or free-form back-and-forth to explore problems and solutions. This PRD replaces the non-interactive plan generation and separate problem collection steps with a single interactive Claude Code session, while preserving the existing non-interactive agent execution loop.

## Goals

- Replace non-interactive revision plan generation with a fully interactive Claude Code session
- Eliminate the separate problem collection step — fold problem discovery into the interactive session
- Preserve the existing agent execution loop (non-interactive per-story) unchanged
- Allow users to leverage any Claude Code skill (`/grill-me`, `/simplify`, `/polish`, etc.) during revision planning
- Extract the finalized plan via a file written by Claude during the interactive session

## User Stories

### US-001: Replace plan generation with interactive Claude session

**Description:** As a user, I want `william revise <workspace>` to launch a fully interactive Claude Code session so that I can use skills and have back-and-forth conversation to shape the revision plan.

**Acceptance Criteria:**

- [ ] Running `william revise <workspace>` spawns an interactive Claude Code session using `spawnInteractive()`
- [ ] The session receives an initial prompt containing: the original PRD, `progress.txt` contents, and a git diff summary
- [ ] The prompt instructs Claude to help identify problems and create a revision plan
- [ ] The prompt specifies the plan output path: `{workspace}/revision-plan.md`
- [ ] The prompt includes light formatting instructions (RI-XXX format with description + acceptance criteria)
- [ ] The user has full control of the session — can use any Claude Code skill, ask questions, iterate
- [ ] The session runs in the workspace's target directory (worktree path or target dir)
- [ ] Typecheck and lint pass

### US-002: Extract plan from file after interactive session

**Description:** As a user, I want the revision plan I finalized during the interactive session to be automatically picked up by william so that agent execution proceeds without extra manual steps.

**Acceptance Criteria:**

- [ ] After the interactive session exits, william checks for `{workspace}/revision-plan.md`
- [ ] If the file exists, william reads and parses it for RI-XXX items using the existing `parsePrd()` logic
- [ ] Parsed items are passed to `createRevisionWorkspace()` to create the revision workspace
- [ ] Agent execution proceeds as before (non-interactive per-story loop)
- [ ] Typecheck and lint pass

### US-003: Handle missing plan file gracefully

**Description:** As a user, if I exit the interactive session without writing a plan file (forgot, crashed, changed my mind), I want a clear message and the option to retry.

**Acceptance Criteria:**

- [ ] If `{workspace}/revision-plan.md` does not exist after the session exits, william prints a message explaining no plan was found
- [ ] William offers to re-launch the interactive session (prompt: "No revision plan found. Re-launch session?")
- [ ] If the user declines, william exits cleanly without creating a revision workspace
- [ ] If the user accepts, the interactive session is re-launched with the same context
- [ ] Typecheck and lint pass

### US-004: Remove separate problem collection step

**Description:** As a developer, I want to remove the `collectRevisionProblems()` function and its usage so that the revision flow is simplified to a single interactive session.

**Acceptance Criteria:**

- [ ] The `collectRevisionProblems()` function in `src/revision-wizard.ts` is removed
- [ ] The `generateRevisionPlan()` function in `src/revision-wizard.ts` is removed
- [ ] The approval loop in `src/cli.ts` (the loop that calls `generateRevisionPlan` and prompts for approve/reject) is removed
- [ ] The `revision-plan-instructions.md` template is removed or repurposed as the light interactive prompt template
- [ ] No references to removed functions remain in the codebase
- [ ] Typecheck and lint pass

### US-005: Create interactive revision prompt template

**Description:** As a developer, I need a prompt template for the interactive session that provides context and light formatting instructions without being overly prescriptive.

**Acceptance Criteria:**

- [ ] A new template file exists (e.g., `templates/revision-interactive.md`) with placeholder support
- [ ] Template includes placeholders for: `{{workspace_name}}`, `{{prd}}`, `{{progress}}`, `{{diff}}`, `{{plan_path}}`
- [ ] Template provides the RI-XXX formatting instructions (title, description, acceptance criteria)
- [ ] Template instructs Claude to write the finalized plan to `{{plan_path}}` when the user is satisfied
- [ ] Template does NOT heavily constrain the conversation — it sets context and a goal, not a rigid flow
- [ ] Typecheck and lint pass

## Functional Requirements

- FR-1: `william revise <workspace>` must spawn an interactive Claude Code session via `spawnInteractive()` with the full workspace context injected as the initial prompt
- FR-2: The initial prompt must include the original PRD content, `progress.txt` content, and a git diff of the workspace branch
- FR-3: The initial prompt must instruct Claude to write the finalized plan to `{workspace}/revision-plan.md` in RI-XXX format
- FR-4: After the interactive session exits (any exit method), william must check for the existence of `{workspace}/revision-plan.md`
- FR-5: If the plan file exists, william must parse it into revision items and call `createRevisionWorkspace()` followed by `runWorkspace()`
- FR-6: If the plan file does not exist, william must prompt the user to re-launch or exit
- FR-7: The `collectRevisionProblems()` and `generateRevisionPlan()` functions must be removed
- FR-8: The approval loop (approve/reject/feedback cycle) must be removed
- FR-9: The agent execution loop (`runWorkspace()` for revision items) must remain unchanged

## Non-Goals

- No changes to the per-story agent execution loop (it stays non-interactive)
- No `--auto` or `--non-interactive` fallback flag — there is one way to revise
- No changes to how revision workspaces are structured on disk (still `revision-{n}/` under parent)
- No changes to `william list` or `william status` display of revisions
- No changes to stuck detection, retry logic, or TUI rendering during agent execution

## Technical Considerations

- `spawnInteractive()` in `src/adapters/claude.ts` already handles large prompts (>100k chars) by piping via stdin — this will likely be needed since the prompt includes PRD + diff + progress
- The plan file path should be deterministic: `{workspaceDir}/revision-plan.md` — william knows exactly where to look
- `parsePrd()` already handles RI-XXX formatted items (used by `createRevisionWorkspace()` today) — reuse as-is
- The interactive session runs in the workspace's working directory (`worktreePath ?? targetDir`) so Claude has access to the codebase

## Success Metrics

- User can use any Claude Code skill during revision planning
- Revision plan quality improves due to interactive refinement (subjective, user-reported)
- Flow has fewer steps: no separate problem collection, no approve/reject loop
- Time from `william revise` to agent execution is not significantly increased despite interactivity

## Open Questions

- Should the plan file (`revision-plan.md`) be cleaned up after successful parsing, or left in place for reference?
- If the user runs `william revise` again on the same workspace, should an existing `revision-plan.md` be overwritten or should william warn?
