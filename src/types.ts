export interface StoryState {
  passes: boolean | 'skipped';
  attempts: number;
  completedAt?: string;
  lastAttempt?: string;
  skipReason?: string;
}

export interface WorkspaceState {
  workspace: string;
  project: string;
  targetDir: string;
  branchName: string;
  sourceFile: string;
  stories: Record<string, StoryState>;
  currentStory: string | null;
  startedAt: string;
}
