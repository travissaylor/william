#!/usr/bin/env tsx
/**
 * Skill helper for `/william pr`.
 * Subcommands:
 *   context <workspace>  – gather workspace state and PR context (PRD, diff, log, story status, template)
 */
import * as path from "path";
import * as fs from "fs";
import { execSync } from "child_process";
import { resolveWorkspace } from "../cli/workspace.js";
import { loadState } from "../lib/prd/tracker.js";
import { resolveTemplatePath } from "../lib/paths.js";
import { getWorkingDir } from "../cli/pr.js";
import { ensureBranchCheckout } from "../lib/git.js";
import type { WorkspaceState } from "../lib/types.js";

const MAX_DIFF_BYTES = 100_000;

function getGitDiff(branchName: string, cwd: string): string {
  try {
    const diff = execSync(`git diff main...${branchName}`, {
      cwd,
      stdio: "pipe",
      maxBuffer: 10 * 1024 * 1024,
    }).toString();
    if (diff.length > MAX_DIFF_BYTES) {
      return (
        diff.slice(0, MAX_DIFF_BYTES) +
        "\n\n[diff truncated — exceeded 100KB limit]"
      );
    }
    return diff;
  } catch {
    return "(unable to generate diff)";
  }
}

function getGitLog(branchName: string, cwd: string): string {
  try {
    return execSync(`git log main..${branchName} --oneline`, {
      cwd,
      stdio: "pipe",
    }).toString();
  } catch {
    return "(unable to generate log)";
  }
}

function formatStoryStatus(state: WorkspaceState): string {
  const lines: string[] = [];
  for (const [id, story] of Object.entries(state.stories)) {
    if (story.passes === true) {
      lines.push(`- [x] ${id} — complete`);
    } else if (story.passes === "skipped") {
      lines.push(
        `- [ ] ${id} — skipped${story.skipReason ? `: ${story.skipReason}` : ""}`,
      );
    } else {
      lines.push(`- [ ] ${id} — pending`);
    }
  }
  return lines.join("\n");
}

function hasUpstream(cwd: string): boolean {
  try {
    execSync("git rev-parse --abbrev-ref @{u}", {
      cwd,
      stdio: "pipe",
    });
    return true;
  } catch {
    return false;
  }
}

function cmdContext(workspaceName: string): void {
  const resolved = resolveWorkspace(workspaceName);
  const statePath = path.join(resolved.workspaceDir, "state.json");
  const state = loadState(statePath);

  const workingDir = getWorkingDir(state);

  if (!fs.existsSync(workingDir)) {
    throw new Error(
      `Working directory does not exist: ${workingDir}. Re-create the workspace with: william new`,
    );
  }

  // In branch mode, auto-checkout the workspace branch if needed
  if (!state.worktreePath) {
    ensureBranchCheckout(state.branchName, workingDir);
  }

  // Load PRD content
  const prdContent = fs.existsSync(state.sourceFile)
    ? fs.readFileSync(state.sourceFile, "utf-8")
    : "(PRD file not found)";

  // Gather git context
  const gitDiff = getGitDiff(state.branchName, workingDir);
  const gitLog = getGitLog(state.branchName, workingDir);
  const storyStatus = formatStoryStatus(state);

  // Load PR description template
  const templatePath = resolveTemplatePath("pr-description-instructions.md");
  const template = fs.readFileSync(templatePath, "utf-8");

  // Check for incomplete stories
  const incompleteStories = Object.entries(state.stories)
    .filter(([, story]) => story.passes !== true)
    .map(([id]) => id);

  console.log(
    JSON.stringify({
      workspaceName: resolved.workspaceName,
      projectName: resolved.projectName,
      workspaceDir: resolved.workspaceDir,
      branchName: state.branchName,
      targetDir: state.targetDir,
      worktreePath: state.worktreePath ?? null,
      workingDir,
      hasUpstream: hasUpstream(workingDir),
      incompleteStories,
      template,
      prdContent,
      gitDiff,
      gitLog,
      storyStatus,
    }),
  );
}

// --- main ---

const [subcommand, ...args] = process.argv.slice(2);

try {
  switch (subcommand) {
    case "context":
      if (!args[0]) throw new Error("Usage: pr.ts context <workspace>");
      cmdContext(args[0]);
      break;
    default:
      console.error(
        JSON.stringify({
          error: `Unknown subcommand: ${subcommand}. Valid: context`,
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
