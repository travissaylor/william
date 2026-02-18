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
  .command('start <workspace-name>')
  .description(
    'Create workspace (if needed) and start the iteration loop, or resume if already exists',
  )
  .requiredOption('--target <dir>', 'target project directory')
  .requiredOption('--prd <file>', 'PRD markdown file in tasks/')
  .requiredOption('--branch <name>', 'git branch name')
  .option('--project <name>', 'project name (defaults to target directory basename)')
  .option('--max-iterations <n>', 'maximum iterations', '20')
  .option('--tool <adapter>', 'AI tool adapter to use', 'claude')
  .action(async (workspaceName: string, options: {
    target: string;
    prd: string;
    branch: string;
    project?: string;
    maxIterations: string;
    tool: string;
  }) => {
    try {
      const adapter = ClaudeAdapter;

      // Try to create workspace; if it already exists, resume
      try {
        createWorkspace(workspaceName, {
          targetDir: options.target,
          prdFile: options.prd,
          branchName: options.branch,
          project: options.project,
        });
        console.log(`[william] Workspace "${workspaceName}" created.`);
      } catch (err) {
        if (err instanceof Error && err.message.includes('already exists')) {
          console.log(`[william] Workspace "${workspaceName}" already exists. Resuming.`);
        } else {
          throw err;
        }
      }

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
