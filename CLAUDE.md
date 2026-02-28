# William

PRD-to-code orchestrator: parses markdown PRDs, spawns AI agents per user story, tracks state, runs quality checks.

## Rules

- Package manager: **pnpm** — never use npm or yarn
- Run `pnpm typecheck` and `pnpm lint` before committing

## Key Components

| File | Role |
|------|------|
| `src/cli.ts` | CLI entry point — registers commands (`new`, `init`, `prd`, etc.) via Commander |
| `src/config.ts` | Project-level config loader — reads `.william/config.json` for per-project defaults (project name, branch prefix, PRD output path, setup commands) |
| `src/init.ts` | `william init` command — interactively scaffolds `.william/config.json` |
| `src/wizard.ts` | Interactive wizard for `william new` — collects workspace parameters, reads project config for defaults |
| `src/workspace.ts` | Workspace lifecycle — create, start, stop, list, archive; runs setup commands from project config |
| `src/runner.ts` | Agent runner — spawns AI agents per user story, manages streaming output |
| `src/prd-prompt.ts` | PRD generation — builds prompts and resolves output directory from project config |

## CI

Pull requests targeting `main` automatically run `pnpm typecheck`, `pnpm lint`, and `pnpm test` via GitHub Actions. All checks must pass before merging.
