import * as fs from "fs";
import lockfile from "proper-lockfile";
import { WorkspaceState, StoryState } from "../types.js";
import { ParsedPrd } from "./parser.js";
import { computeWaves } from "./wave-planner.js";

export interface InitStateOpts {
  workspace: string;
  project: string;
  targetDir: string;
  branchName: string;
  sourceFile: string;
  worktreePath?: string;
}

export function loadState(statePath: string): WorkspaceState {
  const raw = fs.readFileSync(statePath, "utf-8");
  return JSON.parse(raw) as WorkspaceState;
}

export function saveState(statePath: string, state: WorkspaceState): void {
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2), "utf-8");
}

export async function saveStateLocked(
  statePath: string,
  state: WorkspaceState,
): Promise<void> {
  const start = Date.now();
  const release = await lockfile.lock(statePath, {
    retries: { retries: 5, minTimeout: 100, maxTimeout: 500 },
    stale: 10_000,
  });
  const elapsed = Date.now() - start;
  if (elapsed > 2000) {
    console.warn(
      "[william] Warning: state lock held for >2s — possible contention.",
    );
  }
  try {
    saveState(statePath, state);
  } finally {
    await release();
  }
}

export function getCurrentStory(state: WorkspaceState): string | null {
  for (const [id, story] of Object.entries(state.stories)) {
    if (story.passes === false || story.passes === "interrupted") {
      return id;
    }
  }
  return null;
}

export function markStoryInterrupted(
  state: WorkspaceState,
  storyId: string,
): WorkspaceState {
  const existing = state.stories[storyId];
  return {
    ...state,
    stories: {
      ...state.stories,
      [storyId]: {
        ...existing,
        passes: "interrupted",
        lastAttempt: new Date().toISOString(),
      } as StoryState,
    },
  };
}

export function markStoryComplete(
  state: WorkspaceState,
  storyId: string,
): WorkspaceState {
  const updated: WorkspaceState = {
    ...state,
    stories: {
      ...state.stories,
      [storyId]: {
        ...state.stories[storyId],
        passes: true,
        completedAt: new Date().toISOString(),
      } as StoryState,
    },
  };
  updated.currentStory = getCurrentStory(updated);
  return updated;
}

export function markStorySkipped(
  state: WorkspaceState,
  storyId: string,
  reason: string,
): WorkspaceState {
  const updated: WorkspaceState = {
    ...state,
    stories: {
      ...state.stories,
      [storyId]: {
        ...state.stories[storyId],
        passes: "skipped",
        skipReason: reason,
        completedAt: new Date().toISOString(),
      } as StoryState,
    },
  };
  updated.currentStory = getCurrentStory(updated);
  return updated;
}

export function incrementAttempts(
  state: WorkspaceState,
  storyId: string,
): WorkspaceState {
  const existing = state.stories[storyId];
  return {
    ...state,
    stories: {
      ...state.stories,
      [storyId]: {
        ...existing,
        attempts: existing.attempts + 1,
        lastAttempt: new Date().toISOString(),
      } as StoryState,
    },
  };
}

export function initStateFromPrd(
  parsedPrd: ParsedPrd,
  opts: InitStateOpts,
): WorkspaceState {
  const stories: Record<string, StoryState> = {};
  for (const story of parsedPrd.stories) {
    stories[story.id] = { passes: false, attempts: 0 };
  }
  const firstStoryId = parsedPrd.stories[0]?.id ?? null;

  const hasDependencies = parsedPrd.stories.some((s) => s.dependsOn.length > 0);
  const waves = hasDependencies ? computeWaves(parsedPrd.stories) : undefined;

  return {
    workspace: opts.workspace,
    project: opts.project,
    targetDir: opts.targetDir,
    branchName: opts.branchName,
    sourceFile: opts.sourceFile,
    ...(opts.worktreePath ? { worktreePath: opts.worktreePath } : {}),
    stories,
    currentStory: firstStoryId,
    startedAt: new Date().toISOString(),
    ...(waves ? { waves, currentWave: 0, waveResults: [] } : {}),
  };
}
