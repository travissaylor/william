import * as fs from "fs";
import * as path from "path";
import { input, confirm, editor } from "@inquirer/prompts";
import { loadProjectConfig, type ProjectConfig } from "./config.js";

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

  // Build config object, omitting empty/default values
  const config: ProjectConfig = {};

  if (projectName) config.projectName = projectName;
  if (branchPrefix) config.branchPrefix = branchPrefix;
  if (prdOutput !== ".william/prds") config.prdOutput = prdOutput;
  if (setupCommands.length > 0) config.setupCommands = setupCommands;

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

  console.log(`\nConfig created: ${configPath}`);
}
