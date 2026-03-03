# Technology Stack

**Analysis Date:** 2026-03-03

## Languages

**Primary:**
- TypeScript 5 - Complete codebase, strict type checking enabled
- JavaScript (JSX) - React components for terminal UI via Ink

**Secondary:**
- Bash - Shell scripts, completions generation for bash/zsh/fish shells

## Runtime

**Environment:**
- Node.js 22 (target: `node22` in build config)
- ESM (ES Modules) native format

**Package Manager:**
- pnpm 10 - Monorepo/workspace management
- Lockfile: `pnpm-lock.yaml` (present)

## Frameworks

**Core:**
- Commander.js 12 - CLI argument parsing and command registration
- Ink 5 - React-based terminal UI framework
- React 18 - Component framework for terminal UI

**Terminal UI:**
- @inquirer/prompts 8.3.0 - Interactive terminal prompts (input, confirm, etc.)
- ora 9.3.0 - Spinner/progress indicators
- ink-spinner 5.0.0 - Animated spinner component
- marked 15.0.12 - Markdown parser
- marked-terminal 7.3.0 - Terminal markdown renderer

**Testing:**
- Vitest 2 - Unit test runner and framework
- Vitest covers both unit tests and coverage

**Build/Dev:**
- tsup 8.5.1 - TypeScript bundler with ESM build output
- tsx 4 - TypeScript execution runtime for development
- esbuild (via tsup) - Fast JavaScript bundler
- tsc (TypeScript 5) - Type checking

**Code Quality:**
- ESLint 10.0.1 - Linting with typescript-eslint plugin
- Prettier 3.8.1 - Code formatting
- eslint-config-prettier 10.1.8 - Prettier/ESLint integration
- typescript-eslint 8.56.1 - TypeScript-aware linting rules
- Husky 9.1.7 - Git hooks manager
- lint-staged 16.2.7 - Pre-commit linting via husky

## Key Dependencies

**Critical:**
- commander 12 - CLI framework foundation
- execa 9 - Child process spawning and control
- chokidar 4 - File system watching for workspace monitoring

**Infrastructure:**
- jiti 2.6.1 - Dynamic import and require resolution

**Type Support:**
- @types/node 22 - Node.js type definitions
- @types/react 18 - React type definitions

## Configuration

**Environment:**
- `.william/config.json` - Per-project configuration (projectName, branchPrefix, prdOutput, setupCommands)
- Project config is loaded at runtime via `loadProjectConfig(dir)` in `src/config.ts`
- No .env file required (environment variables optional: SHELL for completions detection)

**Build:**
- `tsconfig.json` - TypeScript compiler options (target: ES2022, module: ESNext, strict: true)
- `eslint.config.ts` - ESLint configuration with typescript-eslint strict/stylistic rules
- `.prettierrc` - Prettier formatting rules (semi: true, singleQuote: false, trailingComma: all, printWidth: 80)
- `tsup.config.ts` - Build configuration for CLI packaging
  - Bundles all runtime dependencies except Node.js builtins
  - Generates ESM format with CJS require() polyfill
  - Output: `dist/cli.js` with Node.js shebang

**Pre-commit:**
- `lint-staged` configured in `package.json` - Runs prettier and eslint on staged .ts/.tsx files

## Platform Requirements

**Development:**
- Node.js 22 or compatible
- pnpm 10
- Git (for workspace/branch management)
- macOS/Linux/Windows (notifications only on Darwin via osascript)

**Production/CLI:**
- Node.js 22+ (target runtime)
- Git (required for workspace operations)
- `claude` CLI tool (installed separately) - Required for AI interactions
- `gh` (GitHub CLI) - Required for PR operations
- macOS optional (for desktop notifications)

**Output Format:**
- Compiled to single bundle: `dist/cli.js`
- Executable: `william` (via shebang and npm bin entry)

---

*Stack analysis: 2026-03-03*
