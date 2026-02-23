import type { ChildProcess } from "child_process";
import type { StreamSession } from "../stream/types.js";

export interface AdapterResult {
  storyComplete: boolean;
  allComplete: boolean;
  rawOutput: string;
  session?: StreamSession;
}

export interface ToolAdapter {
  name: string;
  spawn(prompt: string, opts: { cwd: string }): ChildProcess;
  parseOutput(output: string): AdapterResult;
}
