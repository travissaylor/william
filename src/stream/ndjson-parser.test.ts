import { describe, it, expect, vi } from "vitest";
import { NdjsonParser } from "./ndjson-parser.js";
import type { StreamMessage } from "./types.js";

const SYSTEM_INIT = JSON.stringify({
  type: "system",
  subtype: "init",
  session_id: "sess-123",
  model: "claude-sonnet-4-20250514",
  tools: ["Read", "Write", "Bash"],
  cwd: "/tmp/project",
});

const ASSISTANT_TEXT = JSON.stringify({
  type: "assistant",
  message: {
    content: [{ type: "text", text: "Hello, I will help you." }],
  },
});

const ASSISTANT_TOOL_USE = JSON.stringify({
  type: "assistant",
  message: {
    content: [
      { type: "text", text: "Let me read that file." },
      {
        type: "tool_use",
        id: "tu-1",
        name: "Read",
        input: { file_path: "/tmp/foo.ts" },
      },
    ],
  },
});

const USER_TOOL_RESULT = JSON.stringify({
  type: "user",
  message: {
    content: [
      {
        type: "tool_result",
        tool_use_id: "tu-1",
        content: "file contents here",
      },
    ],
  },
});

const USER_TOOL_RESULT_ERROR = JSON.stringify({
  type: "user",
  message: {
    content: [
      {
        type: "tool_result",
        tool_use_id: "tu-2",
        content: "Permission denied",
        is_error: true,
      },
    ],
  },
});

const RESULT_SUCCESS = JSON.stringify({
  type: "result",
  subtype: "success",
  total_cost_usd: 0.042,
  usage: { input_tokens: 1500, output_tokens: 800 },
  duration_ms: 12345,
  num_turns: 5,
  result: "<promise>STORY_COMPLETE</promise>",
});

describe("NdjsonParser", () => {
  describe("single message parsing", () => {
    it("parses a system init message", () => {
      const parser = new NdjsonParser();
      parser.feed(SYSTEM_INIT + "\n");
      const session = parser.getSession();
      expect(session.events).toHaveLength(1);
      expect(session.events[0].type).toBe("system");
    });

    it("parses an assistant text message and accumulates fullText", () => {
      const parser = new NdjsonParser();
      parser.feed(ASSISTANT_TEXT + "\n");
      const session = parser.getSession();
      expect(session.fullText).toBe("Hello, I will help you.");
      expect(session.events).toHaveLength(1);
    });

    it("parses a result message and extracts cost/usage/duration", () => {
      const parser = new NdjsonParser();
      parser.feed(RESULT_SUCCESS + "\n");
      const session = parser.getSession();
      expect(session.totalCostUsd).toBe(0.042);
      expect(session.inputTokens).toBe(1500);
      expect(session.outputTokens).toBe(800);
      expect(session.durationMs).toBe(12345);
      expect(session.numTurns).toBe(5);
      expect(session.resultSubtype).toBe("success");
    });
  });

  describe("tool use and result extraction", () => {
    it("extracts tool_use blocks from assistant messages", () => {
      const parser = new NdjsonParser();
      parser.feed(ASSISTANT_TOOL_USE + "\n");
      const session = parser.getSession();
      expect(session.toolUses).toHaveLength(1);
      expect(session.toolUses[0].name).toBe("Read");
      expect(session.toolUses[0].id).toBe("tu-1");
      expect(session.fullText).toBe("Let me read that file.");
    });

    it("extracts tool_result blocks from user messages", () => {
      const parser = new NdjsonParser();
      parser.feed(USER_TOOL_RESULT + "\n");
      const session = parser.getSession();
      expect(session.toolResults).toHaveLength(1);
      expect(session.toolResults[0].tool_use_id).toBe("tu-1");
      expect(session.toolResults[0].is_error).toBeUndefined();
    });

    it("tracks error tool results", () => {
      const parser = new NdjsonParser();
      parser.feed(USER_TOOL_RESULT_ERROR + "\n");
      const session = parser.getSession();
      expect(session.toolResults).toHaveLength(1);
      expect(session.toolResults[0].is_error).toBe(true);
    });
  });

  describe("multi-line and chunked input", () => {
    it("parses multiple messages from a single chunk", () => {
      const parser = new NdjsonParser();
      const combined =
        [SYSTEM_INIT, ASSISTANT_TEXT, RESULT_SUCCESS].join("\n") + "\n";
      parser.feed(combined);
      const session = parser.getSession();
      expect(session.events).toHaveLength(3);
      expect(session.fullText).toBe("Hello, I will help you.");
      expect(session.totalCostUsd).toBe(0.042);
    });

    it("handles messages split across multiple chunks", () => {
      const parser = new NdjsonParser();
      const full = ASSISTANT_TEXT + "\n";
      // Split in the middle of the JSON
      const mid = Math.floor(full.length / 2);
      parser.feed(full.slice(0, mid));
      // At this point the incomplete line is buffered
      expect(parser.getSession().events).toHaveLength(0);
      parser.feed(full.slice(mid));
      expect(parser.getSession().events).toHaveLength(1);
      expect(parser.getSession().fullText).toBe("Hello, I will help you.");
    });

    it("accumulates text across multiple assistant messages", () => {
      const parser = new NdjsonParser();
      const msg1 = JSON.stringify({
        type: "assistant",
        message: { content: [{ type: "text", text: "First part. " }] },
      });
      const msg2 = JSON.stringify({
        type: "assistant",
        message: { content: [{ type: "text", text: "Second part." }] },
      });
      parser.feed(msg1 + "\n" + msg2 + "\n");
      expect(parser.getSession().fullText).toBe("First part. Second part.");
    });
  });

  describe("malformed JSON recovery", () => {
    it("skips malformed lines and emits parse-error", () => {
      const parser = new NdjsonParser();
      const errorHandler = vi.fn();
      parser.on("parse-error", errorHandler);

      parser.feed("not valid json\n" + ASSISTANT_TEXT + "\n");
      const session = parser.getSession();
      expect(session.events).toHaveLength(1);
      expect(session.fullText).toBe("Hello, I will help you.");
      expect(errorHandler).toHaveBeenCalledOnce();
      expect(errorHandler).toHaveBeenCalledWith("not valid json");
    });

    it("continues parsing after malformed line", () => {
      const parser = new NdjsonParser();
      parser.feed(SYSTEM_INIT + "\n{broken\n" + RESULT_SUCCESS + "\n");
      const session = parser.getSession();
      expect(session.events).toHaveLength(2);
      expect(session.events[0].type).toBe("system");
      expect(session.events[1].type).toBe("result");
    });
  });

  describe("flush", () => {
    it("processes remaining buffer content on flush", () => {
      const parser = new NdjsonParser();
      // Feed without trailing newline
      parser.feed(ASSISTANT_TEXT);
      expect(parser.getSession().events).toHaveLength(0);
      parser.flush();
      expect(parser.getSession().events).toHaveLength(1);
      expect(parser.getSession().fullText).toBe("Hello, I will help you.");
    });
  });

  describe("event emission", () => {
    it("emits message events for each parsed line", () => {
      const parser = new NdjsonParser();
      const handler = vi.fn();
      parser.on("message", handler);
      parser.feed(SYSTEM_INIT + "\n" + ASSISTANT_TEXT + "\n");
      expect(handler).toHaveBeenCalledTimes(2);
      expect((handler.mock.calls[0][0] as StreamMessage).type).toBe("system");
      expect((handler.mock.calls[1][0] as StreamMessage).type).toBe(
        "assistant",
      );
    });
  });

  describe("full session simulation", () => {
    it("builds a complete session from a realistic sequence", () => {
      const parser = new NdjsonParser();
      const lines = [
        SYSTEM_INIT,
        ASSISTANT_TOOL_USE,
        USER_TOOL_RESULT,
        ASSISTANT_TEXT,
        USER_TOOL_RESULT_ERROR,
        RESULT_SUCCESS,
      ];
      parser.feed(lines.join("\n") + "\n");
      const session = parser.getSession();
      expect(session.events).toHaveLength(6);
      expect(session.fullText).toBe(
        "Let me read that file.Hello, I will help you.",
      );
      expect(session.toolUses).toHaveLength(1);
      expect(session.toolResults).toHaveLength(2);
      expect(session.totalCostUsd).toBe(0.042);
      expect(session.numTurns).toBe(5);
      expect(session.resultSubtype).toBe("success");
    });
  });
});
