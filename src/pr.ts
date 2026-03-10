import * as fs from "fs";
import { execSync } from "child_process";
import ora from "ora";
import { resolveWorkspace } from "./workspace.js";
import { loadState } from "./prd/tracker.js";
import { resolveTemplatePath } from "./paths.js";
import { spawnCapture } from "./adapters/claude.js";
import { renderMarkdown } from "./ui/render-markdown.js";
import { ensureBranchCheckout } from "./git.js";
import type { WorkspaceState } from "./types.js";

/**
 * Return the git working directory for a workspace.
 * Worktree-mode workspaces use their dedicated worktree path;
 * branch-mode workspaces use the original target directory.
 */
export function getWorkingDir(state: WorkspaceState): string {
  return state.worktreePath ?? state.targetDir;
}

export interface PrOptions {
  draft?: boolean;
  dryRun?: boolean;
}

/**
 * Check whether the current branch has an upstream (remote tracking) branch configured.
 */
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

/**
 * Push the workspace branch to the remote.
 * Uses `git push -u origin <branch>` on first push, `git push` thereafter.
 */
export function pushBranch(branchName: string, cwd: string): void {
  const alreadyPushed = hasUpstream(cwd);

  const cmd = alreadyPushed ? "git push" : `git push -u origin ${branchName}`;

  try {
    execSync(cmd, { cwd, stdio: "pipe" });
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
  cwd: string,
): ExistingPr | null {
  let output: string;
  try {
    output = execSync(
      `gh pr list --head ${branchName} --base main --json number,url --limit 1`,
      { cwd, stdio: "pipe" },
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

export async function generatePrDescription(
  state: WorkspaceState,
  spinner?: ReturnType<typeof ora>,
): Promise<PrDescription> {
  const workingDir = getWorkingDir(state);
  const branchName = state.branchName;

  // Load PRD content
  const prdContent = fs.existsSync(state.sourceFile)
    ? fs.readFileSync(state.sourceFile, "utf-8")
    : "(PRD file not found)";

  // Gather git context
  const gitDiff = getGitDiff(branchName, workingDir);
  const gitLog = getGitLog(branchName, workingDir);
  const storyStatus = formatStoryStatus(state);

  // Build prompt from template
  const templatePath = resolveTemplatePath("pr-description-instructions.md");
  const template = fs.readFileSync(templatePath, "utf-8");

  const prompt = template
    .replace("{{prd}}", prdContent)
    .replace("{{git_diff}}", gitDiff)
    .replace("{{git_log}}", gitLog)
    .replace("{{story_status}}", storyStatus);

  // Stream Claude's output with markdown rendering via spawnCapture
  let spinnerStopped = false;
  let lineBuffer = "";
  const onText = (text: string) => {
    // Stop the spinner once the first token arrives
    if (spinner && !spinnerStopped) {
      spinner.stop();
      spinnerStopped = true;
    }
    lineBuffer += text;
    const lines = lineBuffer.split("\n");
    // Keep the last (potentially incomplete) line in the buffer
    lineBuffer = lines.pop() ?? "";
    for (const line of lines) {
      process.stdout.write(renderMarkdown(line) + "\n");
    }
  };

  const { exitCode, output } = await spawnCapture(prompt, {
    cwd: workingDir,
    onText,
  });

  // Stop spinner if no text was ever received
  spinner?.stop();

  // Flush any remaining buffered text
  if (lineBuffer) {
    process.stdout.write(renderMarkdown(lineBuffer) + "\n");
    lineBuffer = "";
  }

  if (exitCode !== 0) {
    throw new Error(`Claude exited with code ${exitCode ?? "unknown"}`);
  }

  // Parse JSON response — handle possible markdown code fences
  let jsonStr = output.trim();
  const fenceMatch = /```(?:json)?\s*\n?([\s\S]*?)\n?```/.exec(jsonStr);
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
  cwd: string,
  options?: { draft?: boolean },
): string {
  if (existingPr) {
    // Update existing PR
    try {
      execSync(
        `gh pr edit ${existingPr.number} --title ${shellEscape(description.title)} --body ${shellEscape(description.body)}`,
        { cwd, stdio: "pipe" },
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

    // Convert existing PR to draft if --draft was passed
    if (options?.draft) {
      try {
        execSync(`gh pr ready ${existingPr.number} --undo`, {
          cwd,
          stdio: "pipe",
        });
      } catch (err) {
        const stderr =
          err instanceof Error && "stderr" in err
            ? String((err as NodeJS.ErrnoException & { stderr: Buffer }).stderr)
            : "";
        const message =
          stderr.trim() || (err instanceof Error ? err.message : String(err));
        throw new Error(
          `Failed to convert PR #${existingPr.number} to draft: ${message}`,
        );
      }
    }

    return existingPr.url;
  }

  // Create new PR
  const draftFlag = options?.draft ? " --draft" : "";
  let output: string;
  try {
    output = execSync(
      `gh pr create --base main --title ${shellEscape(description.title)} --body ${shellEscape(description.body)}${draftFlag}`,
      { cwd, stdio: "pipe" },
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

export async function prCommand(
  workspaceName: string,
  options: PrOptions,
): Promise<void> {
  const resolved = resolveWorkspace(workspaceName);
  const statePath = `${resolved.workspaceDir}/state.json`;
  const state = loadState(statePath);

  const workingDir = getWorkingDir(state);

  if (!fs.existsSync(workingDir)) {
    throw new Error(
      `Working directory does not exist: ${workingDir}\nThe directory may have been removed. Re-create the workspace with: william new`,
    );
  }

  // In branch mode, auto-checkout the workspace branch if needed
  if (!state.worktreePath) {
    ensureBranchCheckout(state.branchName, workingDir);
  }

  // Warn on incomplete stories with yellow coloring
  const incompleteStories = Object.entries(state.stories)
    .filter(([, story]) => story.passes !== true)
    .map(([id]) => id);

  if (incompleteStories.length > 0) {
    console.warn(
      `\x1b[33m⚠ Warning: ${incompleteStories.length} incomplete ${incompleteStories.length === 1 ? "story" : "stories"}: ${incompleteStories.join(", ")}\x1b[0m`,
    );
  }

  // Phase 1: Generate PR description (streamed live with markdown rendering)
  const descSpinner = ora("Generating PR description...").start();
  const prDescription = await generatePrDescription(state, descSpinner);
  console.log(); // Separate streamed output from phase indicator
  descSpinner.succeed("PR description generated");

  // Dry run — print the generated title and body without pushing or creating a PR
  if (options.dryRun) {
    console.log("\nDry run — no PR created\n");
    console.log(`Title: ${prDescription.title}\n`);
    console.log(prDescription.body);
    return;
  }

  // Phase 2: Push branch
  const pushSpinner = ora("Pushing branch...").start();
  pushBranch(state.branchName, workingDir);
  pushSpinner.succeed("Branch pushed");

  // Phase 3: Check for existing PR
  const existingPr = findExistingPr(state.branchName, workingDir);

  // Phase 4: Create or update the GitHub PR
  const prSpinner = ora(
    existingPr
      ? `Updating pull request #${existingPr.number}...`
      : "Creating pull request...",
  ).start();
  const prUrl = createOrUpdatePr(existingPr, prDescription, workingDir, {
    draft: options.draft,
  });
  prSpinner.succeed(
    existingPr
      ? `Pull request #${existingPr.number} updated`
      : "Pull request created",
  );

  // Print final PR URL with green success indicator
  console.log(`\n\x1b[32m✔\x1b[0m ${prUrl}`);
}
