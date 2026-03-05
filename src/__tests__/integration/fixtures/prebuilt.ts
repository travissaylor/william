import type { NdjsonFixtureConfig } from "./mock-adapter.js";

/**
 * A session where the assistant completes a story: does some tool calls,
 * emits STORY_COMPLETE, and exits cleanly.
 */
export function storyCompleteFixture(
  overrides?: Partial<NdjsonFixtureConfig>,
): NdjsonFixtureConfig {
  return {
    messages: [
      { role: "system" },
      {
        role: "assistant",
        content: "I'll implement this feature now.",
        toolUse: [
          { id: "tu-1", name: "Read", input: { file_path: "/src/index.ts" } },
        ],
      },
      {
        role: "user",
        toolResult: [
          { toolUseId: "tu-1", content: "export function main() {}" },
        ],
      },
      {
        role: "assistant",
        toolUse: [
          {
            id: "tu-2",
            name: "Write",
            input: {
              file_path: "/src/feature.ts",
              content: 'export const feature = "done";',
            },
          },
        ],
      },
      {
        role: "user",
        toolResult: [{ toolUseId: "tu-2", content: "File written." }],
      },
      {
        role: "assistant",
        content:
          "The feature is implemented and all checks pass.\n\n<promise>STORY_COMPLETE</promise>",
      },
    ],
    cost: 0.025,
    tokens: { input: 2000, output: 1000 },
    duration: 8000,
    ...overrides,
  };
}

/**
 * A session where the assistant marks the entire workspace complete (all stories done).
 */
export function allCompleteFixture(
  overrides?: Partial<NdjsonFixtureConfig>,
): NdjsonFixtureConfig {
  return {
    messages: [
      { role: "system" },
      {
        role: "assistant",
        content: "Implementing the final story.",
        toolUse: [
          {
            id: "tu-1",
            name: "Write",
            input: {
              file_path: "/src/final.ts",
              content: "export const done = true;",
            },
          },
        ],
      },
      {
        role: "user",
        toolResult: [{ toolUseId: "tu-1", content: "File written." }],
      },
      {
        role: "assistant",
        content:
          "All stories are now complete.\n\n<promise>ALL_COMPLETE</promise>",
      },
    ],
    cost: 0.015,
    tokens: { input: 1500, output: 800 },
    duration: 6000,
    ...overrides,
  };
}

/**
 * A session that triggers tool loop detection: the assistant calls the same
 * tool 12 times with identical input (threshold is 10).
 */
export function stuckToolLoopFixture(
  overrides?: Partial<NdjsonFixtureConfig>,
): NdjsonFixtureConfig {
  const messages: NdjsonFixtureConfig["messages"] = [{ role: "system" }];

  // Generate 12 identical tool calls to trigger the loop detector
  for (let i = 0; i < 12; i++) {
    messages.push({
      role: "assistant",
      toolUse: [
        {
          id: `tu-loop-${i}`,
          name: "Bash",
          input: { command: "pnpm test" },
        },
      ],
    });
    messages.push({
      role: "user",
      toolResult: [
        {
          toolUseId: `tu-loop-${i}`,
          content: "FAIL: 3 tests failed",
          isError: true,
        },
      ],
    });
  }

  // End without STORY_COMPLETE
  messages.push({
    role: "assistant",
    content: "I'm having trouble getting tests to pass.",
  });

  return {
    messages,
    cost: 0.08,
    tokens: { input: 5000, output: 3000 },
    duration: 30000,
    ...overrides,
  };
}

/**
 * A session where the process exits with a non-zero exit code and stderr output.
 */
export function errorExitFixture(
  overrides?: Partial<NdjsonFixtureConfig>,
): NdjsonFixtureConfig {
  return {
    messages: [{ role: "system" }],
    cost: 0.001,
    tokens: { input: 100, output: 50 },
    duration: 1000,
    resultSubtype: "error_unknown",
    exitCode: 1,
    stderrOutput: "Error: Claude CLI crashed unexpectedly\n",
    ...overrides,
  };
}

/**
 * A minimal session with no tool calls and no completion markers.
 * Useful for testing "zero progress" detection.
 */
export function zeroProgressFixture(
  overrides?: Partial<NdjsonFixtureConfig>,
): NdjsonFixtureConfig {
  return {
    messages: [
      { role: "system" },
      {
        role: "assistant",
        content: "Let me look at the codebase.",
        toolUse: [
          { id: "tu-1", name: "Read", input: { file_path: "/src/index.ts" } },
        ],
      },
      {
        role: "user",
        toolResult: [
          { toolUseId: "tu-1", content: "export function main() {}" },
        ],
      },
      {
        role: "assistant",
        content: "I need to think about how to approach this.",
      },
    ],
    cost: 0.01,
    tokens: { input: 800, output: 400 },
    duration: 4000,
    ...overrides,
  };
}
