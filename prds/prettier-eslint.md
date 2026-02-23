# PRD: Add Prettier and ESLint

## Introduction

Add Prettier (code formatting) and ESLint (static analysis) to the William repository to establish consistent code style and catch bugs early. This gives developers and AI agents a fast feedback loop — formatting errors and common mistakes are caught before code is committed or reviewed.

## Goals

- Enforce consistent code formatting across all TypeScript/TSX files via Prettier
- Catch bugs and enforce best practices via ESLint with strict type-checked rules
- Automate enforcement with npm scripts and a pre-commit hook
- Fix all existing files in a single pass so the codebase starts clean

## User Stories

### US-001: Install and configure Prettier

**Description:** As a developer, I want Prettier configured so that all code is formatted consistently without manual effort.

**Acceptance Criteria:**

- [ ] `prettier` is installed as a devDependency
- [ ] A `.prettierrc` config file exists at the repo root with Prettier defaults (double quotes, semicolons, 80 char width)
- [ ] A `.prettierignore` file excludes `node_modules`, `dist`, and `build`
- [ ] Running `pnpm format` formats all `.ts`, `.tsx`, `.js`, `.jsx`, `.json`, and `.md` files
- [ ] Running `pnpm format:check` exits non-zero if any file is unformatted

### US-002: Install and configure ESLint with strict type-checked rules

**Description:** As a developer, I want ESLint configured with strict TypeScript rules so that bugs like unsafe `any` usage, floating promises, and unused variables are caught automatically.

**Acceptance Criteria:**

- [ ] `eslint`, `typescript-eslint`, and `eslint-config-prettier` are installed as devDependencies
- [ ] An `eslint.config.ts` flat config file exists at the repo root
- [ ] Config extends `tseslint.configs.strictTypeChecked` and `tseslint.configs.stylisticTypeChecked`
- [ ] Config includes `eslint-config-prettier` to disable rules that conflict with Prettier
- [ ] TSX/JSX files are included in the linting scope
- [ ] Running `pnpm lint` lints all source files in `src/`
- [ ] Running `pnpm lint:fix` auto-fixes what it can
- [ ] Typecheck (`pnpm typecheck`) still passes

### US-003: Add pre-commit hook with lint-staged

**Description:** As a developer, I want formatting and linting to run automatically on staged files before every commit, so bad code can't slip into the repo.

**Acceptance Criteria:**

- [ ] `husky` and `lint-staged` are installed as devDependencies
- [ ] A `.husky/pre-commit` hook runs `lint-staged`
- [ ] `lint-staged` config (in `package.json` or `.lintstagedrc`) runs Prettier and ESLint on staged `.ts` and `.tsx` files
- [ ] A commit with a formatting error is blocked until fixed
- [ ] A commit with clean code succeeds without issue

### US-004: Run initial codebase-wide fix

**Description:** As a developer, I want all existing files formatted and lint-fixed so the codebase starts from a clean baseline.

**Acceptance Criteria:**

- [ ] `pnpm format` has been run on the entire codebase
- [ ] `pnpm lint:fix` has been run on the entire codebase
- [ ] Any remaining lint errors that cannot be auto-fixed are documented or suppressed with inline comments and a tracking note
- [ ] `pnpm format:check` exits 0 (all files formatted)
- [ ] `pnpm typecheck` still passes
- [ ] `pnpm test` still passes

## Functional Requirements

- FR-1: Install `prettier` as a devDependency
- FR-2: Create `.prettierrc` with default settings (explicit for clarity): `{ "semi": true, "singleQuote": false, "trailingComma": "all", "printWidth": 80 }`
- FR-3: Create `.prettierignore` with entries: `node_modules`, `dist`, `build`, `pnpm-lock.yaml`
- FR-4: Add `format` script to `package.json`: `prettier --write .`
- FR-5: Add `format:check` script to `package.json`: `prettier --check .`
- FR-6: Install `eslint`, `typescript-eslint`, and `eslint-config-prettier` as devDependencies
- FR-7: Create `eslint.config.ts` using the flat config format with `tseslint.configs.strictTypeChecked`, `tseslint.configs.stylisticTypeChecked`, and `eslint-config-prettier`
- FR-8: Configure ESLint `parserOptions.projectService` to enable type-aware linting
- FR-9: Add `lint` script to `package.json`: `eslint src/`
- FR-10: Add `lint:fix` script to `package.json`: `eslint --fix src/`
- FR-11: Install `husky` and `lint-staged` as devDependencies
- FR-12: Initialize husky with a `prepare` script: `husky`
- FR-13: Create `.husky/pre-commit` hook that runs `pnpm lint-staged`
- FR-14: Add `lint-staged` config to `package.json` that runs `prettier --write` and `eslint --fix` on `*.{ts,tsx}` files
- FR-15: Run `pnpm format` and `pnpm lint:fix` across the entire codebase as the final setup step

## Non-Goals

- No CI/CD pipeline integration (that can be added later)
- No editor-specific config files (e.g., `.vscode/settings.json`) — developers configure their own editors
- No custom ESLint rules or plugins beyond typescript-eslint and eslint-config-prettier
- No Prettier plugins (e.g., for import sorting) — keep it simple
- No linting of non-TypeScript files (e.g., shell scripts, YAML)

## Technical Considerations

- **Flat config format:** ESLint v9+ uses `eslint.config.ts` (flat config). Do not use the legacy `.eslintrc` format.
- **typescript-eslint v8+:** Use the `typescript-eslint` package (single package) rather than the older `@typescript-eslint/parser` + `@typescript-eslint/eslint-plugin` split.
- **eslint-config-prettier:** This disables ESLint formatting rules that conflict with Prettier. It must be the last config in the extends chain.
- **pnpm:** All install commands should use `pnpm add -D`.
- **Existing tests:** `vitest` tests must still pass after all changes.
- **Type checking:** `tsc --noEmit` must still pass. The strict ESLint rules may surface new issues that need fixing.

## Success Metrics

- `pnpm format:check` exits 0 on the full codebase
- `pnpm lint` exits 0 on the full codebase (or remaining issues are explicitly suppressed with documented reasons)
- `pnpm typecheck` exits 0
- `pnpm test` passes
- Pre-commit hook blocks a commit that introduces a formatting violation

## Open Questions

- Should we add an ESLint rule for import sorting (e.g., `eslint-plugin-simple-import-sort`), or keep that out of scope for now?
- Are there any files or directories beyond `node_modules`/`dist`/`build` that should be excluded from linting/formatting?
