#!/usr/bin/env tsx
/**
 * Skill helper for `/william revise`.
 * Subcommands:
 *   context <workspace>                   – gather revision context (PRD, progress, diff, etc.)
 *   create <workspace> <plan>             – create revision workspace from approved plan
 *   update-parent <workspace> <rev#> <itemCount> – update parent state after revision completes
 */
import * as path from "path";
import * as fs from "fs";
import { execSync } from "child_process";
import {
  resolveWorkspace,
  createRevisionWorkspace,
  updateParentAfterRevision,
} from "../cli/workspace.js";
import { loadState } from "../lib/prd/tracker.js";
import { resolveTemplatePath } from "../lib/paths.js";

// --- context ---

function cmdContext(workspaceName: string): void {
  const resolved = resolveWorkspace(workspaceName);
  const statePath = path.join(resolved.workspaceDir, "state.json");
  const state = loadState(statePath);

  const progressPath = path.join(resolved.workspaceDir, "progress.txt");
  const progress = fs.existsSync(progressPath)
    ? fs.readFileSync(progressPath, "utf-8")
    : "(no progress file)";

  const prdPath = path.join(resolved.workspaceDir, "prd.md");
  const originalPrd = fs.existsSync(prdPath)
    ? fs.readFileSync(prdPath, "utf-8")
    : "(no PRD file found)";

  const stuckHintPath = path.join(resolved.workspaceDir, ".stuck-hint.md");
  const stuckHints = fs.existsSync(stuckHintPath)
    ? fs.readFileSync(stuckHintPath, "utf-8")
    : "(none)";

  let gitDiff = "(no changes)";
  try {
    gitDiff =
      execSync(`git diff main...${state.branchName}`, {
        cwd: state.targetDir,
        encoding: "utf-8",
        maxBuffer: 1024 * 1024 * 10,
      }) || "(no changes)";
  } catch {
    gitDiff = "(could not generate diff)";
  }

  // Load the revision plan template
  const templatePath = resolveTemplatePath("revision-plan-instructions.md");
  const template = fs.readFileSync(templatePath, "utf-8");

  // Story status summary
  const storyEntries = Object.entries(state.stories);
  const passed = storyEntries.filter(([, s]) => s.passes === true).length;
  const total = storyEntries.length;

  console.log(
    JSON.stringify({
      workspaceName: resolved.workspaceName,
      projectName: resolved.projectName,
      workspaceDir: resolved.workspaceDir,
      branchName: state.branchName,
      targetDir: state.targetDir,
      worktreePath: state.worktreePath ?? null,
      gitWorkflow: state.gitWorkflow ?? "worktree",
      storySummary: `${passed}/${total} stories passed`,
      template,
      originalPrd,
      progress,
      gitDiff,
      stuckHints,
    }),
  );
}

// --- create ---

function cmdCreate(workspaceName: string, plan: string): void {
  const resolved = resolveWorkspace(workspaceName);
  const statePath = path.join(resolved.workspaceDir, "state.json");
  const state = loadState(statePath);

  const { revisionDir, revisionNumber } = createRevisionWorkspace({
    parentWorkspaceDir: resolved.workspaceDir,
    parentState: state,
    plan,
  });

  // Count revision items (RI-XXX entries)
  const itemMatches = plan.match(/^###\s+RI-\d+/gm);
  const itemCount = itemMatches ? itemMatches.length : 0;

  // Build the revision workspace name for start.ts
  const revisionWorkspaceName = `${resolved.workspaceName}/revision-${revisionNumber}`;

  console.log(
    JSON.stringify({
      revisionDir,
      revisionNumber,
      revisionWorkspaceName,
      fullPath: `${resolved.projectName}/${revisionWorkspaceName}`,
      itemCount,
    }),
  );
}

// --- update-parent ---

async function cmdUpdateParent(
  workspaceName: string,
  revisionNumber: string,
  itemCount: string,
): Promise<void> {
  const resolved = resolveWorkspace(workspaceName);

  await updateParentAfterRevision(
    resolved.workspaceDir,
    path.join(resolved.workspaceDir, `revision-${revisionNumber}`),
    parseInt(revisionNumber, 10),
    parseInt(itemCount, 10),
  );

  console.log(JSON.stringify({ ok: true, revisionNumber }));
}

// --- main ---

const [subcommand, ...args] = process.argv.slice(2);

try {
  switch (subcommand) {
    case "context":
      if (!args[0]) throw new Error("Usage: revise.ts context <workspace>");
      cmdContext(args[0]);
      break;
    case "create":
      if (!args[0] || !args[1])
        throw new Error("Usage: revise.ts create <workspace> <plan>");
      cmdCreate(args[0], args[1]);
      break;
    case "update-parent":
      if (!args[0] || !args[1] || !args[2])
        throw new Error(
          "Usage: revise.ts update-parent <workspace> <revisionNumber> <itemCount>",
        );
      cmdUpdateParent(args[0], args[1], args[2])
        .then(() => process.exit(0))
        .catch((err: unknown) => {
          console.error(
            JSON.stringify({
              error: err instanceof Error ? err.message : String(err),
            }),
          );
          process.exit(1);
        });
      break;
    default:
      console.error(
        JSON.stringify({
          error: `Unknown subcommand: ${subcommand}. Valid: context, create, update-parent`,
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
