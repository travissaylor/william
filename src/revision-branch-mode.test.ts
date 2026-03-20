import { describe, it, expect, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { createRevisionWorkspace } from "./workspace.js";
import type { WorkspaceState } from "./types.js";

function makeParentState(
  overrides: Partial<WorkspaceState> = {},
): WorkspaceState {
  return {
    workspace: "test-project/test-workspace",
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

describe("createRevisionWorkspace — branch-mode parents", () => {
  let tmpDir: string;

  afterEach(() => {
    if (tmpDir) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("sets gitWorkflow to 'branch' when parent is branch mode", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "william-rev-test-"));
    const parentState = makeParentState({
      gitWorkflow: "branch",
      worktreePath: undefined,
    });

    const { revisionDir } = createRevisionWorkspace({
      parentWorkspaceDir: tmpDir,
      parentState,
      plan: "### US-R1: Fix something\n\n**Description:** Fix it.\n\n**Acceptance Criteria:**\n\n- [ ] Fixed",
    });

    const revState = JSON.parse(
      fs.readFileSync(path.join(revisionDir, "state.json"), "utf-8"),
    ) as WorkspaceState;

    expect(revState.gitWorkflow).toBe("branch");
  });

  it("does not set worktreePath for branch-mode parents", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "william-rev-test-"));
    const parentState = makeParentState({
      gitWorkflow: "branch",
      worktreePath: undefined,
    });

    const { revisionDir } = createRevisionWorkspace({
      parentWorkspaceDir: tmpDir,
      parentState,
      plan: "### US-R1: Fix something\n\n**Description:** Fix it.\n\n**Acceptance Criteria:**\n\n- [ ] Fixed",
    });

    const revState = JSON.parse(
      fs.readFileSync(path.join(revisionDir, "state.json"), "utf-8"),
    ) as WorkspaceState;

    expect(revState.worktreePath).toBeUndefined();
  });

  it("preserves worktreePath for worktree-mode parents", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "william-rev-test-"));
    const parentState = makeParentState({
      gitWorkflow: "worktree",
      worktreePath: "/worktrees/my-app-feature",
    });

    const { revisionDir } = createRevisionWorkspace({
      parentWorkspaceDir: tmpDir,
      parentState,
      plan: "### US-R1: Fix something\n\n**Description:** Fix it.\n\n**Acceptance Criteria:**\n\n- [ ] Fixed",
    });

    const revState = JSON.parse(
      fs.readFileSync(path.join(revisionDir, "state.json"), "utf-8"),
    ) as WorkspaceState;

    expect(revState.gitWorkflow).toBe("worktree");
    expect(revState.worktreePath).toBe("/worktrees/my-app-feature");
  });

  it("defaults to worktree workflow when parent has no gitWorkflow set", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "william-rev-test-"));
    const parentState = makeParentState({
      worktreePath: "/worktrees/my-app-feature",
    });
    // Explicitly remove gitWorkflow to simulate legacy state
    delete parentState.gitWorkflow;

    const { revisionDir } = createRevisionWorkspace({
      parentWorkspaceDir: tmpDir,
      parentState,
      plan: "### US-R1: Fix something\n\n**Description:** Fix it.\n\n**Acceptance Criteria:**\n\n- [ ] Fixed",
    });

    const revState = JSON.parse(
      fs.readFileSync(path.join(revisionDir, "state.json"), "utf-8"),
    ) as WorkspaceState;

    expect(revState.gitWorkflow).toBe("worktree");
    expect(revState.worktreePath).toBe("/worktrees/my-app-feature");
  });

  it("uses targetDir as working directory for branch-mode revisions", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "william-rev-test-"));
    const parentState = makeParentState({
      gitWorkflow: "branch",
      worktreePath: undefined,
      targetDir: "/projects/my-app",
    });

    const { revisionDir } = createRevisionWorkspace({
      parentWorkspaceDir: tmpDir,
      parentState,
      plan: "### US-R1: Fix something\n\n**Description:** Fix it.\n\n**Acceptance Criteria:**\n\n- [ ] Fixed",
    });

    const revState = JSON.parse(
      fs.readFileSync(path.join(revisionDir, "state.json"), "utf-8"),
    ) as WorkspaceState;

    // For branch-mode, getWorkingDir should return targetDir
    // since worktreePath is undefined
    expect(revState.worktreePath).toBeUndefined();
    expect(revState.targetDir).toBe("/projects/my-app");
  });
});
