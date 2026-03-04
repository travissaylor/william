import { EventEmitter } from "events";
import { Readable } from "stream";
import type { ChildProcess } from "child_process";
import type { ToolAdapter, AdapterResult } from "../../../adapters/types.js";
import type {
  StreamMessage,
  StreamSystemMessage,
  StreamAssistantMessage,
  StreamUserMessage,
  StreamResultMessage,
} from "../../../stream/types.js";

/**
 * Configuration for a single NDJSON fixture sequence.
 */
export interface NdjsonFixtureConfig {
  messages: FixtureMessage[];
  cost?: number;
  tokens?: { input: number; output: number };
  duration?: number;
  resultSubtype?: StreamResultMessage["subtype"];
  exitCode?: number;
  stderrOutput?: string;
  /** If set, bypass buildNdjsonFixture and send this raw data on stdout. */
  rawStdout?: string;
}

export type FixtureMessage =
  | { role: "system"; sessionId?: string; model?: string; tools?: string[] }
  | {
      role: "assistant";
      content?: string;
      toolUse?: { id: string; name: string; input: Record<string, unknown> }[];
    }
  | {
      role: "user";
      toolResult?: {
        toolUseId: string;
        content: string;
        isError?: boolean;
      }[];
    };

/**
 * Builds a valid NDJSON byte stream (as a string) from a declarative config.
 * Each line is a JSON-serialized StreamMessage followed by a newline.
 */
export function buildNdjsonFixture(config: NdjsonFixtureConfig): string {
  const lines: string[] = [];

  for (const msg of config.messages) {
    let streamMsg: StreamMessage;

    switch (msg.role) {
      case "system":
        streamMsg = {
          type: "system",
          subtype: "init",
          session_id: msg.sessionId ?? "test-session-001",
          model: msg.model ?? "claude-sonnet-4-20250514",
          tools: msg.tools ?? ["Read", "Write", "Bash", "Edit", "Glob", "Grep"],
          cwd: "/tmp/test-project",
        } satisfies StreamSystemMessage;
        break;

      case "assistant": {
        const content: StreamAssistantMessage["message"]["content"] = [];
        if (msg.content) {
          content.push({ type: "text", text: msg.content });
        }
        if (msg.toolUse) {
          for (const tu of msg.toolUse) {
            content.push({
              type: "tool_use",
              id: tu.id,
              name: tu.name,
              input: tu.input,
            });
          }
        }
        streamMsg = {
          type: "assistant",
          message: { content },
        } satisfies StreamAssistantMessage;
        break;
      }

      case "user": {
        const content: StreamUserMessage["message"]["content"] = [];
        if (msg.toolResult) {
          for (const tr of msg.toolResult) {
            content.push({
              type: "tool_result",
              tool_use_id: tr.toolUseId,
              content: tr.content,
              is_error: tr.isError ?? false,
            });
          }
        }
        streamMsg = {
          type: "user",
          message: { content },
        } satisfies StreamUserMessage;
        break;
      }
    }

    lines.push(JSON.stringify(streamMsg));
  }

  // Always append a result message at the end
  const resultMsg: StreamResultMessage = {
    type: "result",
    subtype: config.resultSubtype ?? "success",
    total_cost_usd: config.cost ?? 0.01,
    usage: config.tokens
      ? {
          input_tokens: config.tokens.input,
          output_tokens: config.tokens.output,
        }
      : { input_tokens: 1000, output_tokens: 500 },
    duration_ms: config.duration ?? 5000,
    num_turns: config.messages.filter((m) => m.role === "assistant").length,
    result:
      config.messages
        .filter(
          (m): m is Extract<FixtureMessage, { role: "assistant" }> =>
            m.role === "assistant",
        )
        .map((m) => m.content ?? "")
        .join("") || "",
  };
  lines.push(JSON.stringify(resultMsg));

  return lines.join("\n") + "\n";
}

// noop function used for Readable stream stubs and ChildProcess method stubs
// eslint-disable-next-line @typescript-eslint/no-empty-function
function noop(): void {}

/**
 * Creates a fake ChildProcess whose stdout emits pre-configured NDJSON,
 * stderr is empty (or configured), and fires close with the given exit code.
 */
function createFakeChildProcess(
  ndjsonData: string,
  exitCode: number,
  stderrOutput?: string,
): ChildProcess {
  const proc = new EventEmitter() as ChildProcess & EventEmitter;

  const stdout = new Readable({ read: noop });
  const stderr = new Readable({ read: noop });

  // Assign as properties matching ChildProcess shape
  const p = proc as unknown as Record<string, unknown>;
  p.stdout = stdout;
  p.stderr = stderr;
  p.stdin = null;
  p.stdio = [null, stdout, stderr];
  p.pid = 99999;
  p.connected = false;
  p.exitCode = null;
  p.signalCode = null;
  p.killed = false;

  // Stub methods expected on ChildProcess
  p.kill = () => true;
  p.disconnect = noop;
  p.ref = () => proc;
  p.unref = () => proc;

  // Schedule data emission on next tick so event listeners can be set up first
  process.nextTick(() => {
    stdout.push(Buffer.from(ndjsonData, "utf-8"));
    stdout.push(null); // signal end of stream

    if (stderrOutput) {
      stderr.push(Buffer.from(stderrOutput, "utf-8"));
    }
    stderr.push(null);

    // Fire close event after streams end
    setImmediate(() => {
      p.exitCode = exitCode;
      proc.emit("close", exitCode, null);
    });
  });

  return proc;
}

/**
 * Mock ToolAdapter for integration tests.
 * Accepts a queue of fixture configs — each spawn() call dequeues the next one.
 */
export class MockAdapter implements ToolAdapter {
  name = "mock";
  private fixtureQueue: NdjsonFixtureConfig[];
  private spawnCalls: { prompt: string; opts: { cwd: string } }[] = [];

  constructor(fixtures: NdjsonFixtureConfig[]) {
    this.fixtureQueue = [...fixtures];
  }

  spawn(prompt: string, opts: { cwd: string }): ChildProcess {
    this.spawnCalls.push({ prompt, opts });

    const fixture = this.fixtureQueue.shift();
    if (!fixture) {
      throw new Error(
        "MockAdapter: no more fixtures in queue. " +
          `spawn() called ${this.spawnCalls.length} times but only had ${this.spawnCalls.length - 1} fixtures.`,
      );
    }

    const stdoutData = fixture.rawStdout ?? buildNdjsonFixture(fixture);
    return createFakeChildProcess(
      stdoutData,
      fixture.exitCode ?? 0,
      fixture.stderrOutput,
    );
  }

  parseOutput(output: string): AdapterResult {
    // Same logic as ClaudeAdapter.parseOutput()
    const allComplete = output.includes("<promise>ALL_COMPLETE</promise>");
    const storyComplete =
      allComplete || output.includes("<promise>STORY_COMPLETE</promise>");

    return {
      storyComplete,
      allComplete,
      rawOutput: output,
    };
  }

  /** Get all recorded spawn() calls for test assertions. */
  getSpawnCalls(): readonly { prompt: string; opts: { cwd: string } }[] {
    return this.spawnCalls;
  }

  /** Get number of remaining fixtures in the queue. */
  remainingFixtures(): number {
    return this.fixtureQueue.length;
  }
}
