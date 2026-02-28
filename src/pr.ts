import * as fs from "fs";
import { resolveWorkspace } from "./workspace.js";
import { loadState } from "./prd/tracker.js";

export interface PrOptions {
  draft?: boolean;
  dryRun?: boolean;
}

export function prCommand(workspaceName: string, options: PrOptions): void {
  // options will be used by subsequent stories (US-007, US-008)
  void options;
  const resolved = resolveWorkspace(workspaceName);
  const statePath = `${resolved.workspaceDir}/state.json`;
  const state = loadState(statePath);

  if (!state.worktreePath) {
    throw new Error(
      `Workspace "${workspaceName}" has no worktree path. Legacy workspaces without worktrees are not supported by the pr command.`,
    );
  }

  if (!fs.existsSync(state.worktreePath)) {
    throw new Error(
      `Worktree directory does not exist: ${state.worktreePath}\nThe worktree may have been removed. Re-create the workspace with: william new`,
    );
  }
}
