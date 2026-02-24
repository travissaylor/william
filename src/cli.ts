#!/usr/bin/env tsx
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { spawn } from "child_process";
import { Command } from "commander";
import {
  createWorkspace,
  startWorkspace,
  stopWorkspace,
  listGroupedWorkspaces,
  getWorkspaceStatus,
  resolveWorkspace,
} from "./workspace.js";
import { archiveWorkspace } from "./archive.js";
import { ClaudeAdapter } from "./adapters/claude.js";
import { runNewWizard } from "./wizard.js";
import { migrateWorkspaces } from "./migrate.js";
import { loadState } from "./prd/tracker.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function buildPrdPrompt(options: {
  description?: string;
  output?: string;
}): string {
  const templatePath = path.join(
    __dirname,
    "..",
    "templates",
    "prd-instructions.md",
  );
  const template = fs.readFileSync(templatePath, "utf-8");

  let prompt = template;

  prompt += "\n\n## Agent Instructions\n\n";
  prompt +=
    "Wrap the final PRD in `<prd>...</prd>` XML tags so it can be extracted programmatically.\n";
  prompt +=
    "\nAfter generating the PRD, you MUST write it to disk using your file-writing tools (Write tool). Create any parent directories if needed.\n";

  if (options.output) {
    prompt += `\nThe user specified an output path: \`${options.output}\`. Save the PRD to that exact path.\n`;
  } else {
    prompt +=
      "\nNo output path was specified. The default save location is `prds/<feature-name>.md` (where feature-name is kebab-case derived from the PRD title). Ask the user where to save if they haven't specified, mentioning the default `prds/<feature-name>.md`.\n";
  }

  if (options.description) {
    prompt += `\n\n## Feature Description\n\n${options.description}`;
  } else {
    prompt +=
      "\n\nNo feature description was provided. Start by asking the user to describe the feature they want to build.";
  }

  return prompt;
}

function readPackageVersion(): string {
  try {
    const pkgPath = path.join(__dirname, "..", "package.json");
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8")) as {
      version: string;
    };
    return pkg.version;
  } catch {
    return "0.1.0";
  }
}

const program = new Command();

program
  .name("william")
  .description("Autonomous orchestrator for managing development tasks")
  .version(readPackageVersion());

program
  .command("new")
  .description("Interactive wizard to create a new workspace")
  .action(async () => {
    try {
      const result = await runNewWizard();

      createWorkspace(result.workspaceName, {
        targetDir: result.targetDir,
        prdFile: result.prdFile,
        branchName: result.branchName,
        project: result.projectName,
      });

      console.log("\nWorkspace created:");
      console.log(`  Name:      ${result.workspaceName}`);
      console.log(`  Project:   ${result.projectName}`);
      console.log(`  Target:    ${result.targetDir}`);
      console.log(`  Branch:    ${result.branchName}`);
      console.log(`  PRD:       ${result.prdFile}`);
      console.log(`\nRun: william start ${result.workspaceName}`);
    } catch (err) {
      if (err instanceof Error && err.name === "ExitPromptError") {
        console.log("\nWizard cancelled.");
        return;
      }
      console.error(
        `[william] Error: ${err instanceof Error ? err.message : String(err)}`,
      );
      process.exit(1);
    }
  });

program
  .command("start <workspace-name>")
  .description(
    "Start (or resume) a workspace. Create one first with: william new",
  )
  .option("--max-iterations <n>", "maximum iterations", "20")
  .option("--tool <adapter>", "AI tool adapter to use", "claude")
  .action(
    async (
      workspaceName: string,
      options: {
        maxIterations: string;
        tool: string;
      },
    ) => {
      try {
        const adapter = ClaudeAdapter;

        await startWorkspace(workspaceName, {
          adapter,
          maxIterations: parseInt(options.maxIterations, 10),
        });
      } catch (err) {
        console.error(
          `[william] Error: ${err instanceof Error ? err.message : String(err)}`,
        );
        process.exit(1);
      }
    },
  );

program
  .command("stop <workspace-name>")
  .description("Stop a running workspace")
  .action((workspaceName: string) => {
    try {
      stopWorkspace(workspaceName);
    } catch (err) {
      console.error(
        `[william] Error: ${err instanceof Error ? err.message : String(err)}`,
      );
      process.exit(1);
    }
  });

program
  .command("status [workspace-name]")
  .description("Show status of workspaces (all or a specific one)")
  .action((workspaceName?: string) => {
    try {
      if (workspaceName) {
        // Detailed status for a specific workspace
        const status = getWorkspaceStatus(workspaceName);
        console.log(`Workspace: ${status.name}`);
        console.log(`Status:    ${status.runningStatus}`);
        console.log(`Branch:    ${status.state.branchName}`);
        console.log(`Target:    ${status.state.targetDir}`);
        console.log(`PRD:       ${status.state.sourceFile}`);
        console.log(`Summary:   ${status.summary}`);
        console.log("\nStory breakdown:");
        for (const [id, story] of Object.entries(status.state.stories)) {
          const mark =
            story.passes === true
              ? "✓"
              : story.passes === "skipped"
                ? "⊘"
                : "·";
          const attempts =
            story.attempts > 0 ? ` (${story.attempts} attempts)` : "";
          const isCurrent = id === status.currentStory ? " ← current" : "";
          console.log(`  ${mark} ${id}${attempts}${isCurrent}`);
        }
      } else {
        // Summary for all workspaces grouped by project
        const grouped = listGroupedWorkspaces();
        const projectNames = Object.keys(grouped);

        if (projectNames.length === 0) {
          console.log("No active workspaces.");
          return;
        }

        for (const project of projectNames) {
          console.log(`${project}/`);
          for (const ws of grouped[project]) {
            try {
              const status = getWorkspaceStatus(`${project}/${ws}`);
              const storyValues = Object.values(status.state.stories);
              const passed = storyValues.filter(
                (s) => s.passes === true,
              ).length;
              const total = storyValues.length;
              const currentPart = status.currentStory
                ? `, current: ${status.currentStory}`
                : "";
              const storyEntry = status.currentStory
                ? status.state.stories[status.currentStory]
                : undefined;
              const attemptsPart = storyEntry
                ? `, attempts: ${storyEntry.attempts}`
                : "";
              console.log(
                `  ${ws} [${status.runningStatus}] — ${passed}/${total} complete${currentPart}${attemptsPart}`,
              );
            } catch {
              console.log(`  ${ws} [unknown] — could not read state`);
            }
          }
        }
      }
    } catch (err) {
      console.error(
        `[william] Error: ${err instanceof Error ? err.message : String(err)}`,
      );
      process.exit(1);
    }
  });

program
  .command("archive <workspace-name>")
  .description("Archive a completed workspace (must be stopped first)")
  .action((workspaceName: string) => {
    try {
      const archivePath = archiveWorkspace(workspaceName);
      console.log(
        `[william] Workspace "${workspaceName}" archived to: ${archivePath}`,
      );
    } catch (err) {
      console.error(
        `[william] Error: ${err instanceof Error ? err.message : String(err)}`,
      );
      process.exit(1);
    }
  });

program
  .command("list [project-name]")
  .description(
    "List workspaces grouped by project, optionally filtered to a single project",
  )
  .action((projectFilter?: string) => {
    try {
      const grouped = listGroupedWorkspaces();
      const projectNames = Object.keys(grouped);

      if (projectNames.length === 0) {
        console.log("No active workspaces.");
        return;
      }

      if (projectFilter) {
        if (!(projectFilter in grouped)) {
          console.log(`No workspaces found for project "${projectFilter}"`);
          return;
        }
        printProjectGroup(projectFilter, grouped[projectFilter]);
      } else {
        for (const project of projectNames) {
          printProjectGroup(project, grouped[project]);
        }
      }
    } catch (err) {
      console.error(
        `[william] Error: ${err instanceof Error ? err.message : String(err)}`,
      );
      process.exit(1);
    }
  });

function printProjectGroup(project: string, workspaces: string[]): void {
  console.log(`${project}/`);
  for (const ws of workspaces) {
    try {
      const status = getWorkspaceStatus(`${project}/${ws}`);
      const storyValues = Object.values(status.state.stories);
      const passed = storyValues.filter((s) => s.passes === true).length;
      const total = storyValues.length;
      const allDone =
        total > 0 &&
        storyValues.every((s) => s.passes === true || s.passes === "skipped");
      const displayStatus = allDone ? "completed" : status.runningStatus;
      console.log(`  ${ws} [${displayStatus}] — ${passed}/${total}`);
    } catch {
      console.log(`  ${ws} [unknown]`);
    }
  }
}

program
  .command("migrate")
  .description(
    "Migrate existing flat workspaces into project-grouped structure (one-time)",
  )
  .action(() => {
    try {
      migrateWorkspaces();
    } catch (err) {
      console.error(
        `[william] Error: ${err instanceof Error ? err.message : String(err)}`,
      );
      process.exit(1);
    }
  });

program
  .command("prd")
  .description("Generate a PRD by spawning an interactive Claude session")
  .argument("[description]", "Feature description to include in the prompt")
  .option("-o, --output <path>", "Output path for the generated PRD file")
  .action(async (description?: string, options?: { output?: string }) => {
    try {
      const prompt = buildPrdPrompt({ description, output: options?.output });

      // Ensure target directory exists before spawning Claude
      if (options?.output) {
        const outputDir = path.dirname(path.resolve(options.output));
        fs.mkdirSync(outputDir, { recursive: true });
      } else {
        fs.mkdirSync(path.resolve("prds"), { recursive: true });
      }

      const startTime = Date.now();

      let child;

      if (prompt.length > 100_000) {
        // For very long prompts, pass via stdin
        child = spawn("claude", [], {
          stdio: ["pipe", "inherit", "inherit"],
          cwd: process.cwd(),
        });
        child.stdin.end(prompt);
      } else {
        child = spawn("claude", [prompt], {
          stdio: "inherit",
          cwd: process.cwd(),
        });
      }

      const exitCode = await new Promise<number | null>((resolve) => {
        child.on("close", resolve);
      });

      if (exitCode !== 0) {
        console.error(
          `[william] Claude process exited with code ${exitCode ?? "unknown"}`,
        );
        process.exit(1);
      }

      // Print summary of saved PRD
      if (options?.output) {
        const resolved = path.resolve(options.output);
        if (fs.existsSync(resolved)) {
          console.log(`\nPRD saved to: ${options.output}`);
        }
      } else {
        // Find the most recently modified .md file in prds/ created during this session
        const prdsDir = path.resolve("prds");
        if (fs.existsSync(prdsDir)) {
          const files = fs
            .readdirSync(prdsDir)
            .filter((f) => f.endsWith(".md"))
            .map((f) => ({
              name: f,
              mtime: fs.statSync(path.join(prdsDir, f)).mtimeMs,
            }))
            .filter((f) => f.mtime >= startTime)
            .sort((a, b) => b.mtime - a.mtime);

          if (files.length > 0) {
            console.log(`\nPRD saved to: prds/${files[0].name}`);
          }
        }
      }
    } catch (err) {
      console.error(
        `[william] Error: ${err instanceof Error ? err.message : String(err)}`,
      );
      process.exit(1);
    }
  });

program
  .command("revise <workspace-name>")
  .description("Start a revision flow for a completed workspace")
  .action((workspaceName: string) => {
    try {
      const resolved = resolveWorkspace(workspaceName);
      const statePath = path.join(resolved.workspaceDir, "state.json");

      if (!fs.existsSync(statePath)) {
        console.error(
          `[william] Error: No state.json found for workspace "${workspaceName}". Cannot revise.`,
        );
        process.exit(1);
      }

      const state = loadState(statePath);
      const pending = Object.values(state.stories).filter(
        (s) => s.passes === false,
      ).length;

      if (pending > 0) {
        console.warn(
          `Warning: ${pending} ${pending === 1 ? "story" : "stories"} still pending`,
        );
      }

      console.log(
        `Starting revision for workspace "${resolved.projectName}/${resolved.workspaceName}"...`,
      );
    } catch (err) {
      console.error(
        `[william] Error: ${err instanceof Error ? err.message : String(err)}`,
      );
      process.exit(1);
    }
  });

program.parse();
