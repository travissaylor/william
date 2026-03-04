import { describe, it, expect, afterEach } from "vitest";
import * as fs from "fs";
import {
  createTestWorkspace,
  THREE_STORY_PRD,
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
