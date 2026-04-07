import { describe, it, expect } from "vitest";
import { getWorkingDir } from "./pr.js";
import type { WorkspaceState } from "../lib/types.js";

function makeState(overrides: Partial<WorkspaceState> = {}): WorkspaceState {
  return {
    workspace: "test-workspace",
    project: "test-project",
    targetDir: "/projects/my-app",
    branchName: "feature/test",
    sourceFile: "/tmp/prd.md",
    stories: {},
    currentStory: null,
    startedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("getWorkingDir", () => {
  it("returns targetDir when worktreePath is absent (branch mode)", () => {
    const state = makeState({ gitWorkflow: "branch" });
    expect(getWorkingDir(state)).toBe("/projects/my-app");
  });

  it("returns targetDir when worktreePath is undefined", () => {
    const state = makeState({ worktreePath: undefined });
    expect(getWorkingDir(state)).toBe("/projects/my-app");
  });

  it("returns worktreePath when present (worktree mode)", () => {
    const state = makeState({
      gitWorkflow: "worktree",
      worktreePath: "/worktrees/my-app-feature",
    });
    expect(getWorkingDir(state)).toBe("/worktrees/my-app-feature");
  });
});
