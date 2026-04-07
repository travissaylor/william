import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { input, confirm, editor, select } from "@inquirer/prompts";
import {
  loadProjectConfig,
  type ProjectConfig,
  type GitConfig,
} from "../lib/config.js";
import {
  detectShell,
  areCompletionsInstalled,
  installCompletions,
} from "./completions.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_WILLIAM_PATH = path.resolve(__dirname, "..", "..");

export async function runInit(): Promise<void> {
  const cwd = process.cwd();
  const configDir = path.join(cwd, ".william");
  const configPath = path.join(configDir, "config.json");

  // Warn if config already exists
  const existing = loadProjectConfig(cwd);
  if (existing !== null) {
    const overwrite = await confirm({
      message: ".william/config.json already exists. Overwrite?",
      default: false,
    });
    if (!overwrite) {
      console.log("Init cancelled.");
      return;
    }
  }

  const projectName = await input({
    message: "Project name:",
    default: path.basename(cwd),
    validate: (value) => {
      if (!value.trim()) {
        return "Project name cannot be empty";
      }
      return true;
    },
  });

  const williamPath = await input({
    message: "Path to William codebase:",
    default: DEFAULT_WILLIAM_PATH,
    validate: (value) => {
      if (!value.trim()) {
        return "William codebase path cannot be empty";
      }
      return true;
    },
  });

  const branchPrefix = await input({
    message: "Branch prefix (e.g. feature/, leave empty for none):",
    default: "",
  });

  const prdOutput = await input({
    message: "PRD output directory:",
    default: ".william/prds",
    validate: (value) => {
      if (!value.trim()) {
        return "PRD output directory cannot be empty";
      }
      return true;
    },
  });

  const gitWorkflow = await select<"worktree" | "branch">({
    message:
      "Git workflow (worktree creates an isolated worktree; branch creates a branch only):",
    choices: [
      { value: "worktree" as const, name: "worktree" },
      { value: "branch" as const, name: "branch" },
    ],
    default: "worktree",
  });

  const setupRaw = await editor({
    message: "Setup commands (one per line, runs in worktree after creation):",
    default: "",
  });

  const setupCommands = setupRaw
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const addGitignore = await confirm({
    message: "Add .william/ to .gitignore?",
    default: true,
  });

  // Build git config object, omitting empty/default values
  const git: GitConfig = {};
  if (gitWorkflow !== "worktree") git.workflow = gitWorkflow;
  if (branchPrefix) git.branchPrefix = branchPrefix;
  if (setupCommands.length > 0) git.worktreeSetupCommands = setupCommands;

  // Build config object, omitting empty/default values
  const config: ProjectConfig = {};

  if (projectName) config.projectName = projectName;
  config.williamPath = williamPath;
  if (prdOutput !== ".william/prds") config.prdOutput = prdOutput;
  if (Object.keys(git).length > 0) config.git = git;

  // Create .william/ directory and write config
  fs.mkdirSync(configDir, { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n");

  // Handle .gitignore
  if (addGitignore) {
    const gitignorePath = path.join(cwd, ".gitignore");
    if (fs.existsSync(gitignorePath)) {
      const content = fs.readFileSync(gitignorePath, "utf-8");
      if (!content.includes(".william/")) {
        const separator = content.endsWith("\n") ? "" : "\n";
        fs.appendFileSync(gitignorePath, `${separator}.william/\n`);
      }
    } else {
      fs.writeFileSync(gitignorePath, ".william/\n");
    }
  }

  // Offer to install shell completions
  const detectedShell = detectShell();
  if (detectedShell && !areCompletionsInstalled(detectedShell)) {
    const installCompletionsAnswer = await confirm({
      message: `Install shell completions? (auto-detected: ${detectedShell})`,
      default: true,
    });
    if (installCompletionsAnswer) {
      installCompletions(detectedShell);
    }
  }

  console.log(`\nConfig created: ${configPath}`);
}
