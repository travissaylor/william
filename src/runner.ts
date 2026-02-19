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
  markStorySkipped,
  incrementAttempts,
} from './prd/tracker.js';
import { parsePrd } from './prd/parser.js';
import { buildContext } from './prd/context-builder.js';
import { replacePlaceholders } from './template.js';
import { consumeStreamOutput } from './stream/consume.js';
import { extractChainContext, formatChainContextForPrompt } from './stream/chain.js';
import { sendNotification } from './notifier.js';
import type { StreamSession } from './stream/types.js';
import type { TuiEmitter } from './ui/events.js';

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

// --- Inline stuck detection (replaces watchdog module) ---

interface StuckResult {
  action: 'continue' | 'hint' | 'skip' | 'pause';
}

function detectToolLoops(session: StreamSession): boolean {
  const counts: Record<string, number> = {};
  for (const tu of session.toolUses) {
    const key = `${tu.name}:${JSON.stringify(tu.input)}`;
    counts[key] = (counts[key] ?? 0) + 1;
    if (counts[key] >= 10) return true;
  }
  return false;
}

function detectZeroProgress(session: StreamSession): boolean {
  const writeEdits = session.toolUses.filter(
    (tu) => tu.name === 'Write' || tu.name === 'Edit',
  );
  return session.toolUses.length > 0 && writeEdits.length === 0;
}

function detectHighErrorRate(session: StreamSession): boolean {
  if (session.toolResults.length === 0) return false;
  const errors = session.toolResults.filter((tr) => tr.is_error);
  return errors.length / session.toolResults.length > 0.5;
}

function writeStuckHint(
  stuckHintPath: string,
  storyId: string,
  session: StreamSession,
  reason: string,
): void {
  const errorResults = session.toolResults
    .filter((tr) => tr.is_error)
    .slice(0, 20);
  const filesModified = session.toolUses
    .filter((tu) => tu.name === 'Write' || tu.name === 'Edit')
    .map((tu) => (tu.input as Record<string, unknown>).file_path as string)
    .filter(Boolean)
    .slice(0, 10);

  const content = [
    `# Stuck Hint for ${storyId}`,
    '',
    `## Reason`,
    reason,
    '',
    `## Error Results from Session`,
    errorResults.length > 0
      ? errorResults.map((e) => `- [${e.tool_use_id}] ${e.content.slice(0, 200)}`).join('\n')
      : '_No error results_',
    '',
    `## Files Modified`,
    filesModified.length > 0
      ? filesModified.map((f) => `- \`${f}\``).join('\n')
      : '_No files modified_',
    '',
    `## Session Stats`,
    `- Tool uses: ${session.toolUses.length}`,
    `- Tool results: ${session.toolResults.length}`,
    `- Error results: ${errorResults.length}`,
    `- Cost: $${session.totalCostUsd.toFixed(4)}`,
    '',
    `## Suggestion`,
    'The previous approach may not be working. Consider:',
    '- Re-reading the acceptance criteria from scratch',
    '- Checking for type errors or missing imports',
    '- Looking at adjacent files for patterns to follow',
    '- Running quality checks manually to isolate the specific failure',
    '- Breaking the implementation into smaller incremental steps',
  ].join('\n');

  fs.writeFileSync(stuckHintPath, content, 'utf-8');
}

function runStuckDetection(
  state: WorkspaceState,
  workspaceDir: string,
  session: StreamSession,
): StuckResult {
  const currentStoryId = getCurrentStory(state);
  if (currentStoryId === null) return { action: 'continue' };

  const storyState = state.stories[currentStoryId];
  if (!storyState) return { action: 'continue' };

  const attempts = storyState.attempts;
  const stuckHintPath = path.join(workspaceDir, '.stuck-hint.md');
  const stuckHintExists = fs.existsSync(stuckHintPath);
  const pausedPath = path.join(workspaceDir, '.paused');

  // Escalation: stuck hint already written + attempts >= 7 → pause
  if (stuckHintExists && attempts >= 7) {
    fs.writeFileSync(
      pausedPath,
      `Paused: ${currentStoryId} stuck after ${attempts} attempts\n`,
      'utf-8',
    );
    sendNotification(
      'William: Workspace Paused',
      `Story ${currentStoryId} stuck after ${attempts} attempts. Manual intervention required.`,
    );
    return { action: 'pause' };
  }

  // Escalation: stuck hint already written + attempts >= 5 → skip
  if (stuckHintExists && attempts >= 5) {
    const statePath = path.join(workspaceDir, 'state.json');
    const updatedState = markStorySkipped(
      state,
      currentStoryId,
      `Skipped after ${attempts} attempts with stuck hint present`,
    );
    saveState(statePath, updatedState);
    sendNotification(
      'William: Story Skipped',
      `Story ${currentStoryId} skipped after ${attempts} attempts.`,
    );
    return { action: 'skip' };
  }

  // Detect stuck from session data: tool loops, zero progress, high error rate
  const isToolLoop = detectToolLoops(session);
  const isZeroProgress = detectZeroProgress(session);
  const isHighErrorRate = detectHighErrorRate(session);

  if (attempts >= 3 || isToolLoop || isZeroProgress || isHighErrorRate) {
    const reasons: string[] = [];
    if (attempts >= 3) reasons.push(`Failed ${attempts} times in a row`);
    if (isToolLoop) reasons.push('Detected tool loop (same tool called 10+ times with identical input)');
    if (isZeroProgress) reasons.push('No Write/Edit tool uses detected (zero progress)');
    if (isHighErrorRate) reasons.push('High error rate (>50% of tool results are errors)');

    writeStuckHint(stuckHintPath, currentStoryId, session, reasons.join('; '));
    sendNotification(
      'William: Agent Stuck',
      `Story ${currentStoryId}: ${reasons[0]}. A hint has been written.`,
    );
    return { action: 'hint' };
  }

  return { action: 'continue' };
}

// --- Main runner ---

export async function runWorkspace(workspaceName: string, opts: RunOpts, emitter: TuiEmitter): Promise<void> {
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

  fs.mkdirSync(logsDir, { recursive: true });

  const templateContent = fs.readFileSync(templatePath, 'utf-8');

  let normalExit = false;
  let lastChainContext = '';
  let cumulativeCostUsd = 0;
  let cumulativeInputTokens = 0;
  let cumulativeOutputTokens = 0;

  for (let iteration = 0; iteration < maxIterations; iteration++) {
    if (fs.existsSync(stoppedPath)) {
      emitter.system(`[william] Workspace "${workspaceName}" has been stopped. Halting.`);
      normalExit = true;
      break;
    }
    if (fs.existsSync(pausedPath)) {
      emitter.system(`[william] Workspace "${workspaceName}" is paused. Halting.`);
      normalExit = true;
      break;
    }

    const state = loadState(statePath);
    const currentStory = getCurrentStory(state);
    if (currentStory === null) {
      emitter.system(`[william] All stories complete for workspace "${workspaceName}".`);
      normalExit = true;
      break;
    }

    const prdPath = state.sourceFile;
    const rawMarkdown = fs.readFileSync(prdPath, 'utf-8');
    const parsedPrd = parsePrd(rawMarkdown);

    const progressTxt = fs.existsSync(progressPath)
      ? fs.readFileSync(progressPath, 'utf-8')
      : '';

    const stuckHint = fs.existsSync(stuckHintPath)
      ? fs.readFileSync(stuckHintPath, 'utf-8')
      : undefined;

    const prdContext = buildContext({
      parsedPrd,
      rawMarkdown,
      state,
      progressTxt,
      stuckHint,
      chainContext: lastChainContext || undefined,
    });

    const currentStoryObj = parsedPrd.stories.find((s) => s.id === currentStory);
    const storyTitle = currentStoryObj?.title ?? currentStory;

    const storyTable = buildStoryTable(parsedPrd.stories, state, currentStory);
    const codebasePatterns = extractCodebasePatterns(progressTxt);
    const recentLearnings = extractRecentLearnings(progressTxt, 3);

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
      chain_context: lastChainContext,
    });

    emitter.system(
      `[william] Iteration ${iteration + 1}/${maxIterations} — workspace "${workspaceName}" — ${currentStory}: ${storyTitle}`,
    );

    {
      const storyValues = Object.values(state.stories);
      const storyEntry = state.stories[currentStory];
      const hintExists = fs.existsSync(stuckHintPath);
      const attempts = storyEntry?.attempts ?? 0;
      emitter.dashboardUpdate({
        workspaceName,
        storyId: currentStory,
        storyTitle,
        iteration: iteration + 1,
        maxIterations,
        storiesCompleted: storyValues.filter(s => s.passes === true).length,
        storiesTotal: storyValues.length,
        storiesSkipped: storyValues.filter(s => s.passes === 'skipped').length,
        cumulativeCostUsd,
        cumulativeInputTokens,
        cumulativeOutputTokens,
        storyAttempts: attempts,
        stuckStatus: !hintExists ? 'normal' : (attempts >= 4 ? 'approaching-skip' : 'hint-written'),
        filesModified: 0,
      });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const logPath = path.join(logsDir, `${timestamp}-${currentStory}.log`);
    const logStream = fs.createWriteStream(logPath);

    const childProcess = adapter.spawn(prompt, { cwd: state.targetDir });

    const { session } = await consumeStreamOutput({ childProcess, logStream, emitter });

    const result = adapter.parseOutput(session.fullText);
    result.session = session;

    let currentState = loadState(statePath);

    if (result.storyComplete || result.allComplete) {
      currentState = markStoryComplete(currentState, currentStory);
      if (fs.existsSync(stuckHintPath)) {
        fs.unlinkSync(stuckHintPath);
      }
      emitter.system(`[william] Story ${currentStory} marked complete.`);

      // Extract chain context for the next story
      const chainCtx = extractChainContext(session);
      lastChainContext = formatChainContextForPrompt(chainCtx, currentStory);
    } else {
      currentState = incrementAttempts(currentState, currentStory);
      const attempts = currentState.stories[currentStory]?.attempts ?? 0;
      emitter.system(`[william] Story ${currentStory} not yet complete (attempts: ${attempts}).`);
    }

    saveState(statePath, currentState);

    cumulativeCostUsd += session.totalCostUsd;
    cumulativeInputTokens += session.inputTokens;
    cumulativeOutputTokens += session.outputTokens;

    {
      const updatedValues = Object.values(currentState.stories);
      const updatedAttempts = currentState.stories[currentStory]?.attempts ?? 0;
      const hintExists = fs.existsSync(stuckHintPath);
      const filesModified = new Set(
        session.toolUses
          .filter(tu => tu.name === 'Write' || tu.name === 'Edit')
          .map(tu => (tu.input as Record<string, unknown>).file_path as string)
          .filter(Boolean),
      ).size;
      emitter.dashboardUpdate({
        workspaceName,
        storyId: currentStory,
        storyTitle,
        iteration: iteration + 1,
        maxIterations,
        storiesCompleted: updatedValues.filter(s => s.passes === true).length,
        storiesTotal: updatedValues.length,
        storiesSkipped: updatedValues.filter(s => s.passes === 'skipped').length,
        cumulativeCostUsd,
        cumulativeInputTokens,
        cumulativeOutputTokens,
        storyAttempts: updatedAttempts,
        stuckStatus: !hintExists ? 'normal' : (updatedAttempts >= 4 ? 'approaching-skip' : 'hint-written'),
        filesModified,
      });
    }

    // Inline stuck detection (replaces watchdog)
    const stuckResult = runStuckDetection(currentState, workspaceDir, session);

    if (stuckResult.action === 'pause') {
      emitter.system(`[william] Stuck detection triggered pause for workspace "${workspaceName}".`);
      normalExit = true;
      break;
    }
    if (stuckResult.action === 'skip') {
      currentState = loadState(statePath);
    }

    if (result.allComplete || getCurrentStory(currentState) === null) {
      emitter.system(`[william] All stories complete for workspace "${workspaceName}".`);
      normalExit = true;
      break;
    }

    await sleep(sleepMs);
  }

  if (!normalExit) {
    emitter.error(
      `[william] Warning: max iterations (${maxIterations}) reached for workspace "${workspaceName}". Stopping.`,
    );
  }
}
