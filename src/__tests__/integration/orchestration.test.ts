import { describe, it, expect, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import {
  createTestWorkspace,
  THREE_STORY_PRD,
  TWO_STORY_PRD,
  SINGLE_STORY_PRD,
  type TestWorkspaceResult,
} from "./helpers/create-test-workspace.js";
import {
  MockAdapter,
  type NdjsonFixtureConfig,
} from "./fixtures/mock-adapter.js";
import { runWorkspace } from "../../runner.js";
import { TuiEmitter } from "../../ui/events.js";
import type { TuiEvent } from "../../ui/events.js";
import { loadState } from "../../prd/tracker.js";

/**
 * Creates an NDJSON fixture config for a story that completes successfully.
 * Uses STORY_COMPLETE marker by default, or ALL_COMPLETE if specified.
 */
function storyCompleteFixture(
  marker: "STORY_COMPLETE" | "ALL_COMPLETE" = "STORY_COMPLETE",
): NdjsonFixtureConfig {
  return {
    messages: [
      { role: "system" },
      {
        role: "assistant",
        content: "Working on the story...",
        toolUse: [
          { id: "tu-1", name: "Read", input: { file_path: "/tmp/test.ts" } },
        ],
      },
      {
        role: "user",
        toolResult: [{ toolUseId: "tu-1", content: "file contents here" }],
      },
      {
        role: "assistant",
        content: "Implementing changes...",
        toolUse: [
          {
            id: "tu-2",
            name: "Write",
            input: { file_path: "/tmp/test.ts", content: "new content" },
          },
        ],
      },
      {
        role: "user",
        toolResult: [{ toolUseId: "tu-2", content: "File written." }],
      },
      {
        role: "assistant",
        content: `Done!\n<promise>${marker}</promise>`,
      },
    ],
    cost: 0.05,
    tokens: { input: 2000, output: 1000 },
    duration: 10000,
  };
}

describe("Orchestration: chain context is passed between stories", () => {
  let ws: TestWorkspaceResult;

  afterEach(() => {
    ws.cleanup();
  });

  /**
   * Creates a fixture for story-1 that includes Write and Bash tool_use blocks,
   * so extractChainContext() will capture files modified and commands run.
   */
  function storyWithToolsFixture(): NdjsonFixtureConfig {
    return {
      messages: [
        { role: "system" },
        {
          role: "assistant",
          content: "Reading the file first...",
          toolUse: [
            {
              id: "tu-r1",
              name: "Read",
              input: { file_path: "/tmp/project/src/utils.ts" },
            },
          ],
        },
        {
          role: "user",
          toolResult: [
            { toolUseId: "tu-r1", content: "export function hello() {}" },
          ],
        },
        {
          role: "assistant",
          content: "Writing the implementation...",
          toolUse: [
            {
              id: "tu-w1",
              name: "Write",
              input: {
                file_path: "/tmp/project/src/feature-a.ts",
                content: "export const featureA = true;",
              },
            },
          ],
        },
        {
          role: "user",
          toolResult: [{ toolUseId: "tu-w1", content: "File written." }],
        },
        {
          role: "assistant",
          content: "Running tests...",
          toolUse: [
            {
              id: "tu-b1",
              name: "Bash",
              input: { command: "pnpm test 2>&1" },
            },
          ],
        },
        {
          role: "user",
          toolResult: [{ toolUseId: "tu-b1", content: "All tests passed." }],
        },
        {
          role: "assistant",
          content: "Done!\n<promise>STORY_COMPLETE</promise>",
        },
      ],
      cost: 0.08,
      tokens: { input: 3000, output: 1500 },
      duration: 15000,
    };
  }

  it("story-2 prompt contains chain context from story-1", async () => {
    ws = createTestWorkspace({ prdText: THREE_STORY_PRD });

    const adapter = new MockAdapter([
      storyWithToolsFixture(),
      storyCompleteFixture("STORY_COMPLETE"),
      storyCompleteFixture("ALL_COMPLETE"),
    ]);

    const emitter = new TuiEmitter();

    await runWorkspace(
      "test-workspace",
      ws.workspaceDir,
      { adapter, sleepMs: 0, maxIterations: 10 },
      emitter,
    );

    const spawnCalls = adapter.getSpawnCalls();
    expect(spawnCalls).toHaveLength(3);

    // Story-2's prompt should contain chain context from story-1
    const story2Prompt = spawnCalls[1].prompt;
    expect(story2Prompt).toContain("Chain Context from US-001");
    expect(story2Prompt).toContain("/tmp/project/src/feature-a.ts");
    expect(story2Prompt).toContain("pnpm test 2>&1");
  });

  it("story-1 prompt does NOT contain chain context", async () => {
    ws = createTestWorkspace({ prdText: THREE_STORY_PRD });

    const adapter = new MockAdapter([
      storyWithToolsFixture(),
      storyCompleteFixture("STORY_COMPLETE"),
      storyCompleteFixture("ALL_COMPLETE"),
    ]);

    const emitter = new TuiEmitter();

    await runWorkspace(
      "test-workspace",
      ws.workspaceDir,
      { adapter, sleepMs: 0, maxIterations: 10 },
      emitter,
    );

    const spawnCalls = adapter.getSpawnCalls();

    // Story-1 is the first story — it should NOT have any chain context
    const story1Prompt = spawnCalls[0].prompt;
    expect(story1Prompt).not.toContain("Chain Context from");
  });

  it("story-3 prompt contains chain context from story-2 (not story-1)", async () => {
    ws = createTestWorkspace({ prdText: THREE_STORY_PRD });

    // Story-2 uses a distinct fixture with different files
    const story2Fixture: NdjsonFixtureConfig = {
      messages: [
        { role: "system" },
        {
          role: "assistant",
          content: "Editing feature B...",
          toolUse: [
            {
              id: "tu-e1",
              name: "Edit",
              input: {
                file_path: "/tmp/project/src/feature-b.ts",
                old_string: "old",
                new_string: "new",
              },
            },
          ],
        },
        {
          role: "user",
          toolResult: [{ toolUseId: "tu-e1", content: "File edited." }],
        },
        {
          role: "assistant",
          content: "Done!\n<promise>STORY_COMPLETE</promise>",
        },
      ],
      cost: 0.05,
      tokens: { input: 2000, output: 1000 },
      duration: 10000,
    };

    const adapter = new MockAdapter([
      storyWithToolsFixture(),
      story2Fixture,
      storyCompleteFixture("ALL_COMPLETE"),
    ]);

    const emitter = new TuiEmitter();

    await runWorkspace(
      "test-workspace",
      ws.workspaceDir,
      { adapter, sleepMs: 0, maxIterations: 10 },
      emitter,
    );

    const spawnCalls = adapter.getSpawnCalls();
    expect(spawnCalls).toHaveLength(3);

    // Story-3's prompt should contain chain context from story-2
    const story3Prompt = spawnCalls[2].prompt;
    expect(story3Prompt).toContain("Chain Context from US-002");
    expect(story3Prompt).toContain("/tmp/project/src/feature-b.ts");

    // Story-3 should NOT contain chain context from story-1
    // (only the most recent story's context is chained)
    expect(story3Prompt).not.toContain("Chain Context from US-001");
  });
});

describe("Orchestration: happy-path sequential story execution", () => {
  let ws: TestWorkspaceResult;

  afterEach(() => {
    ws.cleanup();
  });

  it("processes 3 stories sequentially with correct state transitions", async () => {
    ws = createTestWorkspace({ prdText: THREE_STORY_PRD });

    // Story 1 & 2 return STORY_COMPLETE, story 3 returns ALL_COMPLETE
    const adapter = new MockAdapter([
      storyCompleteFixture("STORY_COMPLETE"),
      storyCompleteFixture("STORY_COMPLETE"),
      storyCompleteFixture("ALL_COMPLETE"),
    ]);

    const emitter = new TuiEmitter();
    const events: TuiEvent[] = [];
    emitter.on("event", (evt: TuiEvent) => events.push(evt));

    await runWorkspace(
      "test-workspace",
      ws.workspaceDir,
      {
        adapter,
        sleepMs: 0,
        maxIterations: 10,
      },
      emitter,
    );

    // Verify MockAdapter was called exactly 3 times
    const spawnCalls = adapter.getSpawnCalls();
    expect(spawnCalls).toHaveLength(3);

    // Verify stories were processed in order by checking prompts contain the story IDs
    expect(spawnCalls[0].prompt).toContain("US-001");
    expect(spawnCalls[1].prompt).toContain("US-002");
    expect(spawnCalls[2].prompt).toContain("US-003");

    // Verify final state: all 3 stories marked complete
    const finalState = loadState(ws.statePath);
    expect(finalState.stories["US-001"].passes).toBe(true);
    expect(finalState.stories["US-002"].passes).toBe(true);
    expect(finalState.stories["US-003"].passes).toBe(true);

    // Verify completedAt timestamps exist
    expect(finalState.stories["US-001"].completedAt).toBeDefined();
    expect(finalState.stories["US-002"].completedAt).toBeDefined();
    expect(finalState.stories["US-003"].completedAt).toBeDefined();

    // Verify no fixtures left unconsumed
    expect(adapter.remainingFixtures()).toBe(0);

    // Verify story-start and story-complete events were emitted for each story
    const storyStartEvents = events.filter((e) => e.type === "story-start");
    const storyCompleteEvents = events.filter(
      (e) => e.type === "story-complete",
    );
    expect(storyStartEvents).toHaveLength(3);
    expect(storyCompleteEvents).toHaveLength(3);

    // Verify logs directory was created
    expect(fs.existsSync(`${ws.workspaceDir}/logs`)).toBe(true);
  });

  it("processes stories in the correct order US-001 → US-002 → US-003", async () => {
    ws = createTestWorkspace({ prdText: THREE_STORY_PRD });

    const adapter = new MockAdapter([
      storyCompleteFixture("STORY_COMPLETE"),
      storyCompleteFixture("STORY_COMPLETE"),
      storyCompleteFixture("ALL_COMPLETE"),
    ]);

    const emitter = new TuiEmitter();
    const storyOrder: string[] = [];
    emitter.on("event", (evt: TuiEvent) => {
      if (evt.type === "story-start") {
        storyOrder.push(evt.storyId);
      }
    });

    await runWorkspace(
      "test-workspace",
      ws.workspaceDir,
      {
        adapter,
        sleepMs: 0,
        maxIterations: 10,
      },
      emitter,
    );

    expect(storyOrder).toEqual(["US-001", "US-002", "US-003"]);
  });

  it("state transitions correctly: pending → running → done for each story", async () => {
    ws = createTestWorkspace({ prdText: THREE_STORY_PRD });

    // Verify initial state: all stories are pending (passes: false)
    const initialState = loadState(ws.statePath);
    expect(initialState.stories["US-001"].passes).toBe(false);
    expect(initialState.stories["US-002"].passes).toBe(false);
    expect(initialState.stories["US-003"].passes).toBe(false);

    const adapter = new MockAdapter([
      storyCompleteFixture("STORY_COMPLETE"),
      storyCompleteFixture("STORY_COMPLETE"),
      storyCompleteFixture("ALL_COMPLETE"),
    ]);

    const emitter = new TuiEmitter();

    await runWorkspace(
      "test-workspace",
      ws.workspaceDir,
      {
        adapter,
        sleepMs: 0,
        maxIterations: 10,
      },
      emitter,
    );

    // After the run, all stories should be done
    const finalState = loadState(ws.statePath);
    for (const id of ["US-001", "US-002", "US-003"]) {
      expect(finalState.stories[id].passes).toBe(true);
      expect(finalState.stories[id].completedAt).toBeTruthy();
    }
  });

  it("completedAt timestamps are in chronological order", async () => {
    ws = createTestWorkspace({ prdText: THREE_STORY_PRD });

    const adapter = new MockAdapter([
      storyCompleteFixture("STORY_COMPLETE"),
      storyCompleteFixture("STORY_COMPLETE"),
      storyCompleteFixture("ALL_COMPLETE"),
    ]);

    const emitter = new TuiEmitter();

    await runWorkspace(
      "test-workspace",
      ws.workspaceDir,
      {
        adapter,
        sleepMs: 0,
        maxIterations: 10,
      },
      emitter,
    );

    const finalState = loadState(ws.statePath);
    const c1 = finalState.stories["US-001"].completedAt;
    const c2 = finalState.stories["US-002"].completedAt;
    const c3 = finalState.stories["US-003"].completedAt;

    // Guard: all completedAt must be defined (verified in prior test, but needed for types)
    expect(c1).toBeDefined();
    expect(c2).toBeDefined();
    expect(c3).toBeDefined();

    if (c1 && c2 && c3) {
      const t1 = new Date(c1).getTime();
      const t2 = new Date(c2).getTime();
      const t3 = new Date(c3).getTime();

      expect(t1).toBeLessThanOrEqual(t2);
      expect(t2).toBeLessThanOrEqual(t3);
    }
  });

  it("all spawn calls use the workspace directory as cwd", async () => {
    ws = createTestWorkspace({ prdText: THREE_STORY_PRD });

    const adapter = new MockAdapter([
      storyCompleteFixture("STORY_COMPLETE"),
      storyCompleteFixture("STORY_COMPLETE"),
      storyCompleteFixture("ALL_COMPLETE"),
    ]);

    const emitter = new TuiEmitter();

    await runWorkspace(
      "test-workspace",
      ws.workspaceDir,
      {
        adapter,
        sleepMs: 0,
        maxIterations: 10,
      },
      emitter,
    );

    for (const call of adapter.getSpawnCalls()) {
      expect(call.opts.cwd).toBe(ws.workspaceDir);
    }
  });
});

/**
 * Creates a "stuck" NDJSON fixture where the same Read tool is called 12 times
 * with identical input, triggering tool loop detection (threshold is 10).
 * Does NOT include a STORY_COMPLETE marker.
 */
function stuckToolLoopFixture(): NdjsonFixtureConfig {
  const messages: NdjsonFixtureConfig["messages"] = [{ role: "system" }];

  for (let i = 0; i < 12; i++) {
    messages.push({
      role: "assistant",
      content: i === 0 ? "Let me check this file..." : undefined,
      toolUse: [
        {
          id: `tu-loop-${i}`,
          name: "Read",
          input: { file_path: "/tmp/test.ts" },
        },
      ],
    });
    messages.push({
      role: "user",
      toolResult: [{ toolUseId: `tu-loop-${i}`, content: "file contents" }],
    });
  }

  messages.push({
    role: "assistant",
    content: "I seem to be stuck.",
  });

  return {
    messages,
    cost: 0.05,
    tokens: { input: 2000, output: 1000 },
    duration: 10000,
  };
}

describe("Orchestration: error handling — adapter spawn failure and non-zero exit", () => {
  let ws: TestWorkspaceResult;

  afterEach(() => {
    ws.cleanup();
  });

  it("non-zero exit code increments attempts but does not mark story complete", async () => {
    ws = createTestWorkspace({ prdText: SINGLE_STORY_PRD });

    // Fixture: exits with code 1, has stderr output, no STORY_COMPLETE marker
    const errorFixture: NdjsonFixtureConfig = {
      messages: [
        { role: "system" },
        {
          role: "assistant",
          content: "Starting work on the story...",
        },
      ],
      exitCode: 1,
      stderrOutput: "Error: Claude process crashed unexpectedly\n",
      cost: 0.01,
      tokens: { input: 500, output: 100 },
      duration: 2000,
    };

    const adapter = new MockAdapter([errorFixture]);
    const emitter = new TuiEmitter();

    await runWorkspace(
      "test-workspace",
      ws.workspaceDir,
      { adapter, sleepMs: 0, maxIterations: 1 },
      emitter,
    );

    // Verify attempts incremented but story not complete
    const state = loadState(ws.statePath);
    expect(state.stories["US-001"].attempts).toBe(1);
    expect(state.stories["US-001"].passes).toBe(false);
    expect(state.stories["US-001"].completedAt).toBeUndefined();

    // Verify state.json is valid JSON (not corrupted)
    const rawState = fs.readFileSync(ws.statePath, "utf-8");
    expect(() => JSON.parse(rawState) as unknown).not.toThrow();
  });

  it("malformed stdout (non-JSON) is handled gracefully without corrupting state", async () => {
    ws = createTestWorkspace({ prdText: SINGLE_STORY_PRD });

    // Fixture: raw non-JSON data on stdout
    const malformedFixture: NdjsonFixtureConfig = {
      messages: [],
      rawStdout:
        "This is not JSON at all\nNeither is this line\nGarbage data\n",
      exitCode: 0,
      cost: 0,
      tokens: { input: 0, output: 0 },
      duration: 0,
    };

    const adapter = new MockAdapter([malformedFixture]);
    const emitter = new TuiEmitter();

    await runWorkspace(
      "test-workspace",
      ws.workspaceDir,
      { adapter, sleepMs: 0, maxIterations: 1 },
      emitter,
    );

    // Verify state is still valid and story not marked complete
    const state = loadState(ws.statePath);
    expect(state.stories["US-001"].attempts).toBe(1);
    expect(state.stories["US-001"].passes).toBe(false);

    // Verify state.json is valid JSON (not corrupted)
    const rawState = fs.readFileSync(ws.statePath, "utf-8");
    expect(() => JSON.parse(rawState) as unknown).not.toThrow();
  });

  it("runner continues to next iteration after non-zero exit", async () => {
    ws = createTestWorkspace({ prdText: SINGLE_STORY_PRD });

    // First call: error exit, second call: success
    const errorFixture: NdjsonFixtureConfig = {
      messages: [
        { role: "system" },
        { role: "assistant", content: "Crashing..." },
      ],
      exitCode: 1,
      stderrOutput: "Fatal error\n",
    };

    const adapter = new MockAdapter([
      errorFixture,
      storyCompleteFixture("ALL_COMPLETE"),
    ]);
    const emitter = new TuiEmitter();

    await runWorkspace(
      "test-workspace",
      ws.workspaceDir,
      { adapter, sleepMs: 0, maxIterations: 5 },
      emitter,
    );

    // Verify adapter was called twice (error + success)
    expect(adapter.getSpawnCalls()).toHaveLength(2);

    // Verify story eventually completed
    const state = loadState(ws.statePath);
    expect(state.stories["US-001"].passes).toBe(true);
  });

  it("runner continues to next iteration after malformed stdout", async () => {
    ws = createTestWorkspace({ prdText: SINGLE_STORY_PRD });

    const malformedFixture: NdjsonFixtureConfig = {
      messages: [],
      rawStdout: "NOT VALID JSON\n",
      exitCode: 0,
    };

    const adapter = new MockAdapter([
      malformedFixture,
      storyCompleteFixture("ALL_COMPLETE"),
    ]);
    const emitter = new TuiEmitter();

    await runWorkspace(
      "test-workspace",
      ws.workspaceDir,
      { adapter, sleepMs: 0, maxIterations: 5 },
      emitter,
    );

    // Verify adapter was called twice (malformed + success)
    expect(adapter.getSpawnCalls()).toHaveLength(2);

    // Verify story eventually completed
    const state = loadState(ws.statePath);
    expect(state.stories["US-001"].passes).toBe(true);
  });
});

describe("Orchestration: stuck detection triggers hint and pause", () => {
  let ws: TestWorkspaceResult;

  afterEach(() => {
    ws.cleanup();
  });

  it("tool loop detection writes .stuck-hint.md on first non-completing attempt", async () => {
    ws = createTestWorkspace({ prdText: SINGLE_STORY_PRD });

    // One stuck fixture + enough iterations to see the hint written
    const adapter = new MockAdapter([stuckToolLoopFixture()]);

    const emitter = new TuiEmitter();

    await runWorkspace(
      "test-workspace",
      ws.workspaceDir,
      {
        adapter,
        sleepMs: 0,
        maxIterations: 1,
      },
      emitter,
    );

    // Verify .stuck-hint.md was written
    const stuckHintPath = path.join(ws.workspaceDir, ".stuck-hint.md");
    expect(fs.existsSync(stuckHintPath)).toBe(true);

    const hintContent = fs.readFileSync(stuckHintPath, "utf-8");
    expect(hintContent).toContain("Stuck Hint for US-001");
    expect(hintContent).toContain("tool loop");

    // Verify attempts counter incremented to 1
    const state = loadState(ws.statePath);
    expect(state.stories["US-001"].attempts).toBe(1);
    expect(state.stories["US-001"].passes).toBe(false);
  });

  it("attempts counter increments on each non-completing iteration", async () => {
    ws = createTestWorkspace({ prdText: SINGLE_STORY_PRD });

    const adapter = new MockAdapter([
      stuckToolLoopFixture(),
      stuckToolLoopFixture(),
      stuckToolLoopFixture(),
    ]);

    const emitter = new TuiEmitter();

    await runWorkspace(
      "test-workspace",
      ws.workspaceDir,
      {
        adapter,
        sleepMs: 0,
        maxIterations: 3,
      },
      emitter,
    );

    const state = loadState(ws.statePath);
    expect(state.stories["US-001"].attempts).toBe(3);
  });

  it("pause triggers after reaching pause threshold (revision workspace)", async () => {
    ws = createTestWorkspace({ prdText: SINGLE_STORY_PRD });

    // Make this a revision workspace so skip is disabled and pauseThreshold=4
    const state = loadState(ws.statePath);
    state.parentWorkspace = ws.workspaceDir;
    fs.writeFileSync(ws.statePath, JSON.stringify(state, null, 2), "utf-8");

    // Need 4 iterations: hint written on iter 1 (tool loop), pause on iter 4
    const adapter = new MockAdapter([
      stuckToolLoopFixture(),
      stuckToolLoopFixture(),
      stuckToolLoopFixture(),
      stuckToolLoopFixture(),
    ]);

    const emitter = new TuiEmitter();

    await runWorkspace(
      "test-workspace",
      ws.workspaceDir,
      {
        adapter,
        sleepMs: 0,
        maxIterations: 10,
      },
      emitter,
    );

    // Verify .paused marker file was created
    const pausedPath = path.join(ws.workspaceDir, ".paused");
    expect(fs.existsSync(pausedPath)).toBe(true);

    const pausedContent = fs.readFileSync(pausedPath, "utf-8");
    expect(pausedContent).toContain("Paused");
    expect(pausedContent).toContain("US-001");

    // Verify .stuck-hint.md also exists
    const stuckHintPath = path.join(ws.workspaceDir, ".stuck-hint.md");
    expect(fs.existsSync(stuckHintPath)).toBe(true);

    // Verify runner exited — adapter was called 4 times (not 10)
    expect(adapter.getSpawnCalls()).toHaveLength(4);

    // Verify state: attempts = 4, story not completed
    const finalState = loadState(ws.statePath);
    expect(finalState.stories["US-001"].attempts).toBe(4);
    expect(finalState.stories["US-001"].passes).toBe(false);
  });

  it("stuck hint contains tool loop reason and session details", async () => {
    ws = createTestWorkspace({ prdText: SINGLE_STORY_PRD });

    const adapter = new MockAdapter([stuckToolLoopFixture()]);

    const emitter = new TuiEmitter();

    await runWorkspace(
      "test-workspace",
      ws.workspaceDir,
      {
        adapter,
        sleepMs: 0,
        maxIterations: 1,
      },
      emitter,
    );

    const stuckHintPath = path.join(ws.workspaceDir, ".stuck-hint.md");
    const hintContent = fs.readFileSync(stuckHintPath, "utf-8");

    // Verify hint structure
    expect(hintContent).toContain("# Stuck Hint for US-001");
    expect(hintContent).toContain("## Reason");
    expect(hintContent).toContain(
      "same tool called 10+ times with identical input",
    );
    expect(hintContent).toContain("## Session Stats");
    expect(hintContent).toContain("Tool uses:");
    expect(hintContent).toContain("## Suggestion");
  });
});

describe("Orchestration: story skip behavior", () => {
  let ws: TestWorkspaceResult;

  afterEach(() => {
    ws.cleanup();
  });

  it("story-1 is skipped after 5 stuck attempts and story-2 proceeds", async () => {
    ws = createTestWorkspace({ prdText: TWO_STORY_PRD });

    // 5 stuck fixtures for story-1 (triggers skip at attempts=5 with hint present)
    // then 1 success fixture for story-2
    const adapter = new MockAdapter([
      stuckToolLoopFixture(),
      stuckToolLoopFixture(),
      stuckToolLoopFixture(),
      stuckToolLoopFixture(),
      stuckToolLoopFixture(),
      storyCompleteFixture("ALL_COMPLETE"),
    ]);

    const emitter = new TuiEmitter();

    await runWorkspace(
      "test-workspace",
      ws.workspaceDir,
      { adapter, sleepMs: 0, maxIterations: 10 },
      emitter,
    );

    const state = loadState(ws.statePath);

    // Story-1 should be skipped with a reason
    expect(state.stories["US-001"].passes).toBe("skipped");
    expect(state.stories["US-001"].skipReason).toContain(
      "Skipped after 5 attempts",
    );
    expect(state.stories["US-001"].completedAt).toBeDefined();

    // Story-2 should have completed successfully
    expect(state.stories["US-002"].passes).toBe(true);
    expect(state.stories["US-002"].completedAt).toBeDefined();

    // Adapter should have been called 6 times (5 stuck + 1 success)
    expect(adapter.getSpawnCalls()).toHaveLength(6);
  });

  it("story-2 prompt shows story-1 as skipped in the story table", async () => {
    ws = createTestWorkspace({ prdText: TWO_STORY_PRD });

    const adapter = new MockAdapter([
      stuckToolLoopFixture(),
      stuckToolLoopFixture(),
      stuckToolLoopFixture(),
      stuckToolLoopFixture(),
      stuckToolLoopFixture(),
      storyCompleteFixture("ALL_COMPLETE"),
    ]);

    const emitter = new TuiEmitter();

    await runWorkspace(
      "test-workspace",
      ws.workspaceDir,
      { adapter, sleepMs: 0, maxIterations: 10 },
      emitter,
    );

    const spawnCalls = adapter.getSpawnCalls();

    // The last spawn call is for story-2 — its prompt should show story-1 as skipped
    const story2Prompt = spawnCalls[spawnCalls.length - 1].prompt;
    expect(story2Prompt).toContain("US-002");
    // Story-1 should appear with the skip marker (⊘) in the story table
    expect(story2Prompt).toContain("⊘ US-001");
  });

  it("skip is disabled for revision workspaces (pause instead)", async () => {
    ws = createTestWorkspace({ prdText: TWO_STORY_PRD });

    // Make this a revision workspace
    const state = loadState(ws.statePath);
    state.parentWorkspace = ws.workspaceDir;
    fs.writeFileSync(ws.statePath, JSON.stringify(state, null, 2), "utf-8");

    // For revision workspaces: pauseThreshold=4, skip disabled
    const adapter = new MockAdapter([
      stuckToolLoopFixture(),
      stuckToolLoopFixture(),
      stuckToolLoopFixture(),
      stuckToolLoopFixture(),
    ]);

    const emitter = new TuiEmitter();

    await runWorkspace(
      "test-workspace",
      ws.workspaceDir,
      { adapter, sleepMs: 0, maxIterations: 10 },
      emitter,
    );

    const finalState = loadState(ws.statePath);

    // Story-1 should NOT be skipped — should be paused instead
    expect(finalState.stories["US-001"].passes).toBe(false);
    expect(finalState.stories["US-001"].skipReason).toBeUndefined();

    // .paused marker should exist
    const pausedPath = path.join(ws.workspaceDir, ".paused");
    expect(fs.existsSync(pausedPath)).toBe(true);

    // Runner should have exited after 4 iterations (pause)
    expect(adapter.getSpawnCalls()).toHaveLength(4);
  });
});
