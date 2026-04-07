#!/usr/bin/env tsx
/**
 * Skill helper for `/william start`.
 * Subcommands:
 *   info <workspace>                                      – workspace state and wave info
 *   prompt <workspace> <story> [branch] [cwd]             – build subagent prompt, write to temp file
 *   mark-complete <workspace> <story>                     – mark story passed
 *   mark-failed <workspace> <story>                       – increment story attempts
 *   checkpoint-wave <workspace> <wave#> <outcomes-json> [chain-context]
 */
import * as os from "os";
import * as path from "path";
import * as fs from "fs";
import { loadState, saveState } from "../lib/prd/tracker.js";
import { parsePrd } from "../lib/prd/parser.js";
import { buildContext } from "../lib/prd/context-builder.js";
import { replacePlaceholders } from "../lib/template.js";
import { resolveTemplatePath } from "../lib/paths.js";
import { resolveWorkspace } from "../cli/workspace.js";
import { loadProjectConfig } from "../lib/config.js";
import type { WaveResult, StoryOutcome } from "../lib/types.js";

// --- info ---

function cmdInfo(workspaceName: string): void {
  const resolved = resolveWorkspace(workspaceName);
  const statePath = path.join(resolved.workspaceDir, "state.json");
  const state = loadState(statePath);

  const waves = state.waves ?? [];
  const currentWave = state.currentWave ?? 0;
  const waveResults = state.waveResults ?? [];
  const hasWaves = waves.length > 0;

  // Stories to execute in current wave (or all pending if no waves)
  let waveStories: string[];
  if (hasWaves && currentWave < waves.length) {
    waveStories = waves[currentWave].filter((id) => {
      const s = state.stories[id];
      return s.passes !== true && s.passes !== "skipped";
    });
  } else if (!hasWaves) {
    waveStories = Object.entries(state.stories)
      .filter(([, s]) => s.passes !== true && s.passes !== "skipped")
      .map(([id]) => id);
  } else {
    waveStories = [];
  }

  const isResume = waveResults.length > 0;
  const allDone = Object.values(state.stories).every(
    (s) => s.passes === true || s.passes === "skipped",
  );

  // Load PRD for story details
  const prdPath = path.join(resolved.workspaceDir, "prd.md");
  const storyDetails: Record<string, { title: string; description: string }> =
    {};
  if (fs.existsSync(prdPath)) {
    const parsedPrd = parsePrd(fs.readFileSync(prdPath, "utf-8"));
    for (const s of parsedPrd.stories) {
      storyDetails[s.id] = { title: s.title, description: s.description };
    }
  }

  // Load config for setup commands
  const config = loadProjectConfig(state.targetDir);
  /* eslint-disable @typescript-eslint/no-deprecated -- legacy fallback */
  const worktreeSetupCommands =
    config?.git?.worktreeSetupCommands ?? config?.setupCommands ?? [];
  /* eslint-enable @typescript-eslint/no-deprecated */

  console.log(
    JSON.stringify({
      workspaceName: resolved.workspaceName,
      projectName: resolved.projectName,
      workspaceDir: resolved.workspaceDir,
      branchName: state.branchName,
      targetDir: state.targetDir,
      worktreePath: state.worktreePath ?? null,
      gitWorkflow: state.gitWorkflow ?? "worktree",
      hasWaves,
      totalWaves: waves.length,
      currentWave,
      waveStories,
      isResume,
      allDone,
      worktreeSetupCommands,
      stories: Object.fromEntries(
        Object.entries(state.stories).map(([id, s]) => [
          id,
          { passes: s.passes, attempts: s.attempts },
        ]),
      ),
      storyDetails,
      waves,
    }),
  );
}

// --- prompt ---

function cmdPrompt(
  workspaceName: string,
  storyId: string,
  branchOverride?: string,
  cwdOverride?: string,
): void {
  const resolved = resolveWorkspace(workspaceName);
  const workspaceDir = resolved.workspaceDir;
  const statePath = path.join(workspaceDir, "state.json");
  const state = loadState(statePath);

  const prdPath = path.join(workspaceDir, "prd.md");
  const rawMarkdown = fs.readFileSync(prdPath, "utf-8");
  const parsedPrd = parsePrd(rawMarkdown);

  const progressPath = path.join(workspaceDir, "progress.txt");
  const progressTxt = fs.existsSync(progressPath)
    ? fs.readFileSync(progressPath, "utf-8")
    : "";

  const stuckHintPath = path.join(workspaceDir, ".stuck-hint.md");
  const stuckHint = fs.existsSync(stuckHintPath)
    ? fs.readFileSync(stuckHintPath, "utf-8")
    : undefined;

  // Chain context from last completed wave
  const waveResults = state.waveResults ?? [];
  const lastChainContext =
    waveResults.length > 0
      ? waveResults[waveResults.length - 1].chainContext
      : "";

  // Temporarily set currentStory so buildContext focuses on this story
  const tempState = { ...state, currentStory: storyId };

  const prdContext = buildContext({
    parsedPrd,
    rawMarkdown,
    state: tempState,
    progressTxt,
    stuckHint,
    chainContext: lastChainContext || undefined,
  });

  const currentStoryObj = parsedPrd.stories.find((s) => s.id === storyId);
  const storyTitle = currentStoryObj?.title ?? storyId;

  const storyTable = parsedPrd.stories
    .map((s) => {
      if (s.id === storyId) return `\u2192 ${s.id}: ${s.title}`;
      const st = state.stories[s.id];
      if (st.passes === true) return `\u2713 ${s.id}: ${s.title}`;
      if (st.passes === "skipped") return `\u2298 ${s.id}: ${s.title}`;
      return `\u00b7 ${s.id}: ${s.title}`;
    })
    .join("\n");

  const patternsMatch =
    /^## Codebase Patterns\s*\n([\s\S]*?)(?=\n## |\n---|\s*$)/m.exec(
      progressTxt,
    );
  const codebasePatterns = patternsMatch ? patternsMatch[0].trim() : "";

  const learnParts = progressTxt.split(/(?=^## \[?\d{4}-\d{2}-\d{2}\]?)/m);
  const learnEntries = learnParts.filter((p) =>
    /^## \[?\d{4}-\d{2}-\d{2}\]?/.test(p.trim()),
  );
  const recentLearnings = learnEntries
    .slice(-3)
    .map((e) => e.trim())
    .join("\n\n");

  const branchName = branchOverride ?? state.branchName;
  const commitMessage = `[${storyTitle}]`;

  const templatePath = resolveTemplatePath("agent-instructions.md");
  const templateContent = fs.readFileSync(templatePath, "utf-8");

  const prompt = replacePlaceholders(templateContent, {
    branch_name: branchName,
    story_id: storyId,
    story_title: storyTitle,
    prd_context: prdContext,
    story_table: storyTable,
    codebase_patterns: codebasePatterns,
    recent_learnings: recentLearnings,
    stuck_hint: stuckHint ?? "",
    progress_txt_path: progressPath,
    chain_context: lastChainContext,
    commit_message: commitMessage,
  });

  // Prepend working directory section if cwd specified
  let fullPrompt = prompt;
  if (cwdOverride) {
    const cwdSection = [
      "",
      "## Working Directory",
      "",
      `Your working directory is \`${cwdOverride}\`. Run \`cd "${cwdOverride}"\` as your first bash command. Use absolute paths for all file operations.`,
      "",
      "---",
      "",
    ].join("\n");
    fullPrompt = cwdSection + prompt;
  }

  // Write to temp file
  const sanitized = `${resolved.workspaceName.replace(/\//g, "-")}-${storyId}`;
  const promptFile = path.join(os.tmpdir(), `william-prompt-${sanitized}.md`);
  fs.writeFileSync(promptFile, fullPrompt, "utf-8");

  console.log(
    JSON.stringify({
      promptFile,
      storyId,
      storyTitle,
      branchName,
    }),
  );
}

// --- mark-complete ---

function cmdMarkComplete(workspaceName: string, storyId: string): void {
  const resolved = resolveWorkspace(workspaceName);
  const statePath = path.join(resolved.workspaceDir, "state.json");
  const state = loadState(statePath);

  state.stories[storyId] = {
    ...state.stories[storyId],
    passes: true,
    completedAt: new Date().toISOString(),
  };

  saveState(statePath, state);
  console.log(JSON.stringify({ ok: true, storyId }));
}

// --- mark-failed ---

function cmdMarkFailed(workspaceName: string, storyId: string): void {
  const resolved = resolveWorkspace(workspaceName);
  const statePath = path.join(resolved.workspaceDir, "state.json");
  const state = loadState(statePath);

  const existing = state.stories[storyId];
  state.stories[storyId] = {
    ...existing,
    attempts: existing.attempts + 1,
    lastAttempt: new Date().toISOString(),
  };

  saveState(statePath, state);
  console.log(
    JSON.stringify({
      ok: true,
      storyId,
      attempts: state.stories[storyId].attempts,
    }),
  );
}

// --- checkpoint-wave ---

function isStoryOutcome(value: unknown): value is StoryOutcome {
  return value === "pass" || value === "fail" || value === "skip";
}

function parseOutcomes(json: string): Record<string, StoryOutcome> {
  const result: Record<string, StoryOutcome> = {};
  const raw: unknown = JSON.parse(json);
  if (typeof raw === "object" && raw !== null) {
    for (const [key, val] of Object.entries(raw as Record<string, unknown>)) {
      if (isStoryOutcome(val)) {
        result[key] = val;
      }
    }
  }
  return result;
}

function cmdCheckpointWave(
  workspaceName: string,
  waveNum: string,
  outcomesJson: string,
  chainContext?: string,
): void {
  const resolved = resolveWorkspace(workspaceName);
  const statePath = path.join(resolved.workspaceDir, "state.json");
  const state = loadState(statePath);

  const outcomes = parseOutcomes(outcomesJson);

  const waveResult: WaveResult = {
    wave: parseInt(waveNum, 10),
    storyOutcomes: outcomes,
    chainContext: chainContext ?? "",
    completedAt: new Date().toISOString(),
  };

  state.waveResults ??= [];
  state.waveResults.push(waveResult);
  state.currentWave = (state.currentWave ?? 0) + 1;

  saveState(statePath, state);

  const allDone = Object.values(state.stories).every(
    (s) => s.passes === true || s.passes === "skipped",
  );

  console.log(
    JSON.stringify({
      ok: true,
      currentWave: state.currentWave,
      allDone,
    }),
  );
}

// --- main ---

const [subcommand, ...args] = process.argv.slice(2);

try {
  switch (subcommand) {
    case "info":
      if (!args[0]) throw new Error("Usage: start.ts info <workspace>");
      cmdInfo(args[0]);
      break;
    case "prompt":
      if (!args[0] || !args[1])
        throw new Error(
          "Usage: start.ts prompt <workspace> <story-id> [branch] [cwd]",
        );
      cmdPrompt(args[0], args[1], args[2] || undefined, args[3] || undefined);
      break;
    case "mark-complete":
      if (!args[0] || !args[1])
        throw new Error("Usage: start.ts mark-complete <workspace> <story-id>");
      cmdMarkComplete(args[0], args[1]);
      break;
    case "mark-failed":
      if (!args[0] || !args[1])
        throw new Error("Usage: start.ts mark-failed <workspace> <story-id>");
      cmdMarkFailed(args[0], args[1]);
      break;
    case "checkpoint-wave":
      if (!args[0] || !args[1] || !args[2])
        throw new Error(
          "Usage: start.ts checkpoint-wave <workspace> <wave#> <outcomes-json> [chain-context]",
        );
      cmdCheckpointWave(args[0], args[1], args[2], args[3]);
      break;
    default:
      console.error(
        JSON.stringify({
          error: `Unknown subcommand: ${subcommand}. Valid: info, prompt, mark-complete, mark-failed, checkpoint-wave`,
        }),
      );
      process.exit(1);
  }
} catch (err) {
  console.error(
    JSON.stringify({
      error: err instanceof Error ? err.message : String(err),
    }),
  );
  process.exit(1);
}
