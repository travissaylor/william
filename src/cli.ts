#!/usr/bin/env tsx
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { Command } from 'commander';
import {
  createWorkspace,
  startWorkspace,
  stopWorkspace,
  listWorkspaces,
  getWorkspaceStatus,
} from './workspace.js';
import { archiveWorkspace } from './archive.js';
import { ClaudeAdapter } from './adapters/claude.js';
import { runNewWizard } from './wizard.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function readPackageVersion(): string {
  try {
    const pkgPath = path.join(__dirname, '..', 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8')) as { version: string };
    return pkg.version;
  } catch {
    return '0.1.0';
  }
}

const program = new Command();

program
  .name('william')
  .description('Autonomous orchestrator for managing development tasks')
  .version(readPackageVersion());

program
  .command('new')
  .description('Interactive wizard to create a new workspace')
  .action(async () => {
    try {
      const result = await runNewWizard();

      createWorkspace(result.workspaceName, {
        targetDir: result.targetDir,
        prdFile: result.prdFile,
        branchName: result.branchName,
        project: result.projectName,
      });

      console.log('\nWorkspace created:');
      console.log(`  Name:      ${result.workspaceName}`);
      console.log(`  Project:   ${result.projectName}`);
      console.log(`  Target:    ${result.targetDir}`);
      console.log(`  Branch:    ${result.branchName}`);
      console.log(`  PRD:       ${result.prdFile}`);
      console.log(`\nRun: william start ${result.workspaceName}`);
    } catch (err) {
      if (err instanceof Error && err.name === 'ExitPromptError') {
        console.log('\nWizard cancelled.');
        return;
      }
      console.error(`[william] Error: ${err instanceof Error ? err.message : String(err)}`);
      process.exit(1);
    }
  });

program
  .command('start <workspace-name>')
  .description(
    'Start (or resume) a workspace. Create one first with: william new',
  )
  .option('--max-iterations <n>', 'maximum iterations', '20')
  .option('--tool <adapter>', 'AI tool adapter to use', 'claude')
  .action(async (workspaceName: string, options: {
    maxIterations: string;
    tool: string;
  }) => {
    try {
      const adapter = ClaudeAdapter;

      await startWorkspace(workspaceName, {
        adapter,
        maxIterations: parseInt(options.maxIterations, 10),
      });
    } catch (err) {
      console.error(`[william] Error: ${err instanceof Error ? err.message : String(err)}`);
      process.exit(1);
    }
  });

program
  .command('stop <workspace-name>')
  .description('Stop a running workspace')
  .action((workspaceName: string) => {
    try {
      stopWorkspace(workspaceName);
    } catch (err) {
      console.error(`[william] Error: ${err instanceof Error ? err.message : String(err)}`);
      process.exit(1);
    }
  });

program
  .command('status [workspace-name]')
  .description('Show status of workspaces (all or a specific one)')
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
        console.log('\nStory breakdown:');
        for (const [id, story] of Object.entries(status.state.stories)) {
          const mark =
            story.passes === true ? '✓' : story.passes === 'skipped' ? '⊘' : '·';
          const attempts = story.attempts > 0 ? ` (${story.attempts} attempts)` : '';
          const isCurrent = id === status.currentStory ? ' ← current' : '';
          console.log(`  ${mark} ${id}${attempts}${isCurrent}`);
        }
      } else {
        // Summary for all workspaces
        const names = listWorkspaces();
        if (names.length === 0) {
          console.log('No active workspaces.');
          return;
        }
        for (const name of names) {
          try {
            const status = getWorkspaceStatus(name);
            const storyValues = Object.values(status.state.stories);
            const passed = storyValues.filter((s) => s.passes === true).length;
            const total = storyValues.length;
            const currentPart = status.currentStory ? `, current: ${status.currentStory}` : '';
            const attemptsPart =
              status.currentStory && status.state.stories[status.currentStory]
                ? `, attempts: ${status.state.stories[status.currentStory].attempts}`
                : '';
            console.log(
              `${name} [${status.runningStatus}] — ${passed}/${total} complete${currentPart}${attemptsPart}`,
            );
          } catch {
            console.log(`${name} [unknown] — could not read state`);
          }
        }
      }
    } catch (err) {
      console.error(`[william] Error: ${err instanceof Error ? err.message : String(err)}`);
      process.exit(1);
    }
  });

program
  .command('archive <workspace-name>')
  .description('Archive a completed workspace (must be stopped first)')
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
  .command('list')
  .description('List all workspaces and their status (running / stopped / paused)')
  .action(() => {
    try {
      const names = listWorkspaces();
      if (names.length === 0) {
        console.log('No active workspaces.');
        return;
      }
      for (const name of names) {
        try {
          const status = getWorkspaceStatus(name);
          console.log(`${name} [${status.runningStatus}]`);
        } catch {
          console.log(`${name} [unknown]`);
        }
      }
    } catch (err) {
      console.error(`[william] Error: ${err instanceof Error ? err.message : String(err)}`);
      process.exit(1);
    }
  });

program.parse();
