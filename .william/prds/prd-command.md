# PRD: `william prd` Command

## Introduction

Creating PRDs for william workspaces is currently a manual process — users write markdown files by hand or use a separate tool, then feed the file into `william new`. The `william prd` command automates PRD generation by spawning a Claude agent loaded with the PRD instructions template (`templates/prd-instructions.md`). The agent conducts a short interview with the user (clarifying questions), generates a structured PRD, and saves it to disk. This keeps the entire workflow — from idea to implementation — within the william CLI.

## Goals

- Provide a single command (`william prd`) that generates a complete, structured PRD from a feature description
- Spawn an interactive Claude session that follows the PRD instructions template to ask clarifying questions and produce the document
- Accept an optional feature description as a positional argument to skip the initial prompt
- Support a `--output <path>` flag for the save location, with `prds/<feature-name>.md` as the default
- Produce PRDs that are immediately compatible with `william new` and the existing PRD parser

## User Stories

### US-001: Register `william prd` command in CLI

**Description:** As a user, I want to run `william prd` so that I can generate a PRD without leaving the terminal.

**Acceptance Criteria:**

- [ ] `william prd` is registered as a new command in `src/cli.ts`
- [ ] The command accepts an optional positional argument: `william prd [description]`
- [ ] The command accepts an `--output <path>` option
- [ ] Running `william prd --help` shows usage information
- [ ] Typecheck/lint passes

### US-002: Load and prepare the PRD instructions prompt

**Description:** As a developer, I need to read the PRD instructions template and combine it with the user's feature description so that Claude receives a complete prompt.

**Acceptance Criteria:**

- [ ] Reads `templates/prd-instructions.md` from the william project root (relative to `src/cli.ts`, i.e., `path.join(__dirname, '..', 'templates', 'prd-instructions.md')`)
- [ ] If a feature description is provided as a positional argument, it is appended to the prompt as: `\n\n## Feature Description\n\n<user's description>`
- [ ] If no description is provided, the prompt instructs Claude to ask the user for a feature description first
- [ ] The prompt includes an instruction to output the final PRD inside `<prd>...</prd>` XML tags so it can be extracted programmatically
- [ ] The prompt includes an instruction that when Claude asks where to save, it should look for the `--output` flag value if one was provided, and mention the default `prds/<feature-name>.md` otherwise
- [ ] Typecheck/lint passes

### US-003: Spawn interactive Claude session

**Description:** As a user, I want the Claude agent to interactively ask me clarifying questions and generate the PRD in my terminal.

**Acceptance Criteria:**

- [ ] The command spawns Claude using `child_process.spawn` with `claude` CLI in interactive mode (no `--output-format stream-json`, no `--dangerously-skip-permissions`)
- [ ] The prompt is passed via `--prompt` flag (or via stdin if the prompt is too long — over 100K characters)
- [ ] Claude's stdin, stdout, and stderr are inherited (`stdio: 'inherit'`) so the user can interact directly
- [ ] The process runs in the current working directory
- [ ] The command waits for the Claude process to exit before continuing
- [ ] If the Claude process exits with a non-zero code, print an error message and exit with code 1
- [ ] Typecheck/lint passes

### US-004: Extract and save the PRD file

**Description:** As a user, I want the generated PRD to be saved to disk automatically so I don't have to copy-paste from the terminal.

**Acceptance Criteria:**

- [ ] After the Claude session exits, if `--output` was specified, the PRD is already saved by Claude (via the instructions telling it to save)
- [ ] Alternative approach: The prompt instructs Claude to write the PRD file directly using its file-writing capabilities, to the path determined by `--output` flag or the user's interactive choice (default: `prds/<feature-name>.md`)
- [ ] The `prds/` directory is created if it doesn't exist
- [ ] After the session, print a summary: `PRD saved to: <path>`
- [ ] Typecheck/lint passes

### US-005: Update PRD instructions template for agent use

**Description:** As a developer, I need to update the PRD instructions template so it works well when used as a Claude agent prompt (clear instructions for the agent, extraction-friendly output, file-saving behavior).

**Acceptance Criteria:**

- [ ] The template begins with a clear role instruction: "You are a PRD generator. Your job is to help the user create a structured Product Requirements Document."
- [ ] The template includes instructions for Claude to write the final PRD to disk using its file-writing tools
- [ ] The template specifies that the output path will be provided in the prompt, and Claude should create parent directories if needed
- [ ] The template instructs Claude to ask where to save only if no output path was provided in the prompt
- [ ] The template instructs Claude to print a brief confirmation after saving (e.g., "PRD saved to prds/my-feature.md")
- [ ] The existing PRD structure (Introduction, Goals, User Stories, Functional Requirements, Non-Goals, Technical Considerations, Success Metrics, Open Questions) is preserved
- [ ] The example PRD section is preserved as a reference
- [ ] The "Writing for Junior Developers" guidance is preserved
- [ ] Typecheck/lint passes (for any code changes related to template loading)

## Functional Requirements

- FR-1: Register `william prd [description]` command with Commander.js in `src/cli.ts`
- FR-2: Accept `--output <path>` option for specifying the PRD save location
- FR-3: Read `templates/prd-instructions.md` and use it as the base prompt for the Claude session
- FR-4: If a description argument is provided, append it to the prompt so Claude can skip asking for it
- FR-5: Spawn `claude` as an interactive child process with inherited stdio so the user can converse with it
- FR-6: Pass the prompt to Claude via `--prompt` flag (or stdin for very long prompts)
- FR-7: The Claude agent must write the PRD file to disk using its own file-writing capabilities
- FR-8: Default save path is `prds/<feature-name>.md` where feature-name is kebab-case derived from the PRD title
- FR-9: Create the `prds/` directory if it doesn't exist
- FR-10: Update `templates/prd-instructions.md` to include agent-specific instructions (role, file-saving, directory creation)
- FR-11: Exit with code 1 if the Claude process fails

## Non-Goals

- No TUI/Ink rendering — this is a simple interactive passthrough to Claude
- No NDJSON stream parsing — the session is fully interactive (inherited stdio)
- No automatic workspace creation after PRD generation
- No PRD validation or linting after generation
- No changes to the existing PRD parser (`src/prd/parser.ts`)
- No new dependencies required

## Technical Considerations

- The command spawns Claude differently from `william start`. Here, Claude runs interactively (inherited stdio) rather than in stream-json mode. This is closer to how a user would run `claude` directly
- The prompt is assembled at runtime by reading the template file and optionally appending the feature description
- Claude's built-in file-writing tools (Write/Edit) handle saving the PRD — no post-processing extraction needed
- The `--output` flag value is embedded into the prompt text so Claude knows where to save
- The template needs to resolve its path relative to the william package root, not the user's cwd
- The `prds/` default directory is relative to the user's cwd, not the william project root

## Success Metrics

- A user can go from idea to saved PRD in a single `william prd "my feature idea"` command
- Generated PRDs pass through the existing `src/prd/parser.ts` without errors
- The clarifying questions step produces better, more specific PRDs than writing manually
- The entire flow (questions + generation + save) completes in under 3 minutes for a typical feature

## Open Questions

- Should we add a `--model` flag to let users choose which Claude model to use for PRD generation?
- Should the command support a `--template <path>` flag to use custom PRD templates?
- Should we add `--no-questions` flag to skip clarifying questions and generate directly from the description?
