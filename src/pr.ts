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

export interface ExistingPr {
  number: number;
  url: string;
}

/**
 * Check whether a PR already exists for the given branch targeting main.
 * Returns the PR number and URL if found, or null if no PR exists.
 */
export function findExistingPr(
  branchName: string,
  worktreePath: string,
): ExistingPr | null {
  let output: string;
  try {
    output = execSync(
      `gh pr list --head ${branchName} --base main --json number,url --limit 1`,
      { cwd: worktreePath, stdio: "pipe" },
    ).toString();
  } catch (err) {
    const stderr =
      err instanceof Error && "stderr" in err
        ? String((err as NodeJS.ErrnoException & { stderr: Buffer }).stderr)
        : "";
    const message =
      stderr.trim() || (err instanceof Error ? err.message : String(err));
    throw new Error(`Failed to check for existing PR: ${message}`);
  }

  const prs = JSON.parse(output) as { number: number; url: string }[];
  if (prs.length === 0) {
    return null;
  }

  return { number: prs[0].number, url: prs[0].url };
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

  // US-003: Detect existing PR for branch (result used in US-005)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const existingPr = findExistingPr(state.branchName, state.worktreePath);
}
