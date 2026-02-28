import * as fs from "fs";
import * as path from "path";
import { execSync, spawnSync } from "child_process";
import { createElement } from "react";
import { render } from "ink";
import { parsePrd } from "./prd/parser.js";
import {
  initStateFromPrd,
  loadState,
  saveState,
  getCurrentStory,
} from "./prd/tracker.js";
import { runWorkspace, WILLIAM_ROOT, type RunOpts } from "./runner.js";
import { TuiEmitter } from "./ui/events.js";
import { App } from "./ui/App.js";
import type { WorkspaceState, RevisionEntry } from "./types.js";
import { loadProjectConfig } from "./config.js";

export interface ResolvedWorkspace {
  workspaceDir: string;
  workspaceName: string;
  projectName: string;
}

/**
 * Resolve a workspace by name or project/name path.
 * Scans workspaces/{project}/{name}/ directories to find matches.
 * Also supports revision paths: workspace/revision-N or project/workspace/revision-N.
 */
export function resolveWorkspace(nameOrPath: string): ResolvedWorkspace {
  const workspacesRoot = path.join(WILLIAM_ROOT, "workspaces");

  if (!fs.existsSync(workspacesRoot)) {
    throw new Error(
      `No workspaces directory found. Create a workspace first with: william new`,
    );
  }

  const parts = nameOrPath.split("/");

  // Three-part path: project/workspace/revision-N
  if (parts.length === 3) {
    const [projectName, parentName, revisionName] = parts;
    const workspaceDir = path.join(
      workspacesRoot,
      projectName,
      parentName,
      revisionName,
    );
    if (!fs.existsSync(workspaceDir)) {
      throw new Error(
        `Revision workspace "${revisionName}" not found under "${projectName}/${parentName}".`,
      );
    }
    return {
      workspaceDir,
      workspaceName: `${parentName}/${revisionName}`,
      projectName,
    };
  }

  // Two-part path: could be project/workspace or workspace/revision-N
  if (parts.length === 2) {
    const [first, second] = parts;

    // If the second part looks like a revision, try workspace/revision-N first
    if (/^revision-\d+$/.test(second)) {
      const projectDirs = fs.readdirSync(workspacesRoot).filter((entry) => {
        const full = path.join(workspacesRoot, entry);
        return fs.statSync(full).isDirectory();
      });

      const revisionMatches: ResolvedWorkspace[] = [];
      for (const projectName of projectDirs) {
        const candidate = path.join(workspacesRoot, projectName, first, second);
        if (
          fs.existsSync(candidate) &&
          fs.statSync(candidate).isDirectory() &&
          fs.existsSync(path.join(candidate, "state.json"))
        ) {
          revisionMatches.push({
            workspaceDir: candidate,
            workspaceName: `${first}/${second}`,
            projectName,
          });
        }
      }

      if (revisionMatches.length === 1) {
        return revisionMatches[0];
      }
      if (revisionMatches.length > 1) {
        const listing = revisionMatches
          .map((m) => `  ${m.projectName}/${m.workspaceName}`)
          .join("\n");
        throw new Error(
          `Revision workspace "${nameOrPath}" exists under multiple projects:\n${listing}\nSpecify the project: william status <project>/${nameOrPath}`,
        );
      }
    }

    // Fall back to project/workspace interpretation
    const [projectName, workspaceName] = parts;
    const workspaceDir = path.join(workspacesRoot, projectName, workspaceName);
    if (!fs.existsSync(workspaceDir)) {
      throw new Error(
        `Workspace "${workspaceName}" not found under project "${projectName}".`,
      );
    }
    return { workspaceDir, workspaceName, projectName };
  }

  // Single name: scan all project directories for a matching workspace name
  const matches: ResolvedWorkspace[] = [];
  const projectDirs = fs.readdirSync(workspacesRoot).filter((entry) => {
    const full = path.join(workspacesRoot, entry);
    return fs.statSync(full).isDirectory();
  });

  for (const projectName of projectDirs) {
    const candidate = path.join(workspacesRoot, projectName, nameOrPath);
    if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
      matches.push({
        workspaceDir: candidate,
        workspaceName: nameOrPath,
        projectName,
      });
    }
  }

  if (matches.length === 0) {
    throw new Error(
      `Workspace "${nameOrPath}" not found. Create it first with: william new`,
    );
  }

  if (matches.length > 1) {
    const listing = matches
      .map((m) => `  ${m.projectName}/${m.workspaceName}`)
      .join("\n");
    throw new Error(
      `Workspace "${nameOrPath}" exists under multiple projects:\n${listing}\nSpecify the project: william start <project>/${nameOrPath}`,
    );
  }

  return matches[0];
}

/**
 * Detect the package manager from lockfiles in a directory and run install.
 * If no lockfile is found, silently skips. If install fails, cleans up
 * the workspace directory and throws.
 */
function installWorktreeDeps(worktreePath: string, workspaceDir: string): void {
  const lockfileMap: [string, string, string[]][] = [
    ["pnpm-lock.yaml", "pnpm", ["install"]],
    ["package-lock.json", "npm", ["install"]],
    ["yarn.lock", "yarn", ["install"]],
    ["bun.lockb", "bun", ["install"]],
    ["bun.lock", "bun", ["install"]],
  ];

  let detected: { cmd: string; args: string[] } | null = null;
  for (const [lockfile, cmd, args] of lockfileMap) {
    if (fs.existsSync(path.join(worktreePath, lockfile))) {
      detected = { cmd, args };
      break;
    }
  }

  if (!detected) return;

  const result = spawnSync(detected.cmd, detected.args, {
    cwd: worktreePath,
    stdio: "inherit",
  });

  if (result.status !== 0) {
    fs.rmSync(workspaceDir, { recursive: true, force: true });
    const msg = result.error
      ? result.error.message
      : `${detected.cmd} ${detected.args.join(" ")} exited with code ${result.status}`;
    throw new Error(`Failed to install dependencies in worktree: ${msg}`);
  }
}

/**
 * Load project config from the target directory and run each setupCommands
 * entry sequentially in the worktree. Failures log a warning but do not abort.
 */
export function runSetupCommands(
  targetDir: string,
  worktreePath: string,
): void {
  const config = loadProjectConfig(targetDir);
  if (!config?.setupCommands?.length) return;

  for (const cmd of config.setupCommands) {
    console.log(`[william] Running setup: ${cmd}`);
    const result = spawnSync(cmd, {
      shell: true,
      cwd: worktreePath,
      stdio: "inherit",
    });
    if (result.status !== 0) {
      console.error(
        `[william] Warning: setup command failed: ${cmd} (exit code ${result.status})`,
      );
    }
  }
}

export interface CreateWorkspaceOpts {
  targetDir: string;
  prdFile: string;
  branchName: string;
  project?: string;
}

export function createWorkspace(
  name: string,
  opts: CreateWorkspaceOpts,
): string {
  const projectName =
    opts.project ?? path.basename(path.resolve(opts.targetDir));
  const workspaceDir = path.join(WILLIAM_ROOT, "workspaces", projectName, name);
  const prdPath = path.resolve(opts.prdFile);

  if (fs.existsSync(workspaceDir)) {
    throw new Error(
      `Workspace "${name}" already exists under project "${projectName}" at ${workspaceDir}`,
    );
  }

  const resolvedTarget = path.resolve(opts.targetDir);
  if (!fs.existsSync(resolvedTarget)) {
    throw new Error(`Target directory does not exist: ${resolvedTarget}`);
  }
  if (!fs.existsSync(path.join(resolvedTarget, ".git"))) {
    throw new Error(
      `Target directory is not a git repository (no .git found): ${resolvedTarget}`,
    );
  }

  if (!fs.existsSync(prdPath)) {
    throw new Error(`PRD file not found: ${prdPath}`);
  }

  const rawMarkdown = fs.readFileSync(prdPath, "utf-8");
  const parsedPrd = parsePrd(rawMarkdown);

  // Create workspace directory structure first
  fs.mkdirSync(path.join(workspaceDir, "logs"), { recursive: true });

  // Create git worktree for isolation
  const worktreePath = path.join(workspaceDir, "worktree");
  try {
    // Try creating with a new branch first
    execSync(
      `git worktree add ${JSON.stringify(worktreePath)} -b ${JSON.stringify(opts.branchName)}`,
      {
        cwd: resolvedTarget,
        stdio: "pipe",
      },
    );
  } catch {
    // Branch may already exist — try without -b to reuse it
    try {
      execSync(
        `git worktree add ${JSON.stringify(worktreePath)} ${JSON.stringify(opts.branchName)}`,
        {
          cwd: resolvedTarget,
          stdio: "pipe",
        },
      );
    } catch (err) {
      // Clean up the partially created workspace directory
      fs.rmSync(workspaceDir, { recursive: true, force: true });
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(
        `Failed to create git worktree for branch "${opts.branchName}": ${msg}`,
      );
    }
  }

  // Install dependencies in the worktree if a known lockfile is present
  installWorktreeDeps(worktreePath, workspaceDir);

  // Run project-level setup commands if configured
  runSetupCommands(resolvedTarget, worktreePath);

  const state = initStateFromPrd(parsedPrd, {
    workspace: name,
    project: projectName,
    targetDir: resolvedTarget,
    branchName: opts.branchName,
    sourceFile: prdPath,
    worktreePath,
  });

  fs.writeFileSync(
    path.join(workspaceDir, "state.json"),
    JSON.stringify(state, null, 2),
    "utf-8",
  );
  fs.writeFileSync(
    path.join(workspaceDir, "progress.txt"),
    "## Codebase Patterns\n(none yet)\n\n---\n",
    "utf-8",
  );

  // Copy the PRD into the workspace directory
  fs.copyFileSync(prdPath, path.join(workspaceDir, "prd.md"));

  return worktreePath;
}

export interface CreateRevisionWorkspaceOpts {
  parentWorkspaceDir: string;
  parentState: WorkspaceState;
  plan: string;
}

export interface RevisionWorkspaceResult {
  revisionDir: string;
  revisionNumber: number;
}

/**
 * Creates a child revision workspace inside the parent workspace directory.
 * The revision workspace shares the parent's git branch and tracks revision items
 * parsed from the approved plan.
 */
export function createRevisionWorkspace(
  opts: CreateRevisionWorkspaceOpts,
): RevisionWorkspaceResult {
  const { parentWorkspaceDir, parentState, plan } = opts;

  // Determine next available revision number
  let revisionNumber = 1;
  while (
    fs.existsSync(path.join(parentWorkspaceDir, `revision-${revisionNumber}`))
  ) {
    revisionNumber++;
  }

  const revisionDir = path.join(
    parentWorkspaceDir,
    `revision-${revisionNumber}`,
  );

  // Wrap the plan in a parseable PRD structure
  const prdContent = `# Revision Plan\n\n## User Stories\n\n${plan}`;

  const parsedPrd = parsePrd(prdContent);

  const state = initStateFromPrd(parsedPrd, {
    workspace: `${parentState.workspace}/revision-${revisionNumber}`,
    project: parentState.project,
    targetDir: parentState.targetDir,
    branchName: parentState.branchName,
    sourceFile: path.join(revisionDir, "prd.md"),
    worktreePath: parentState.worktreePath,
  });

  // Add revision-specific fields
  state.parentWorkspace = parentWorkspaceDir;
  state.revisionNumber = revisionNumber;

  fs.mkdirSync(path.join(revisionDir, "logs"), { recursive: true });
  fs.writeFileSync(
    path.join(revisionDir, "state.json"),
    JSON.stringify(state, null, 2),
    "utf-8",
  );
  fs.writeFileSync(
    path.join(revisionDir, "progress.txt"),
    "## Codebase Patterns\n(none yet)\n\n---\n",
    "utf-8",
  );
  fs.writeFileSync(path.join(revisionDir, "prd.md"), prdContent, "utf-8");

  return { revisionDir, revisionNumber };
}

/**
 * After a revision workspace completes, update the parent workspace's state.json
 * with a revisions array entry recording the completed revision.
 */
export function updateParentAfterRevision(
  parentWorkspaceDir: string,
  revisionDir: string,
  revisionNumber: number,
  itemCount: number,
): void {
  const parentStatePath = path.join(parentWorkspaceDir, "state.json");
  const parentState = loadState(parentStatePath);

  const entry: RevisionEntry = {
    number: revisionNumber,
    completedAt: new Date().toISOString(),
    itemCount,
    path: `revision-${revisionNumber}`,
  };

  const revisions = parentState.revisions ?? [];
  revisions.push(entry);
  parentState.revisions = revisions;

  saveState(parentStatePath, parentState);
}

export async function startWorkspace(
  name: string,
  opts: RunOpts,
): Promise<void> {
  const resolved = resolveWorkspace(name);

  const statePath = path.join(resolved.workspaceDir, "state.json");
  const initialState = loadState(statePath);

  const emitter = new TuiEmitter();
  const inkApp = render(
    createElement(App, {
      emitter,
      workspaceName: resolved.workspaceName,
      initialState,
      maxIterations: opts.maxIterations ?? 20,
    }),
  );

  try {
    await runWorkspace(
      resolved.workspaceName,
      resolved.workspaceDir,
      opts,
      emitter,
    );
  } finally {
    inkApp.unmount();
  }
}

export function stopWorkspace(name: string): void {
  const resolved = resolveWorkspace(name);
  fs.writeFileSync(
    path.join(resolved.workspaceDir, ".stopped"),
    new Date().toISOString(),
    "utf-8",
  );
  console.log(
    `[william] Stop signal written for workspace "${resolved.projectName}/${resolved.workspaceName}".`,
  );

  const statePath = path.join(resolved.workspaceDir, "state.json");
  if (fs.existsSync(statePath)) {
    const state = loadState(statePath);
    if (state.worktreePath) {
      console.log(
        `Workspace stopped. Worktree with in-progress work is at: ${state.worktreePath}`,
      );
    }
  }
}

export function listWorkspaces(): string[] {
  const workspacesDir = path.join(WILLIAM_ROOT, "workspaces");
  if (!fs.existsSync(workspacesDir)) {
    return [];
  }
  return fs
    .readdirSync(workspacesDir)
    .filter((entry) =>
      fs.statSync(path.join(workspacesDir, entry)).isDirectory(),
    );
}

/**
 * List workspaces grouped by project name.
 * Returns a map of project name → workspace names.
 */
export function listGroupedWorkspaces(): Record<string, string[]> {
  const workspacesDir = path.join(WILLIAM_ROOT, "workspaces");
  if (!fs.existsSync(workspacesDir)) {
    return {};
  }

  const result: Record<string, string[]> = {};
  const projectDirs = fs
    .readdirSync(workspacesDir)
    .filter((entry) =>
      fs.statSync(path.join(workspacesDir, entry)).isDirectory(),
    );

  for (const project of projectDirs) {
    const projectPath = path.join(workspacesDir, project);
    const entries: string[] = [];
    const workspaces = fs.readdirSync(projectPath).filter((entry) => {
      const full = path.join(projectPath, entry);
      return (
        fs.statSync(full).isDirectory() &&
        fs.existsSync(path.join(full, "state.json"))
      );
    });

    for (const ws of workspaces) {
      entries.push(ws);

      // Scan for revision subdirectories
      const wsPath = path.join(projectPath, ws);
      const revisionDirs = fs
        .readdirSync(wsPath)
        .filter((entry) => {
          const full = path.join(wsPath, entry);
          return (
            /^revision-\d+$/.test(entry) &&
            fs.statSync(full).isDirectory() &&
            fs.existsSync(path.join(full, "state.json"))
          );
        })
        .sort(
          (a, b) =>
            parseInt(a.replace("revision-", ""), 10) -
            parseInt(b.replace("revision-", ""), 10),
        );

      for (const rev of revisionDirs) {
        entries.push(`${ws}/${rev}`);
      }
    }

    if (entries.length > 0) {
      result[project] = entries;
    }
  }

  return result;
}

export interface WorkspaceStatus {
  name: string;
  state: WorkspaceState;
  currentStory: string | null;
  summary: string;
  runningStatus: "running" | "stopped" | "paused";
}

export interface RevisionStatusEntry {
  name: string;
  status: string;
  passed: number;
  total: number;
}

/**
 * Discover revision subdirectories for a workspace and return their status info.
 */
export function getRevisionStatuses(
  workspaceDir: string,
): RevisionStatusEntry[] {
  const results: RevisionStatusEntry[] = [];
  if (!fs.existsSync(workspaceDir)) return results;

  const entries = fs
    .readdirSync(workspaceDir)
    .filter((entry) => {
      const full = path.join(workspaceDir, entry);
      return (
        /^revision-\d+$/.test(entry) &&
        fs.statSync(full).isDirectory() &&
        fs.existsSync(path.join(full, "state.json"))
      );
    })
    .sort(
      (a, b) =>
        parseInt(a.replace("revision-", ""), 10) -
        parseInt(b.replace("revision-", ""), 10),
    );

  for (const rev of entries) {
    const revStatePath = path.join(workspaceDir, rev, "state.json");
    try {
      const revState = loadState(revStatePath);
      const storyValues = Object.values(revState.stories);
      const passed = storyValues.filter((s) => s.passes === true).length;
      const total = storyValues.length;
      const allDone =
        total > 0 &&
        storyValues.every((s) => s.passes === true || s.passes === "skipped");

      let status = "running";
      if (fs.existsSync(path.join(workspaceDir, rev, ".stopped"))) {
        status = "stopped";
      } else if (fs.existsSync(path.join(workspaceDir, rev, ".paused"))) {
        status = "paused";
      } else if (allDone) {
        status = "completed";
      }

      results.push({ name: rev, status, passed, total });
    } catch {
      results.push({ name: rev, status: "unknown", passed: 0, total: 0 });
    }
  }

  return results;
}

export function getWorkspaceStatus(name: string): WorkspaceStatus {
  const resolved = resolveWorkspace(name);
  const statePath = path.join(resolved.workspaceDir, "state.json");

  if (!fs.existsSync(statePath)) {
    throw new Error(`Workspace "${name}" has no state.json.`);
  }

  const state = loadState(statePath);
  const currentStory = getCurrentStory(state);

  const storyValues = Object.values(state.stories);
  const total = storyValues.length;
  const passed = storyValues.filter((s) => s.passes === true).length;
  const skipped = storyValues.filter((s) => s.passes === "skipped").length;
  const pending = storyValues.filter((s) => s.passes === false).length;

  const revisionCount = state.revisions?.length ?? 0;
  const revisionSuffix =
    revisionCount > 0
      ? ` [${revisionCount} ${revisionCount === 1 ? "revision" : "revisions"}]`
      : "";

  const summary = `${passed}/${total} complete, ${skipped} skipped, ${pending} pending${currentStory ? ` (current: ${currentStory})` : ""}${revisionSuffix}`;

  let runningStatus: "running" | "stopped" | "paused" = "running";
  if (fs.existsSync(path.join(resolved.workspaceDir, ".stopped"))) {
    runningStatus = "stopped";
  } else if (fs.existsSync(path.join(resolved.workspaceDir, ".paused"))) {
    runningStatus = "paused";
  }

  return {
    name: `${resolved.projectName}/${resolved.workspaceName}`,
    state,
    currentStory,
    summary,
    runningStatus,
  };
}
