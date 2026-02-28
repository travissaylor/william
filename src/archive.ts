import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";
import { WILLIAM_ROOT } from "./runner.js";
import { loadState } from "./prd/tracker.js";
import { resolveWorkspace } from "./workspace.js";

function copyDirRecursive(src: string, dest: string): void {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src)) {
    const srcPath = path.join(src, entry);
    const destPath = path.join(dest, entry);
    if (fs.statSync(srcPath).isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

export function archiveWorkspace(name: string): string {
  const resolved = resolveWorkspace(name);
  const workspaceDir = resolved.workspaceDir;
  const statePath = path.join(workspaceDir, "state.json");

  if (!fs.existsSync(path.join(workspaceDir, ".stopped"))) {
    throw new Error("Stop the workspace before archiving");
  }

  if (!fs.existsSync(statePath)) {
    throw new Error(`Workspace "${name}" has no state.json.`);
  }

  const state = loadState(statePath);

  const dateStr = new Date().toISOString().slice(0, 10);
  const sanitizedBranch = state.branchName.replace(/\//g, "-");
  const archiveBase = path.join(
    WILLIAM_ROOT,
    "archive",
    `${dateStr}-${sanitizedBranch}`,
  );

  let archivePath = archiveBase;
  let counter = 2;
  while (fs.existsSync(archivePath)) {
    archivePath = `${archiveBase}-${counter}`;
    counter++;
  }

  fs.mkdirSync(archivePath, { recursive: true });

  // Copy state.json
  fs.copyFileSync(statePath, path.join(archivePath, "state.json"));

  // Copy progress.txt
  const progressPath = path.join(workspaceDir, "progress.txt");
  if (fs.existsSync(progressPath)) {
    fs.copyFileSync(progressPath, path.join(archivePath, "progress.txt"));
  }

  // Copy logs/ directory
  const logsDir = path.join(workspaceDir, "logs");
  if (fs.existsSync(logsDir)) {
    copyDirRecursive(logsDir, path.join(archivePath, "logs"));
  }

  // Copy source PRD
  if (fs.existsSync(state.sourceFile)) {
    fs.copyFileSync(
      state.sourceFile,
      path.join(archivePath, path.basename(state.sourceFile)),
    );
  }

  // Clean up git worktree if present
  if (state.worktreePath) {
    if (fs.existsSync(state.worktreePath)) {
      try {
        execSync(`git worktree remove ${JSON.stringify(state.worktreePath)}`, {
          cwd: state.targetDir,
          stdio: "pipe",
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new Error(
          `Cannot archive: worktree has uncommitted changes. Commit or discard changes first.\n${msg}`,
        );
      }
    } else {
      // Worktree directory already gone — prune stale references
      execSync("git worktree prune", { cwd: state.targetDir, stdio: "pipe" });
    }
  }

  // Remove workspace directory
  fs.rmSync(workspaceDir, { recursive: true, force: true });

  return archivePath;
}
