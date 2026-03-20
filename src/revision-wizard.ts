import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";
import { replacePlaceholders } from "./template.js";

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

  const workspaceName = path.basename(workspaceDir);

  const templatePath = path.join(
    __dirname,
    "..",
    "templates",
    "revision-interactive.md",
  );
  const template = fs.readFileSync(templatePath, "utf-8");

  return replacePlaceholders(template, {
    workspace_name: workspaceName,
    prd: originalPrd,
    progress,
    diff: gitDiff,
    plan_path: planPath,
  });
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
