#!/usr/bin/env tsx
import { Command } from "commander";
import { archiveWorkspace } from "./archive.js";

const program = new Command();

program
  .name("william")
  .description("Autonomous orchestrator for managing development tasks")
  .version("0.1.0");

program
  .command("start [task]")
  .description("Start the orchestrator, optionally targeting a specific task")
  .option("-w, --workspace <path>", "workspace directory to use")
  .action((task, options) => {
    console.log("start:", { task, options });
  });

program
  .command("stop [task]")
  .description("Stop a running task or all tasks")
  .action((task) => {
    console.log("stop:", { task });
  });

program
  .command("status [task]")
  .description("Show status of running or recent tasks")
  .option("-j, --json", "output as JSON")
  .action((task, options) => {
    console.log("status:", { task, options });
  });

program
  .command("archive <workspace-name>")
  .description("Archive a completed workspace (must be stopped first)")
  .action((workspaceName: string) => {
    try {
      const archivePath = archiveWorkspace(workspaceName);
      console.log(`[william] Workspace "${workspaceName}" archived to: ${archivePath}`);
    } catch (err) {
      console.error(`[william] Error: ${err instanceof Error ? err.message : String(err)}`);
      process.exit(1);
    }
  });

program
  .command("list")
  .description("List all tasks")
  .option("--status <status>", "filter by status (pending|running|done|archived)")
  .action((options) => {
    console.log("list:", { options });
  });

program.parse();
