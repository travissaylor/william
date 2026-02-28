# PRD: Portable CLI Build

## Introduction

William currently runs from source via `tsx`, requiring every machine to have the full repo cloned, all dependencies installed via `pnpm install`, and a global link set up. This means Node.js, pnpm, and every transitive dependency must be present and in sync. If dependencies drift between machines, things break silently.

This feature adds a build step that bundles William's TypeScript source and all runtime dependencies into a single JavaScript file using tsup (an esbuild-based bundler). After building, the CLI can be globally linked and run with just Node.js — no `node_modules` required at runtime.

## Goals

- Add a `pnpm build` command that produces a self-contained JS bundle in `dist/`
- Bundle all runtime dependencies (commander, ink, react, execa, etc.) so `node_modules` is not needed at runtime
- Copy template files into `dist/templates/` so the build output is portable
- Update the `bin` entry so `pnpm link --global` points to the built artifact
- Keep the existing `pnpm dev` workflow unchanged for local development

## User Stories

### US-001: Add tsup and build script

**Description:** As the maintainer, I want a build script that bundles the CLI into a single JS file so that I don't need `node_modules` at runtime.

**Acceptance Criteria:**

- [ ] `tsup` is added as a dev dependency
- [ ] A `tsup.config.ts` (or equivalent config) exists that: targets Node 22 (or the current ES2022 target), uses ESM output format, bundles all dependencies (not just devDependencies), and sets the entry point to `src/cli.ts`
- [ ] `pnpm build` produces `dist/cli.js` (a single bundled file)
- [ ] `dist/cli.js` starts with `#!/usr/bin/env node` (not `tsx`)
- [ ] Running `node dist/cli.js --version` prints the version without errors
- [ ] Running `node dist/cli.js --help` prints help without errors
- [ ] Typecheck and lint pass

### US-002: Copy templates into dist during build

**Description:** As the maintainer, I want template files included alongside the bundle so the built CLI can find them without the original repo structure.

**Acceptance Criteria:**

- [ ] The build step copies `templates/*.md` into `dist/templates/`
- [ ] After a clean build (`rm -rf dist && pnpm build`), `dist/templates/` contains all 4 template files: `agent-instructions.md`, `prd-instructions.md`, `problem-statement-instructions.md`, `revision-plan-instructions.md`
- [ ] Typecheck and lint pass

### US-003: Update path resolution for bundled output

**Description:** As the maintainer, I want the CLI to resolve templates and `package.json` correctly when running from `dist/cli.js` instead of `src/cli.ts`.

**Acceptance Criteria:**

- [ ] `WILLIAM_ROOT` (in `runner.ts`) resolves to the project root from both `src/` (dev) and `dist/` (built) — both are one level below root, so `path.resolve(__dirname, "..")` continues to work
- [ ] Template path resolution in `cli.ts`, `runner.ts`, and `revision-wizard.ts` uses a shared helper or consistent pattern that finds templates relative to `__dirname` — i.e., `path.join(__dirname, "templates", filename)` instead of `path.join(__dirname, "..", "templates", filename)`
- [ ] `readPackageVersion()` in `cli.ts` resolves `package.json` from the project root (still `path.join(__dirname, "..", "package.json")` — this is correct for both `src/` and `dist/`)
- [ ] All 4 template reads work when running via `node dist/cli.js`
- [ ] The `pnpm dev` workflow (`tsx src/cli.ts`) still works — templates must be findable from `src/` too (either by also copying templates into `src/templates/`, or by falling back to `../templates/` when `__dirname/templates/` doesn't exist)
- [ ] Typecheck and lint pass

### US-004: Update package.json bin to point to built output

**Description:** As the maintainer, I want `pnpm link --global` to use the built bundle so the `william` command runs without `tsx` or `node_modules`.

**Acceptance Criteria:**

- [ ] `package.json` `bin.william` is changed from `src/cli.ts` to `dist/cli.js`
- [ ] After `pnpm build && pnpm link --global`, running `william --version` works on a shell with just Node.js (no tsx in PATH required)
- [ ] After `pnpm build && pnpm link --global`, running `william --help` works
- [ ] The `dev` script in `package.json` still uses `tsx src/cli.ts` for development
- [ ] Typecheck and lint pass

### US-005: Verify end-to-end workflow

**Description:** As the maintainer, I want to verify the full setup workflow works so I'm confident it will work on a new machine.

**Acceptance Criteria:**

- [ ] `pnpm build` completes without errors
- [ ] `node dist/cli.js --version` prints the correct version
- [ ] `node dist/cli.js status` runs without import/module errors
- [ ] `node dist/cli.js new` launches the interactive wizard without errors (can be cancelled immediately)
- [ ] The bundle does not contain dev-only code (no vitest, eslint, prettier, husky references in dist/)
- [ ] Typecheck and lint pass

## Functional Requirements

- FR-1: Add `tsup` as a dev dependency and create a tsup config that bundles `src/cli.ts` into `dist/cli.js` as ESM with all runtime dependencies included
- FR-2: The build must produce a single JS entry file with a `#!/usr/bin/env node` shebang (the `banner` option in tsup)
- FR-3: Add a `build` script to `package.json` that runs tsup and copies templates: `tsup && cp -r templates dist/templates`
- FR-4: Add a `clean` script to `package.json`: `rm -rf dist`
- FR-5: Update all template path resolution (`cli.ts`, `runner.ts`, `revision-wizard.ts`) to look for templates at `path.join(__dirname, "templates", filename)` with a fallback to `path.join(__dirname, "..", "templates", filename)` for dev mode compatibility
- FR-6: Change `package.json` `bin.william` from `src/cli.ts` to `dist/cli.js`
- FR-7: Add `dist/` to `.gitignore` so build artifacts are not committed
- FR-8: The `ink` and `react` JSX runtime must be bundled correctly — tsup's `--jsx` or esbuild jsx settings may need to be configured since the project uses `react-jsx` transform

## Non-Goals

- No npm registry publishing or distribution to others
- No standalone binary (Node.js as a prerequisite is acceptable)
- No CI-automated builds — the maintainer runs `pnpm build` manually
- No changes to the workspace storage location or runtime data directories
- No changes to the dev workflow (`pnpm dev` stays as-is)
- No tree-shaking or minification optimization (correctness over size)

## Technical Considerations

- **JSX bundling:** The project uses `ink` (React-based TUI) with the `react-jsx` transform. tsup/esbuild must be configured to handle `.tsx`/`.jsx` files. Since `ink` components are imported but not present in `cli.ts` directly, the bundler should handle this transitively. The tsup config should set `jsx: 'automatic'` or equivalent.
- **ESM output:** The project is `"type": "module"`. The bundle must output ESM (`format: 'esm'`). This means `import.meta.url` works naturally, and `__dirname` must be derived from it (as the code already does).
- **`__dirname` in ESM bundles:** esbuild/tsup injects a shim for `__dirname` when targeting ESM. Verify that this shim produces the correct value (the directory containing `dist/cli.js`, not some temp path).
- **External binaries:** The CLI spawns `claude` (Claude Code CLI) via `execa`. This is a system-level dependency unrelated to bundling — it just needs to be on PATH.
- **chokidar native deps:** `chokidar` may use native filesystem watchers. Verify it bundles correctly or consider marking it as external if issues arise.
- **Template fallback pattern:** To keep `pnpm dev` (tsx) working after template path resolution changes, use a simple fallback: check `__dirname/templates/` first, then `__dirname/../templates/`. This avoids needing to copy templates into `src/` during development.

## Success Metrics

- Setting up William on a new machine requires only: `git clone`, `pnpm install`, `pnpm build`, `pnpm link --global`
- After initial setup, the `william` command works with just Node.js on PATH (no tsx, no node_modules at runtime)
- Build completes in under 10 seconds
- No runtime errors from missing modules or templates

## Open Questions

- Should `dist/` be committed to the repo so new machines can skip the build step entirely (just `git clone && pnpm link --global`)?
- If `chokidar` or `ink` have issues with bundling, should they be marked as external (requiring them in `node_modules` at runtime)?
