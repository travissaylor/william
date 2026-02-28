import * as fs from "fs";
import { execSync, spawnSync } from "child_process";
import { resolveWorkspace } from "./workspace.js";
import { loadState } from "./prd/tracker.js";
import { resolveTemplatePath } from "./paths.js";
import type { WorkspaceState } from "./types.js";

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

export interface PrDescription {
  title: string;
  body: string;
}

const MAX_DIFF_BYTES = 100_000;

function getGitDiff(branchName: string, worktreePath: string): string {
  try {
    const diff = execSync(`git diff main...${branchName}`, {
      cwd: worktreePath,
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

function getGitLog(branchName: string, worktreePath: string): string {
  try {
    return execSync(`git log main..${branchName} --oneline`, {
      cwd: worktreePath,
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

export function generatePrDescription(state: WorkspaceState): PrDescription {
  if (!state.worktreePath) {
    throw new Error("Workspace has no worktree path");
  }
  const worktreePath = state.worktreePath;
  const branchName = state.branchName;

  // Load PRD content
  const prdContent = fs.existsSync(state.sourceFile)
    ? fs.readFileSync(state.sourceFile, "utf-8")
    : "(PRD file not found)";

  // Gather git context
  const gitDiff = getGitDiff(branchName, worktreePath);
  const gitLog = getGitLog(branchName, worktreePath);
  const storyStatus = formatStoryStatus(state);

  // Build prompt from template
  const templatePath = resolveTemplatePath("pr-description-instructions.md");
  const template = fs.readFileSync(templatePath, "utf-8");

  const prompt = template
    .replace("{{prd}}", prdContent)
    .replace("{{git_diff}}", gitDiff)
    .replace("{{git_log}}", gitLog)
    .replace("{{story_status}}", storyStatus);

  // Spawn Claude with --print flag to get direct output.
  // Pipe the prompt via stdin to avoid OS argument length limits on large diffs.
  const result = spawnSync("claude", ["--print"], {
    input: prompt,
    cwd: worktreePath,
    stdio: ["pipe", "pipe", "pipe"],
    maxBuffer: 10 * 1024 * 1024,
  });

  if (result.error) {
    throw new Error(`Failed to spawn Claude: ${result.error.message}`);
  }

  if (result.status !== 0) {
    const stderr = result.stderr.toString().trim();
    throw new Error(
      `Claude exited with code ${result.status}${stderr ? `: ${stderr}` : ""}`,
    );
  }

  const output = result.stdout.toString().trim();

  // Parse JSON response — handle possible markdown code fences
  let jsonStr = output;
  const fenceMatch = /```(?:json)?\s*\n?([\s\S]*?)\n?```/.exec(output);
  if (fenceMatch) {
    jsonStr = fenceMatch[1].trim();
  }

  let parsed: { title?: string; body?: string };
  try {
    parsed = JSON.parse(jsonStr) as { title?: string; body?: string };
  } catch {
    throw new Error(
      `Failed to parse Claude response as JSON. Raw output:\n${output}`,
    );
  }

  if (typeof parsed.title !== "string" || typeof parsed.body !== "string") {
    throw new Error(
      `Claude response missing "title" or "body" fields. Parsed:\n${JSON.stringify(parsed, null, 2)}`,
    );
  }

  return { title: parsed.title, body: parsed.body };
}

/**
 * Create a new PR or update an existing one using the `gh` CLI.
 * Returns the PR URL on success.
 */
export function createOrUpdatePr(
  existingPr: ExistingPr | null,
  description: PrDescription,
  worktreePath: string,
): string {
  if (existingPr) {
    // Update existing PR
    try {
      execSync(
        `gh pr edit ${existingPr.number} --title ${shellEscape(description.title)} --body ${shellEscape(description.body)}`,
        { cwd: worktreePath, stdio: "pipe" },
      );
    } catch (err) {
      const stderr =
        err instanceof Error && "stderr" in err
          ? String((err as NodeJS.ErrnoException & { stderr: Buffer }).stderr)
          : "";
      const message =
        stderr.trim() || (err instanceof Error ? err.message : String(err));
      throw new Error(`Failed to update PR #${existingPr.number}: ${message}`);
    }
    return existingPr.url;
  }

  // Create new PR
  let output: string;
  try {
    output = execSync(
      `gh pr create --base main --title ${shellEscape(description.title)} --body ${shellEscape(description.body)}`,
      { cwd: worktreePath, stdio: "pipe" },
    ).toString();
  } catch (err) {
    const stderr =
      err instanceof Error && "stderr" in err
        ? String((err as NodeJS.ErrnoException & { stderr: Buffer }).stderr)
        : "";
    const message =
      stderr.trim() || (err instanceof Error ? err.message : String(err));
    throw new Error(`Failed to create PR: ${message}`);
  }

  // gh pr create prints the URL to stdout
  const url = output.trim();
  return url;
}

/**
 * Escape a string for safe use as a shell argument.
 */
function shellEscape(str: string): string {
  return "'" + str.replace(/'/g, "'\\''") + "'";
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
  const existingPr = findExistingPr(state.branchName, state.worktreePath);

  // US-004: Generate PR title and description via Claude
  const prDescription = generatePrDescription(state);

  // US-005: Create or update the GitHub PR (skip if dry run)
  if (options.dryRun) {
    console.log("Dry run — no PR created\n");
    console.log(`Title: ${prDescription.title}\n`);
    console.log(prDescription.body);
    return;
  }

  const prUrl = createOrUpdatePr(existingPr, prDescription, state.worktreePath);
  console.log(prUrl);
}
