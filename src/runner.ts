import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import type { ToolAdapter } from './adapters/types.js';
import type { WorkspaceState } from './types.js';
import {
  loadState,
  saveState,
  getCurrentStory,
  markStoryComplete,
  incrementAttempts,
} from './prd/tracker.js';
import { parsePrd } from './prd/parser.js';
import { buildContext } from './prd/context-builder.js';
import { replacePlaceholders } from './template.js';
import { runWatchdog } from './watchdog.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const WILLIAM_ROOT = path.resolve(__dirname, '..');

export interface RunOpts {
  maxIterations?: number;
  adapter: ToolAdapter;
  sleepMs?: number;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function extractCodebasePatterns(progressTxt: string): string {
  const match = progressTxt.match(/^## Codebase Patterns\s*\n([\s\S]*?)(?=\n## |\n---|\s*$)/m);
  return match ? match[0].trim() : '';
}

function extractRecentLearnings(progressTxt: string, count: number): string {
  const parts = progressTxt.split(/(?=^## \[?\d{4}-\d{2}-\d{2}\]?)/m);
  const entries = parts.filter((p) => /^## \[?\d{4}-\d{2}-\d{2}\]?/.test(p.trim()));
  return entries
    .slice(-count)
    .map((e) => e.trim())
    .join('\n\n');
}

function buildStoryTable(parsedStories: ReturnType<typeof parsePrd>['stories'], state: WorkspaceState, currentStory: string): string {
  return parsedStories
    .map((s) => {
      const st = state.stories[s.id];
      if (s.id === currentStory) return `→ ${s.id}: ${s.title}`;
      if (st?.passes === true) return `✓ ${s.id}: ${s.title}`;
      if (st?.passes === 'skipped') return `⊘ ${s.id}: ${s.title}`;
      return `· ${s.id}: ${s.title}`;
    })
    .join('\n');
}

export async function runWorkspace(workspaceName: string, opts: RunOpts): Promise<void> {
  const maxIterations = opts.maxIterations ?? 20;
  const sleepMs = opts.sleepMs ?? 2000;
  const { adapter } = opts;

  const workspaceDir = path.join(WILLIAM_ROOT, 'workspaces', workspaceName);
  const statePath = path.join(workspaceDir, 'state.json');
  const progressPath = path.join(workspaceDir, 'progress.txt');
  const stuckHintPath = path.join(workspaceDir, '.stuck-hint.md');
  const pausedPath = path.join(workspaceDir, '.paused');
  const stoppedPath = path.join(workspaceDir, '.stopped');
  const logsDir = path.join(workspaceDir, 'logs');
  const templatePath = path.join(WILLIAM_ROOT, 'templates', 'agent-instructions.md');

  // Ensure logs directory exists
  fs.mkdirSync(logsDir, { recursive: true });

  const templateContent = fs.readFileSync(templatePath, 'utf-8');

  let normalExit = false;

  for (let iteration = 0; iteration < maxIterations; iteration++) {
    // Check for stop/pause signals between iterations
    if (fs.existsSync(stoppedPath)) {
      console.log(`[william] Workspace "${workspaceName}" has been stopped. Halting.`);
      normalExit = true;
      break;
    }
    if (fs.existsSync(pausedPath)) {
      console.log(`[william] Workspace "${workspaceName}" is paused. Halting.`);
      normalExit = true;
      break;
    }

    // 1. Load state
    const state = loadState(statePath);

    // 2. Get current story; exit if all done
    const currentStory = getCurrentStory(state);
    if (currentStory === null) {
      console.log(`[william] All stories complete for workspace "${workspaceName}".`);
      normalExit = true;
      break;
    }

    // 3. Read markdown PRD
    const prdPath = state.sourceFile;
    const rawMarkdown = fs.readFileSync(prdPath, 'utf-8');

    // 4. Parse PRD
    const parsedPrd = parsePrd(rawMarkdown);

    // 5. Read progress.txt
    const progressTxt = fs.existsSync(progressPath)
      ? fs.readFileSync(progressPath, 'utf-8')
      : '';

    // 6. Read .stuck-hint.md if present
    const stuckHint = fs.existsSync(stuckHintPath)
      ? fs.readFileSync(stuckHintPath, 'utf-8')
      : undefined;

    // Build assembled PRD context
    const prdContext = buildContext({
      parsedPrd,
      rawMarkdown,
      state,
      progressTxt,
      stuckHint,
    });

    const currentStoryObj = parsedPrd.stories.find((s) => s.id === currentStory);
    const storyTitle = currentStoryObj?.title ?? currentStory;

    const storyTable = buildStoryTable(parsedPrd.stories, state, currentStory);
    const codebasePatterns = extractCodebasePatterns(progressTxt);
    const recentLearnings = extractRecentLearnings(progressTxt, 3);

    // 7. Replace all {{placeholder}} tokens in the template
    const prompt = replacePlaceholders(templateContent, {
      branch_name: state.branchName,
      story_id: currentStory,
      story_title: storyTitle,
      prd_context: prdContext,
      story_table: storyTable,
      codebase_patterns: codebasePatterns,
      recent_learnings: recentLearnings,
      stuck_hint: stuckHint ?? '',
      progress_txt_path: progressPath,
    });

    // 8. Spawn adapter
    console.log(
      `[william] Iteration ${iteration + 1}/${maxIterations} — workspace "${workspaceName}" — ${currentStory}: ${storyTitle}`,
    );

    // 9. Pipe stdout/stderr to log file and terminal
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const logPath = path.join(logsDir, `${timestamp}-${currentStory}.log`);
    const logStream = fs.createWriteStream(logPath);

    const childProcess = adapter.spawn(prompt, { cwd: state.targetDir });

    let rawOutput = '';

    await new Promise<void>((resolve, reject) => {
      childProcess.stdout?.on('data', (chunk: Buffer) => {
        const text = chunk.toString();
        rawOutput += text;
        process.stdout.write(text);
        logStream.write(text);
      });
      childProcess.stderr?.on('data', (chunk: Buffer) => {
        const text = chunk.toString();
        rawOutput += text;
        process.stderr.write(text);
        logStream.write(text);
      });
      childProcess.on('close', () => {
        logStream.end(() => resolve());
      });
      childProcess.on('error', (err: Error) => {
        logStream.destroy();
        reject(err);
      });
    });

    // 10. Parse adapter output
    const result = adapter.parseOutput(rawOutput);

    // Reload state (agent may have modified state.json)
    let currentState = loadState(statePath);

    // 11. Mark complete or 12. increment attempts
    if (result.storyComplete || result.allComplete) {
      currentState = markStoryComplete(currentState, currentStory);
      if (fs.existsSync(stuckHintPath)) {
        fs.unlinkSync(stuckHintPath);
      }
      console.log(`[william] Story ${currentStory} marked complete.`);
    } else {
      currentState = incrementAttempts(currentState, currentStory);
      const attempts = currentState.stories[currentStory]?.attempts ?? 0;
      console.log(`[william] Story ${currentStory} not yet complete (attempts: ${attempts}).`);
    }

    saveState(statePath, currentState);

    // 13. Call watchdog after every iteration
    const watchdogResult = runWatchdog(currentState, workspaceDir, rawOutput);

    if (watchdogResult.action === 'pause') {
      console.log(`[william] Watchdog triggered pause for workspace "${workspaceName}".`);
      normalExit = true;
      break;
    }
    if (watchdogResult.action === 'skip') {
      // Watchdog calls markStorySkipped internally and saves state; reload to pick up the change
      currentState = loadState(statePath);
    }

    // Exit loop if all complete
    if (result.allComplete || getCurrentStory(currentState) === null) {
      console.log(`[william] All stories complete for workspace "${workspaceName}".`);
      normalExit = true;
      break;
    }

    // 14. Sleep between iterations
    await sleep(sleepMs);
  }

  if (!normalExit) {
    console.warn(
      `[william] Warning: max iterations (${maxIterations}) reached for workspace "${workspaceName}". Stopping.`,
    );
  }
}
