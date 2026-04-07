#!/usr/bin/env tsx
/**
 * Skill helper for `/william new <prd-path>`.
 * Called by the skill instruction via `npx tsx`.
 * Outputs structured JSON on success, exits non-zero on error.
 */
import * as path from "path";
import { loadProjectConfig } from "../lib/config.js";
import { parsePrd } from "../lib/prd/parser.js";
import { createWorkspace } from "../cli/workspace.js";
import { loadState } from "../lib/prd/tracker.js";
import { WILLIAM_ROOT } from "../cli/runner.js";
import * as fs from "fs";

function toKebabCase(str: string): string {
  return str
    .replace(/[^a-zA-Z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .toLowerCase();
}

function main(): void {
  const prdPath = process.argv[2];

  if (!prdPath) {
    console.error(JSON.stringify({ error: "Missing PRD path argument" }));
    process.exit(1);
  }

  const resolved = path.resolve(prdPath);

  if (!fs.existsSync(resolved)) {
    console.error(JSON.stringify({ error: `PRD file not found: ${resolved}` }));
    process.exit(1);
  }

  const cwd = process.cwd();

  if (!fs.existsSync(path.join(cwd, ".git"))) {
    console.error(
      JSON.stringify({
        error: `Not a git repository (no .git found): ${cwd}`,
      }),
    );
    process.exit(1);
  }

  const config = loadProjectConfig(cwd);

  // Parse PRD to get title for workspace name
  const rawMarkdown = fs.readFileSync(resolved, "utf-8");
  const parsedPrd = parsePrd(rawMarkdown);

  const workspaceName = parsedPrd.title
    ? toKebabCase(parsedPrd.title)
    : path.basename(resolved, ".md");

  const projectName = config?.projectName ?? path.basename(cwd);

  /* eslint-disable @typescript-eslint/no-deprecated -- legacy fallback */
  const branchPrefix = config?.git?.branchPrefix ?? config?.branchPrefix;
  /* eslint-enable @typescript-eslint/no-deprecated */
  const branchName = branchPrefix
    ? `${branchPrefix}${workspaceName}`
    : workspaceName;

  const gitWorkflow = config?.git?.workflow ?? "worktree";

  try {
    const worktreePath = createWorkspace(workspaceName, {
      targetDir: cwd,
      prdFile: resolved,
      branchName,
      project: projectName,
      gitWorkflow,
    });

    const storyCount = parsedPrd.stories.length;
    const hasDeps = parsedPrd.stories.some((s) => s.dependsOn.length > 0);

    // Re-read the state to get wave info
    const stateFile = path.join(
      WILLIAM_ROOT,
      "workspaces",
      projectName,
      workspaceName,
      "state.json",
    );
    let waveCount = 0;
    if (hasDeps && fs.existsSync(stateFile)) {
      const state = loadState(stateFile);
      waveCount = state.waves?.length ?? 0;
    }

    const result = {
      workspaceName,
      projectName,
      branchName,
      gitWorkflow,
      targetDir: cwd,
      prdFile: resolved,
      worktreePath: worktreePath ?? null,
      storyCount,
      waveCount,
      hasDependencies: hasDeps,
    };

    console.log(JSON.stringify(result));
  } catch (err) {
    console.error(
      JSON.stringify({
        error: err instanceof Error ? err.message : String(err),
      }),
    );
    process.exit(1);
  }
}

main();
