#!/usr/bin/env tsx
/**
 * Skill helper for `/william status`.
 * Subcommands:
 *   status <workspace>  – detailed workspace status with wave/story breakdown
 *   list [project]      – list all workspaces, optionally filtered by project
 */
import * as path from "path";
import * as fs from "fs";
import { resolveWorkspace } from "../cli/workspace.js";
import { loadState } from "../lib/prd/tracker.js";
import { parsePrd } from "../lib/prd/parser.js";
import { WILLIAM_ROOT } from "../cli/runner.js";
import type { WorkspaceState } from "../lib/types.js";

function getStoryStatus(
  s: WorkspaceState["stories"][string],
): "passed" | "failed" | "skipped" | "in-progress" | "pending" {
  if (s.passes === true) return "passed";
  if (s.passes === "skipped") return "skipped";
  if (s.passes === "interrupted") return "in-progress";
  if (s.attempts > 0) return "failed";
  return "pending";
}

function cmdStatus(workspaceName: string): void {
  const resolved = resolveWorkspace(workspaceName);
  const statePath = path.join(resolved.workspaceDir, "state.json");
  const state = loadState(statePath);

  const waves = state.waves ?? [];
  const currentWave = state.currentWave ?? 0;
  const waveResults = state.waveResults ?? [];

  const totalStories = Object.keys(state.stories).length;
  const completedStories = Object.values(state.stories).filter(
    (s) => s.passes === true,
  ).length;
  const skippedStories = Object.values(state.stories).filter(
    (s) => s.passes === "skipped",
  ).length;
  const failedStories = Object.values(state.stories).filter(
    (s) => s.passes !== true && s.passes !== "skipped" && s.attempts > 0,
  ).length;

  const allDone = Object.values(state.stories).every(
    (s) => s.passes === true || s.passes === "skipped",
  );

  // Load PRD for story titles
  const prdPath = path.join(resolved.workspaceDir, "prd.md");
  const storyTitles: Record<string, string> = {};
  if (fs.existsSync(prdPath)) {
    const parsedPrd = parsePrd(fs.readFileSync(prdPath, "utf-8"));
    for (const s of parsedPrd.stories) {
      storyTitles[s.id] = s.title;
    }
  }

  // Build per-wave story details
  const waveBreakdown: {
    waveNumber: number;
    stories: {
      id: string;
      title: string;
      status: string;
      attempts: number;
    }[];
    completed: boolean;
  }[] = [];

  if (waves.length > 0) {
    for (let i = 0; i < waves.length; i++) {
      const waveStoryIds = waves[i];
      const stories = waveStoryIds.map((id) => {
        const s = state.stories[id];
        return {
          id,
          title: storyTitles[id] ?? id,
          status: getStoryStatus(s),
          attempts: s.attempts,
        };
      });
      const completed =
        i < currentWave ||
        stories.every((s) => s.status === "passed" || s.status === "skipped");
      waveBreakdown.push({
        waveNumber: i + 1,
        stories,
        completed,
      });
    }
  } else {
    // No waves — all stories in a single group
    const stories = Object.entries(state.stories).map(([id, s]) => ({
      id,
      title: storyTitles[id] ?? id,
      status: getStoryStatus(s),
      attempts: s.attempts,
    }));
    const completed = stories.every(
      (s) => s.status === "passed" || s.status === "skipped",
    );
    waveBreakdown.push({ waveNumber: 1, stories, completed });
  }

  // Revision info
  const revisions = state.revisions ?? [];

  console.log(
    JSON.stringify({
      workspaceName: resolved.workspaceName,
      projectName: resolved.projectName,
      branchName: state.branchName,
      gitWorkflow: state.gitWorkflow ?? "worktree",
      targetDir: state.targetDir,
      totalStories,
      completedStories,
      skippedStories,
      failedStories,
      totalWaves: waves.length || 1,
      currentWave: waves.length > 0 ? currentWave + 1 : 1,
      allDone,
      startedAt: state.startedAt,
      waveBreakdown,
      waveResults: waveResults.map((wr) => ({
        wave: wr.wave,
        completedAt: wr.completedAt,
        outcomes: wr.storyOutcomes,
      })),
      revisions,
    }),
  );
}

function cmdList(projectFilter?: string): void {
  const workspacesRoot = path.join(WILLIAM_ROOT, "workspaces");

  if (!fs.existsSync(workspacesRoot)) {
    console.log(JSON.stringify({ workspaces: [] }));
    return;
  }

  const projectDirs = fs
    .readdirSync(workspacesRoot)
    .filter((entry) => {
      const full = path.join(workspacesRoot, entry);
      return fs.statSync(full).isDirectory();
    })
    .filter((p) => !projectFilter || p === projectFilter);

  const workspaces: {
    projectName: string;
    workspaceName: string;
    branchName: string;
    totalStories: number;
    completedStories: number;
    allDone: boolean;
    startedAt: string;
  }[] = [];

  for (const projectName of projectDirs) {
    const projectDir = path.join(workspacesRoot, projectName);
    const entries = fs.readdirSync(projectDir).filter((entry) => {
      const full = path.join(projectDir, entry);
      return (
        fs.statSync(full).isDirectory() &&
        fs.existsSync(path.join(full, "state.json"))
      );
    });

    for (const wsName of entries) {
      try {
        const statePath = path.join(projectDir, wsName, "state.json");
        const state = loadState(statePath);
        const totalStories = Object.keys(state.stories).length;
        const completedStories = Object.values(state.stories).filter(
          (s) => s.passes === true,
        ).length;
        const allDone = Object.values(state.stories).every(
          (s) => s.passes === true || s.passes === "skipped",
        );

        workspaces.push({
          projectName,
          workspaceName: wsName,
          branchName: state.branchName,
          totalStories,
          completedStories,
          allDone,
          startedAt: state.startedAt,
        });
      } catch {
        // Skip workspaces with invalid state
      }
    }
  }

  console.log(JSON.stringify({ workspaces }));
}

// --- main ---

const [subcommand, ...args] = process.argv.slice(2);

try {
  switch (subcommand) {
    case "status":
      if (!args[0]) throw new Error("Usage: status.ts status <workspace>");
      cmdStatus(args[0]);
      break;
    case "list":
      cmdList(args[0]);
      break;
    default:
      console.error(
        JSON.stringify({
          error: `Unknown subcommand: ${subcommand}. Valid: status, list`,
        }),
      );
      process.exit(1);
  }
} catch (err) {
  console.error(
    JSON.stringify({
      error: err instanceof Error ? err.message : String(err),
    }),
  );
  process.exit(1);
}
