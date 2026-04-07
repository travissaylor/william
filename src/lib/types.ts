import type { Wave } from "./prd/wave-planner.js";

export type StoryOutcome = "pass" | "fail" | "skip";

export interface WaveResult {
  wave: number;
  storyOutcomes: Record<string, StoryOutcome>;
  chainContext: string;
  completedAt: string;
}

export interface StoryState {
  passes: boolean | "skipped" | "interrupted";
  attempts: number;
  completedAt?: string;
  lastAttempt?: string;
  skipReason?: string;
}

export interface RevisionEntry {
  number: number;
  completedAt: string;
  itemCount: number;
  path: string;
}

export interface WorkspaceState {
  workspace: string;
  project: string;
  targetDir: string;
  branchName: string;
  sourceFile: string;
  worktreePath?: string;
  gitWorkflow?: "worktree" | "branch";
  stories: Record<string, StoryState>;
  currentStory: string | null;
  startedAt: string;
  parentWorkspace?: string;
  revisionNumber?: number;
  revisions?: RevisionEntry[];
  waves?: Wave[];
  currentWave?: number;
  waveResults?: WaveResult[];
}
