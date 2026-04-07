import * as fs from "fs";
import * as path from "path";
import { describe, it, expect, afterEach } from "vitest";
import {
  createTestWorkspace,
  SINGLE_STORY_PRD,
  THREE_STORY_PRD,
  type TestWorkspaceResult,
} from "./create-test-workspace.js";
import { loadState } from "../../../../lib/prd/tracker.js";

describe("createTestWorkspace", () => {
  const workspaces: TestWorkspaceResult[] = [];

  afterEach(() => {
    for (const ws of workspaces) {
      ws.cleanup();
    }
    workspaces.length = 0;
  });

  it("creates a temp directory with state.json, prd.md, and progress.txt", () => {
    const ws = createTestWorkspace({ prdText: SINGLE_STORY_PRD });
    workspaces.push(ws);

    expect(fs.existsSync(ws.workspaceDir)).toBe(true);
    expect(fs.existsSync(ws.statePath)).toBe(true);
    expect(fs.existsSync(ws.prdPath)).toBe(true);
    expect(fs.existsSync(ws.progressPath)).toBe(true);
  });

  it("writes the PRD text to prd.md", () => {
    const ws = createTestWorkspace({ prdText: SINGLE_STORY_PRD });
    workspaces.push(ws);

    const content = fs.readFileSync(ws.prdPath, "utf-8");
    expect(content).toBe(SINGLE_STORY_PRD);
  });

  it("creates an empty progress.txt", () => {
    const ws = createTestWorkspace({ prdText: SINGLE_STORY_PRD });
    workspaces.push(ws);

    const content = fs.readFileSync(ws.progressPath, "utf-8");
    expect(content).toBe("");
  });

  it("generates valid state.json with stories from the PRD", () => {
    const ws = createTestWorkspace({ prdText: THREE_STORY_PRD });
    workspaces.push(ws);

    const state = loadState(ws.statePath);

    expect(state.stories).toHaveProperty("US-001");
    expect(state.stories).toHaveProperty("US-002");
    expect(state.stories).toHaveProperty("US-003");
    expect(Object.keys(state.stories)).toHaveLength(3);
  });

  it("sets all stories to pending (passes: false, attempts: 0)", () => {
    const ws = createTestWorkspace({ prdText: THREE_STORY_PRD });
    workspaces.push(ws);

    const state = loadState(ws.statePath);

    for (const story of Object.values(state.stories)) {
      expect(story.passes).toBe(false);
      expect(story.attempts).toBe(0);
    }
  });

  it("sets currentStory to the first story", () => {
    const ws = createTestWorkspace({ prdText: THREE_STORY_PRD });
    workspaces.push(ws);

    const state = loadState(ws.statePath);

    expect(state.currentStory).toBe("US-001");
  });

  it("uses provided workspace name and branch name", () => {
    const ws = createTestWorkspace({
      prdText: SINGLE_STORY_PRD,
      workspaceName: "my-workspace",
      branchName: "feature/my-branch",
    });
    workspaces.push(ws);

    const state = loadState(ws.statePath);

    expect(state.workspace).toBe("my-workspace");
    expect(state.branchName).toBe("feature/my-branch");
  });

  it("sets sourceFile to the prd.md path", () => {
    const ws = createTestWorkspace({ prdText: SINGLE_STORY_PRD });
    workspaces.push(ws);

    const state = loadState(ws.statePath);

    expect(state.sourceFile).toBe(ws.prdPath);
  });

  it("sets worktreePath and targetDir to the workspace directory", () => {
    const ws = createTestWorkspace({ prdText: SINGLE_STORY_PRD });
    workspaces.push(ws);

    const state = loadState(ws.statePath);

    expect(state.targetDir).toBe(ws.workspaceDir);
    expect(state.worktreePath).toBe(ws.workspaceDir);
  });

  it("cleanup removes the temp directory", () => {
    const ws = createTestWorkspace({ prdText: SINGLE_STORY_PRD });
    const dir = ws.workspaceDir;

    expect(fs.existsSync(dir)).toBe(true);
    ws.cleanup();
    expect(fs.existsSync(dir)).toBe(false);
  });

  it("paths are consistent (statePath and prdPath inside workspaceDir)", () => {
    const ws = createTestWorkspace({ prdText: SINGLE_STORY_PRD });
    workspaces.push(ws);

    expect(ws.statePath).toBe(path.join(ws.workspaceDir, "state.json"));
    expect(ws.prdPath).toBe(path.join(ws.workspaceDir, "prd.md"));
    expect(ws.progressPath).toBe(path.join(ws.workspaceDir, "progress.txt"));
  });
});
