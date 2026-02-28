import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import * as childProcess from "child_process";
import { runSetupCommands } from "./workspace.js";

vi.mock("child_process", async () => {
  const actual =
    await vi.importActual<typeof import("child_process")>("child_process");
  return { ...actual, spawnSync: vi.fn() };
});

describe("runSetupCommands", () => {
  let tmpDir: string;
  let worktreeDir: string;
  const spawnSyncMock = vi.mocked(childProcess.spawnSync);

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "william-setup-test-"));
    worktreeDir = path.join(tmpDir, "worktree");
    fs.mkdirSync(worktreeDir, { recursive: true });
    spawnSyncMock.mockReset();
    spawnSyncMock.mockReturnValue({
      status: 0,
      signal: null,
      output: [],
      pid: 0,
      stdout: Buffer.from(""),
      stderr: Buffer.from(""),
    });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it("does nothing when no project config exists", () => {
    runSetupCommands(tmpDir, worktreeDir);
    expect(spawnSyncMock).not.toHaveBeenCalled();
  });

  it("does nothing when setupCommands is empty", () => {
    const configDir = path.join(tmpDir, ".william");
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(
      path.join(configDir, "config.json"),
      JSON.stringify({ setupCommands: [] }),
    );

    runSetupCommands(tmpDir, worktreeDir);
    expect(spawnSyncMock).not.toHaveBeenCalled();
  });

  it("does nothing when setupCommands is absent", () => {
    const configDir = path.join(tmpDir, ".william");
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(
      path.join(configDir, "config.json"),
      JSON.stringify({ projectName: "test" }),
    );

    runSetupCommands(tmpDir, worktreeDir);
    expect(spawnSyncMock).not.toHaveBeenCalled();
  });

  it("runs each command sequentially with shell and correct cwd", () => {
    const configDir = path.join(tmpDir, ".william");
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(
      path.join(configDir, "config.json"),
      JSON.stringify({
        setupCommands: ["cp .env.example .env", "pnpm db:seed"],
      }),
    );

    runSetupCommands(tmpDir, worktreeDir);

    expect(spawnSyncMock).toHaveBeenCalledTimes(2);
    expect(spawnSyncMock).toHaveBeenNthCalledWith(1, "cp .env.example .env", {
      shell: true,
      cwd: worktreeDir,
      stdio: "inherit",
    });
    expect(spawnSyncMock).toHaveBeenNthCalledWith(2, "pnpm db:seed", {
      shell: true,
      cwd: worktreeDir,
      stdio: "inherit",
    });
  });

  it("logs each command before running it", () => {
    const configDir = path.join(tmpDir, ".william");
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(
      path.join(configDir, "config.json"),
      JSON.stringify({ setupCommands: ["echo hello"] }),
    );

    const logSpy = vi
      .spyOn(console, "log") // eslint-disable-next-line @typescript-eslint/no-empty-function
      .mockImplementation(() => {});
    runSetupCommands(tmpDir, worktreeDir);

    expect(logSpy).toHaveBeenCalledWith("[william] Running setup: echo hello");
    logSpy.mockRestore();
  });

  it("warns on non-zero exit but continues remaining commands", () => {
    const configDir = path.join(tmpDir, ".william");
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(
      path.join(configDir, "config.json"),
      JSON.stringify({
        setupCommands: ["failing-cmd", "second-cmd"],
      }),
    );

    spawnSyncMock
      .mockReturnValueOnce({
        status: 1,
        signal: null,
        output: [],
        pid: 0,
        stdout: Buffer.from(""),
        stderr: Buffer.from(""),
      })
      .mockReturnValueOnce({
        status: 0,
        signal: null,
        output: [],
        pid: 0,
        stdout: Buffer.from(""),
        stderr: Buffer.from(""),
      });

    const errorSpy = vi
      .spyOn(console, "error") // eslint-disable-next-line @typescript-eslint/no-empty-function
      .mockImplementation(() => {});
    const logSpy = vi
      .spyOn(console, "log") // eslint-disable-next-line @typescript-eslint/no-empty-function
      .mockImplementation(() => {});
    runSetupCommands(tmpDir, worktreeDir);

    expect(errorSpy).toHaveBeenCalledWith(
      "[william] Warning: setup command failed: failing-cmd (exit code 1)",
    );
    // Second command still runs
    expect(spawnSyncMock).toHaveBeenCalledTimes(2);
    errorSpy.mockRestore();
    logSpy.mockRestore();
  });
});
