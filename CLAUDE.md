# William

Autonomous orchestrator that turns markdown PRDs into implemented code by spawning a fresh AI agent for each user story. It parses PRDs, tracks story state, runs quality checks, and commits — with stuck detection and recovery built in.

## Critical Rules

- Package manager is **pnpm** — never use npm or yarn
- Run `pnpm typecheck` and `pnpm lint` before committing
- Follow existing code patterns — check nearby files before adding new abstractions
- Source code lives under `src/`; entry point is `src/cli.ts`
- Target is ES2022+, ESM modules (`"type": "module"`)
- Pre-commit hooks (Husky + lint-staged) auto-run Prettier and ESLint on staged `.ts`/`.tsx` files

## Key Components

| File | Role |
|------|------|
| `src/cli.ts` | CLI entry point (Commander) |
| `src/runner.ts` | Core iteration loop |
| `src/workspace.ts` | Workspace lifecycle and resolution |
| `src/wizard.ts` | Interactive workspace creation |
| `src/watchdog.ts` | Stuck detection and recovery |
| `src/prd/parser.ts` | Markdown PRD parser |
| `src/prd/tracker.ts` | Story state management |
| `src/prd/context-builder.ts` | Prompt context assembly |
| `src/adapters/claude.ts` | Claude CLI adapter |
| `src/archive.ts` | Workspace archiving |
| `src/template.ts` | Template placeholder replacement |

## Docs

- [Architecture](docs/architecture.md) — high-level flow, component roles, key files
- [Tech Stack](docs/tech-stack.md) — stack, tooling, and coding conventions
