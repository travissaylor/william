import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// We need to mock readRegistry before importing shutdown
vi.mock("./pid-registry.js", () => ({
  readRegistry: vi.fn(),
  isProcessAlive: vi.fn(),
}));

import { readRegistry, isProcessAlive } from "./pid-registry.js";
import {
  gracefulShutdown,
  killAllAgents,
  resetShutdownState,
} from "./shutdown.js";

const mockReadRegistry = vi.mocked(readRegistry);
const mockIsProcessAlive = vi.mocked(isProcessAlive);

const WORKSPACE_DIR = "/tmp/test-workspace";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEntry(pid: number, storyId: string) {
  return { pid, storyId, startedAt: "2024-01-01T00:00:00.000Z" };
}

// ---------------------------------------------------------------------------
// gracefulShutdown
// ---------------------------------------------------------------------------

describe("gracefulShutdown", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let killSpy: ReturnType<typeof vi.spyOn<any, any>>;
  let exitCalled: number | null;
  let onExit: (code: number) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let consoleLogSpy: ReturnType<typeof vi.spyOn<any, any>>;

  beforeEach(() => {
    killSpy = vi.spyOn(process, "kill").mockImplementation(() => true);
    exitCalled = null;
    onExit = (code: number) => {
      exitCalled = code;
    };
    consoleLogSpy = vi.spyOn(console, "log").mockReturnValue(undefined);
    resetShutdownState();
    vi.useFakeTimers();
  });

  afterEach(() => {
    killSpy.mockRestore();
    consoleLogSpy.mockRestore();
    vi.useRealTimers();
    resetShutdownState();
  });

  it("sends SIGTERM to all alive registered PIDs", async () => {
    mockReadRegistry.mockReturnValue([
      makeEntry(1001, "US-1"),
      makeEntry(1002, "US-2"),
    ]);
    // First calls: alive (for initial SIGTERM); subsequent calls: dead (survivors check)
    mockIsProcessAlive
      .mockReturnValueOnce(true) // US-1 alive — will SIGTERM
      .mockReturnValueOnce(true) // US-2 alive — will SIGTERM
      .mockReturnValueOnce(false) // US-1 dead after grace period
      .mockReturnValueOnce(false); // US-2 dead after grace period

    const shutdownPromise = gracefulShutdown("SIGINT", {
      workspaceDir: WORKSPACE_DIR,
      onExit,
    });
    // Advance past the 5-second grace period
    await vi.runAllTimersAsync();
    await shutdownPromise;

    // SIGTERM should have been sent to both PIDs
    expect(killSpy).toHaveBeenCalledWith(1001, "SIGTERM");
    expect(killSpy).toHaveBeenCalledWith(1002, "SIGTERM");
  });

  it("sends SIGKILL to survivors after 5s grace period", async () => {
    mockReadRegistry.mockReturnValue([makeEntry(1001, "US-1")]);
    // alive for SIGTERM, then still alive after 5s = survivor
    mockIsProcessAlive
      .mockReturnValueOnce(true) // alive — SIGTERM sent
      .mockReturnValueOnce(true); // still alive — SIGKILL

    const shutdownPromise = gracefulShutdown("SIGINT", {
      workspaceDir: WORKSPACE_DIR,
      onExit,
    });
    await vi.runAllTimersAsync();
    await shutdownPromise;

    expect(killSpy).toHaveBeenCalledWith(1001, "SIGTERM");
    expect(killSpy).toHaveBeenCalledWith(1001, "SIGKILL");
  });

  it("logs force-kill warning for each survivor", async () => {
    mockReadRegistry.mockReturnValue([makeEntry(1001, "US-1")]);
    mockIsProcessAlive
      .mockReturnValueOnce(true) // alive — SIGTERM
      .mockReturnValueOnce(true); // still alive — SIGKILL

    const shutdownPromise = gracefulShutdown("SIGINT", {
      workspaceDir: WORKSPACE_DIR,
      onExit,
    });
    await vi.runAllTimersAsync();
    await shutdownPromise;

    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        "Agent [US-1] did not respond to graceful shutdown, force-killed",
      ),
    );
  });

  it("logs summary with killed count", async () => {
    mockReadRegistry.mockReturnValue([
      makeEntry(1001, "US-1"),
      makeEntry(1002, "US-2"),
    ]);
    mockIsProcessAlive
      .mockReturnValueOnce(true) // US-1 alive
      .mockReturnValueOnce(true) // US-2 alive
      .mockReturnValueOnce(false) // US-1 dead
      .mockReturnValueOnce(false); // US-2 dead

    const shutdownPromise = gracefulShutdown("SIGTERM", {
      workspaceDir: WORKSPACE_DIR,
      onExit,
    });
    await vi.runAllTimersAsync();
    await shutdownPromise;

    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringContaining("killed 2 agent(s), state saved"),
    );
  });

  it("calls onExit with code 130 for SIGINT", async () => {
    mockReadRegistry.mockReturnValue([]);
    const shutdownPromise = gracefulShutdown("SIGINT", {
      workspaceDir: WORKSPACE_DIR,
      onExit,
    });
    await vi.runAllTimersAsync();
    await shutdownPromise;
    expect(exitCalled).toBe(130);
  });

  it("calls onExit with code 143 for SIGTERM", async () => {
    mockReadRegistry.mockReturnValue([]);
    const shutdownPromise = gracefulShutdown("SIGTERM", {
      workspaceDir: WORKSPACE_DIR,
      onExit,
    });
    await vi.runAllTimersAsync();
    await shutdownPromise;
    expect(exitCalled).toBe(143);
  });

  it("double invocation (shuttingDown=true) sends SIGKILL immediately without waiting", async () => {
    mockReadRegistry.mockReturnValue([makeEntry(1001, "US-1")]);
    mockIsProcessAlive.mockReturnValue(true);

    // First invocation sets shuttingDown = true
    const firstPromise = gracefulShutdown("SIGINT", {
      workspaceDir: WORKSPACE_DIR,
      onExit,
    });

    // Second invocation should force-kill immediately (shuttingDown already true)
    const secondOnExitCalled: number[] = [];
    const secondPromise = gracefulShutdown("SIGINT", {
      workspaceDir: WORKSPACE_DIR,
      onExit: (code) => secondOnExitCalled.push(code),
    });
    await secondPromise;

    // Second call should have force-killed and exited
    expect(killSpy).toHaveBeenCalledWith(1001, "SIGKILL");
    expect(secondOnExitCalled).toHaveLength(1);
    expect(secondOnExitCalled[0]).toBe(1);

    // Clean up first promise
    await vi.runAllTimersAsync();
    await firstPromise;
  });
});

// ---------------------------------------------------------------------------
// killAllAgents
// ---------------------------------------------------------------------------

describe("killAllAgents", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let killSpy: ReturnType<typeof vi.spyOn<any, any>>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let consoleLogSpy: ReturnType<typeof vi.spyOn<any, any>>;

  beforeEach(() => {
    killSpy = vi.spyOn(process, "kill").mockImplementation(() => true);
    consoleLogSpy = vi.spyOn(console, "log").mockReturnValue(undefined);
    resetShutdownState();
  });

  afterEach(() => {
    killSpy.mockRestore();
    consoleLogSpy.mockRestore();
    resetShutdownState();
  });

  it("reads registry and kills all alive PIDs with SIGTERM", () => {
    mockReadRegistry.mockReturnValue([
      makeEntry(2001, "US-1"),
      makeEntry(2002, "US-2"),
    ]);
    mockIsProcessAlive.mockReturnValue(true);

    killAllAgents(WORKSPACE_DIR);

    expect(killSpy).toHaveBeenCalledWith(2001, "SIGTERM");
    expect(killSpy).toHaveBeenCalledWith(2002, "SIGTERM");
  });

  it("logs the count of killed agents", () => {
    mockReadRegistry.mockReturnValue([makeEntry(2001, "US-1")]);
    mockIsProcessAlive.mockReturnValue(true);

    killAllAgents(WORKSPACE_DIR);

    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("1"));
  });

  it("does not kill dead processes", () => {
    mockReadRegistry.mockReturnValue([makeEntry(2001, "US-1")]);
    mockIsProcessAlive.mockReturnValue(false);

    killAllAgents(WORKSPACE_DIR);

    expect(killSpy).not.toHaveBeenCalled();
  });
});
