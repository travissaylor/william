import * as fs from "fs";
import * as path from "path";
import { input } from "@inquirer/prompts";
import { loadProjectConfig } from "./config.js";

export interface WizardResult {
  prdFile: string;
  workspaceName: string;
  targetDir: string;
  projectName: string;
  branchName: string;
}

export async function runNewWizard(): Promise<WizardResult> {
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

  const defaultBranch = config?.branchPrefix
    ? `${config.branchPrefix}${workspaceName}`
    : workspaceName;

  let branchName: string;
  if (config?.skipDefaults && config.branchPrefix) {
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

  return {
    prdFile: path.resolve(prdFile),
    workspaceName,
    targetDir: resolvedTarget,
    projectName,
    branchName,
  };
}
