import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import type { WorkspaceState } from "../lib/types.js";

let tmpRoot: string;

// Mock git.js to spy on ensureBranchCheckout
vi.mock("../lib/git.js", () => ({
  ensureBranchCheckout: vi.fn(),
}));

// Mock runner.js — use a getter so WILLIAM_ROOT tracks tmpRoot changes
vi.mock("./runner.js", () => ({
  get WILLIAM_ROOT() {
    return tmpRoot;
  },
  runWorkspace: vi.fn().mockResolvedValue(undefined),
}));

// Mock ink rendering
vi.mock("ink", () => ({
  render: vi.fn().mockReturnValue({ unmount: vi.fn() }),
}));

vi.mock("react", () => ({
  createElement: vi.fn(),
}));

vi.mock("./ui/events.js", () => ({
  TuiEmitter: vi.fn(),
}));

vi.mock("./ui/App.js", () => ({
  App: vi.fn(),
}));

// Mock PID registry / shutdown
vi.mock("./safety/pid-registry.js", () => ({
  cleanupOrphans: vi.fn(),
  registerPid: vi.fn(),
  deregisterPid: vi.fn(),
}));

vi.mock("./safety/shutdown.js", () => ({
  killAllAgents: vi.fn(),
}));

import { ensureBranchCheckout } from "../lib/git.js";
import { startWorkspace, createRevisionWorkspace } from "./workspace.js";

const ensureBranchCheckoutMock = vi.mocked(ensureBranchCheckout);

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

function setupWorkspaceDir(
  state: WorkspaceState,
  project: string,
  name: string,
): string {
  const wsDir = path.join(tmpRoot, "workspaces", project, name);
  fs.mkdirSync(wsDir, { recursive: true });
  fs.writeFileSync(
    path.join(wsDir, "state.json"),
    JSON.stringify(state),
    "utf-8",
  );
  return wsDir;
}

describe("startWorkspace — branch-mode auto-checkout", () => {
  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "william-ws-branch-test-"));
    vi.clearAllMocks();
  });

  afterEach(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  it("calls ensureBranchCheckout for branch-mode workspaces", async () => {
    const state = makeState({
      gitWorkflow: "branch",
      worktreePath: undefined,
      branchName: "feature/test",
      targetDir: "/projects/my-app",
    });

    setupWorkspaceDir(state, "test-project", "test-workspace");

    await startWorkspace("test-workspace", {
      adapter: vi.fn() as never,
      maxIterations: 1,
    });

    expect(ensureBranchCheckoutMock).toHaveBeenCalledWith(
      "feature/test",
      "/projects/my-app",
    );
  });

  it("does NOT call ensureBranchCheckout for worktree-mode workspaces", async () => {
    const state = makeState({
      gitWorkflow: "worktree",
      worktreePath: "/some/worktree",
      branchName: "feature/test",
      targetDir: "/projects/my-app",
    });

    setupWorkspaceDir(state, "test-project", "test-workspace");

    await startWorkspace("test-workspace", {
      adapter: vi.fn() as never,
      maxIterations: 1,
    });

    expect(ensureBranchCheckoutMock).not.toHaveBeenCalled();
  });

  it("does NOT call ensureBranchCheckout when gitWorkflow is undefined (legacy worktree)", async () => {
    const state = makeState({
      worktreePath: "/some/worktree",
      branchName: "feature/test",
      targetDir: "/projects/my-app",
    });
    delete state.gitWorkflow;

    setupWorkspaceDir(state, "test-project", "test-workspace");

    await startWorkspace("test-workspace", {
      adapter: vi.fn() as never,
      maxIterations: 1,
    });

    expect(ensureBranchCheckoutMock).not.toHaveBeenCalled();
  });
});

describe("revision workspace — branch-mode auto-checkout", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "william-rev-checkout-test-"),
    );
    vi.clearAllMocks();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("revision state enables ensureBranchCheckout call in branch mode", () => {
    // Create a branch-mode parent workspace
    const parentState = makeState({
      gitWorkflow: "branch",
      worktreePath: undefined,
      branchName: "feature/test",
      targetDir: "/projects/my-app",
    });

    const { revisionDir } = createRevisionWorkspace({
      parentWorkspaceDir: tmpDir,
      parentState,
      plan: "### US-R1: Fix something\n\n**Description:** Fix it.\n\n**Acceptance Criteria:**\n\n- [ ] Fixed",
    });

    // Load the revision state (as cli.ts does)
    const revisionState = JSON.parse(
      fs.readFileSync(path.join(revisionDir, "state.json"), "utf-8"),
    ) as WorkspaceState;

    // Simulate what cli.ts does: call ensureBranchCheckout if branch mode
    if (revisionState.gitWorkflow === "branch" && revisionState.branchName) {
      ensureBranchCheckout(revisionState.branchName, revisionState.targetDir);
    }

    expect(ensureBranchCheckoutMock).toHaveBeenCalledWith(
      "feature/test",
      "/projects/my-app",
    );
  });

  it("revision state does NOT trigger checkout for worktree-mode parent", () => {
    const parentState = makeState({
      gitWorkflow: "worktree",
      worktreePath: "/worktrees/my-app",
      branchName: "feature/test",
      targetDir: "/projects/my-app",
    });

    const { revisionDir } = createRevisionWorkspace({
      parentWorkspaceDir: tmpDir,
      parentState,
      plan: "### US-R1: Fix something\n\n**Description:** Fix it.\n\n**Acceptance Criteria:**\n\n- [ ] Fixed",
    });

    const revisionState = JSON.parse(
      fs.readFileSync(path.join(revisionDir, "state.json"), "utf-8"),
    ) as WorkspaceState;

    // Simulate what cli.ts does
    if (revisionState.gitWorkflow === "branch" && revisionState.branchName) {
      ensureBranchCheckout(revisionState.branchName, revisionState.targetDir);
    }

    expect(ensureBranchCheckoutMock).not.toHaveBeenCalled();
  });
});
