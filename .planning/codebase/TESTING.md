# Testing Patterns

**Analysis Date:** 2026-03-03

## Test Framework

**Runner:**
- Vitest v2 (latest)
- Config: `vitest` config embedded in `package.json` (no separate vitest.config.ts in root)
- Fast unit test execution with ESM support

**Assertion Library:**
- Vitest built-in expect() assertions (Chai-compatible API)

**Run Commands:**
```bash
pnpm test              # Run all tests once
pnpm test:watch       # Run tests in watch mode
```

**Coverage:**
- No coverage enforcement configured
- Coverage viewing: Not explicitly configured in package.json

## Test File Organization

**Location:**
- Co-located with source: test files live in `src/` alongside implementation
- Subdirectories mirror implementation structure: `src/prd/parser.test.ts` tests `src/prd/parser.ts`

**Naming:**
- `.test.ts` suffix for TypeScript tests: `init.test.ts`, `workspace-setup.test.ts`
- `.test.tsx` suffix for React component tests (if any): None currently in codebase
- Match the name of tested file: `prd-prompt.test.ts` tests `prd-prompt.ts`

**Structure:**
```
src/
├── config.ts
├── init.ts
├── init.test.ts          # Co-located test
├── prd/
│   ├── parser.ts
│   ├── parser.test.ts
│   ├── context-builder.ts
│   └── context-builder.test.ts
├── stream/
│   ├── chain.ts
│   ├── chain.test.ts
│   ├── ndjson-parser.ts
│   └── ndjson-parser.test.ts
```

## Test Structure

**Suite Organization:**
```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("feature/module name", () => {
  // Setup
  beforeEach(() => {
    // Create temp directories, reset mocks
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "william-test-"));
  });

  afterEach(() => {
    // Cleanup temp files, restore mocks
    fs.rmSync(tmpDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  describe("nested suite for related tests", () => {
    it("should do X when Y", () => {
      // Arrange
      const input = ...;

      // Act
      const result = functionUnderTest(input);

      // Assert
      expect(result).toBe(expected);
    });
  });
});
```

**Patterns:**
- Test files import from tested module using explicit path: `import { runInit } from "./init.js"`
- Setup in `beforeEach()` for per-test isolation: new temp dirs, mock resets
- Teardown in `afterEach()` for cleanup: remove temp files, restore mocks
- Describe blocks for grouping related tests: "does nothing when config missing", "creates config with defaults"
- Test names use "should" pattern: "should create .william/config.json with all fields"

**Example Structure from `src/init.test.ts`:**
```typescript
describe("runInit", () => {
  let tmpDir: string;
  let originalCwd: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "william-init-test-"));
    originalCwd = process.cwd();
    process.chdir(tmpDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tmpDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it("creates .william/config.json with all fields", async () => {
    mockInput
      .mockResolvedValueOnce("my-project")
      .mockResolvedValueOnce("feature/")
      .mockResolvedValueOnce("docs/prds");
    mockEditor.mockResolvedValueOnce("cp .env.example .env\npnpm db:seed\n");
    mockConfirm.mockResolvedValueOnce(false);

    await runInit();

    const configPath = path.join(tmpDir, ".william", "config.json");
    expect(fs.existsSync(configPath)).toBe(true);
    const config = readConfig(configPath);
    expect(config).toEqual({
      projectName: "my-project",
      branchPrefix: "feature/",
      prdOutput: "docs/prds",
      setupCommands: ["cp .env.example .env", "pnpm db:seed"],
    });
  });
});
```

## Mocking

**Framework:** Vitest's native mocking with `vi` module

**Patterns:**
```typescript
// Module mocking
vi.mock("@inquirer/prompts", () => ({
  input: vi.fn(),
  confirm: vi.fn(),
  editor: vi.fn(),
}));

// Import mocked module
import { input, confirm, editor } from "@inquirer/prompts";

// Create typed references to mocks
const mockInput = vi.mocked(input);
const mockConfirm = vi.mocked(confirm);
const mockEditor = vi.mocked(editor);

// Chain mock returns for sequential calls
mockInput
  .mockResolvedValueOnce("my-project")
  .mockResolvedValueOnce("feature/")
  .mockResolvedValueOnce("docs/prds");

// Verify calls
expect(spawnSyncMock).toHaveBeenCalledTimes(2);
expect(spawnSyncMock).not.toHaveBeenCalled();
```

**Example from `src/workspace-setup.test.ts`:**
```typescript
vi.mock("child_process", async () => {
  const actual = await vi.importActual<typeof import("child_process")>(
    "child_process",
  );
  return { ...actual, spawnSync: vi.fn() };
});

const spawnSyncMock = vi.mocked(childProcess.spawnSync);

beforeEach(() => {
  spawnSyncMock.mockReset();
  spawnSyncMock.mockReturnValue({
    status: 0,
    signal: null,
    output: [],
    pid: 0,
    stdout: Buffer.from(""),
    stderr: Buffer.from(""),
  });
});
```

**What to Mock:**
- External I/O: filesystem operations (when testing logic not actual file creation) — but see below
- User input prompts: `@inquirer/prompts` (input, confirm, editor)
- Child processes: `child_process` for spawn/exec calls
- Network APIs: adapters for external services

**What NOT to Mock:**
- Filesystem operations when testing actual file creation/reading workflows (use temp dirs instead)
- JSON parsing/serialization (test real behavior)
- Internal utility functions (call them directly)
- Path operations (test with real paths in temp dirs)

## Fixtures and Factories

**Test Data:**
- Inline constants for simple data: `const SYSTEM_INIT = JSON.stringify({ ... })`
- Helper functions to create test objects:

```typescript
function makeSession(overrides: Partial<StreamSession> = {}): StreamSession {
  return {
    events: [],
    fullText: "",
    toolUses: [],
    toolResults: [],
    totalCostUsd: 0,
    inputTokens: 0,
    outputTokens: 0,
    durationMs: 0,
    numTurns: 0,
    resultSubtype: null,
    sessionId: null,
    ...overrides,
  };
}
```

- Factory pattern for reusable test data: `function readConfig(filePath: string): ProjectConfig`
- Labeled test data in comments explaining intent: `// Small PRD (< 10KB) with all optional sections populated`

**Location:**
- Fixtures defined at top of test file, before describe blocks
- Helpers defined within test file (not in separate fixture files)
- Test constants (`SYSTEM_INIT`, `ASSISTANT_TEXT`) as module-level constants
- Temp directories created fresh in `beforeEach()` for isolation

## Test Types

**Unit Tests:**
- Scope: Individual functions and modules in isolation
- Approach: Mock external dependencies; test pure logic
- Examples: `config.test.ts`, `prd-prompt.test.ts`, `stream/chain.test.ts`
- Assert: Return values, side effects on files, mock call counts

**Integration Tests:**
- Scope: Multiple modules working together (e.g., workspace setup)
- Approach: Use real temp directories; mock only external I/O (child process)
- Examples: `init.test.ts`, `workspace-setup.test.ts`
- Assert: Files created correctly, config written, commands executed in sequence

**E2E Tests:**
- Framework: Not implemented
- The CLI's `william start` command is tested manually (interactive)

## Common Patterns

**Async Testing:**
```typescript
// Test async functions with await
it("creates config when user confirms", async () => {
  mockInput.mockResolvedValueOnce("my-project");

  await runInit();

  expect(fs.existsSync(configPath)).toBe(true);
});

// Chain mock resolvedValues for sequential calls
mockInput
  .mockResolvedValueOnce("value1")
  .mockResolvedValueOnce("value2");
```

**Error Testing:**
```typescript
// Test error conditions by checking for thrown errors or error states
it("warns when config already exists", async () => {
  fs.writeFileSync(configPath, JSON.stringify({ projectName: "old" }));

  mockConfirm.mockResolvedValueOnce(false); // User declines overwrite

  await runInit();

  const config = readConfig(configPath);
  expect(config.projectName).toBe("old"); // Config unchanged
});

// Test error messages
it("throws with clear message when file not found", () => {
  expect(() => {
    resolveWorkspace("nonexistent");
  }).toThrow("not found");
});
```

**Mocking Prompts in Sequence:**
```typescript
// Multiple inputs in one test
mockInput
  .mockResolvedValueOnce("my-project")  // First call
  .mockResolvedValueOnce("")             // Second call
  .mockResolvedValueOnce(".william/prds"); // Third call

mockConfirm.mockResolvedValueOnce(true);  // Single confirm call
mockEditor.mockResolvedValueOnce("cmd1\ncmd2\n"); // Editor content

await runInit();

// Verify all mocks used appropriately
expect(mockInput).toHaveBeenCalledTimes(3);
```

**Filesystem Testing:**
```typescript
// Create temp dir for each test
beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "test-"));
  process.chdir(tmpDir);
});

// Test file creation
it("creates .gitignore", async () => {
  await runInit();
  const gitignore = fs.readFileSync(path.join(tmpDir, ".gitignore"), "utf-8");
  expect(gitignore).toContain(".william/");
});

// Test edge cases
it("does not duplicate entries", async () => {
  fs.writeFileSync(path.join(tmpDir, ".gitignore"), ".william/\n");
  await runInit();
  const count = (fs.readFileSync(...).match(/\.william\//g) ?? []).length;
  expect(count).toBe(1);
});

afterEach(() => {
  process.chdir(originalCwd);
  fs.rmSync(tmpDir, { recursive: true, force: true });
});
```

## Test Data Size Management

**For Large Data Tests:**
- Comment describes test data size and structure: `// Large PRD (> 10KB): selective injection based on parsed sections`
- Use inline JSON for readability when small; refactor to functions if repetitive
- Example from `src/stream/ndjson-parser.test.ts`:
  ```typescript
  const SYSTEM_INIT = JSON.stringify({
    type: "system",
    subtype: "init",
    session_id: "sess-123",
    model: "claude-sonnet-4-20250514",
    tools: ["Read", "Write", "Bash"],
    cwd: "/tmp/project",
  });
  ```

---

*Testing analysis: 2026-03-03*
