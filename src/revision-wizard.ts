import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";
import { input, confirm } from "@inquirer/prompts";
import { spawnCapture } from "./adapters/claude.js";
import { replacePlaceholders } from "./template.js";
import { resolveTemplatePath } from "./paths.js";

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
): Promise<{ plan: string | null; sessionId: string | null }> {
  const { exitCode, output, sessionId } = await spawnCapture(prompt, {
    cwd,
    resumeSessionId,
  });

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
  let { plan, sessionId } = await spawnAndExtractPlan(prompt, opts.targetDir);

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
    console.log(plan);
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
      console.log("\nRegenerating plan with your feedback...\n");

      const feedbackPrompt =
        `I have the following feedback on the plan:\n\n${response.trim()}\n\n` +
        "Please regenerate the revision plan taking this feedback into account. " +
        "Output the revised plan wrapped in `<revision-plan>...</revision-plan>` XML tags.";

      const result = await spawnAndExtractPlan(
        feedbackPrompt,
        opts.targetDir,
        sessionId ?? undefined,
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
