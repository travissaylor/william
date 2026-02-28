#!/usr/bin/env tsx
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { Command } from "commander";
import { createElement } from "react";
import { render } from "ink";
import {
  createWorkspace,
  createRevisionWorkspace,
  startWorkspace,
  stopWorkspace,
  listGroupedWorkspaces,
  getWorkspaceStatus,
  getRevisionStatuses,
  resolveWorkspace,
  updateParentAfterRevision,
} from "./workspace.js";
import { archiveWorkspace } from "./archive.js";
import { ClaudeAdapter, spawnInteractive } from "./adapters/claude.js";
import { runNewWizard, buildPrdWizardResult } from "./wizard.js";
import { runInit } from "./init.js";
import { loadProjectConfig } from "./config.js";
import {
  collectRevisionProblems,
  generateRevisionPlan,
} from "./revision-wizard.js";
import { migrateWorkspaces } from "./migrate.js";
import { resolveTemplatePath } from "./paths.js";
import { buildPrdPrompt } from "./prd-prompt.js";
import { loadState } from "./prd/tracker.js";
import { runWorkspace } from "./runner.js";
import { TuiEmitter } from "./ui/events.js";
import { App } from "./ui/App.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function buildProblemPrompt(options: { description?: string }): string {
  const templatePath = resolveTemplatePath("problem-statement-instructions.md");
  const template = fs.readFileSync(templatePath, "utf-8");

  let prompt = template;

  if (options.description) {
    prompt += `\n\n## Feature Idea\n\n${options.description}`;
  } else {
    prompt +=
      "\n\nNo feature idea was provided. Start by asking the user to describe the idea or problem they want to explore.";
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
  .option("-p, --prd <path>", "PRD file path — skip wizard and use defaults")
  .action(async (options: { prd?: string }) => {
    try {
      const result = options.prd
        ? buildPrdWizardResult(options.prd)
        : await runNewWizard();

      const worktreePath = createWorkspace(result.workspaceName, {
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
      console.log(`  Worktree:  ${worktreePath}`);
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
  .command("init")
  .description("Initialize .william/config.json in the current project")
  .action(async () => {
    try {
      await runInit();
    } catch (err) {
      if (err instanceof Error && err.name === "ExitPromptError") {
        console.log("\nInit cancelled.");
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
        const resolved = resolveWorkspace(workspaceName);
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

        // Show revisions section for parent workspaces (not for revision workspaces themselves)
        if (!status.state.parentWorkspace) {
          const revisions = getRevisionStatuses(resolved.workspaceDir);
          if (revisions.length > 0) {
            console.log("\nRevisions:");
            for (const rev of revisions) {
              console.log(
                `  ${rev.name} [${rev.status}] — ${rev.passed}/${rev.total}`,
              );
            }
          }
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
      const isRevision = ws.includes("/revision-");
      const revisionTag = isRevision ? " [revision]" : "";
      console.log(
        `  ${ws}${revisionTag} [${displayStatus}] — ${passed}/${total}`,
      );
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
      // Determine default output directory based on project config
      const cwd = process.cwd();
      const config = loadProjectConfig(cwd);
      let defaultOutputDir: string;
      if (config) {
        defaultOutputDir = config.prdOutput
          ? path.resolve(cwd, config.prdOutput)
          : path.resolve(cwd, ".william", "prds");
      } else {
        defaultOutputDir = path.resolve("prds");
      }

      const prompt = buildPrdPrompt({
        description,
        output: options?.output,
        defaultOutputDir: config
          ? path.relative(cwd, defaultOutputDir) || "."
          : undefined,
      });

      // Ensure target directory exists before spawning Claude
      if (options?.output) {
        const outputDir = path.dirname(path.resolve(options.output));
        fs.mkdirSync(outputDir, { recursive: true });
      } else {
        fs.mkdirSync(defaultOutputDir, { recursive: true });
      }

      const startTime = Date.now();

      const exitCode = await spawnInteractive(prompt);

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
        // Find the most recently modified .md file in the default output dir
        if (fs.existsSync(defaultOutputDir)) {
          const files = fs
            .readdirSync(defaultOutputDir)
            .filter((f) => f.endsWith(".md"))
            .map((f) => ({
              name: f,
              mtime: fs.statSync(path.join(defaultOutputDir, f)).mtimeMs,
            }))
            .filter((f) => f.mtime >= startTime)
            .sort((a, b) => b.mtime - a.mtime);

          if (files.length > 0) {
            const relativePath = path.relative(
              cwd,
              path.join(defaultOutputDir, files[0].name),
            );
            console.log(`\nPRD saved to: ${relativePath}`);
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
  .command("problem")
  .description(
    "Start a guided problem statement session with an interactive Claude session",
  )
  .argument("[description]", "Rough feature idea to explore")
  .action(async (description?: string) => {
    try {
      const prompt = buildProblemPrompt({ description });

      const exitCode = await spawnInteractive(prompt);

      if (exitCode !== 0) {
        console.error(
          `[william] Claude process exited with code ${exitCode ?? "unknown"}`,
        );
        process.exit(1);
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
  .action(async (workspaceName: string) => {
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

      const problems = await collectRevisionProblems();

      console.log(
        `\nCollected ${problems.length} problem(s). Generating revision plan...\n`,
      );

      const plan = await generateRevisionPlan({
        problems,
        workspaceDir: resolved.workspaceDir,
        targetDir: state.targetDir,
        branchName: state.branchName,
      });

      if (plan === null) {
        console.error("[william] Revision plan generation failed.");
        process.exit(1);
      }

      const { revisionDir, revisionNumber } = createRevisionWorkspace({
        parentWorkspaceDir: resolved.workspaceDir,
        parentState: state,
        plan,
      });

      console.log(
        `\nRevision workspace created: ${resolved.projectName}/${resolved.workspaceName}/revision-${revisionNumber}`,
      );
      console.log(`  Path: ${revisionDir}`);
      console.log(`\nStarting revision execution...\n`);

      const revisionStatePath = path.join(revisionDir, "state.json");
      const revisionState = loadState(revisionStatePath);
      const revisionName = `${resolved.workspaceName}/revision-${revisionNumber}`;

      const emitter = new TuiEmitter();
      const inkApp = render(
        createElement(App, {
          emitter,
          workspaceName: revisionName,
          initialState: revisionState,
          maxIterations: 20,
        }),
      );

      try {
        await runWorkspace(
          revisionName,
          revisionDir,
          {
            adapter: ClaudeAdapter,
            maxIterations: 20,
          },
          emitter,
        );

        // Check if all revision items completed and update parent state
        const finalRevisionState = loadState(
          path.join(revisionDir, "state.json"),
        );
        const allComplete = Object.values(finalRevisionState.stories).every(
          (s) => s.passes === true || s.passes === "skipped",
        );

        if (allComplete) {
          const itemCount = Object.keys(finalRevisionState.stories).length;
          updateParentAfterRevision(
            resolved.workspaceDir,
            revisionDir,
            revisionNumber,
            itemCount,
          );
          console.log(
            `\nRevision ${revisionNumber} completed. Parent workspace updated.`,
          );
        }
      } finally {
        inkApp.unmount();
      }
    } catch (err) {
      if (err instanceof Error && err.name === "ExitPromptError") {
        console.log("\nRevision cancelled.");
        return;
      }
      console.error(
        `[william] Error: ${err instanceof Error ? err.message : String(err)}`,
      );
      process.exit(1);
    }
  });

program.parse();
