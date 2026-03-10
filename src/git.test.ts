import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as childProcess from "child_process";

// Mock child_process before importing the module under test
vi.mock("child_process", async () => {
  const actual =
    await vi.importActual<typeof import("child_process")>("child_process");
  return { ...actual, execSync: vi.fn() };
});

import { ensureBranchCheckout } from "./git.js";

const execSyncMock = vi.mocked(childProcess.execSync);

describe("ensureBranchCheckout", () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("switches branch when on a different branch", () => {
    execSyncMock.mockImplementation(((cmd: string) => {
      if (cmd.includes("rev-parse --abbrev-ref HEAD")) {
        return Buffer.from("main\n");
      }
      if (cmd.includes("git status --porcelain")) {
        return Buffer.from("");
      }
      if (cmd.includes("git checkout feature/my-branch")) {
        return Buffer.from("");
      }
      throw new Error(`Unexpected command: ${cmd}`);
    }) as typeof childProcess.execSync);

    ensureBranchCheckout("feature/my-branch", "/projects/app");

    expect(execSyncMock).toHaveBeenCalledWith(
      "git checkout feature/my-branch",
      expect.objectContaining({ cwd: "/projects/app" }),
    );
    expect(consoleSpy).toHaveBeenCalledWith(
      "Switched to branch feature/my-branch",
    );
  });

  it("stashes dirty working tree before switching", () => {
    const callOrder: string[] = [];

    execSyncMock.mockImplementation(((cmd: string) => {
      if (cmd.includes("rev-parse --abbrev-ref HEAD")) {
        return Buffer.from("main\n");
      }
      if (cmd.includes("git status --porcelain")) {
        return Buffer.from(" M src/index.ts\n");
      }
      if (cmd === "git stash") {
        callOrder.push("stash");
        return Buffer.from("");
      }
      if (cmd.includes("git checkout feature/dirty")) {
        callOrder.push("checkout");
        return Buffer.from("");
      }
      throw new Error(`Unexpected command: ${cmd}`);
    }) as typeof childProcess.execSync);

    ensureBranchCheckout("feature/dirty", "/projects/app");

    expect(execSyncMock).toHaveBeenCalledWith(
      "git stash",
      expect.objectContaining({ cwd: "/projects/app" }),
    );
    expect(consoleSpy).toHaveBeenCalledWith(
      "Stashed uncommitted changes on main",
    );
    expect(consoleSpy).toHaveBeenCalledWith("Switched to branch feature/dirty");
    // Stash should happen before checkout
    expect(callOrder).toEqual(["stash", "checkout"]);
  });

  it("is a no-op when already on the correct branch", () => {
    execSyncMock.mockImplementation(((cmd: string) => {
      if (cmd.includes("rev-parse --abbrev-ref HEAD")) {
        return Buffer.from("feature/already-here\n");
      }
      throw new Error(`Unexpected command: ${cmd}`);
    }) as typeof childProcess.execSync);

    ensureBranchCheckout("feature/already-here", "/projects/app");

    // Should only call rev-parse, nothing else
    expect(execSyncMock).toHaveBeenCalledTimes(1);
    expect(consoleSpy).not.toHaveBeenCalled();
  });

  it("throws when branch does not exist", () => {
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
          "error: pathspec 'nonexistent-branch' did not match any file(s) known to git",
        );
        throw err;
      }
      throw new Error(`Unexpected command: ${cmd}`);
    }) as typeof childProcess.execSync);

    expect(() => {
      ensureBranchCheckout("nonexistent-branch", "/projects/app");
    }).toThrow(/Failed to checkout branch "nonexistent-branch"/);
  });

  it("does not stash when working tree is clean", () => {
    execSyncMock.mockImplementation(((cmd: string) => {
      if (cmd.includes("rev-parse --abbrev-ref HEAD")) {
        return Buffer.from("main\n");
      }
      if (cmd.includes("git status --porcelain")) {
        return Buffer.from("");
      }
      if (cmd.includes("git checkout")) {
        return Buffer.from("");
      }
      throw new Error(`Unexpected command: ${cmd}`);
    }) as typeof childProcess.execSync);

    ensureBranchCheckout("feature/clean", "/projects/app");

    const stashCalls = execSyncMock.mock.calls.filter(
      ([cmd]) => cmd === "git stash",
    );
    expect(stashCalls).toHaveLength(0);
  });
});
