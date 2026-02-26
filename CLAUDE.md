# William

PRD-to-code orchestrator: parses markdown PRDs, spawns AI agents per user story, tracks state, runs quality checks.

## Rules

- Package manager: **pnpm** — never use npm or yarn
- Run `pnpm typecheck` and `pnpm lint` before committing

## CI

Pull requests targeting `main` automatically run `pnpm typecheck`, `pnpm lint`, and `pnpm test` via GitHub Actions. All checks must pass before merging.
