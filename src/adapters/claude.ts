import { spawn } from "child_process";
import type { ChildProcess } from "child_process";
import type { ToolAdapter, AdapterResult } from "./types.js";

/**
 * Spawns Claude in interactive mode (stdio: "inherit") for conversational use.
 * Mirrors the pattern used by `william prd` — no --dangerously-skip-permissions
 * or --output-format flags. For long prompts (>100k chars), pipes via stdin.
 *
 * Returns a promise that resolves with the exit code.
 */
export function spawnInteractive(
  prompt: string,
  opts?: { cwd?: string },
): Promise<number | null> {
  const cwd = opts?.cwd ?? process.cwd();

  let child: ChildProcess;

  if (prompt.length > 100_000) {
    child = spawn("claude", [], {
      stdio: ["pipe", "inherit", "inherit"],
      cwd,
    });
    if (child.stdin) {
      child.stdin.end(prompt);
    }
  } else {
    child = spawn("claude", [prompt], {
      stdio: "inherit",
      cwd,
    });
  }

  return new Promise<number | null>((resolve) => {
    child.on("close", resolve);
  });
}

/**
 * Spawns Claude and captures stdout while tee-ing it to the terminal.
 * Used for plan generation where we need to extract structured output
 * (e.g., <revision-plan> tags) while still showing progress to the user.
 *
 * Returns the exit code and the full captured output.
 */
export function spawnInteractiveCapture(
  prompt: string,
  opts?: { cwd?: string },
): Promise<{ exitCode: number | null; output: string }> {
  const cwd = opts?.cwd ?? process.cwd();

  let child: ChildProcess;

  if (prompt.length > 100_000) {
    child = spawn("claude", [], {
      stdio: ["pipe", "pipe", "inherit"],
      cwd,
    });
    if (child.stdin) {
      child.stdin.end(prompt);
    }
  } else {
    child = spawn("claude", [prompt], {
      stdio: ["inherit", "pipe", "inherit"],
      cwd,
    });
  }

  let output = "";

  child.stdout?.on("data", (chunk: Buffer) => {
    const text = chunk.toString();
    output += text;
    process.stdout.write(text);
  });

  return new Promise((resolve) => {
    child.on("close", (exitCode) => {
      resolve({ exitCode, output });
    });
  });
}

export const ClaudeAdapter: ToolAdapter = {
  name: "claude",

  spawn(prompt: string, opts: { cwd: string }): ChildProcess {
    const child = spawn(
      "claude",
      [
        "--dangerously-skip-permissions",
        "--output-format",
        "stream-json",
        "--verbose",
      ],
      {
        cwd: opts.cwd,
        stdio: ["pipe", "pipe", "pipe"],
      },
    );

    // Write prompt to stdin and close it
    child.stdin.write(prompt, "utf-8");
    child.stdin.end();

    return child;
  },

  parseOutput(output: string): AdapterResult {
    const allComplete = output.includes("<promise>ALL_COMPLETE</promise>");
    const storyComplete =
      allComplete || output.includes("<promise>STORY_COMPLETE</promise>");

    return {
      storyComplete,
      allComplete,
      rawOutput: output,
    };
  },
};
