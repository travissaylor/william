import * as fs from "fs";
import * as path from "path";
import { createElement } from "react";
import { render } from "ink";
import { parsePrd } from "./prd/parser.js";
import { initStateFromPrd, loadState, getCurrentStory } from "./prd/tracker.js";
import { runWorkspace, WILLIAM_ROOT, type RunOpts } from "./runner.js";
import { TuiEmitter } from "./ui/events.js";
import { App } from "./ui/App.js";
import type { WorkspaceState } from "./types.js";

export interface ResolvedWorkspace {
  workspaceDir: string;
  workspaceName: string;
  projectName: string;
}

/**
 * Resolve a workspace by name or project/name path.
 * Scans workspaces/{project}/{name}/ directories to find matches.
 */
export function resolveWorkspace(nameOrPath: string): ResolvedWorkspace {
  const workspacesRoot = path.join(WILLIAM_ROOT, "workspaces");

  if (!fs.existsSync(workspacesRoot)) {
    throw new Error(
      `No workspaces directory found. Create a workspace first with: william new`,
    );
  }

  // If the input contains a slash, treat it as project/workspace
  if (nameOrPath.includes("/")) {
    const [projectName, workspaceName] = nameOrPath.split("/");
    const workspaceDir = path.join(workspacesRoot, projectName, workspaceName);
    if (!fs.existsSync(workspaceDir)) {
      throw new Error(
        `Workspace "${workspaceName}" not found under project "${projectName}".`,
      );
    }
    return { workspaceDir, workspaceName, projectName };
  }

  // Scan all project directories for a matching workspace name
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

export interface CreateWorkspaceOpts {
  targetDir: string;
  prdFile: string;
  branchName: string;
  project?: string;
}

export function createWorkspace(name: string, opts: CreateWorkspaceOpts): void {
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

  const state = initStateFromPrd(parsedPrd, {
    workspace: name,
    project: projectName,
    targetDir: resolvedTarget,
    branchName: opts.branchName,
    sourceFile: prdPath,
  });

  fs.mkdirSync(path.join(workspaceDir, "logs"), { recursive: true });
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
    const workspaces = fs.readdirSync(projectPath).filter((entry) => {
      const full = path.join(projectPath, entry);
      return (
        fs.statSync(full).isDirectory() &&
        fs.existsSync(path.join(full, "state.json"))
      );
    });

    if (workspaces.length > 0) {
      result[project] = workspaces;
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

  const summary = `${passed}/${total} complete, ${skipped} skipped, ${pending} pending${currentStory ? ` (current: ${currentStory})` : ""}`;

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
