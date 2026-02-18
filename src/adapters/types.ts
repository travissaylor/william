import type { ChildProcess } from 'child_process';

export interface AdapterResult {
  storyComplete: boolean;
  allComplete: boolean;
  rawOutput: string;
}

export interface ToolAdapter {
  name: string;
  spawn(prompt: string, opts: { cwd: string }): ChildProcess;
  parseOutput(output: string): AdapterResult;
}
