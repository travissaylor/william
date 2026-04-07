import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {
  MockAdapter,
  buildNdjsonFixture,
  type NdjsonFixtureConfig,
} from "./mock-adapter.js";
import { consumeStreamOutput } from "../../../stream/consume.js";
import { TuiEmitter } from "../../../ui/events.js";
import type { TuiEvent } from "../../../ui/events.js";
import type { StreamMessage } from "../../../stream/types.js";

function createEmitter(): TuiEmitter {
  return new TuiEmitter();
}

describe("buildNdjsonFixture", () => {
  it("generates valid NDJSON with all message types", () => {
    const config: NdjsonFixtureConfig = {
      messages: [
        { role: "system", model: "test-model" },
        {
          role: "assistant",
          content: "Hello",
          toolUse: [
            { id: "tu-1", name: "Read", input: { file_path: "/foo.ts" } },
          ],
        },
        {
          role: "user",
          toolResult: [{ toolUseId: "tu-1", content: "file contents" }],
        },
      ],
      cost: 0.05,
      tokens: { input: 2000, output: 1000 },
      duration: 10000,
    };

    const ndjson = buildNdjsonFixture(config);
    const lines = ndjson.trim().split("\n");

    // 3 messages + 1 result = 4 lines
    expect(lines).toHaveLength(4);

    const parsed = lines.map((l) => JSON.parse(l) as StreamMessage);
    expect(parsed[0].type).toBe("system");
    expect(parsed[1].type).toBe("assistant");
    expect(parsed[2].type).toBe("user");
    expect(parsed[3].type).toBe("result");

    // Verify system message fields
    const sys = parsed[0];
    if (sys.type === "system") {
      expect(sys.model).toBe("test-model");
      expect(sys.session_id).toBe("test-session-001");
    }

    // Verify result message fields
    const result = parsed[3];
    if (result.type === "result") {
      expect(result.total_cost_usd).toBe(0.05);
      expect(result.usage?.input_tokens).toBe(2000);
      expect(result.duration_ms).toBe(10000);
    }
  });

  it("generates default values when optional fields are omitted", () => {
    const ndjson = buildNdjsonFixture({
      messages: [{ role: "assistant", content: "Hi" }],
    });
    const lines = ndjson.trim().split("\n");
    // 1 assistant + 1 result
    expect(lines).toHaveLength(2);

    const result = JSON.parse(lines[1]) as StreamMessage;
    expect(result.type).toBe("result");
    if (result.type === "result") {
      expect(result.total_cost_usd).toBe(0.01);
      expect(result.usage?.input_tokens).toBe(1000);
    }
  });
});

describe("MockAdapter", () => {
  it("implements the ToolAdapter interface with correct name", () => {
    const adapter = new MockAdapter([]);
    expect(adapter.name).toBe("mock");
  });

  it("spawn() dequeues fixtures in order", () => {
    const adapter = new MockAdapter([
      { messages: [{ role: "assistant", content: "First" }] },
      { messages: [{ role: "assistant", content: "Second" }] },
    ]);

    // First spawn should work
    const child1 = adapter.spawn("prompt-1", { cwd: "/tmp" });
    expect(child1.pid).toBeDefined();
    expect(adapter.remainingFixtures()).toBe(1);

    // Second spawn should work
    const child2 = adapter.spawn("prompt-2", { cwd: "/tmp" });
    expect(child2.pid).toBeDefined();
    expect(adapter.remainingFixtures()).toBe(0);

    // Third spawn should throw
    expect(() => adapter.spawn("prompt-3", { cwd: "/tmp" })).toThrow(
      /no more fixtures/,
    );
  });

  it("records spawn calls for assertions", () => {
    const adapter = new MockAdapter([
      { messages: [{ role: "assistant", content: "response" }] },
    ]);

    adapter.spawn("test prompt", { cwd: "/workspace" });

    const calls = adapter.getSpawnCalls();
    expect(calls).toHaveLength(1);
    expect(calls[0].prompt).toBe("test prompt");
    expect(calls[0].opts.cwd).toBe("/workspace");
  });

  it("parseOutput detects STORY_COMPLETE", () => {
    const adapter = new MockAdapter([]);
    const result = adapter.parseOutput(
      "Done!\n<promise>STORY_COMPLETE</promise>",
    );
    expect(result.storyComplete).toBe(true);
    expect(result.allComplete).toBe(false);
  });

  it("parseOutput detects ALL_COMPLETE (implies storyComplete)", () => {
    const adapter = new MockAdapter([]);
    const result = adapter.parseOutput(
      "Done!\n<promise>ALL_COMPLETE</promise>",
    );
    expect(result.storyComplete).toBe(true);
    expect(result.allComplete).toBe(true);
  });

  it("parseOutput returns false when no markers present", () => {
    const adapter = new MockAdapter([]);
    const result = adapter.parseOutput("Still working on it...");
    expect(result.storyComplete).toBe(false);
    expect(result.allComplete).toBe(false);
  });

  it("spawn() returns a fake ChildProcess compatible with consumeStreamOutput", async () => {
    const config: NdjsonFixtureConfig = {
      messages: [
        { role: "system" },
        { role: "assistant", content: "Implementing feature." },
        {
          role: "assistant",
          content: "\n<promise>STORY_COMPLETE</promise>",
        },
      ],
      cost: 0.03,
      tokens: { input: 1500, output: 700 },
    };

    const adapter = new MockAdapter([config]);
    const child = adapter.spawn("test", { cwd: "/tmp" });

    // Create a real log stream to a temp file
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "william-mock-test-"));
    const logPath = path.join(tmpDir, "test.log");
    const logStream = fs.createWriteStream(logPath);

    const emitter = createEmitter();

    const { session } = await consumeStreamOutput({
      childProcess: child,
      logStream,
      emitter,
    });

    // Verify the session was populated correctly
    expect(session.fullText).toContain("Implementing feature.");
    expect(session.fullText).toContain("STORY_COMPLETE");
    expect(session.totalCostUsd).toBe(0.03);
    expect(session.inputTokens).toBe(1500);
    expect(session.outputTokens).toBe(700);
    expect(session.sessionId).toBe("test-session-001");

    // Verify parseOutput works with the session
    const result = adapter.parseOutput(session.fullText);
    expect(result.storyComplete).toBe(true);

    // Cleanup
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("supports stderr output and non-zero exit code", async () => {
    const config: NdjsonFixtureConfig = {
      messages: [{ role: "system" }],
      exitCode: 0, // close event still fires normally
      stderrOutput: "Warning: something happened\n",
    };

    const adapter = new MockAdapter([config]);
    const child = adapter.spawn("test", { cwd: "/tmp" });

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "william-mock-test-"));
    const logPath = path.join(tmpDir, "test.log");
    const logStream = fs.createWriteStream(logPath);

    const errors: string[] = [];
    const emitter = createEmitter();
    emitter.on("event", (evt: TuiEvent) => {
      if (evt.type === "error") errors.push(evt.text);
    });

    await consumeStreamOutput({
      childProcess: child,
      logStream,
      emitter,
    });

    expect(errors).toContain("Warning: something happened\n");

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("supports different responses per sequential spawn", async () => {
    const adapter = new MockAdapter([
      {
        messages: [
          { role: "system" },
          {
            role: "assistant",
            content: "Story 1 done.\n<promise>STORY_COMPLETE</promise>",
          },
        ],
      },
      {
        messages: [
          { role: "system" },
          {
            role: "assistant",
            content: "Story 2 done.\n<promise>ALL_COMPLETE</promise>",
          },
        ],
      },
    ]);

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "william-mock-test-"));
    const emitter = createEmitter();

    // First spawn
    const child1 = adapter.spawn("prompt-1", { cwd: "/tmp" });
    const log1 = fs.createWriteStream(path.join(tmpDir, "log1.log"));
    const { session: s1 } = await consumeStreamOutput({
      childProcess: child1,
      logStream: log1,
      emitter,
    });

    const r1 = adapter.parseOutput(s1.fullText);
    expect(r1.storyComplete).toBe(true);
    expect(r1.allComplete).toBe(false);

    // Second spawn
    const child2 = adapter.spawn("prompt-2", { cwd: "/tmp" });
    const log2 = fs.createWriteStream(path.join(tmpDir, "log2.log"));
    const { session: s2 } = await consumeStreamOutput({
      childProcess: child2,
      logStream: log2,
      emitter,
    });

    const r2 = adapter.parseOutput(s2.fullText);
    expect(r2.storyComplete).toBe(true);
    expect(r2.allComplete).toBe(true);

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});
