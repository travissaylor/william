import { describe, it, expect } from "vitest";
import { extractChainContext, formatChainContextForPrompt } from "./chain.js";
import type { StreamSession, StreamAssistantMessage } from "./types.js";

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

describe("extractChainContext", () => {
  it("extracts files modified from Write and Edit tool uses", () => {
    const session = makeSession({
      toolUses: [
        {
          type: "tool_use",
          id: "tu-1",
          name: "Write",
          input: { file_path: "/src/foo.ts" },
        },
        {
          type: "tool_use",
          id: "tu-2",
          name: "Edit",
          input: { file_path: "/src/bar.ts" },
        },
        {
          type: "tool_use",
          id: "tu-3",
          name: "Read",
          input: { file_path: "/src/baz.ts" },
        },
      ],
    });
    const ctx = extractChainContext(session);
    expect(ctx.filesModified).toEqual(["/src/foo.ts", "/src/bar.ts"]);
    expect(ctx.filesRead).toEqual(["/src/baz.ts"]);
  });

  it("deduplicates file paths", () => {
    const session = makeSession({
      toolUses: [
        {
          type: "tool_use",
          id: "tu-1",
          name: "Write",
          input: { file_path: "/src/foo.ts" },
        },
        {
          type: "tool_use",
          id: "tu-2",
          name: "Write",
          input: { file_path: "/src/foo.ts" },
        },
      ],
    });
    const ctx = extractChainContext(session);
    expect(ctx.filesModified).toEqual(["/src/foo.ts"]);
  });

  it("extracts commands from Bash tool uses", () => {
    const session = makeSession({
      toolUses: [
        {
          type: "tool_use",
          id: "tu-1",
          name: "Bash",
          input: { command: "pnpm test" },
        },
        {
          type: "tool_use",
          id: "tu-2",
          name: "Bash",
          input: { command: "pnpm typecheck" },
        },
      ],
    });
    const ctx = extractChainContext(session);
    expect(ctx.commandsRun).toEqual(["pnpm test", "pnpm typecheck"]);
  });

  it("extracts errors from tool results", () => {
    const session = makeSession({
      toolResults: [
        {
          type: "tool_result",
          tool_use_id: "tu-1",
          content: "Success",
          is_error: false,
        },
        {
          type: "tool_result",
          tool_use_id: "tu-2",
          content: "File not found",
          is_error: true,
        },
      ],
    });
    const ctx = extractChainContext(session);
    expect(ctx.errors).toHaveLength(1);
    expect(ctx.errors[0]).toContain("File not found");
  });

  it("extracts key decisions from assistant text blocks", () => {
    const assistantMsg: StreamAssistantMessage = {
      type: "assistant",
      message: {
        content: [
          { type: "text", text: "I will create the component first." },
          {
            type: "tool_use",
            id: "tu-1",
            name: "Write",
            input: { file_path: "/src/comp.ts" },
          },
        ],
      },
    };
    const session = makeSession({
      events: [assistantMsg],
      toolUses: [
        {
          type: "tool_use",
          id: "tu-1",
          name: "Write",
          input: { file_path: "/src/comp.ts" },
        },
      ],
    });
    const ctx = extractChainContext(session);
    expect(ctx.keyDecisions).toHaveLength(1);
    expect(ctx.keyDecisions[0]).toBe("I will create the component first.");
  });

  it("limits key decisions to last 5", () => {
    const events: StreamAssistantMessage[] = Array.from(
      { length: 10 },
      (_, i) => ({
        type: "assistant" as const,
        message: {
          content: [{ type: "text" as const, text: `Decision ${i}` }],
        },
      }),
    );
    const session = makeSession({ events });
    const ctx = extractChainContext(session);
    expect(ctx.keyDecisions).toHaveLength(5);
    expect(ctx.keyDecisions[0]).toBe("Decision 5");
    expect(ctx.keyDecisions[4]).toBe("Decision 9");
  });

  it("captures cost and token stats", () => {
    const session = makeSession({
      totalCostUsd: 0.15,
      inputTokens: 5000,
      outputTokens: 2000,
      durationMs: 30000,
    });
    const ctx = extractChainContext(session);
    expect(ctx.costUsd).toBe(0.15);
    expect(ctx.inputTokens).toBe(5000);
    expect(ctx.outputTokens).toBe(2000);
    expect(ctx.durationMs).toBe(30000);
  });
});

describe("formatChainContextForPrompt", () => {
  it("formats a complete chain context as markdown", () => {
    const ctx = {
      filesModified: ["/src/foo.ts", "/src/bar.ts"],
      filesRead: ["/src/baz.ts"],
      commandsRun: ["pnpm test"],
      errors: ["[tu-2] File not found"],
      keyDecisions: ["I will create the component first."],
      costUsd: 0.042,
      inputTokens: 1500,
      outputTokens: 800,
      durationMs: 12345,
    };
    const result = formatChainContextForPrompt(ctx, "US-001");
    expect(result).toContain("## Chain Context from US-001");
    expect(result).toContain("### Files Modified");
    expect(result).toContain("`/src/foo.ts`");
    expect(result).toContain("### Files Referenced");
    expect(result).toContain("### Commands Run");
    expect(result).toContain("`pnpm test`");
    expect(result).toContain("### Errors Encountered");
    expect(result).toContain("### Key Decisions");
    expect(result).toContain("### Session Stats");
    expect(result).toContain("$0.0420");
  });

  it("omits empty sections", () => {
    const ctx = {
      filesModified: [],
      filesRead: [],
      commandsRun: [],
      errors: [],
      keyDecisions: [],
      costUsd: 0,
      inputTokens: 0,
      outputTokens: 0,
      durationMs: 0,
    };
    const result = formatChainContextForPrompt(ctx, "US-002");
    expect(result).toContain("## Chain Context from US-002");
    expect(result).not.toContain("### Files Modified");
    expect(result).not.toContain("### Files Referenced");
    expect(result).not.toContain("### Commands Run");
    expect(result).not.toContain("### Errors Encountered");
    expect(result).not.toContain("### Key Decisions");
    expect(result).toContain("### Session Stats");
  });

  it("respects size limits on files", () => {
    const ctx = {
      filesModified: Array.from({ length: 20 }, (_, i) => `/src/file${i}.ts`),
      filesRead: [],
      commandsRun: [],
      errors: [],
      keyDecisions: [],
      costUsd: 0,
      inputTokens: 0,
      outputTokens: 0,
      durationMs: 0,
    };
    const result = formatChainContextForPrompt(ctx, "US-003");
    // Should only include first 15
    expect(result).toContain("file14.ts");
    expect(result).not.toContain("file15.ts");
  });
});
