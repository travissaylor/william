import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";
import { input, confirm } from "@inquirer/prompts";
import { spawnInteractive } from "./adapters/claude.js";
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
 * Builds the revision plan prompt from the template and workspace context,
 * then spawns Claude interactively to generate a plan.
 *
 * Returns the raw plan text extracted from <revision-plan> tags, or null
 * if Claude exited with a non-zero code or no plan was found in output.
 */
export async function generateRevisionPlan(
  opts: GeneratePlanOpts,
): Promise<string | null> {
  const { problems, workspaceDir, targetDir, branchName } = opts;

  const templatePath = path.join(
    __dirname,
    "..",
    "templates",
    "revision-plan-instructions.md",
  );
  const template = fs.readFileSync(templatePath, "utf-8");

  // Gather context
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

  // Format problems as a numbered list
  const problemsList = problems.map((p, i) => `${i + 1}. ${p}`).join("\n");

  const prompt = replacePlaceholders(template, {
    problems: problemsList,
    progress,
    git_diff: gitDiff,
    original_prd: originalPrd,
    stuck_hints: stuckHints,
  });

  const exitCode = await spawnInteractive(prompt, { cwd: targetDir });

  if (exitCode !== 0) {
    console.error(
      `[william] Claude process exited with code ${exitCode ?? "unknown"}`,
    );
    return null;
  }

  return null;
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
