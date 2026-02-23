# PRD: Repository Documentation System (CLAUDE.md + docs/)

## Introduction

Add a minimalist `CLAUDE.md` at the repo root that acts as a table of contents for AI agents, plus a `docs/` directory housing detailed documentation. The `CLAUDE.md` should give agents just enough context to orient themselves — project purpose, critical rules, and links to deeper docs — without being a wall of text. Agent and PRD instruction templates should also be updated to encourage keeping docs current.

## Goals

- Provide AI agents with a fast, scannable entry point to understand the repo (`CLAUDE.md`)
- Keep `CLAUDE.md` minimal — critical inline rules plus links, not a comprehensive reference
- House detailed documentation in `docs/` with focused, single-topic files
- Nudge agents (via template updates) to update docs when they change documented behavior

## User Stories

### US-001: Create CLAUDE.md at repo root

**Description:** As a developer using AI agents, I want a concise `CLAUDE.md` at the repo root so that any agent (Claude Code, William-spawned agents, etc.) can quickly understand the project and find detailed docs.

**Acceptance Criteria:**

- [ ] `CLAUDE.md` exists at the repo root
- [ ] Contains a brief project description (1-3 sentences: what William is and does)
- [ ] Contains a small set of critical inline rules (e.g., package manager is pnpm, run typecheck/lint before committing, use existing patterns)
- [ ] Contains a "Docs" section with links to each file in `docs/`
- [ ] Total length is under ~50 lines — concise enough to scan in seconds
- [ ] Typecheck/lint passes

### US-002: Create docs/architecture.md

**Description:** As a developer or AI agent, I want a document explaining the project's architecture so I can understand how the key pieces fit together without reading every source file.

**Acceptance Criteria:**

- [ ] `docs/architecture.md` exists
- [ ] Describes the high-level flow: PRD → parser → workspace → agent runner → commit
- [ ] Lists key source files with one-line descriptions (e.g., `src/runner.ts` — core iteration loop)
- [ ] Explains the role of major components: CLI, runner, wizard, watchdog, adapter, archive
- [ ] Does not duplicate content that belongs in CLAUDE.md
- [ ] Typecheck/lint passes

### US-003: Create docs/tech-stack.md

**Description:** As a developer or AI agent, I want a document covering the tech stack and coding conventions so I follow the project's established patterns.

**Acceptance Criteria:**

- [ ] `docs/tech-stack.md` exists
- [ ] Lists the tech stack: TypeScript, Node.js, pnpm, Commander, React/Ink, Vitest
- [ ] Documents code quality tooling: ESLint (strict type-checked), Prettier, Husky pre-commit hooks
- [ ] Notes key conventions (e.g., ES2022+ target, module system, source layout under `src/`)
- [ ] Does not duplicate content that belongs in CLAUDE.md
- [ ] Typecheck/lint passes

### US-004: Update templates/agent-instructions.md with docs reminder

**Description:** As a project maintainer, I want spawned agents to be reminded to update docs when their changes affect documented behavior.

**Acceptance Criteria:**

- [ ] `templates/agent-instructions.md` contains a soft reminder to update relevant docs if changes affect documented behavior
- [ ] Reminder references `CLAUDE.md` and the `docs/` directory
- [ ] Reminder is brief (1-3 lines) and non-blocking — it's a nudge, not a gate
- [ ] Typecheck/lint passes

### US-005: Update templates/prd-instructions.md with docs reminder

**Description:** As a project maintainer, I want the PRD generator to remind authors to consider doc updates when planning features that change existing behavior.

**Acceptance Criteria:**

- [ ] `templates/prd-instructions.md` contains a soft reminder about updating docs
- [ ] Reminder suggests including a doc-update note in user stories when the feature changes documented behavior
- [ ] Reminder is brief (1-3 lines) — a suggestion, not a requirement
- [ ] Typecheck/lint passes

## Functional Requirements

- FR-1: Create `CLAUDE.md` at the repo root with project overview, critical rules, and links to `docs/` files
- FR-2: Create `docs/` directory at the repo root
- FR-3: Create `docs/architecture.md` covering project structure, key files, and component roles
- FR-4: Create `docs/tech-stack.md` covering stack, tooling, and conventions
- FR-5: Add a soft "update docs if relevant" reminder to `templates/agent-instructions.md`
- FR-6: Add a soft "consider doc updates" reminder to `templates/prd-instructions.md`
- FR-7: `CLAUDE.md` must stay under ~50 lines to remain scannable
- FR-8: All links in `CLAUDE.md` must use relative paths (e.g., `docs/architecture.md`)

## Non-Goals

- No auto-generated docs from source code
- No enforced doc-update CI checks or gates
- No docs for PRD workflow or development guide (can be added later)
- No changes to the existing `README.md`
- No doc templates or scaffolding tooling

## Technical Considerations

- `CLAUDE.md` is automatically loaded by Claude Code at conversation start — keep it short to avoid wasting context window
- William-spawned agents may or may not have `CLAUDE.md` in context depending on how they're invoked; the agent-instructions template reminder covers this gap
- Relative links in `CLAUDE.md` work in both GitHub rendering and local file reads

## Success Metrics

- An agent reading only `CLAUDE.md` can identify the project purpose, key rules, and where to find details in under 10 seconds
- New feature PRDs start referencing doc updates when relevant
- Doc files stay focused — each under ~100 lines

## Open Questions

- Should `docs/` files include a "last updated" date or version?
- Should we add more doc topics later (e.g., PRD workflow, development guide, testing)?
