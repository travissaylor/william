import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";
import { input, confirm } from "@inquirer/prompts";
import ora from "ora";
import { spawnCapture } from "./adapters/claude.js";
import { replacePlaceholders } from "./template.js";
import { resolveTemplatePath } from "./paths.js";
import { renderMarkdown } from "./ui/render-markdown.js";

export interface InteractiveRevisionOpts {
  workspaceDir: string;
  targetDir: string;
  branchName: string;
  planPath: string;
}

/**
 * Builds the prompt for an interactive revision planning session.
 * Includes the original PRD, progress.txt, and git diff as context,
 * with light formatting instructions for the RI-XXX plan format.
 */
export function buildInteractiveRevisionPrompt(
  opts: InteractiveRevisionOpts,
): string {
  const { workspaceDir, targetDir, branchName, planPath } = opts;

  const progressPath = path.join(workspaceDir, "progress.txt");
  const progress = fs.existsSync(progressPath)
    ? fs.readFileSync(progressPath, "utf-8")
    : "(no progress file)";

  const prdPath = path.join(workspaceDir, "prd.md");
  const originalPrd = fs.existsSync(prdPath)
    ? fs.readFileSync(prdPath, "utf-8")
    : "(no PRD file found)";

  const gitDiff = getGitDiff(targetDir, branchName);

  return `You are helping the user plan revisions to a workspace that has already been implemented. Your goal is to help them identify problems and create a structured revision plan.

You have full interactive capabilities — the user can ask questions, use any Claude Code skill (like /grill-me, /simplify, etc.), and iterate with you until they're satisfied with the plan.

---

## Original PRD

${originalPrd}

---

## Workspace Progress

${progress}

---

## Git Diff (changes made by this workspace)

${gitDiff}

---

## Your Task

1. Help the user identify what needs to be revised — ask about problems they've noticed, review the diff, and surface issues
2. Collaborate with the user to shape a revision plan
3. When the user is satisfied, write the finalized plan to \`${planPath}\`

## Plan Format

The revision plan must use the \`RI-XXX\` identifier format. Each revision item should follow this structure:

\`\`\`
### RI-001: Title

**Description:** Explicit description of what is wrong and what the fix should look like.

**Acceptance Criteria:**

- [ ] Specific verifiable criterion
- [ ] Another criterion
- [ ] Typecheck and lint pass
\`\`\`

Keep revision items small and independently committable. Do not combine unrelated problems into a single revision item.

When the plan is finalized, write it to \`${planPath}\` using your file-writing tools.`;
}

export async function collectRevisionProblems(): Promise<string[]> {
  const problems: string[] = [];
  let collecting = true;

  while (collecting) {
    const problem = await input({
      message: "Describe a problem (or press Enter to finish):",
    });

    if (problem.trim() === "") {
      if (problems.length === 0) {
        console.log("At least one problem is required");
      } else {
        collecting = false;
      }
    } else {
      problems.push(problem.trim());
    }
  }

  console.log("\nCollected problems:");
  for (let i = 0; i < problems.length; i++) {
    console.log(`  ${i + 1}. ${problems[i]}`);
  }
  console.log();

  const confirmed = await confirm({
    message: "Proceed with these problems?",
    default: true,
  });

  if (!confirmed) {
    console.log("Revision cancelled.");
    process.exit(0);
  }

  return problems;
}

export interface GeneratePlanOpts {
  problems: string[];
  workspaceDir: string;
  targetDir: string;
  branchName: string;
}

/**
 * Extracts the content between <revision-plan> and </revision-plan> XML tags.
 */
export function extractPlanFromOutput(output: string): string | null {
  const match = /<revision-plan>([\s\S]*?)<\/revision-plan>/.exec(output);
  return match ? match[1].trim() : null;
}

/**
 * Gathers workspace context used in plan generation prompts.
 */
function gatherContext(opts: GeneratePlanOpts) {
  const { workspaceDir, targetDir, branchName } = opts;

  const progressPath = path.join(workspaceDir, "progress.txt");
  const progress = fs.existsSync(progressPath)
    ? fs.readFileSync(progressPath, "utf-8")
    : "(no progress file)";

  const prdPath = path.join(workspaceDir, "prd.md");
  const originalPrd = fs.existsSync(prdPath)
    ? fs.readFileSync(prdPath, "utf-8")
    : "(no PRD file found)";

  const stuckHintPath = path.join(workspaceDir, ".stuck-hint.md");
  const stuckHints = fs.existsSync(stuckHintPath)
    ? fs.readFileSync(stuckHintPath, "utf-8")
    : "(none)";

  const gitDiff = getGitDiff(targetDir, branchName);
  const problemsList = opts.problems.map((p, i) => `${i + 1}. ${p}`).join("\n");

  return { progress, originalPrd, stuckHints, gitDiff, problemsList };
}

/**
 * Builds the initial revision plan prompt from the template and workspace context.
 */
function buildInitialPrompt(opts: GeneratePlanOpts): string {
  const templatePath = resolveTemplatePath("revision-plan-instructions.md");
  const template = fs.readFileSync(templatePath, "utf-8");
  const ctx = gatherContext(opts);

  return replacePlaceholders(template, {
    problems: ctx.problemsList,
    progress: ctx.progress,
    git_diff: ctx.gitDiff,
    original_prd: ctx.originalPrd,
    stuck_hints: ctx.stuckHints,
  });
}

/**
 * Spawns Claude with a prompt, captures output, and extracts the plan.
 * Supports resuming a previous session for follow-up feedback.
 * Returns the extracted plan text, session ID, or null on failure.
 */
async function spawnAndExtractPlan(
  prompt: string,
  cwd: string,
  resumeSessionId?: string,
  spinnerLabel?: string,
): Promise<{ plan: string | null; sessionId: string | null }> {
  const spinner = spinnerLabel ? ora(spinnerLabel).start() : null;
  let spinnerStopped = false;

  // Buffer streamed text by line so markdown rendering works on complete lines
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
      // Render each complete line with markdown formatting
      process.stdout.write(renderMarkdown(line) + "\n");
    }
  };

  const { exitCode, output, sessionId } = await spawnCapture(prompt, {
    cwd,
    resumeSessionId,
    onText,
  });

  // Stop spinner if no text was ever received (e.g. error before any output).
  // ora's stop() is idempotent, so this is safe even if onText already stopped it.
  spinner?.stop();

  // Flush any remaining buffered text
  if (lineBuffer) {
    process.stdout.write(renderMarkdown(lineBuffer));
    lineBuffer = "";
  }

  if (exitCode !== 0) {
    console.error(
      `[william] Claude process exited with code ${exitCode ?? "unknown"}`,
    );
    return { plan: null, sessionId };
  }

  return { plan: extractPlanFromOutput(output), sessionId };
}

/**
 * Generates a revision plan and runs an approval loop where the user can
 * approve the plan or provide feedback to regenerate it.
 * Uses --resume to continue the same Claude session for feedback rounds.
 *
 * Returns the approved plan text, or null if generation fails.
 */
export async function generateRevisionPlan(
  opts: GeneratePlanOpts,
): Promise<string | null> {
  const prompt = buildInitialPrompt(opts);
  let { plan, sessionId } = await spawnAndExtractPlan(
    prompt,
    opts.targetDir,
    undefined,
    "Generating revision plan...",
  );

  if (!sessionId) {
    console.warn(
      "[william] No session ID returned; feedback rounds will start fresh sessions.",
    );
  }

  if (!plan) {
    console.error(
      "\n[william] Could not extract a revision plan from Claude's output.",
    );
    return null;
  }

  let approved = false;

  while (!approved) {
    console.log("\n--- Revision Plan ---\n");
    console.log(renderMarkdown(plan));
    console.log("\n--- End of Plan ---\n");

    const response = await input({
      message: "Approve this plan? (yes / or give feedback):",
    });

    const normalized = response.trim().toLowerCase();
    if (
      normalized === "yes" ||
      normalized === "y" ||
      normalized === "approve"
    ) {
      approved = true;
    } else {
      const feedbackPrompt =
        `I have the following feedback on the plan:\n\n${response.trim()}\n\n` +
        "Please regenerate the revision plan taking this feedback into account. " +
        "Output the revised plan wrapped in `<revision-plan>...</revision-plan>` XML tags.";

      const result = await spawnAndExtractPlan(
        feedbackPrompt,
        opts.targetDir,
        sessionId ?? undefined,
        "Regenerating plan with feedback...",
      );

      if (!result.plan) {
        console.error(
          "\n[william] Could not extract a revision plan from Claude's output.",
        );
        return null;
      }

      plan = result.plan;
      sessionId = result.sessionId;
    }
  }

  return plan;
}

/**
 * Gets the git diff of all changes made on the workspace branch vs its merge base.
 */
function getGitDiff(targetDir: string, branchName: string): string {
  try {
    const diff = execSync(`git diff main...${branchName}`, {
      cwd: targetDir,
      encoding: "utf-8",
      maxBuffer: 1024 * 1024 * 10,
    });
    return diff || "(no changes)";
  } catch {
    return "(could not generate diff)";
  }
}
