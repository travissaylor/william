import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import {
  registerPid,
  deregisterPid,
  readRegistry,
  isProcessAlive,
  cleanupOrphans,
} from "./pid-registry.js";
import type { WorkspaceState } from "../../lib/types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "william-pid-test-"));
}

function makeStateFile(
  dir: string,
  stories: Record<string, { passes: boolean | "skipped" | "interrupted" }>,
): string {
  const state: WorkspaceState = {
    workspace: "test-ws",
    project: "test-project",
    targetDir: dir,
    branchName: "feature/test",
    sourceFile: path.join(dir, "prd.md"),
    stories: Object.fromEntries(
      Object.entries(stories).map(([id, s]) => [
        id,
        { passes: s.passes, attempts: 1 },
      ]),
    ),
    currentStory: null,
    startedAt: new Date().toISOString(),
  };
  const statePath = path.join(dir, "state.json");
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2), "utf-8");
  return statePath;
}

// ---------------------------------------------------------------------------
// readRegistry
// ---------------------------------------------------------------------------

describe("readRegistry", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTempDir();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns empty array if registry file does not exist", () => {
    const result = readRegistry(tmpDir);
    expect(result).toEqual([]);
  });

  it("returns empty array if registry file has invalid JSON", () => {
    fs.writeFileSync(
      path.join(tmpDir, "pid-registry.json"),
      "not valid json",
      "utf-8",
    );
    const result = readRegistry(tmpDir);
    expect(result).toEqual([]);
  });

  it("returns parsed entries from valid registry file", () => {
    const entries = [
      { pid: 1234, storyId: "US-1", startedAt: "2024-01-01T00:00:00.000Z" },
    ];
    fs.writeFileSync(
      path.join(tmpDir, "pid-registry.json"),
      JSON.stringify(entries),
      "utf-8",
    );
    const result = readRegistry(tmpDir);
    expect(result).toEqual(entries);
  });
});

// ---------------------------------------------------------------------------
// registerPid / deregisterPid
// ---------------------------------------------------------------------------

describe("registerPid", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTempDir();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("adds entry with pid, storyId, and startedAt to registry file", () => {
    registerPid(tmpDir, "US-1", 42);
    const entries = readRegistry(tmpDir);
    expect(entries).toHaveLength(1);
    expect(entries[0].pid).toBe(42);
    expect(entries[0].storyId).toBe("US-1");
    expect(entries[0].startedAt).toBeDefined();
    expect(typeof entries[0].startedAt).toBe("string");
  });

  it("appends to existing entries without overwriting", () => {
    registerPid(tmpDir, "US-1", 100);
    registerPid(tmpDir, "US-2", 200);
    const entries = readRegistry(tmpDir);
    expect(entries).toHaveLength(2);
    expect(entries.map((e) => e.pid)).toContain(100);
    expect(entries.map((e) => e.pid)).toContain(200);
  });
});

describe("deregisterPid", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTempDir();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("removes entry by pid", () => {
    registerPid(tmpDir, "US-1", 100);
    registerPid(tmpDir, "US-2", 200);
    deregisterPid(tmpDir, 100);
    const entries = readRegistry(tmpDir);
    expect(entries).toHaveLength(1);
    expect(entries[0].pid).toBe(200);
  });

  it("deletes the registry file when the result is an empty array", () => {
    registerPid(tmpDir, "US-1", 100);
    deregisterPid(tmpDir, 100);
    const registryPath = path.join(tmpDir, "pid-registry.json");
    expect(fs.existsSync(registryPath)).toBe(false);
  });

  it("does nothing if pid not found", () => {
    registerPid(tmpDir, "US-1", 100);
    deregisterPid(tmpDir, 999);
    const entries = readRegistry(tmpDir);
    expect(entries).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// isProcessAlive
// ---------------------------------------------------------------------------

describe("isProcessAlive", () => {
  it("returns true for the current process PID", () => {
    expect(isProcessAlive(process.pid)).toBe(true);
  });

  it("returns false for a known-dead PID (99999999)", () => {
    expect(isProcessAlive(99999999)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// cleanupOrphans
// ---------------------------------------------------------------------------

describe("cleanupOrphans", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTempDir();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("does nothing if registry is empty", () => {
    const statePath = makeStateFile(tmpDir, { "US-1": { passes: false } });
    const consoleSpy = vi.spyOn(console, "log").mockReturnValue(undefined);
    cleanupOrphans(tmpDir, statePath);
    consoleSpy.mockRestore();
    // State should be unchanged
    const state = JSON.parse(
      fs.readFileSync(statePath, "utf-8"),
    ) as WorkspaceState;
    expect(state.stories["US-1"].passes).toBe(false);
  });

  it("skips PIDs that are still alive", () => {
    const statePath = makeStateFile(tmpDir, { "US-1": { passes: false } });
    // Register the current process PID as if it's running story US-1
    registerPid(tmpDir, "US-1", process.pid);
    const consoleSpy = vi.spyOn(console, "log").mockReturnValue(undefined);
    cleanupOrphans(tmpDir, statePath);
    consoleSpy.mockRestore();
    // US-1 should remain unchanged (process is alive)
    const state = JSON.parse(
      fs.readFileSync(statePath, "utf-8"),
    ) as WorkspaceState;
    expect(state.stories["US-1"].passes).toBe(false);
    // The alive PID should remain in the registry
    const entries = readRegistry(tmpDir);
    expect(entries).toHaveLength(1);
  });

  it("marks stories with dead PIDs as 'interrupted' in state, deregisters them, and logs a notice", () => {
    const statePath = makeStateFile(tmpDir, { "US-1": { passes: false } });
    // Register a fake dead PID (99999999)
    registerPid(tmpDir, "US-1", 99999999);

    const consoleSpy = vi.spyOn(console, "log").mockReturnValue(undefined);
    cleanupOrphans(tmpDir, statePath);

    // Should have logged cleanup notice
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("Cleaned up stale PID registry"),
    );
    consoleSpy.mockRestore();

    // State should show 'interrupted'
    const state = JSON.parse(
      fs.readFileSync(statePath, "utf-8"),
    ) as WorkspaceState;
    expect(state.stories["US-1"].passes).toBe("interrupted");

    // Registry file should be removed (empty after cleanup)
    const registryPath = path.join(tmpDir, "pid-registry.json");
    expect(fs.existsSync(registryPath)).toBe(false);
  });
});
