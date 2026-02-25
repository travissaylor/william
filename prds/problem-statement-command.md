# PRD: Problem Statement Command

## Introduction

Add a `william problem` command that launches an interactive Claude session preloaded with the problem statement template. This makes it easy to step through the structured problem discovery process without manually loading the template, mirroring how `william prd` works for PRD generation.

## Goals

- Provide a single command (`william problem`) to start a guided problem statement session
- Reuse the existing `spawnInteractive` pattern from the `prd` command
- Ensure the problem statement template is optimized for interactive Claude sessions (not just static instructions)

## User Stories

### US-001: Build prompt from problem statement template

**Description:** As a developer, I need a `buildProblemPrompt` function that reads the problem statement template and injects the optional user-provided description, so the prompt is ready to pass to Claude.

**Acceptance Criteria:**

- [ ] `buildProblemPrompt(options: { description?: string })` function exists in `src/cli.ts` (or extracted alongside `buildPrdPrompt`)
- [ ] Reads `templates/problem-statement-instructions.md` as the base prompt
- [ ] When `description` is provided, appends it under a `## Feature Idea` section
- [ ] When no `description` is provided, appends instruction telling Claude to ask the user to describe their idea
- [ ] Typecheck and lint pass

### US-002: Register `problem` CLI command

**Description:** As a user, I want to run `william problem [description]` so that an interactive Claude session opens with the problem statement facilitator loaded.

**Acceptance Criteria:**

- [ ] `william problem` command is registered in the Commander program in `src/cli.ts`
- [ ] Accepts an optional positional `[description]` argument (the rough feature idea)
- [ ] Calls `buildProblemPrompt` with the description, then passes the result to `spawnInteractive`
- [ ] Exits with a non-zero code if the Claude process fails
- [ ] Running `william problem` with no arguments starts the session and Claude asks the user for their idea
- [ ] Running `william problem "my rough idea"` starts the session with the idea pre-filled
- [ ] Typecheck and lint pass

### US-003: Update problem statement template for interactive sessions

**Description:** As a user stepping through the problem statement flow, I want the template to work well as a Claude system prompt in an interactive session, so the experience is smooth and guided.

**Acceptance Criteria:**

- [ ] Template includes file-saving instructions: after synthesizing the problem statement, Claude should save it to disk (to a `problems/` directory, kebab-case filename derived from the problem title) using its file-writing tools, in addition to displaying it
- [ ] Template wraps the final problem statement in `<problem-statement>...</problem-statement>` XML tags for programmatic extraction
- [ ] Template instructs Claude to ask the user where to save if no path is obvious, suggesting `problems/<name>.md` as default
- [ ] The template still functions correctly — discovery questions followed by structured output
- [ ] Typecheck and lint pass

## Functional Requirements

- FR-1: The system must register a `problem` command in the CLI with an optional `[description]` positional argument
- FR-2: The system must read the problem statement template from `templates/problem-statement-instructions.md` and build a prompt from it
- FR-3: When a description is provided, the system must append it to the prompt under a labeled section
- FR-4: When no description is provided, the prompt must instruct Claude to ask the user for their idea
- FR-5: The system must spawn an interactive Claude session using `spawnInteractive` with the assembled prompt
- FR-6: The system must exit with code 1 if the Claude process exits with a non-zero code
- FR-7: The problem statement template must instruct Claude to save the final output to `problems/<name>.md` using file-writing tools

## Non-Goals

- No integration with `william prd` (e.g., no `--from-problem` flag)
- No structured JSON output or machine-readable state tracking
- No automated follow-up actions after the problem statement is generated
- No output path CLI option (unlike `prd`, since the primary output is conversational)

## Technical Considerations

- Follow the exact same pattern as `buildPrdPrompt` and the `prd` command action in `src/cli.ts`
- Reuse `spawnInteractive` from `src/adapters/claude.ts` — no changes needed there
- The `problem` command is simpler than `prd` since there is no `--output` flag or post-session file detection logic

## Success Metrics

- Running `william problem` launches an interactive Claude session within 2 seconds
- The Claude session correctly follows the problem statement template flow (asks discovery questions, produces structured output)
- The problem statement is saved to disk at the end of the session

## Open Questions

- Should `william --help` group `prd` and `problem` together as "planning" commands, or keep the flat command list?
