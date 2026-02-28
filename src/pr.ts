import * as fs from "fs";
import { execSync } from "child_process";
import { resolveWorkspace } from "./workspace.js";
import { loadState } from "./prd/tracker.js";

export interface PrOptions {
  draft?: boolean;
  dryRun?: boolean;
}

/**
 * Check whether the current branch has an upstream (remote tracking) branch configured.
 */
function hasUpstream(worktreePath: string): boolean {
  try {
    execSync("git rev-parse --abbrev-ref @{u}", {
      cwd: worktreePath,
      stdio: "pipe",
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Push the workspace branch to the remote.
 * Uses `git push -u origin <branch>` on first push, `git push` thereafter.
 */
export function pushBranch(branchName: string, worktreePath: string): void {
  const alreadyPushed = hasUpstream(worktreePath);

  const cmd = alreadyPushed ? "git push" : `git push -u origin ${branchName}`;

  try {
    execSync(cmd, { cwd: worktreePath, stdio: "pipe" });
  } catch (err) {
    const stderr =
      err instanceof Error && "stderr" in err
        ? String((err as NodeJS.ErrnoException & { stderr: Buffer }).stderr)
        : "";
    const message =
      stderr.trim() || (err instanceof Error ? err.message : String(err));
    throw new Error(`Failed to push branch "${branchName}": ${message}`);
  }
}

export function prCommand(workspaceName: string, options: PrOptions): void {
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

  // US-002: Push workspace branch to remote (skip if dry run)
  if (!options.dryRun) {
    pushBranch(state.branchName, state.worktreePath);
  }
}
