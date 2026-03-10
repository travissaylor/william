import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import * as childProcess from "child_process";
import type { WorkspaceState } from "./types.js";

// Mock child_process to intercept execSync calls
vi.mock("child_process", async () => {
  const actual =
    await vi.importActual<typeof import("child_process")>("child_process");
  return { ...actual, execSync: vi.fn() };
});

// Mock workspace resolution and state loading
vi.mock("./workspace.js", () => ({
  resolveWorkspace: vi.fn(),
}));

vi.mock("./prd/tracker.js", () => ({
  loadState: vi.fn(),
}));

// Mock ora to avoid spinner output
vi.mock("ora", () => ({
  default: () => ({
    start: vi.fn().mockReturnThis(),
    stop: vi.fn().mockReturnThis(),
    succeed: vi.fn().mockReturnThis(),
  }),
}));

import { resolveWorkspace } from "./workspace.js";
import { loadState } from "./prd/tracker.js";
import { prCommand, getWorkingDir } from "./pr.js";

const execSyncMock = vi.mocked(childProcess.execSync);
const resolveWorkspaceMock = vi.mocked(resolveWorkspace);
const loadStateMock = vi.mocked(loadState);

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

describe("prCommand — branch-mode auto-checkout", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "william-pr-test-"));
    vi.clearAllMocks();
    vi.spyOn(console, "log").mockImplementation(() => {
      // suppress output
    });
    vi.spyOn(console, "warn").mockImplementation(() => {
      // suppress output
    });

    resolveWorkspaceMock.mockReturnValue({
      workspaceDir: tmpDir,
      workspaceName: "test-workspace",
      projectName: "test-project",
    });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it("auto-checks out workspace branch when current branch differs in branch mode", async () => {
    const state = makeState({
      gitWorkflow: "branch",
      worktreePath: undefined,
      targetDir: tmpDir,
      branchName: "feature/test",
    });

    fs.writeFileSync(
      path.join(tmpDir, "state.json"),
      JSON.stringify(state),
      "utf-8",
    );
    loadStateMock.mockReturnValue(state);

    execSyncMock.mockImplementation(((cmd: string) => {
      if (cmd.includes("rev-parse --abbrev-ref HEAD")) {
        return Buffer.from("main\n");
      }
      if (cmd.includes("git status --porcelain")) {
        return Buffer.from("");
      }
      if (cmd.includes("git checkout feature/test")) {
        return Buffer.from("");
      }
      throw new Error(`Unexpected command: ${cmd}`);
    }) as typeof childProcess.execSync);

    try {
      await prCommand("test-workspace", { dryRun: true });
    } catch {
      // Expected — generatePrDescription will fail due to mocks
    }

    expect(execSyncMock).toHaveBeenCalledWith(
      "git checkout feature/test",
      expect.objectContaining({ cwd: tmpDir }),
    );
  });

  it("skips auto-checkout in worktree mode", async () => {
    const worktreeDir = path.join(tmpDir, "worktree");
    fs.mkdirSync(worktreeDir, { recursive: true });

    const state = makeState({
      gitWorkflow: "worktree",
      worktreePath: worktreeDir,
      targetDir: tmpDir,
      branchName: "feature/test",
    });

    fs.writeFileSync(
      path.join(tmpDir, "state.json"),
      JSON.stringify(state),
      "utf-8",
    );
    loadStateMock.mockReturnValue(state);

    try {
      await prCommand("test-workspace", { dryRun: true });
    } catch {
      // Expected — generatePrDescription will fail due to mocks
    }

    // In worktree mode, git rev-parse and git checkout should NOT be called
    const autoCheckoutCalls = execSyncMock.mock.calls.filter(([cmd]) => {
      const c = typeof cmd === "string" ? cmd : "";
      return (
        c.includes("checkout") || c.includes("rev-parse --abbrev-ref HEAD")
      );
    });
    expect(autoCheckoutCalls).toHaveLength(0);
  });

  it("skips auto-checkout when already on correct branch in branch mode", async () => {
    const state = makeState({
      gitWorkflow: "branch",
      worktreePath: undefined,
      targetDir: tmpDir,
      branchName: "feature/test",
    });

    fs.writeFileSync(
      path.join(tmpDir, "state.json"),
      JSON.stringify(state),
      "utf-8",
    );
    loadStateMock.mockReturnValue(state);

    execSyncMock.mockImplementation(((cmd: string) => {
      if (cmd.includes("rev-parse --abbrev-ref HEAD")) {
        return Buffer.from("feature/test\n");
      }
      throw new Error(`Unexpected command: ${cmd}`);
    }) as typeof childProcess.execSync);

    try {
      await prCommand("test-workspace", { dryRun: true });
    } catch {
      // Expected
    }

    const checkoutCalls = execSyncMock.mock.calls.filter(
      ([cmd]) => typeof cmd === "string" && cmd.includes("git checkout"),
    );
    expect(checkoutCalls).toHaveLength(0);
  });

  it("surfaces clear error when checkout fails due to uncommitted changes", async () => {
    const state = makeState({
      gitWorkflow: "branch",
      worktreePath: undefined,
      targetDir: tmpDir,
      branchName: "feature/test",
    });

    fs.writeFileSync(
      path.join(tmpDir, "state.json"),
      JSON.stringify(state),
      "utf-8",
    );
    loadStateMock.mockReturnValue(state);

    execSyncMock.mockImplementation(((cmd: string) => {
      if (cmd.includes("rev-parse --abbrev-ref HEAD")) {
        return Buffer.from("main\n");
      }
      if (cmd.includes("git status --porcelain")) {
        return Buffer.from("");
      }
      if (cmd.includes("git checkout")) {
        const err = new Error("checkout failed") as Error & {
          stderr: Buffer;
        };
        err.stderr = Buffer.from(
          "error: Your local changes to the following files would be overwritten by checkout",
        );
        throw err;
      }
      throw new Error(`Unexpected command: ${cmd}`);
    }) as typeof childProcess.execSync);

    await expect(prCommand("test-workspace", { dryRun: true })).rejects.toThrow(
      /Failed to checkout branch/,
    );
  });
});

describe("getWorkingDir — used by pr helpers", () => {
  it("resolves to targetDir for branch-mode state", () => {
    const state = makeState({
      gitWorkflow: "branch",
      worktreePath: undefined,
      targetDir: "/projects/my-app",
    });
    expect(getWorkingDir(state)).toBe("/projects/my-app");
  });

  it("resolves to worktreePath for worktree-mode state", () => {
    const state = makeState({
      gitWorkflow: "worktree",
      worktreePath: "/worktrees/my-app",
      targetDir: "/projects/my-app",
    });
    expect(getWorkingDir(state)).toBe("/worktrees/my-app");
  });
});
