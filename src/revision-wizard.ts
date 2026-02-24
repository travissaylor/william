import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";
import { input, confirm } from "@inquirer/prompts";
import { spawnInteractiveCapture } from "./adapters/claude.js";
import { replacePlaceholders } from "./template.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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
  const templatePath = path.join(
    __dirname,
    "..",
    "templates",
    "revision-plan-instructions.md",
  );
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
 * Builds a regeneration prompt that includes the previous plan and user feedback.
 */
function buildRegenerationPrompt(
  opts: GeneratePlanOpts,
  previousPlan: string,
  feedback: string[],
): string {
  const initial = buildInitialPrompt(opts);

  const feedbackSection = feedback.map((f, i) => `${i + 1}. ${f}`).join("\n");

  return (
    initial +
    "\n\n---\n\n## Previous Plan\n\n" +
    previousPlan +
    "\n\n---\n\n## User Feedback\n\n" +
    feedbackSection +
    "\n\n---\n\n" +
    "The user rejected the previous plan and provided the feedback above. " +
    "Please regenerate the revision plan taking their feedback into account. " +
    "Output the revised plan wrapped in `<revision-plan>...</revision-plan>` XML tags."
  );
}

/**
 * Spawns Claude with a prompt, captures output, and extracts the plan.
 * Returns the extracted plan text or null on failure.
 */
async function spawnAndExtractPlan(
  prompt: string,
  cwd: string,
): Promise<string | null> {
  const { exitCode, output } = await spawnInteractiveCapture(prompt, { cwd });

  if (exitCode !== 0) {
    console.error(
      `[william] Claude process exited with code ${exitCode ?? "unknown"}`,
    );
    return null;
  }

  return extractPlanFromOutput(output);
}

/**
 * Generates a revision plan and runs an approval loop where the user can
 * approve the plan or provide feedback to regenerate it.
 *
 * Returns the approved plan text, or null if generation fails.
 */
export async function generateRevisionPlan(
  opts: GeneratePlanOpts,
): Promise<string | null> {
  const prompt = buildInitialPrompt(opts);
  let plan = await spawnAndExtractPlan(prompt, opts.targetDir);

  if (!plan) {
    console.error(
      "\n[william] Could not extract a revision plan from Claude's output.",
    );
    return null;
  }

  const feedback: string[] = [];
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
      feedback.push(response.trim());

      console.log("\nRegenerating plan with your feedback...\n");

      const regenPrompt = buildRegenerationPrompt(opts, plan, feedback);
      const newPlan = await spawnAndExtractPlan(regenPrompt, opts.targetDir);

      if (!newPlan) {
        console.error(
          "\n[william] Could not extract a revision plan from Claude's output.",
        );
        return null;
      }

      plan = newPlan;
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
