import * as fs from 'fs';
import * as path from 'path';
import { parsePrd } from './prd/parser.js';
import { initStateFromPrd, loadState, getCurrentStory } from './prd/tracker.js';
import { runWorkspace, WILLIAM_ROOT, type RunOpts } from './runner.js';
import type { WorkspaceState } from './types.js';

export interface CreateWorkspaceOpts {
  targetDir: string;
  prdFile: string;
  branchName: string;
  project?: string;
}

export function createWorkspace(name: string, opts: CreateWorkspaceOpts): void {
  const workspaceDir = path.join(WILLIAM_ROOT, 'workspaces', name);
  const prdPath = path.resolve(opts.prdFile);

  if (fs.existsSync(workspaceDir)) {
    throw new Error(`Workspace "${name}" already exists at ${workspaceDir}`);
  }

  const resolvedTarget = path.resolve(opts.targetDir);
  if (!fs.existsSync(resolvedTarget)) {
    throw new Error(`Target directory does not exist: ${resolvedTarget}`);
  }
  if (!fs.existsSync(path.join(resolvedTarget, '.git'))) {
    throw new Error(`Target directory is not a git repository (no .git found): ${resolvedTarget}`);
  }

  if (!fs.existsSync(prdPath)) {
    throw new Error(`PRD file not found: ${prdPath}`);
  }

  const rawMarkdown = fs.readFileSync(prdPath, 'utf-8');
  const parsedPrd = parsePrd(rawMarkdown);

  const state = initStateFromPrd(parsedPrd, {
    workspace: name,
    project: opts.project ?? path.basename(resolvedTarget),
    targetDir: resolvedTarget,
    branchName: opts.branchName,
    sourceFile: prdPath,
  });

  fs.mkdirSync(path.join(workspaceDir, 'logs'), { recursive: true });
  fs.writeFileSync(path.join(workspaceDir, 'state.json'), JSON.stringify(state, null, 2), 'utf-8');
  fs.writeFileSync(
    path.join(workspaceDir, 'progress.txt'),
    '## Codebase Patterns\n(none yet)\n\n---\n',
    'utf-8',
  );
}

export async function startWorkspace(name: string, opts: RunOpts): Promise<void> {
  const workspaceDir = path.join(WILLIAM_ROOT, 'workspaces', name);
  if (!fs.existsSync(workspaceDir)) {
    throw new Error(
      `Workspace "${name}" does not exist. Create it first with: william start ${name} --target <dir> --prd <file> --branch <name>`,
    );
  }
  await runWorkspace(name, opts);
}

export function stopWorkspace(name: string): void {
  const workspaceDir = path.join(WILLIAM_ROOT, 'workspaces', name);
  if (!fs.existsSync(workspaceDir)) {
    throw new Error(`Workspace "${name}" does not exist.`);
  }
  fs.writeFileSync(path.join(workspaceDir, '.stopped'), new Date().toISOString(), 'utf-8');
  console.log(`[william] Stop signal written for workspace "${name}".`);
}

export function listWorkspaces(): string[] {
  const workspacesDir = path.join(WILLIAM_ROOT, 'workspaces');
  if (!fs.existsSync(workspacesDir)) {
    return [];
  }
  return fs
    .readdirSync(workspacesDir)
    .filter((entry) => fs.statSync(path.join(workspacesDir, entry)).isDirectory());
}

export interface WorkspaceStatus {
  name: string;
  state: WorkspaceState;
  currentStory: string | null;
  summary: string;
  runningStatus: 'running' | 'stopped' | 'paused';
}

export function getWorkspaceStatus(name: string): WorkspaceStatus {
  const workspaceDir = path.join(WILLIAM_ROOT, 'workspaces', name);
  const statePath = path.join(workspaceDir, 'state.json');

  if (!fs.existsSync(workspaceDir)) {
    throw new Error(`Workspace "${name}" does not exist.`);
  }
  if (!fs.existsSync(statePath)) {
    throw new Error(`Workspace "${name}" has no state.json.`);
  }

  const state = loadState(statePath);
  const currentStory = getCurrentStory(state);

  const storyValues = Object.values(state.stories);
  const total = storyValues.length;
  const passed = storyValues.filter((s) => s.passes === true).length;
  const skipped = storyValues.filter((s) => s.passes === 'skipped').length;
  const pending = storyValues.filter((s) => s.passes === false).length;

  const summary = `${passed}/${total} complete, ${skipped} skipped, ${pending} pending${currentStory ? ` (current: ${currentStory})` : ''}`;

  let runningStatus: 'running' | 'stopped' | 'paused' = 'running';
  if (fs.existsSync(path.join(workspaceDir, '.stopped'))) {
    runningStatus = 'stopped';
  } else if (fs.existsSync(path.join(workspaceDir, '.paused'))) {
    runningStatus = 'paused';
  }

  return { name, state, currentStory, summary, runningStatus };
}
