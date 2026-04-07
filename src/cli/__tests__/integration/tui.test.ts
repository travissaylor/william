import { describe, it, expect, afterEach } from "vitest";
import React from "react";
import { render, cleanup } from "ink-testing-library";
import { App } from "../../ui/App.js";
import { Dashboard } from "../../ui/Dashboard.js";
import { LogArea } from "../../ui/LogArea.js";
import type { LogEntry } from "../../ui/LogArea.js";
import { StoryBanner } from "../../ui/StoryBanner.js";
import { TuiEmitter } from "../../ui/events.js";
import type { TuiEvent, DashboardData } from "../../ui/events.js";
import type { WorkspaceState } from "../../../lib/types.js";

afterEach(() => {
  cleanup();
});

function makeState(overrides?: Partial<WorkspaceState>): WorkspaceState {
  return {
    workspace: "test-ws",
    project: "test-project",
    targetDir: "/tmp/test",
    branchName: "test-branch",
    sourceFile: "prd.md",
    stories: {
      "US-001": {
        title: "First story",
        passes: false,
        attempts: 0,
        costUsd: 0,
        inputTokens: 0,
        outputTokens: 0,
      },
      "US-002": {
        title: "Second story",
        passes: false,
        attempts: 0,
        costUsd: 0,
        inputTokens: 0,
        outputTokens: 0,
      },
    } as WorkspaceState["stories"],
    currentStory: "US-001",
    startedAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeDashboard(overrides?: Partial<DashboardData>): DashboardData {
  return {
    workspaceName: "test-ws",
    storyId: "US-001",
    storyTitle: "First story",
    iteration: 0,
    maxIterations: 10,
    storiesCompleted: 0,
    storiesTotal: 2,
    storiesSkipped: 0,
    cumulativeCostUsd: 0,
    cumulativeInputTokens: 0,
    cumulativeOutputTokens: 0,
    storyAttempts: 0,
    stuckStatus: "normal",
    filesModified: 0,
    ...overrides,
  };
}

function getFrame(instance: ReturnType<typeof render>): string {
  return instance.lastFrame() ?? "";
}

describe("TUI event rendering", () => {
  describe("App initial render", () => {
    it("renders the workspace name and initial dashboard", () => {
      const emitter = new TuiEmitter();
      const instance = render(
        React.createElement(App, {
          emitter,
          workspaceName: "test-ws",
          initialState: makeState(),
          maxIterations: 10,
        }),
      );

      const output = getFrame(instance);
      expect(output).toContain("test-ws");
      expect(output).toContain("US-001");
      expect(output).toContain("Iter");
      expect(output).toContain("0/10");
      expect(output).toContain("0/2");
    });
  });

  describe("TuiEmitter event emission", () => {
    it("emits storyStart event with correct payload", () => {
      const emitter = new TuiEmitter();
      const events: TuiEvent[] = [];
      emitter.on("event", (e: TuiEvent) => events.push(e));

      emitter.storyStart("US-001", "First story");

      expect(events).toHaveLength(1);
      expect(events[0]).toEqual({
        type: "story-start",
        storyId: "US-001",
        storyTitle: "First story",
      });
    });

    it("emits assistantText event with correct payload", () => {
      const emitter = new TuiEmitter();
      const events: TuiEvent[] = [];
      emitter.on("event", (e: TuiEvent) => events.push(e));

      emitter.assistantText("Working on...");

      expect(events).toHaveLength(1);
      expect(events[0]).toEqual({
        type: "assistant-text",
        text: "Working on...",
      });
    });

    it("emits toolCall event with correct payload", () => {
      const emitter = new TuiEmitter();
      const events: TuiEvent[] = [];
      emitter.on("event", (e: TuiEvent) => events.push(e));

      emitter.toolCall("Write", "src/foo.ts");

      expect(events).toHaveLength(1);
      expect(events[0]).toEqual({
        type: "tool-call",
        toolName: "Write",
        toolInput: "src/foo.ts",
      });
    });

    it("emits storyComplete event with correct payload", () => {
      const emitter = new TuiEmitter();
      const events: TuiEvent[] = [];
      emitter.on("event", (e: TuiEvent) => events.push(e));

      emitter.storyComplete("US-001", "First story");

      expect(events).toHaveLength(1);
      expect(events[0]).toEqual({
        type: "story-complete",
        storyId: "US-001",
        storyTitle: "First story",
      });
    });

    it("emits dashboardUpdate event with correct payload", () => {
      const emitter = new TuiEmitter();
      const events: TuiEvent[] = [];
      emitter.on("event", (e: TuiEvent) => events.push(e));

      const data = makeDashboard({
        storiesCompleted: 1,
        cumulativeCostUsd: 1.5,
      });
      emitter.dashboardUpdate(data);

      expect(events).toHaveLength(1);
      expect(events[0]).toEqual({ type: "dashboard-update", data });
    });

    it("emits a full sequence of events in order", () => {
      const emitter = new TuiEmitter();
      const events: TuiEvent[] = [];
      emitter.on("event", (e: TuiEvent) => events.push(e));

      emitter.storyStart("US-001", "First story");
      emitter.assistantText("Working on...");
      emitter.toolCall("Write", "src/foo.ts");
      emitter.storyComplete("US-001", "First story");
      emitter.dashboardUpdate(
        makeDashboard({ storiesCompleted: 1, cumulativeCostUsd: 0.5 }),
      );

      expect(events).toHaveLength(5);
      expect(events.map((e) => e.type)).toEqual([
        "story-start",
        "assistant-text",
        "tool-call",
        "story-complete",
        "dashboard-update",
      ]);
    });

    it("emits storySkipped event", () => {
      const emitter = new TuiEmitter();
      const events: TuiEvent[] = [];
      emitter.on("event", (e: TuiEvent) => events.push(e));

      emitter.storySkipped("US-001", "First story");

      expect(events[0]).toEqual({
        type: "story-skipped",
        storyId: "US-001",
        storyTitle: "First story",
      });
    });

    it("emits error, system, thinking, and result events", () => {
      const emitter = new TuiEmitter();
      const events: TuiEvent[] = [];
      emitter.on("event", (e: TuiEvent) => events.push(e));

      emitter.error("Something went wrong");
      emitter.system("Initializing...");
      emitter.thinkingStart();
      emitter.thinkingStop();
      emitter.result(0.5, 10000, 5000, 3000);

      expect(events).toHaveLength(5);
      expect(events[0]).toEqual({
        type: "error",
        text: "Something went wrong",
      });
      expect(events[1]).toEqual({ type: "system", text: "Initializing..." });
      expect(events[2]).toEqual({ type: "thinking", isThinking: true });
      expect(events[3]).toEqual({ type: "thinking", isThinking: false });
      expect(events[4]).toEqual({
        type: "result",
        totalCostUsd: 0.5,
        inputTokens: 10000,
        outputTokens: 5000,
        durationMs: 3000,
      });
    });
  });

  describe("Dashboard component rendering", () => {
    it("renders workspace name and story info", () => {
      const instance = render(
        React.createElement(Dashboard, {
          data: makeDashboard(),
          startTime: Date.now(),
        }),
      );

      const output = getFrame(instance);
      expect(output).toContain("test-ws");
      expect(output).toContain("US-001");
      expect(output).toContain("Iter");
      expect(output).toContain("0/10");
    });

    it("renders cost and token metrics", () => {
      const instance = render(
        React.createElement(Dashboard, {
          data: makeDashboard({
            cumulativeCostUsd: 1.5,
            cumulativeInputTokens: 50000,
            cumulativeOutputTokens: 10000,
          }),
          startTime: Date.now(),
        }),
      );

      const output = getFrame(instance);
      expect(output).toContain("$1.50");
      // 50000+10000 = 60000 => 60.0K
      expect(output).toContain("60.0K");
    });

    it("renders progress bar with completed stories", () => {
      const instance = render(
        React.createElement(Dashboard, {
          data: makeDashboard({ storiesCompleted: 1, storiesTotal: 3 }),
          startTime: Date.now(),
        }),
      );

      const output = getFrame(instance);
      expect(output).toContain("1/3");
    });

    it("renders stuck status as normal", () => {
      const instance = render(
        React.createElement(Dashboard, {
          data: makeDashboard({ stuckStatus: "normal" }),
          startTime: Date.now(),
        }),
      );

      const output = getFrame(instance);
      expect(output).toContain("normal");
    });

    it("renders stuck status as hint-written", () => {
      const instance = render(
        React.createElement(Dashboard, {
          data: makeDashboard({ stuckStatus: "hint-written" }),
          startTime: Date.now(),
        }),
      );

      const output = getFrame(instance);
      expect(output).toContain("hint written");
    });

    it("renders stuck status as approaching-skip", () => {
      const instance = render(
        React.createElement(Dashboard, {
          data: makeDashboard({ stuckStatus: "approaching-skip" }),
          startTime: Date.now(),
        }),
      );

      const output = getFrame(instance);
      expect(output).toContain("approaching skip");
    });

    it("renders attempts and files modified", () => {
      const instance = render(
        React.createElement(Dashboard, {
          data: makeDashboard({ storyAttempts: 3, filesModified: 7 }),
          startTime: Date.now(),
        }),
      );

      const output = getFrame(instance);
      expect(output).toContain("att 3");
      expect(output).toContain("7 files");
    });

    it("renders model name when present", () => {
      const instance = render(
        React.createElement(Dashboard, {
          data: makeDashboard({ modelName: "claude-sonnet" }),
          startTime: Date.now(),
        }),
      );

      const output = getFrame(instance);
      expect(output).toContain("claude-sonnet");
    });
  });

  describe("StoryBanner component rendering", () => {
    it("renders story-start banner", () => {
      const instance = render(
        React.createElement(StoryBanner, {
          kind: "start",
          storyId: "US-001",
          storyTitle: "First story",
        }),
      );

      const output = getFrame(instance);
      expect(output).toContain("Starting");
      expect(output).toContain("US-001");
      expect(output).toContain("First story");
    });

    it("renders story-complete banner", () => {
      const instance = render(
        React.createElement(StoryBanner, {
          kind: "complete",
          storyId: "US-001",
          storyTitle: "First story",
        }),
      );

      const output = getFrame(instance);
      expect(output).toContain("COMPLETE");
      expect(output).toContain("US-001");
    });

    it("renders story-skipped banner", () => {
      const instance = render(
        React.createElement(StoryBanner, {
          kind: "skipped",
          storyId: "US-001",
          storyTitle: "First story",
        }),
      );

      const output = getFrame(instance);
      expect(output).toContain("SKIPPED");
      expect(output).toContain("US-001");
    });
  });

  describe("LogArea component rendering", () => {
    it("renders log entries with correct content", () => {
      const entries: LogEntry[] = [
        { id: 1, type: "system", text: "Initializing workspace..." },
        { id: 2, type: "tool-call", text: "  ▸ Write: src/foo.ts" },
        { id: 3, type: "error", text: "Something went wrong" },
      ];

      const instance = render(
        React.createElement(LogArea, {
          entries,
          liveText: "",
          isThinking: false,
          height: 20,
        }),
      );

      const output = getFrame(instance);
      expect(output).toContain("Initializing workspace...");
      expect(output).toContain("Write: src/foo.ts");
      expect(output).toContain("Something went wrong");
    });

    it("renders story-start banner entries", () => {
      const entries: LogEntry[] = [
        {
          id: 1,
          type: "story-start",
          text: "",
          storyId: "US-001",
          storyTitle: "First story",
        },
      ];

      const instance = render(
        React.createElement(LogArea, {
          entries,
          liveText: "",
          isThinking: false,
          height: 20,
        }),
      );

      const output = getFrame(instance);
      expect(output).toContain("Starting");
      expect(output).toContain("US-001");
      expect(output).toContain("First story");
    });

    it("renders story-complete banner entries", () => {
      const entries: LogEntry[] = [
        {
          id: 1,
          type: "story-complete",
          text: "",
          storyId: "US-001",
          storyTitle: "First story",
        },
      ];

      const instance = render(
        React.createElement(LogArea, {
          entries,
          liveText: "",
          isThinking: false,
          height: 20,
        }),
      );

      const output = getFrame(instance);
      expect(output).toContain("COMPLETE");
      expect(output).toContain("US-001");
    });

    it("renders live text when present", () => {
      const instance = render(
        React.createElement(LogArea, {
          entries: [],
          liveText: "Working on the implementation...",
          isThinking: false,
          height: 20,
        }),
      );

      const output = getFrame(instance);
      expect(output).toContain("Working on the implementation...");
    });

    it("renders thinking spinner when isThinking and no liveText", () => {
      const instance = render(
        React.createElement(LogArea, {
          entries: [],
          liveText: "",
          isThinking: true,
          height: 20,
        }),
      );

      const output = getFrame(instance);
      expect(output).toContain("Claude is thinking...");
    });

    it("does not render spinner when liveText is present even if isThinking", () => {
      const instance = render(
        React.createElement(LogArea, {
          entries: [],
          liveText: "Streaming text...",
          isThinking: true,
          height: 20,
        }),
      );

      const output = getFrame(instance);
      expect(output).toContain("Streaming text...");
      expect(output).not.toContain("Claude is thinking...");
    });

    it("renders a full sequence of log entries", () => {
      const entries: LogEntry[] = [
        {
          id: 1,
          type: "story-start",
          text: "",
          storyId: "US-001",
          storyTitle: "First story",
        },
        { id: 2, type: "assistant-text", text: "Working on..." },
        { id: 3, type: "tool-call", text: "  ▸ Write: src/foo.ts" },
        {
          id: 4,
          type: "story-complete",
          text: "",
          storyId: "US-001",
          storyTitle: "First story",
        },
      ];

      const instance = render(
        React.createElement(LogArea, {
          entries,
          liveText: "",
          isThinking: false,
          height: 20,
        }),
      );

      const output = getFrame(instance);
      expect(output).toContain("Starting");
      expect(output).toContain("US-001");
      expect(output).toContain("Working on...");
      expect(output).toContain("Write: src/foo.ts");
      expect(output).toContain("COMPLETE");
    });
  });
});
