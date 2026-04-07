import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

// We import the module under test after potentially mocking sub-modules
import {
  getCurrentStory,
  markStoryInterrupted,
  saveStateLocked,
} from "./tracker.js";
import type { WorkspaceState } from "../types.js";

function makeState(
  stories: Record<string, { passes: boolean | "skipped" | "interrupted" }>,
): WorkspaceState {
  return {
    workspace: "test-ws",
    project: "test-project",
    targetDir: "/tmp/target",
    branchName: "feature/test",
    sourceFile: "/tmp/prd.md",
    stories: Object.fromEntries(
      Object.entries(stories).map(([id, s]) => [
        id,
        { passes: s.passes, attempts: 1 },
      ]),
    ),
    currentStory: null,
    startedAt: new Date().toISOString(),
  } as WorkspaceState;
}

// ---------------------------------------------------------------------------
// getCurrentStory — "interrupted" treated as pending
// ---------------------------------------------------------------------------

describe("getCurrentStory", () => {
  it("returns story ID when passes is false (baseline)", () => {
    const state = makeState({ "US-1": { passes: false } });
    expect(getCurrentStory(state)).toBe("US-1");
  });

  it("returns story ID when passes is 'interrupted'", () => {
    const state = makeState({ "US-1": { passes: "interrupted" } });
    expect(getCurrentStory(state)).toBe("US-1");
  });

  it("returns null when all stories are complete or skipped", () => {
    const state = makeState({
      "US-1": { passes: true },
      "US-2": { passes: "skipped" },
    });
    expect(getCurrentStory(state)).toBeNull();
  });

  it("returns null when story with interrupted is followed by complete (first pending wins)", () => {
    // In iteration order: US-1 interrupted should be returned before US-2
    const state = makeState({
      "US-1": { passes: "interrupted" },
      "US-2": { passes: false },
    });
    // Either interrupted or false counts as pending; first one found should be returned
    expect(getCurrentStory(state)).toBe("US-1");
  });
});

// ---------------------------------------------------------------------------
// markStoryInterrupted
// ---------------------------------------------------------------------------

describe("markStoryInterrupted", () => {
  it("sets passes to 'interrupted'", () => {
    const state = makeState({ "US-1": { passes: false } });
    const updated = markStoryInterrupted(state, "US-1");
    expect(updated.stories["US-1"].passes).toBe("interrupted");
  });

  it("preserves existing attempts count", () => {
    const state: WorkspaceState = {
      ...makeState({ "US-1": { passes: false } }),
      stories: { "US-1": { passes: false, attempts: 5 } },
    };
    const updated = markStoryInterrupted(state, "US-1");
    expect(updated.stories["US-1"].attempts).toBe(5);
  });

  it("sets lastAttempt to current ISO timestamp", () => {
    const before = new Date().toISOString();
    const state = makeState({ "US-1": { passes: false } });
    const updated = markStoryInterrupted(state, "US-1");
    const after = new Date().toISOString();
    const lastAttempt = updated.stories["US-1"].lastAttempt ?? "";
    expect(lastAttempt).not.toBe("");
    expect(lastAttempt >= before).toBe(true);
    expect(lastAttempt <= after).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// saveStateLocked — unit tests with real temp files
// ---------------------------------------------------------------------------

describe("saveStateLocked", () => {
  let tmpDir: string;
  let statePath: string;
  let baseState: WorkspaceState;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "william-tracker-test-"));
    statePath = path.join(tmpDir, "state.json");
    baseState = makeState({ "US-1": { passes: false } });
    // Write an initial file so proper-lockfile can lock it
    fs.writeFileSync(statePath, JSON.stringify(baseState, null, 2), "utf-8");
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("writes state to disk correctly", async () => {
    const newState = { ...baseState, currentStory: "US-1" };
    await saveStateLocked(statePath, newState);

    const written = JSON.parse(
      fs.readFileSync(statePath, "utf-8"),
    ) as WorkspaceState;
    expect(written.currentStory).toBe("US-1");
  });

  it("releases lock even when the write throws (error release test)", async () => {
    // Use a path where the file exists (for locking) but is not writable.
    // Strategy: chmod the file read-only so writeFileSync throws EACCES,
    // then verify the lock is released by restoring permissions and calling again.
    fs.chmodSync(statePath, 0o444); // read-only

    await expect(saveStateLocked(statePath, baseState)).rejects.toThrow();

    // Restore permissions and verify lock was released (next call succeeds)
    fs.chmodSync(statePath, 0o644);
    await expect(saveStateLocked(statePath, baseState)).resolves.not.toThrow();
  });

  it("logs warning when lock acquisition takes > 2000ms", async () => {
    const warnSpy = vi
      .spyOn(console, "warn")
      .mockImplementation(() => undefined);

    // Mock Date.now to simulate a slow lock acquisition
    let callCount = 0;
    const dateNowSpy = vi.spyOn(Date, "now").mockImplementation(() => {
      callCount++;
      // First call (before lock) returns 0, second call (after lock) returns 2001ms later
      return callCount === 1 ? 0 : 2001;
    });

    await saveStateLocked(statePath, baseState);

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("Warning: state lock held for >2s"),
    );

    warnSpy.mockRestore();
    dateNowSpy.mockRestore();
  });

  it("two concurrent saveStateLocked calls both succeed without corruption", async () => {
    // Run 3 sequential lock-write cycles and verify final JSON is valid
    const states = [
      { ...baseState, currentStory: "US-1" },
      { ...baseState, currentStory: "US-2" },
      { ...baseState, currentStory: "US-3" },
    ];

    // Run them in parallel — proper-lockfile should serialize them
    await Promise.all(states.map((s) => saveStateLocked(statePath, s)));

    // Final state must be valid JSON (not corrupted)
    const raw = fs.readFileSync(statePath, "utf-8");
    const parseResult = (): WorkspaceState => JSON.parse(raw) as WorkspaceState;
    expect(parseResult).not.toThrow();
    // One of the states should have won
    const final = parseResult();
    expect(["US-1", "US-2", "US-3"]).toContain(final.currentStory);
  });
});
