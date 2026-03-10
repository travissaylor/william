import { execSync } from "child_process";

/**
 * Ensures the working directory is on the specified branch.
 * If already on the correct branch, returns early (no-op).
 * If on a different branch, stashes any uncommitted changes and checks out the target branch.
 */
export function ensureBranchCheckout(branchName: string, cwd: string): void {
  const currentBranch = execSync("git rev-parse --abbrev-ref HEAD", {
    cwd,
    stdio: "pipe",
  })
    .toString()
    .trim();

  if (currentBranch === branchName) {
    return;
  }

  // Stash uncommitted changes if working tree is dirty
  const status = execSync("git status --porcelain", {
    cwd,
    stdio: "pipe",
  })
    .toString()
    .trim();

  if (status) {
    execSync("git stash", { cwd, stdio: "pipe" });
    console.log(`Stashed uncommitted changes on ${currentBranch}`);
  }

  try {
    execSync(`git checkout ${branchName}`, { cwd, stdio: "pipe" });
  } catch (err) {
    const stderr =
      err instanceof Error && "stderr" in err
        ? String((err as NodeJS.ErrnoException & { stderr: Buffer }).stderr)
        : "";
    const message =
      stderr.trim() || (err instanceof Error ? err.message : String(err));
    throw new Error(`Failed to checkout branch "${branchName}": ${message}`);
  }

  console.log(`Switched to branch ${branchName}`);
}
