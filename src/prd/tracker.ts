import * as fs from "fs";
import { WorkspaceState, StoryState } from "../types.js";
import { ParsedPrd } from "./parser.js";

export interface InitStateOpts {
  workspace: string;
  project: string;
  targetDir: string;
  branchName: string;
  sourceFile: string;
}

export function loadState(statePath: string): WorkspaceState {
  const raw = fs.readFileSync(statePath, "utf-8");
  return JSON.parse(raw) as WorkspaceState;
}

export function saveState(statePath: string, state: WorkspaceState): void {
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2), "utf-8");
}

export function getCurrentStory(state: WorkspaceState): string | null {
  for (const [id, story] of Object.entries(state.stories)) {
    if (story.passes === false) {
      return id;
    }
  }
  return null;
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
  return {
    workspace: opts.workspace,
    project: opts.project,
    targetDir: opts.targetDir,
    branchName: opts.branchName,
    sourceFile: opts.sourceFile,
    stories,
    currentStory: firstStoryId,
    startedAt: new Date().toISOString(),
  };
}
