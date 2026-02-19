import { spawn } from 'child_process';
import type { ChildProcess } from 'child_process';
import type { ToolAdapter, AdapterResult } from './types.js';

export const ClaudeAdapter: ToolAdapter = {
  name: 'claude',

  spawn(prompt: string, opts: { cwd: string }): ChildProcess {
    const child = spawn('claude', ['--dangerously-skip-permissions', '--output-format', 'stream-json', "--verbose"], {
      cwd: opts.cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    // Write prompt to stdin and close it
    child.stdin.write(prompt, 'utf-8');
    child.stdin.end();

    return child;
  },

  parseOutput(output: string): AdapterResult {
    const allComplete = output.includes('<promise>ALL_COMPLETE</promise>');
    const storyComplete = allComplete || output.includes('<promise>STORY_COMPLETE</promise>');

    return {
      storyComplete,
      allComplete,
      rawOutput: output,
    };
  },
};
