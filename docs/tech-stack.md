# Tech Stack

## Language & Runtime

- **TypeScript 5** — strict mode enabled
- **Node.js** — ES2022 target, ESM modules (`"type": "module"`)
- **tsx** — TypeScript execution for development (`pnpm dev`)

## Core Libraries

| Library | Purpose |
|---------|---------|
| Commander | CLI framework — commands, options, help text |
| React + Ink | Terminal UI — dashboard, spinners, log output |
| Inquirer | Interactive prompts for workspace creation wizard |
| execa | Process spawning (Claude CLI agent) |
| chokidar | File watching |
| marked + marked-terminal | Markdown rendering in terminal |

## Code Quality

- **ESLint** — `typescript-eslint` with `strictTypeChecked` + `stylisticTypeChecked` rule sets, integrated with Prettier via `eslint-config-prettier`
- **Prettier** — double quotes, semicolons, trailing commas, 80-char print width
- **Vitest** — unit test runner (`pnpm test`)
- **Husky + lint-staged** — pre-commit hook runs Prettier and ESLint on staged `.ts`/`.tsx` files

## Conventions

- **Package manager:** pnpm (never npm or yarn)
- **Module system:** ESM — use `import`/`export`, no `require()`
- **Compiler target:** ES2022+ — top-level `await`, `Object.hasOwn`, etc. are available
- **Module resolution:** `bundler` mode in tsconfig
- **JSX:** `react-jsx` transform (no manual `React` imports needed)
- **Source layout:** all source code under `src/`; entry point is `src/cli.ts`
- **Scripts:**
  - `pnpm dev` — run CLI in development
  - `pnpm typecheck` — `tsc --noEmit`
  - `pnpm lint` — ESLint on `src/`
  - `pnpm test` — Vitest (single run)
  - `pnpm format` — Prettier (write)
