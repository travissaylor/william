# Coding Conventions

**Analysis Date:** 2026-03-03

## Naming Patterns

**Files:**
- PascalCase for component/class files: `App.tsx`, `NdjsonParser.ts`
- kebab-case for utility/function files: `prd-prompt.ts`, `stream-parser.ts`, `render-markdown.ts`, `workspace-setup.test.ts`
- Test files use `.test.ts` or `.test.tsx` suffix: `init.test.ts`, `chain.test.ts`, `ndjson-parser.test.ts`
- Interface definitions often share names with implementation but in separate files: `types.ts`, `marked-terminal.d.ts` (type stubs)

**Functions:**
- camelCase for all function names: `readPackageVersion()`, `buildProblemPrompt()`, `resolveWorkspace()`, `extractCodebasePatterns()`
- Prefix functions with action verb: `build*`, `extract*`, `resolve*`, `collect*`, `generate*`, `load*`, `save*`, `run*`
- Private/internal functions also use camelCase: `buildStoryTable()`, `detectToolLoops()`, `gatherContext()`

**Variables:**
- camelCase for all variables: `tmpDir`, `originalCwd`, `parsedStories`, `workspaceDir`, `configPath`, `sessionId`
- UPPER_CASE for constants: `WILLIAM_ROOT`, `SYSTEM_INIT`
- Descriptive names reflecting purpose: `storyValues`, `allDone`, `displayStatus`, `workspaceName` (not shortened)

**Types:**
- PascalCase for interfaces: `ProjectConfig`, `WorkspaceState`, `StoryState`, `ResolvedWorkspace`
- PascalCase for type aliases: `ShellType`, `RunOpts`, `GeneratePlanOpts`
- Use `type` for unions and type aliases; `interface` for object shapes
- Boolean fields prefixed with verb: `skipDefaults`, `is_error`, `passes` (tri-state: `true | false | "skipped"`)

## Code Style

**Formatting:**
- Prettier v3.8.1 with enforced formatting
- 80-character line length (printWidth: 80)
- Semicolons required (semi: true)
- Double quotes (singleQuote: false)
- Trailing commas in multi-line structures (trailingComma: "all")
- 2-space indentation (Prettier default)

**Linting:**
- ESLint v10.0.1 with typescript-eslint v8.56.1
- Strict type checking enabled (strict: true in tsconfig.json)
- ESLint config uses:
  - `@typescript-eslint/strict-type-checked` rules
  - `@typescript-eslint/stylistic-type-checked` rules
  - Custom rule: `@typescript-eslint/restrict-template-expressions` allowing numbers
- Git hook: `lint-staged` runs `prettier --write` and `eslint --fix` on staged `.ts` and `.tsx` files

**TypeScript:**
- Target: ES2022
- Module: ESNext
- Strict null checks: enabled
- Skip lib check: true (for faster compilation)

## Import Organization

**Order:**
1. Standard library imports: `import * as fs from "fs"`
2. External package imports: `import { Command } from "commander"`
3. Type imports from external: `import type { ToolAdapter } from "./adapters/types.js"`
4. Internal absolute imports: `import { loadProjectConfig } from "./config.js"`
5. Local relative imports: (rare, usually absolute with .js extensions)

**Path Aliases:**
- No path aliases configured; uses explicit relative/absolute paths
- Always use `.js` file extensions in import statements (ES modules)
- Organized by feature/module:
  - `./workspace.ts` for workspace lifecycle
  - `./config.ts` for config loading
  - `./prd/` subdirectory for PRD-specific logic (parser, tracker, context-builder)
  - `./stream/` subdirectory for streaming utilities
  - `./adapters/` for tool adapters
  - `./ui/` for UI components

## Error Handling

**Patterns:**
- Throw `Error` with descriptive messages: `throw new Error("Target directory does not exist: ...")`
- Catch specific error types when possible: `catch (err instanceof Error && err.name === "ExitPromptError")`
- Fallback catch-all: `catch (err) { ... err instanceof Error ? err.message : String(err) }`
- Sync operations use `try-catch` blocks; async use `await` with `try-catch`
- Errors in setup commands log warnings but don't abort: `catch { console.error(...) }` with continued execution
- Command line tools exit with `process.exit(1)` on unrecoverable errors
- Workspace operations throw early with clear context about what failed

**Examples:**
```typescript
try {
  const result = await runInit();
} catch (err) {
  if (err instanceof Error && err.name === "ExitPromptError") {
    console.log("\nInit cancelled.");
    return;
  }
  console.error(
    `[william] Error: ${err instanceof Error ? err.message : String(err)}`,
  );
  process.exit(1);
}
```

## Logging

**Framework:** console (no external logging library)

**Patterns:**
- User-facing messages: `console.log()` — neutral status or results
- Warnings: `console.warn()` — non-fatal issues like pending stories
- Errors: `console.error()` — fatal errors with `[william]` prefix
- Prefix format: `[william] Error:` or `[william] Warning:` for CLI context
- Setup command output logged: `console.log(\`[william] Running setup: ${cmd}\`)`
- No debug logs — debugging info removed or kept in comments

**Example:**
```typescript
console.log(`\nConfig created: ${configPath}`);
console.error(`[william] Error: ${message}`);
console.warn(`Warning: ${pending} stories still pending`);
```

## Comments

**When to Comment:**
- Complex regex patterns or algorithm logic: See `src/runner.ts` line 41-44 (extractCodebasePatterns)
- Non-obvious design decisions: "Branch may already exist — try without -b to reuse it"
- Section separators for large files: `// --- Inline stuck detection (replaces watchdog module) ---`
- Test fixture labels: `// Small PRD (< 10KB) with all optional sections populated`
- Explaining why something is stubbed or temporary: `// Stub for react-devtools-core (optional ink dependency, not needed at runtime)`

**What NOT to Comment:**
- Self-documenting code with clear names (avoid repeating variable names)
- Simple conditional branches
- Standard utility operations

**JSDoc/TSDoc:**
- Used selectively for exported public functions
- Documents purpose, not implementation details
- Example from `src/config.ts`:
  ```typescript
  /**
   * Load project config from `<dir>/.william/config.json`.
   * Returns parsed config or `null` if the file doesn't exist.
   * Invalid JSON logs a warning to stderr and returns `null`.
   */
  export function loadProjectConfig(dir: string): ProjectConfig | null
  ```
- Document parameters for exported interface types when constraints exist
- Not used for obvious functions or internal helpers

## Function Design

**Size:** Functions typically 20-60 lines; longer ones (100+) are typically runners with sequential steps marked by comments

**Parameters:**
- Named parameters using object destructuring for >2 params
- Example: `function runSetupCommands(targetDir: string, worktreeDir: string)`
- Options/config passed as typed objects: `interface GeneratePlanOpts { ... }`

**Return Values:**
- Explicit return type annotations on all exported functions
- Void for side-effect operations: `function stopWorkspace(workspaceName: string): void`
- Nullable returns for optional data: `loadProjectConfig(...): ProjectConfig | null`
- Tuple returns for paired data: used in `extractChainContext` returning `{ filesModified: ..., commandsRun: ... }`

**Error Boundary:**
- Higher-level functions (CLI commands) catch and handle errors
- Lower-level utilities throw and let caller decide

## Module Design

**Exports:**
- Named exports for functions and types
- Default exports avoided
- Each module exports one primary concern: `config.ts` exports `loadProjectConfig`, `ProjectConfig`
- Related utilities grouped: `prd/parser.ts`, `prd/tracker.ts`, `prd/context-builder.ts`

**Barrel Files:**
- Not used; imports are explicit to dependencies
- Encourages direct file imports: `import { parsePrd } from "./prd/parser.js"`

**Single Responsibility:**
- `workspace.ts`: workspace lifecycle (create, start, stop, resolve)
- `runner.ts`: agent execution loop
- `prd/parser.ts`: markdown parsing
- `stream/`: streaming protocol and parsing
- Clear separation between concerns

## Type Usage

**Strictness:**
- `strict: true` in tsconfig.json — no implicit any, must annotate all function parameters and returns
- Type narrowing with `instanceof` checks: `err instanceof Error`
- Discriminated unions for complex state: `passes: boolean | "skipped"` (tri-state story status)

**Type Imports:**
- Use `import type { ... }` for types never used at runtime
- Exported types live in `types.ts` or feature-specific `interfaces.ts` files
- Interface names match their usage context: `WorkspaceState`, `ProjectConfig`, `StreamSession`

---

*Convention analysis: 2026-03-03*
