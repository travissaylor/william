# Codebase Structure

**Analysis Date:** 2026-03-03

## Directory Layout

```
william/
├── src/
│   ├── cli.ts                      # CLI entry point, command registration
│   ├── types.ts                    # Core types: WorkspaceState, StoryState
│   ├── config.ts                   # Project config loader (.william/config.json)
│   ├── workspace.ts                # Workspace lifecycle and resolution
│   ├── runner.ts                   # Agent execution loop per story
│   ├── archive.ts                  # Workspace archival utility
│   ├── init.ts                     # Initialize config.json interactively
│   ├── wizard.ts                   # Workspace creation wizard
│   ├── revision-wizard.ts          # Revision problem + plan collection
│   ├── pr.ts                       # GitHub PR creation/updates
│   ├── prd-prompt.ts               # PRD generation prompt builder
│   ├── paths.ts                    # Template path resolution
│   ├── notifier.ts                 # System notifications
│   ├── completions.ts              # Shell completion generation
│   ├── migrate.ts                  # Migration utility
│   ├── template.ts                 # Placeholder replacement
│   │
│   ├── adapters/
│   │   ├── types.ts                # ToolAdapter interface
│   │   └── claude.ts               # Claude adapter (spawnInteractive, spawnCapture)
│   │
│   ├── prd/
│   │   ├── parser.ts               # Parse PRD markdown → ParsedPrd + stories
│   │   ├── tracker.ts              # State persistence and mutations
│   │   └── context-builder.ts      # Build focused prompts with context
│   │
│   ├── stream/
│   │   ├── types.ts                # StreamMessage, StreamSession types
│   │   ├── ndjson-parser.ts        # Parse NDJSON from Claude output
│   │   ├── consume.ts              # Wire parser to child process
│   │   └── chain.ts                # Cross-story context extraction
│   │
│   ├── ui/
│   │   ├── events.ts               # TuiEmitter event dispatch
│   │   ├── App.tsx                 # Main React/Ink app
│   │   ├── Dashboard.tsx           # Top-level dashboard display
│   │   ├── LogArea.tsx             # Scrollable log area
│   │   └── render-markdown.ts      # Markdown renderer
│   │
│   ├── stubs/
│   │   └── react-devtools-core.ts  # Stub for Ink compatibility
│   │
│   └── types/
│       └── marked-terminal.d.ts    # TypeScript definitions
│
├── templates/
│   ├── problem-statement-instructions.md  # Prompt template for `william problem`
│   └── [other prompt templates]
│
├── dist/
│   ├── cli.js                      # Compiled entry point
│   └── [compiled output]
│
├── tests/ (inline with source)
│   ├── config.test.ts
│   ├── init.test.ts
│   ├── wizard.test.ts
│   ├── prd-prompt.test.ts
│   ├── prd/parser.test.ts
│   ├── prd/context-builder.test.ts
│   ├── stream/ndjson-parser.test.ts
│   ├── stream/chain.test.ts
│   └── workspace-setup.test.ts
│
├── .william/
│   ├── config.json                 # Project config (projectName, branchPrefix, prdOutput, setupCommands)
│   └── prds/                       # Generated PRDs
│
├── workspaces/
│   └── {project}/
│       └── {workspace}/
│           ├── .git/
│           ├── state.json          # Workspace state (stories, progress)
│           ├── prd.md              # Original PRD file
│           ├── progress.txt        # Accumulated learnings + patterns
│           ├── output/
│           │   ├── session.ndjson  # Raw Claude stream messages
│           │   └── stuck-hint-*.md # Stuck detection hints (if needed)
│           └── revision-{N}/       # Revision workspaces (same structure)
│
├── archive/
│   └── {project}/
│       └── {workspace}-{timestamp}.tar.gz  # Archived workspaces
│
├── package.json                    # Dependencies, scripts
├── tsconfig.json                   # TypeScript config
├── eslint.config.js                # ESLint config
├── .prettierrc                      # Prettier config
├── vitest.config.ts                # Vitest config
├── .husky/                         # Git hooks
└── CLAUDE.md                       # Project instructions (this file)
```

## Directory Purposes

**`src/`:**
- Purpose: All TypeScript source code
- Contains: CLI, business logic, utilities, UI components
- Key files: `cli.ts` (entry), `runner.ts` (core execution), `workspace.ts` (state mgmt)

**`src/adapters/`:**
- Purpose: Tool integration (Claude SDK)
- Contains: Adapter interface, Claude-specific spawning logic
- Key files: `claude.ts` (spawnInteractive, spawnCapture)

**`src/prd/`:**
- Purpose: PRD parsing and state management
- Contains: Markdown parser, state persistence, context building
- Key files: `parser.ts`, `tracker.ts`, `context-builder.ts`

**`src/stream/`:**
- Purpose: Stream processing and event handling
- Contains: NDJSON parsing, child process wiring, cross-story context
- Key files: `ndjson-parser.ts`, `consume.ts`

**`src/ui/`:**
- Purpose: Real-time TUI dashboard
- Contains: React/Ink components, event emitter, markdown rendering
- Key files: `App.tsx` (main), `Dashboard.tsx`, `LogArea.tsx`

**`templates/`:**
- Purpose: Prompt templates for Claude interactions
- Contains: Markdown instruction files
- Key files: `problem-statement-instructions.md`, others referenced in `prd-prompt.ts`

**`dist/`:**
- Purpose: Compiled JavaScript output (built from src/)
- Contains: Output of `pnpm build` command
- Generated: Yes, not committed

**`.william/`:**
- Purpose: Project-level configuration and generated PRDs
- Contains: `config.json` (project settings), `prds/` (generated PRDs)
- Key files: `config.json` (projectName, branchPrefix, prdOutput, setupCommands)

**`workspaces/`:**
- Purpose: Active and running workspaces
- Contains: Project-grouped subdirectories with workspace directories
- Structure: `{project}/{workspace}/` per workspace, `{workspace}/revision-{N}/` for revisions
- Key files: `state.json` (workspace state), `prd.md` (source), `progress.txt` (learnings)

**`archive/`:**
- Purpose: Completed/archived workspaces
- Contains: Compressed tar.gz files of closed workspaces
- Naming: `{project}/{workspace}-{timestamp}.tar.gz`

## Key File Locations

**Entry Points:**
- `src/cli.ts`: CLI entry point, all command definitions
- `src/runner.ts`: Core execution loop (spawns Claude, manages stories)
- `src/wizard.ts`: Interactive setup for new workspaces
- `src/pr.ts`: GitHub PR integration

**Configuration:**
- `src/config.ts`: ProjectConfig loader
- `.william/config.json`: Project-level settings (projectName, branchPrefix, prdOutput, setupCommands)
- `tsconfig.json`: TypeScript configuration
- `vitest.config.ts`: Test runner configuration
- `eslint.config.js`: Linting rules
- `.prettierrc`: Code formatting rules

**Core Logic:**
- `src/workspace.ts`: Workspace creation/resolution/lifecycle
- `src/prd/parser.ts`: PRD markdown parsing
- `src/prd/tracker.ts`: State persistence (load/save/mutate)
- `src/prd/context-builder.ts`: Prompt context assembly
- `src/adapters/claude.ts`: Claude CLI spawning

**State & Types:**
- `src/types.ts`: Core types (WorkspaceState, StoryState, RevisionEntry)
- `src/stream/types.ts`: Stream types (StreamMessage, StreamSession)
- `src/prd/parser.ts`: Parsed data types (ParsedPrd, ParsedStory)

**Testing:**
- `src/config.test.ts`: Config loader tests
- `src/init.test.ts`: Init command tests
- `src/wizard.test.ts`: Wizard tests
- `src/prd/parser.test.ts`: Parser tests
- `src/prd/context-builder.test.ts`: Context building tests
- `src/stream/ndjson-parser.test.ts`: Stream parser tests
- `src/workspace-setup.test.ts`: Workspace creation tests

## Naming Conventions

**Files:**
- Kebab-case for multi-word filenames: `context-builder.ts`, `ndjson-parser.ts`
- `.test.ts` suffix for test files (co-located with implementation)
- `.tsx` for React/Ink components: `App.tsx`, `Dashboard.tsx`
- Entry point: `cli.ts`

**Directories:**
- Lowercase, singular purpose: `src/adapters/`, `src/prd/`, `src/stream/`, `src/ui/`
- Project grouping: `workspaces/{project}/{workspace}/`

**Exports & Functions:**
- camelCase for functions and variables
- PascalCase for classes and types
- Descriptive names matching purpose: `spawnInteractive()`, `markStoryComplete()`, `buildContext()`

**Workspace Paths:**
- Format: `.william/workspaces/{projectName}/{workspaceName}/`
- Revision paths: `.william/workspaces/{projectName}/{workspaceName}/revision-{N}/`
- Branch names follow pattern from config (e.g., `feature/...`)

**State Files:**
- `state.json`: Workspace state (WorkspaceState JSON structure)
- `prd.md`: Original PRD markdown
- `progress.txt`: Accumulated iteration learnings and codebase patterns
- `output/session.ndjson`: Raw Claude API messages (NDJSON format)
- `output/stuck-hint-{storyId}.md`: Stuck detection hints

## Where to Add New Code

**New Feature (User Story):**
- Primary implementation: Feature code in target project repository (not William itself)
- William impact: If adding new commands or adapters, extend `src/cli.ts` and `src/adapters/`

**New Command:**
- CLI registration: Add command in `src/cli.ts` via `program.command()`
- Handler function: Create separate file or add to existing module
- Example: `william prd`, `william problem`, `william revise` are all in `src/cli.ts` with supporting modules

**New Adapter (e.g., Claude alternative):**
- Create new file: `src/adapters/{adapter-name}.ts`
- Implement: Export function matching `ToolAdapter` interface from `src/adapters/types.ts`
- Register: Add option parsing in `src/cli.ts` start command (currently hardcoded to ClaudeAdapter)

**New TUI Component:**
- Create `.tsx` file in `src/ui/`
- Import React and Ink primitives
- Example: `Dashboard.tsx`, `LogArea.tsx`
- Integrate: Import and use in `App.tsx`

**New Utility:**
- Location: Create in `src/` or appropriate subdirectory
- Example: `notifier.ts`, `paths.ts`, `completions.ts`
- Naming: Descriptive, kebab-case

**Utilities & Helpers:**
- Shared helpers for prompt building: `src/template.ts`
- Git operations for PR: `src/pr.ts`
- Workspace resolution: `src/workspace.ts`
- Config/project defaults: `src/config.ts`

**Tests:**
- Co-locate with implementation: `src/feature.ts` + `src/feature.test.ts`
- Use Vitest patterns from existing tests
- Run: `pnpm test` or `pnpm test:watch`

## Special Directories

**`templates/`:**
- Purpose: Markdown prompt templates for Claude interactions
- Generated: No, checked into repo
- Committed: Yes
- Contents: Instruction prompts, guidelines for PRD generation, problem statements

**`dist/`:**
- Purpose: Compiled JavaScript output
- Generated: Yes, via `pnpm build` command
- Committed: No (in .gitignore)
- Contents: Output of TypeScript → JavaScript compilation via tsup

**`.william/`:**
- Purpose: Project-level William configuration
- Generated: Partially (config.json via `william init`, prds/ via `william prd`)
- Committed: Yes (config.json template/example checked in)
- Contents: Project settings, generated PRDs

**`workspaces/`:**
- Purpose: Active workspace instances
- Generated: Yes, via `william new` and `william start`
- Committed: No (git worktrees, temporary state)
- Contents: Per-workspace state, progress, output logs

**`archive/`:**
- Purpose: Backup location for completed workspaces
- Generated: Yes, via `william archive`
- Committed: No (large, temporary)
- Contents: Compressed workspace snapshots

## Code Organization Patterns

**State Management:**
- All mutable state in `src/prd/tracker.ts`
- Immutable updates via spread operators
- Persisted to JSON files (state.json)
- Loaded fresh on each iteration to support resume

**Error Handling:**
- Exceptions thrown from utility functions
- Caught in CLI command handlers
- Error message logged to stdout/stderr
- Process exits with code 1 on error

**Async Operations:**
- Promises used for child processes and I/O
- Runner loop uses async/await
- No callback-based APIs (except event emitters in TUI)

**Types:**
- Core types in `src/types.ts` (WorkspaceState, StoryState)
- Stream types in `src/stream/types.ts` (StreamMessage, StreamSession)
- Adapter interface in `src/adapters/types.ts` (ToolAdapter)
- Parser output in `src/prd/parser.ts` (ParsedPrd, ParsedStory)

**Module Exports:**
- Descriptive named exports matching function name
- Example: `export function buildContext()`, `export function loadState()`
- Avoid default exports (named imports more explicit)

**Dependencies:**
- External: Commander (CLI), Ink (TUI), Inquirer (prompts), Execa (child processes), Marked (markdown)
- Internal: Highly modular, each file imports only what it needs
- Circular dependencies: None detected
