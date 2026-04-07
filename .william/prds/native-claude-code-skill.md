# PRD: Native Claude Code Skill Workflow

## Introduction

Convert William's CLI orchestration into a native Claude Code skill that runs entirely within Claude Code conversations. The skill uses subagents for parallel story execution instead of spawning separate Claude subprocesses, while preserving the existing CLI as a working alternative. A shared library is extracted so both the CLI and skill operate on the same state format, PRD parser, and prompt templates.

## Goals

- Provide a `/william` skill with subcommands (`new`, `start`, `prd`, `revise`, `pr`, `status`) that replaces the CLI workflow for users inside Claude Code
- Enable parallel story execution via subagents when worktree mode is configured
- Introduce story dependency declarations (`**Depends on:**`) in PRDs to compute execution waves
- Extract shared library code (`src/lib/`) from CLI-specific code (`src/cli/`) so both workflows share the same core logic
- Maintain full backward compatibility with the existing CLI
- Support checkpoint/resume across conversations via the existing `state.json` format

## User Stories

### US-001: Extract shared library from CLI code

**Description:** As a developer, I need the reusable core logic (PRD parser, state management, config loader, context builder, git utilities) separated into `src/lib/` so both the CLI and skill can import from a shared foundation.

**Acceptance Criteria:**

- [ ] New `src/lib/` directory contains: PRD parser, state tracker, config loader, context builder, git utilities, template loader, and types
- [ ] New `src/cli/` directory contains: CLI entry point, Commander commands, Inquirer wizard, React/Ink TUI, Claude adapter, NDJSON stream consumer, PID registry, shutdown handlers
- [ ] All existing CLI imports updated to reference new paths
- [ ] No functional changes to CLI behavior
- [ ] All existing tests pass (relocated as needed)
- [ ] Typecheck and lint pass

### US-002: Add dependency parsing to PRD parser

**Description:** As a developer, I need the PRD parser to extract `**Depends on:**` fields from user stories so the system can compute execution waves.

**Depends on:** US-001

**Acceptance Criteria:**

- [ ] `ParsedStory` type includes a `dependsOn: string[]` field (array of story IDs)
- [ ] Parser extracts `**Depends on:** US-001, US-002` from story markdown (comma-separated IDs)
- [ ] Stories with no `**Depends on:**` field get an empty `dependsOn` array
- [ ] Parser validates that all referenced story IDs exist in the PRD; throws an error with the invalid ID and referencing story if not
- [ ] Existing PRDs without dependency fields parse identically to before (empty arrays)
- [ ] Typecheck and lint pass

### US-003: Build wave planner

**Description:** As a developer, I need a wave planner that takes a dependency graph of stories and produces ordered execution waves, so the skill knows which stories can run in parallel.

**Depends on:** US-002

**Acceptance Criteria:**

- [ ] `computeWaves(stories: ParsedStory[])` function in `src/lib/` takes parsed stories and returns `Wave[]` (each wave is an array of story IDs)
- [ ] Stories with no dependencies are all placed in wave 1 (maximum parallelism)
- [ ] Stories whose dependencies are satisfied by earlier waves are grouped into the earliest possible wave
- [ ] Circular dependencies are detected and produce a clear error naming the cycle
- [ ] Wave computation is deterministic (same input always produces same output)
- [ ] Typecheck and lint pass

### US-004: Extend state format for wave tracking

**Description:** As a developer, I need the workspace state to track wave execution progress so the skill can checkpoint and resume across conversations.

**Depends on:** US-003

**Acceptance Criteria:**

- [ ] `WorkspaceState` type includes: `waves: Wave[]` (computed wave plan), `currentWave: number` (0-indexed), `waveResults: WaveResult[]` (per-wave outcomes)
- [ ] `WaveResult` type includes: wave number, story outcomes (per-story pass/fail/skip), aggregated chain context, completedAt timestamp
- [ ] New fields are optional so existing `state.json` files without them remain valid (backward compatible)
- [ ] State initialization from PRD populates `waves` using the wave planner when dependencies are present
- [ ] Typecheck and lint pass

### US-005: Create skill entry point and routing

**Description:** As a user, I want a `/william` skill that routes subcommands (`new`, `start`, `prd`, `revise`, `pr`, `status`) to the appropriate handler, so I can drive the full workflow from within Claude Code.

**Depends on:** US-001

**Acceptance Criteria:**

- [ ] Skill file at `skills/william.md` serves as the entry point, parsing the first argument as the subcommand
- [ ] Each subcommand loads its detailed instructions from a separate file in `skills/instructions/` within the William repo
- [ ] Unknown subcommands produce a help message listing available subcommands
- [ ] Missing required arguments produce a clear usage message
- [ ] The skill resolves the William repo path by following the symlink from the skill file location
- [ ] Typecheck and lint pass (for any TypeScript utilities the skill relies on)

### US-006: Implement `/william new <prd-path>`

**Description:** As a user, I want `/william new path/to/prd.md` to create a workspace from a PRD using all defaults from `.william/config.json`, with no interactive prompts.

**Depends on:** US-005, US-004

**Acceptance Criteria:**

- [ ] `/william new path/to/prd.md` creates a workspace: parses the PRD, initializes state (including wave plan), creates worktree or branch per config
- [ ] Workspace name is derived from the PRD title (kebab-cased)
- [ ] All settings pulled from `.william/config.json` (project name, git workflow, branch prefix, worktree setup commands)
- [ ] PRD file is copied into the workspace directory
- [ ] The workspace name is stored in conversation context so subsequent `/william start` can auto-detect it
- [ ] No interactive prompts — exits with error if PRD path is missing or file doesn't exist
- [ ] Typecheck and lint pass

### US-007: Implement `/william start` with wave-based parallel execution

**Description:** As a user, I want `/william start` to execute stories in dependency waves using parallel subagents, with progress reported as each story completes, and state checkpointed after each wave.

**Depends on:** US-006

**Acceptance Criteria:**

- [ ] `/william start` with no args auto-detects workspace from conversation context; if ambiguous, lists options and asks
- [ ] `/william start <workspace>` starts or resumes the named workspace
- [ ] Warns if resuming a workspace that already has progress ("Resuming workspace X from wave N")
- [ ] In worktree mode: creates a temporary worktree and branch per story in the wave (`{workspace-branch}/{story-id}`), spawns parallel subagents, each working in its own worktree
- [ ] In branch mode: executes stories sequentially (one subagent at a time) in the workspace branch directory
- [ ] Each subagent receives the story context (PRD context, story details, chain context from prior waves, agent instructions template)
- [ ] Progress is reported as each subagent completes ("US-002 completed successfully. Waiting on US-001, US-003...")
- [ ] After a wave completes, story worktrees are sequentially merged into the workspace branch; temporary branches and worktrees are cleaned up
- [ ] If a merge conflict is straightforward, a subagent resolves it; if ambiguous, the skill asks the user
- [ ] State is checkpointed to `state.json` after each wave (wave results, story outcomes, chain context)
- [ ] If any story in a wave fails, the skill pauses, reports which stories failed and which downstream stories are blocked, and asks the user how to proceed (retry, skip, or re-plan)
- [ ] Chain context is aggregated from all completed stories in a wave and injected into the next wave's subagent prompts
- [ ] Execution can be resumed from the last completed wave if the conversation ends
- [ ] Typecheck and lint pass

### US-008: Implement `/william prd`

**Description:** As a user, I want `/william prd` to load the PRD generation template and project context into the conversation so I can author a PRD interactively, with auto-save when the clarifying questions are done.

**Depends on:** US-005

**Acceptance Criteria:**

- [ ] `/william prd` loads `templates/prd-instructions.md` and injects project context (from config and codebase exploration)
- [ ] The skill asks clarifying questions until the PRD is fully specified (same flow as the existing `william prd` command)
- [ ] Once clarifying questions are complete, the PRD is auto-saved to the configured `prdOutput` path (default `.william/prds/<feature-name>.md`)
- [ ] The user can request edits after save; each edit overwrites the file
- [ ] If `prdOutput` is not configured, the skill asks the user for a path and suggests the default
- [ ] Typecheck and lint pass

### US-009: Implement `/william revise`

**Description:** As a user, I want `/william revise` to collect problems conversationally, generate a revision plan, create a nested revision workspace, and execute it through the same wave-based machinery.

**Depends on:** US-007

**Acceptance Criteria:**

- [ ] `/william revise` auto-detects workspace from conversation context or asks
- [ ] The skill asks the user to describe what's wrong (conversational, not structured prompts)
- [ ] A revision plan is generated using `templates/revision-plan-instructions.md` with the original PRD, git diff, progress, and collected problems as context
- [ ] The plan is presented for approval; user can provide feedback for iteration
- [ ] On approval, a nested revision workspace is created under the parent workspace (`revision-N/`)
- [ ] The revision workspace inherits the parent's target dir, branch, and worktree path
- [ ] Revision stories are executed through the same wave-based execution as `/william start`
- [ ] After all revision stories complete, the parent workspace state is updated with the revision entry
- [ ] Typecheck and lint pass

### US-010: Implement `/william pr`

**Description:** As a user, I want `/william pr` to push the workspace branch and create or update a GitHub PR, identical to the existing CLI behavior.

**Depends on:** US-005

**Acceptance Criteria:**

- [ ] `/william pr` auto-detects workspace from conversation context or asks
- [ ] Pushes the workspace branch to the remote
- [ ] Creates a new PR or updates an existing one via `gh` CLI
- [ ] PR title and body are generated using the existing prompt template and flow
- [ ] Supports PR template injection if `prTemplate` is configured
- [ ] Behavior is identical to `william pr` CLI command
- [ ] Typecheck and lint pass

### US-011: Implement `/william status`

**Description:** As a user, I want `/william status` to show workspace progress including wave information, story breakdown, and current execution state.

**Depends on:** US-004, US-005

**Acceptance Criteria:**

- [ ] `/william status` with no args shows the current workspace from conversation context; if none, shows all workspaces for the current project
- [ ] `/william status <workspace>` shows status for the named workspace
- [ ] Output includes: workspace name, git branch, overall progress (e.g., "Wave 2/4, 5/12 stories complete")
- [ ] Per-wave breakdown: wave number, stories in wave, status of each story (passed/failed/skipped/pending/in-progress)
- [ ] Shows attempt counts for failed or in-progress stories
- [ ] Shows revision history if revisions exist
- [ ] Typecheck and lint pass

### US-012: Update PRD generation template with dependency guidance

**Description:** As a user generating PRDs via `/william prd`, I want the template to include guidance on declaring story dependencies so that new PRDs are wave-ready by default.

**Depends on:** US-002

**Acceptance Criteria:**

- [ ] `templates/prd-instructions.md` includes guidance for the `**Depends on:**` field in the user stories section
- [ ] The guidance explains the format: `**Depends on:** US-001, US-002` (comma-separated story IDs)
- [ ] The guidance explains that stories without dependencies will run in parallel (wave 1)
- [ ] The PRD example in the instructions shows at least one story with a dependency declaration
- [ ] Typecheck and lint pass

## Functional Requirements

- **FR-1:** The `src/` directory must be reorganized into `src/lib/` (shared code) and `src/cli/` (CLI-specific code). All existing imports must be updated.
- **FR-2:** The `ParsedStory` interface must include a `dependsOn: string[]` field. The parser must extract comma-separated story IDs from `**Depends on:**` lines and validate that all referenced IDs exist in the PRD.
- **FR-3:** A `computeWaves()` function must perform topological sort on the story dependency graph and return ordered waves. Circular dependencies must be detected with a clear error.
- **FR-4:** Stories with no declared dependencies must all be placed in wave 1 for maximum parallelism.
- **FR-5:** `WorkspaceState` must be extended with optional `waves`, `currentWave`, and `waveResults` fields. Existing state files without these fields must remain valid.
- **FR-6:** The skill entry point (`skills/william.md`) must route subcommands to instruction files in `skills/instructions/`. The skill must resolve the William repo path by following the symlink from its own file location.
- **FR-7:** `/william new <prd-path>` must create a workspace with zero interactive prompts, using all defaults from `.william/config.json`.
- **FR-8:** In worktree mode, `/william start` must create a temporary worktree per story per wave with branch naming `{workspace-branch}/{story-id}`, spawn parallel subagents, and sequentially merge results into the workspace branch after the wave completes.
- **FR-9:** In branch mode, `/william start` must execute stories sequentially (one at a time) due to the lack of worktree isolation.
- **FR-10:** Merge conflicts during post-wave merging must be resolved by a subagent if straightforward, or escalated to the user if ambiguous.
- **FR-11:** State must be checkpointed to `state.json` after each wave completes, enabling resume from the last completed wave in a new conversation.
- **FR-12:** When a story fails in a wave, execution must pause. The skill must report failed stories, list blocked downstream stories, and ask the user whether to retry, skip, or re-plan.
- **FR-13:** Chain context must be aggregated from all completed stories within a wave and injected into the next wave's subagent prompts.
- **FR-14:** `/william prd` must auto-save the PRD after clarifying questions are complete, and support iterative edits that overwrite the file.
- **FR-15:** `/william revise` must create nested revision workspaces under the parent and execute them through the same wave-based machinery.
- **FR-16:** `/william pr` must behave identically to the existing `william pr` CLI command.
- **FR-17:** `/william status` must display wave-level progress information including per-story status within each wave.
- **FR-18:** Subagent prompt templates must be read from the William repo's `templates/` directory, resolved via the symlink path.
- **FR-19:** The `templates/prd-instructions.md` file must include guidance and examples for the `**Depends on:**` field so that PRDs generated via `/william prd` include dependency declarations by default.

## Non-Goals (Out of Scope)

- No removal or deprecation of the existing CLI — it continues to work as-is
- No real-time tool-by-tool streaming from subagents — completion notifications per story are sufficient (users can inspect subagents directly in Claude Code)
- No custom permission handling — the skill is expected to be run with `--dangerously-skip-permissions`
- No inter-story parallelism within branch mode — branch mode is always sequential
- No automatic dependency inference — dependencies must be explicitly declared in the PRD via `**Depends on:**`
- No changes to the PRD section structure beyond adding the optional `**Depends on:**` field to stories
- No multi-repo workspace support — one project, one repo

## Edge Cases & Error Handling

- **PRD with no dependencies declared:** All stories go in wave 1. In worktree mode, all run in parallel. In branch mode, all run sequentially.
- **PRD with a single story:** One wave, one subagent. No parallelism needed.
- **Circular dependencies:** `computeWaves()` detects the cycle and throws an error naming the involved stories. The skill reports this to the user and does not start execution.
- **Story references nonexistent dependency:** Parser throws an error during PRD parsing, before workspace creation.
- **All stories in one wave fail:** Skill reports all failures, notes there are no downstream stories to block, asks user how to proceed.
- **Merge conflict after wave:** Subagent attempts resolution. If it can resolve cleanly, it commits the merge. If not, the skill presents the conflict to the user and asks for guidance.
- **Conversation ends mid-wave:** Subagents may still be running. On resume (`/william start`), the skill reads `state.json`, detects the incomplete wave, and re-runs any stories that didn't complete.
- **Worktree creation fails:** (e.g., dirty working tree, branch already exists) Skill reports the error and suggests remediation steps.
- **No `.william/config.json` found:** `/william new` exits with an error telling the user to run `william init` first or create the config manually.
- **Workspace already completed:** `/william start` reports that all stories are complete and suggests `/william revise` if changes are needed.
- **Temporary worktree/branch cleanup:** After wave merging, temporary worktrees and branches (`{workspace-branch}/{story-id}`) are deleted. If cleanup fails, a warning is printed but execution continues.

## Technical Considerations

- **Skill file structure:** The skill entry point `skills/william.md` is a lightweight router. Subcommand instructions live in `skills/instructions/{subcommand}.md`. Both are in the William repo and symlinked to `~/.claude/skills/`.
- **Symlink resolution:** The skill resolves the William repo root by following its own symlink path (e.g., `skills/william.md` → repo root). Templates and instruction files are resolved relative to this root.
- **Subagent spawning:** The skill uses Claude Code's Agent tool to spawn subagents. For parallel execution within a wave, multiple Agent tool calls are made in a single message. Background agents (`run_in_background: true`) are used so the skill can report progress as each completes. No artificial concurrency limit — all stories in a wave run simultaneously, matching Claude Code's native agent handling.
- **State locking:** The existing `proper-lockfile` mechanism in the state tracker handles concurrent state access. The orchestrating skill is the only writer between waves; subagents do not write to `state.json` directly.
- **Worktree per agent:** Each parallel subagent gets a worktree created by the orchestrating skill before the wave starts. The skill passes the worktree path as the working directory for the subagent.
- **Template interpolation:** Reuse the existing `replacePlaceholders()` function from the shared lib to build subagent prompts from `templates/agent-instructions.md`.
- **Existing test suite:** All existing tests must continue to pass after the reorganization. Test file locations may change to mirror the new `src/lib/` and `src/cli/` structure.

## Success Metrics

- All existing CLI tests pass after the `src/lib/` + `src/cli/` reorganization
- `/william new` creates a workspace with correct wave plan from a PRD with dependencies
- `/william start` executes waves in parallel (worktree mode) or sequentially (branch mode) and checkpoints state after each wave
- A workspace started in one conversation can be resumed in another via `/william start`
- `/william prd` produces a valid PRD and auto-saves it
- `/william revise` creates a nested revision workspace and executes it
- `/william pr` creates a GitHub PR identical to the CLI version
- `/william status` shows wave-level progress
- Typecheck and lint pass with zero errors

## Open Questions

- None — all questions have been resolved through the clarification process.
