# Architecture

**Analysis Date:** 2026-03-03

## Pattern Overview

**Overall:** Agent-driven orchestration with state machine + streaming architecture

**Key Characteristics:**
- CLI-first interface with multi-command architecture
- Workspace-scoped execution model with project grouping
- PRD parsing → user story extraction → iterative agent completion
- Real-time streaming from Claude with NDJSON output parsing
- Persistent state tracking across sessions (resume capability)
- TUI dashboard for workspace progress visualization
- Revision workflow for iterative problem resolution

## Layers

**CLI Layer:**
- Purpose: Command routing and user interaction
- Location: `src/cli.ts`
- Contains: Commander-based command handlers for `new`, `start`, `stop`, `status`, `archive`, `list`, `migrate`, `prd`, `problem`, `revise`, `pr`, `completions`
- Depends on: workspace management, adapters, wizards, config
- Used by: Direct user invocation via `william` command

**Workspace Management Layer:**
- Purpose: Create, persist, list, and resolve workspaces and revisions
- Location: `src/workspace.ts`, `src/archive.ts`
- Contains: Workspace resolution (project/name paths), revision creation, workspace lifecycle (create/start/stop)
- Depends on: State tracking, config loading
- Used by: CLI commands, runner

**PRD Processing Layer:**
- Purpose: Parse PRD markdown into structured data and extract user stories
- Location: `src/prd/parser.ts`, `src/prd/context-builder.ts`, `src/prd/tracker.ts`
- Contains:
  - Parser: Extracts story IDs, titles, descriptions, acceptance criteria from markdown
  - Context Builder: Assembles focused prompts for agent iterations (handles large PRD truncation)
  - Tracker: Manages state.json persistence, marks stories complete/skipped, increments attempts
- Depends on: None (pure data transformation)
- Used by: Runner, workspace creation

**Agent Execution Layer:**
- Purpose: Orchestrate iterative agent loops per story with stuck detection
- Location: `src/runner.ts`
- Contains: Story loop management, stuck detection (tool loops, zero progress, high error rate), stuck hint generation, max iteration enforcement
- Depends on: Adapters, stream consumption, state tracking, context building
- Used by: CLI start/revise commands

**Adapter Layer (Tool Integration):**
- Purpose: Spawn and communicate with external AI tools (Claude)
- Location: `src/adapters/claude.ts`, `src/adapters/types.js`
- Contains:
  - `spawnInteractive()`: Interactive mode for `prd`/`problem` commands (stdio: "inherit")
  - `spawnCapture()`: Non-interactive mode with NDJSON stream parsing for agent execution
- Depends on: Child process spawning, NDJSON parsing
- Used by: Runner, PR command, CLI (prd/problem/revise)

**Streaming + Output Layer:**
- Purpose: Parse Claude's NDJSON stream, extract session data, pipe to TUI
- Location: `src/stream/ndjson-parser.ts`, `src/stream/consume.ts`, `src/stream/chain.ts`
- Contains:
  - NDJSON Parser: Accumulates tool uses/results, extracts text blocks and result metadata
  - Consume: Wires parser to child process stdio, dispatches to TUI emitter
  - Chain Context: Cross-story context for related stories (re-reads progress.txt for patterns)
- Depends on: Adapter output, TUI events
- Used by: Runner

**TUI + Event Layer:**
- Purpose: Real-time dashboard visualization
- Location: `src/ui/events.ts`, `src/ui/App.tsx`, `src/ui/Dashboard.tsx`, `src/ui/LogArea.tsx`, `src/ui/render-markdown.ts`
- Contains: React/Ink components for dashboard (story progress, cost/tokens, stuck status), log area with markdown rendering, event emitter for async updates
- Depends on: React, Ink, Markdown rendering
- Used by: Runner, PR command

**Configuration Layer:**
- Purpose: Load project-level defaults and settings
- Location: `src/config.ts`
- Contains: ProjectConfig interface, loader for `.william/config.json` (projectName, branchPrefix, prdOutput, setupCommands)
- Depends on: File I/O
- Used by: Wizards, CLI commands, runner

**Interactive Wizard Layer:**
- Purpose: Guided user input for setup and revision
- Location: `src/wizard.ts`, `src/revision-wizard.ts`
- Contains:
  - New Workspace Wizard: Collects workspace name, project, target directory, branch name
  - Revision Wizard: Collects problem statements, generates revision plan via Claude
- Depends on: Config loader, inquirer prompts, adapters
- Used by: CLI new/revise commands

**Utility Layers:**
- **Path Resolution** (`src/paths.ts`): Resolve template directory relative to dist
- **Notifier** (`src/notifier.ts`): System notifications for workspace completion
- **Completions** (`src/completions.ts`): Shell completion generation (bash/zsh/fish)
- **PR Integration** (`src/pr.ts`): Git operations, PR creation/updates via GitHub CLI
- **Migration** (`src/migrate.ts`): One-time workspace structure migration
- **Template** (`src/template.ts`): Placeholder replacement in prompts

## Data Flow

**Workspace Creation Flow:**

1. User: `william new`
2. CLI (`src/cli.ts`): Spawn new wizard
3. Wizard (`src/wizard.ts`): Collect workspace parameters (name, project, target dir, branch)
4. Workspace (`src/workspace.ts`): Create git worktree, create state.json from initial PRD
5. Output: Workspace dir at `.william/workspaces/{project}/{name}`

**Agent Execution Flow:**

1. User: `william start {workspace}`
2. CLI: Resolve workspace, load state.json
3. TUI: Mount Ink App dashboard with emitter
4. Runner (`src/runner.ts`): Loop through pending stories
5. Per Story:
   - Load current state
   - Build context via `context-builder.ts` (PRD + progress.txt + patterns)
   - Spawn Claude via `spawnCapture()` with focused prompt
   - Consume NDJSON stream: parse to `StreamSession`, emit to TUI
   - Check stuck detection (tool loops, zero progress, error rate)
   - If stuck: generate stuck hint, increment attempts
   - Parse Claude output for test results
   - Mark story complete/skipped/retry
   - Save state.json
6. Output: Updated state.json, progress.txt, session logs in `output/` directory

**Revision Flow:**

1. User: `william revise {workspace}`
2. CLI: Load parent state.json, check pending stories
3. Revision Wizard: Collect problems via Claude assistant
4. Revision Wizard: Generate revision plan (what stories to re-attempt)
5. Workspace: Create revision workspace under parent: `{project}/{name}/revision-{N}`
6. Runner: Execute revision stories with original PRD context injected
7. Post-Completion: Update parent state.json with revision metadata

**PR Generation Flow:**

1. User: `william pr {workspace}`
2. PR Command (`src/pr.ts`):
   - Push branch to remote
   - Get git diff main...branch
   - Spawn Claude with diff + PRD to generate PR title + body
   - Create/update PR via GitHub CLI
   - Stream PR description to stdout as it's generated

## Key Abstractions

**WorkspaceState:**
- Purpose: Persistent record of workspace progress
- Location: `src/types.ts`, stored as `.william/workspaces/{project}/{name}/state.json`
- Structure: workspace name, project, branch, target dir, stories map (id → StoryState), currentStory, timestamps
- Pattern: Immutable state updates via spread operators in tracker.ts

**StreamSession:**
- Purpose: Accumulated Claude API interaction metadata
- Location: `src/stream/types.ts`
- Structure: Tool uses/results arrays, full text, cost/tokens/duration, result subtype
- Pattern: Built incrementally by NdjsonParser, extracted from result message

**ParsedPrd:**
- Purpose: Structured PRD data for context injection
- Location: `src/prd/parser.ts`
- Structure: Title, introduction, goals, non-goals, technical considerations, functional requirements, design considerations, success metrics, open questions, stories array
- Pattern: Parsed once at workspace creation, stories extracted for loop

**StoryState:**
- Purpose: Individual story completion tracking
- Location: `src/types.ts`
- Structure: passes (true/false/"skipped"), attempts, completedAt, lastAttempt, skipReason
- Pattern: Updated via tracker.ts functions (markStoryComplete, markStorySkipped, incrementAttempts)

**TuiEvent:**
- Purpose: Async event dispatch to TUI dashboard
- Location: `src/ui/events.ts`
- Structure: Event types for assistant text, tool calls, errors, results, thinking state
- Pattern: EventEmitter-based, consumed by React App component

## Entry Points

**CLI (`src/cli.ts`):**
- Location: `src/cli.ts`
- Triggers: `william {command} [args]`
- Responsibilities:
  - Parse commands via Commander
  - Route to handlers (new, start, stop, status, archive, list, prd, problem, revise, pr)
  - Load config for defaults
  - Handle errors and exit codes

**Workspace Startup (`src/workspace.ts` → `src/runner.ts`):**
- Location: Entry via CLI `start` command
- Triggers: `william start {workspace}`
- Responsibilities:
  - Resolve workspace path and load state.json
  - Mount TUI dashboard
  - Spawn runner loop for pending stories
  - Persist state after each story

**PRD Generation (`src/cli.ts` → `src/adapters/claude.ts`):**
- Location: CLI `prd` command
- Triggers: `william prd [description]`
- Responsibilities:
  - Build PRD generation prompt
  - Spawn interactive Claude session
  - User generates/edits PRD in Claude conversation

**Revision Flow (`src/cli.ts` → `src/revision-wizard.ts`):**
- Location: CLI `revise` command
- Triggers: `william revise {workspace}`
- Responsibilities:
  - Collect problems from user
  - Generate revision plan via Claude
  - Create revision workspace
  - Execute revision runner loop

## Error Handling

**Strategy:** Exceptions bubble to CLI, caught and logged with error message

**Patterns:**
- **Validation errors** (resolveWorkspace, missing state.json): Throw Error with descriptive message
- **Process errors** (git operations, Claude execution): Throw Error with stderr content
- **Stream parsing errors** (malformed NDJSON): Log to emitter, continue
- **Stuck detection**: Write stuck hint file, increment attempts, retry next iteration
- **ExitPromptError** (from inquirer): Caught in CLI, print cancellation message

**Special Case - Stuck Recovery:**
- Stuck detection functions in `runner.ts`: detectToolLoops, detectZeroProgress, detectHighErrorRate
- When detected: Write stuck hint to `output/stuck-hint-{storyId}.md` with error context
- Increment attempts, re-loop (max 20 iterations enforced)
- Hint includes: reason, recent errors, files modified, suggestion for manual review

## Cross-Cutting Concerns

**Logging:**
- Console.log/console.error for CLI output
- TuiEmitter for async progress updates during workspace execution
- Structured NDJSON logging of Claude interactions to `output/session.ndjson`
- Markdown progress.txt for codebase patterns and recent learnings

**Validation:**
- Workspace resolution: Check directory/state.json existence
- PRD parsing: Section normalization, story ID extraction via regex
- Config loading: Try/catch JSON parse with fallback to null
- Git operations: Check for upstream before push, validate branch name

**Authentication:**
- Claude CLI (`claude` command) handles SDK token via environment
- GitHub CLI (`gh` command) handles auth for PR operations
- No token storage in William codebase itself

**State Persistence:**
- All mutable state stored as JSON: state.json (workspace state), session.ndjson (stream messages)
- State loaded on every iteration to support resume after interruption
- Immutable state updates (spread operator pattern) ensure consistency
- Revision metadata appended to parent state.json after completion

**Process Management:**
- Workspace lifecycle: create → start → run → stop → archive
- Child process spawning via execa (adapters/claude.ts)
- Stdio: "inherit" for interactive, "pipe" for streaming capture
- Explicit cleanup on process close/error

**Context Continuity:**
- Progress.txt accumulates all iteration learnings and codebase patterns
- Chain context (cross-story insights) extracted via `stream/chain.ts`
- Last 3 progress entries injected into subsequent story prompts
- Large PRDs (≥10KB) auto-truncated to core sections + story summaries
