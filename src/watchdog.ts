import * as fs from 'fs';
import * as path from 'path';
import { spawnSync } from 'child_process';
import type { WorkspaceState } from './types.js';
import { markStorySkipped, saveState, getCurrentStory } from './prd/tracker.js';
import { sendNotification } from './notifier.js';

export interface WatchdogResult {
  action: 'continue' | 'hint' | 'notify' | 'skip' | 'pause';
}

function extractErrorLines(output: string): string[] {
  return output
    .split('\n')
    .filter((l) =>
      /\b(error|Error|ERROR|failed|FAILED|TypeError|ReferenceError|SyntaxError|Cannot|cannot)\b/.test(
        l,
      ),
    );
}

function findRepeatedErrors(output: string): string[] {
  const counts: Record<string, number> = {};
  for (const line of extractErrorLines(output)) {
    const key = line.trim();
    if (key) counts[key] = (counts[key] ?? 0) + 1;
  }
  return Object.entries(counts)
    .filter(([, count]) => count >= 2)
    .map(([line]) => line);
}

function extractMentionedFiles(output: string): string[] {
  const pattern = /(?:^|[\s(])([./\w-]+\.(?:ts|tsx|js|jsx|json|md))(?:[\s:),]|$)/gm;
  const matches = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(output)) !== null) {
    matches.add(m[1]);
  }
  return Array.from(matches).slice(0, 10);
}

function hasNewCommits(targetDir: string, since: string): boolean {
  const result = spawnSync(
    'git',
    ['-C', targetDir, 'log', `--since=${since}`, '--oneline'],
    { encoding: 'utf-8' },
  );
  // On git errors, assume progress exists so we don't false-positive
  if (result.status !== 0 || result.error) return true;
  return result.stdout.trim().length > 0;
}

function writeHint(
  stuckHintPath: string,
  storyId: string,
  output: string,
  reason: string,
): void {
  const errorLines = extractErrorLines(output).slice(0, 20);
  const mentionedFiles = extractMentionedFiles(output);

  const content = [
    `# Stuck Hint for ${storyId}`,
    '',
    `## Reason`,
    reason,
    '',
    `## Error Patterns from Last Output`,
    errorLines.length > 0
      ? errorLines.map((e) => `- ${e.trim()}`).join('\n')
      : '_No error patterns detected_',
    '',
    `## Files Mentioned in Errors`,
    mentionedFiles.length > 0
      ? mentionedFiles.map((f) => `- \`${f}\``).join('\n')
      : '_No files detected_',
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

export function runWatchdog(
  state: WorkspaceState,
  workspaceDir: string,
  lastOutput: string,
): WatchdogResult {
  const currentStoryId = getCurrentStory(state);
  if (currentStoryId === null) {
    return { action: 'continue' };
  }

  const storyState = state.stories[currentStoryId];
  if (!storyState) {
    return { action: 'continue' };
  }

  const attempts = storyState.attempts;
  const stuckHintPath = path.join(workspaceDir, '.stuck-hint.md');
  const stuckHintExists = fs.existsSync(stuckHintPath);
  const statePath = path.join(workspaceDir, 'state.json');
  const pausedPath = path.join(workspaceDir, '.paused');

  // Check highest escalation first so more severe conditions are never blocked by lighter ones

  // Heuristic 5: stuck hint already written + attempts >= 7 → pause
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

  // Heuristic 4: stuck hint already written + attempts >= 5 → skip
  if (stuckHintExists && attempts >= 5) {
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

  // Heuristic 1: repeat attempts >= 3 → hint
  if (attempts >= 3) {
    writeHint(stuckHintPath, currentStoryId, lastOutput, `Failed ${attempts} times in a row`);
    sendNotification(
      'William: Agent Stuck',
      `Story ${currentStoryId} has failed ${attempts} times. A hint has been written.`,
    );
    return { action: 'hint' };
  }

  // Heuristic 2: no commits since last attempt + attempts >= 2 → hint
  if (attempts >= 2 && storyState.lastAttempt) {
    const hadCommits = hasNewCommits(state.targetDir, storyState.lastAttempt);
    if (!hadCommits) {
      writeHint(
        stuckHintPath,
        currentStoryId,
        lastOutput,
        'No commits detected since the last attempt',
      );
      sendNotification(
        'William: No Progress',
        `Story ${currentStoryId}: no commits after ${attempts} attempts.`,
      );
      return { action: 'hint' };
    }
  }

  // Heuristic 3: identical error message appears 2+ times → hint
  const repeatedErrors = findRepeatedErrors(lastOutput);
  if (repeatedErrors.length > 0) {
    writeHint(
      stuckHintPath,
      currentStoryId,
      lastOutput,
      'Repeated error patterns detected in output',
    );
    sendNotification(
      'William: Repeated Errors',
      `Story ${currentStoryId}: repeated errors detected. A hint has been written.`,
    );
    return { action: 'hint' };
  }

  return { action: 'continue' };
}
