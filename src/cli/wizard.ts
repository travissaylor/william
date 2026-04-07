import * as fs from "fs";
import * as path from "path";
import { input } from "@inquirer/prompts";
import { loadProjectConfig } from "../lib/config.js";

export interface WizardResult {
  prdFile: string;
  workspaceName: string;
  targetDir: string;
  projectName: string;
  branchName: string;
  gitWorkflow: "worktree" | "branch";
}

export interface WizardOptions {
  gitWorkflow?: "worktree" | "branch";
}

/**
 * Build a WizardResult directly from a PRD path, bypassing all interactive prompts.
 * Uses project config for projectName and branchPrefix when available.
 */
export function buildPrdWizardResult(
  prdPath: string,
  options?: WizardOptions,
): WizardResult {
  const cwd = process.cwd();
  const resolved = path.resolve(prdPath);

  if (!fs.existsSync(resolved)) {
    throw new Error(`PRD file not found: ${resolved}`);
  }
  if (!resolved.endsWith(".md")) {
    throw new Error("PRD file must be a .md file");
  }
  if (!fs.existsSync(path.join(cwd, ".git"))) {
    throw new Error(`Not a git repository (no .git found): ${cwd}`);
  }

  const config = loadProjectConfig(cwd);
  const workspaceName = path.basename(resolved, ".md");
  const projectName = config?.projectName ?? path.basename(cwd);
  // eslint-disable-next-line @typescript-eslint/no-deprecated -- legacy fallback
  const branchPrefix = config?.git?.branchPrefix ?? config?.branchPrefix;
  const branchName = branchPrefix
    ? `${branchPrefix}${workspaceName}`
    : workspaceName;

  const gitWorkflow =
    options?.gitWorkflow ?? config?.git?.workflow ?? "worktree";

  return {
    prdFile: resolved,
    workspaceName,
    targetDir: cwd,
    projectName,
    branchName,
    gitWorkflow,
  };
}

export async function runNewWizard(
  options?: WizardOptions,
): Promise<WizardResult> {
  const config = loadProjectConfig(process.cwd());

  const prdFile = await input({
    message: "PRD file path:",
    validate: (value) => {
      const resolved = path.resolve(value);
      if (!fs.existsSync(resolved)) {
        return `File not found: ${resolved}`;
      }
      if (!resolved.endsWith(".md")) {
        return "PRD file must be a .md file";
      }
      return true;
    },
  });

  const prdBasename = path.basename(prdFile, ".md");

  const workspaceName = await input({
    message: "Workspace name:",
    default: prdBasename,
    validate: (value) => {
      if (!value.trim()) {
        return "Workspace name cannot be empty";
      }
      return true;
    },
  });

  const targetDir = await input({
    message: "Target project directory:",
    default: process.cwd(),
    validate: (value) => {
      const resolved = path.resolve(value);
      if (!fs.existsSync(resolved)) {
        return `Directory not found: ${resolved}`;
      }
      if (!fs.existsSync(path.join(resolved, ".git"))) {
        return `Not a git repository (no .git found): ${resolved}`;
      }
      return true;
    },
  });

  const resolvedTarget = path.resolve(targetDir);
  const defaultProject = config?.projectName ?? path.basename(resolvedTarget);

  let projectName: string;
  if (config?.skipDefaults && config.projectName) {
    projectName = config.projectName;
  } else {
    projectName = await input({
      message: "Project name:",
      default: defaultProject,
      validate: (value) => {
        if (!value.trim()) {
          return "Project name cannot be empty";
        }
        return true;
      },
    });
  }

  /* eslint-disable @typescript-eslint/no-deprecated -- legacy fallback */
  const branchPrefixResolved =
    config?.git?.branchPrefix ?? config?.branchPrefix;
  /* eslint-enable @typescript-eslint/no-deprecated */
  const defaultBranch = branchPrefixResolved
    ? `${branchPrefixResolved}${workspaceName}`
    : workspaceName;

  let branchName: string;
  if (config?.skipDefaults && branchPrefixResolved) {
    branchName = defaultBranch;
  } else {
    branchName = await input({
      message: "Branch name:",
      default: defaultBranch,
      validate: (value) => {
        if (!value.trim()) {
          return "Branch name cannot be empty";
        }
        return true;
      },
    });
  }

  const gitWorkflow =
    options?.gitWorkflow ?? config?.git?.workflow ?? "worktree";

  return {
    prdFile: path.resolve(prdFile),
    workspaceName,
    targetDir: resolvedTarget,
    projectName,
    branchName,
    gitWorkflow,
  };
}
