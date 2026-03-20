import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";

export interface InteractiveRevisionOpts {
  workspaceDir: string;
  targetDir: string;
  branchName: string;
  planPath: string;
}

/**
 * Builds the prompt for an interactive revision planning session.
 * Includes the original PRD, progress.txt, and git diff as context,
 * with light formatting instructions for the RI-XXX plan format.
 */
export function buildInteractiveRevisionPrompt(
  opts: InteractiveRevisionOpts,
): string {
  const { workspaceDir, targetDir, branchName, planPath } = opts;

  const progressPath = path.join(workspaceDir, "progress.txt");
  const progress = fs.existsSync(progressPath)
    ? fs.readFileSync(progressPath, "utf-8")
    : "(no progress file)";

  const prdPath = path.join(workspaceDir, "prd.md");
  const originalPrd = fs.existsSync(prdPath)
    ? fs.readFileSync(prdPath, "utf-8")
    : "(no PRD file found)";

  const gitDiff = getGitDiff(targetDir, branchName);

  return `You are helping the user plan revisions to a workspace that has already been implemented. Your goal is to help them identify problems and create a structured revision plan.

You have full interactive capabilities — the user can ask questions, use any Claude Code skill (like /grill-me, /simplify, etc.), and iterate with you until they're satisfied with the plan.

---

## Original PRD

${originalPrd}

---

## Workspace Progress

${progress}

---

## Git Diff (changes made by this workspace)

${gitDiff}

---

## Your Task

1. Help the user identify what needs to be revised — ask about problems they've noticed, review the diff, and surface issues
2. Collaborate with the user to shape a revision plan
3. When the user is satisfied, write the finalized plan to \`${planPath}\`

## Plan Format

The revision plan must use the \`RI-XXX\` identifier format. Each revision item should follow this structure:

\`\`\`
### RI-001: Title

**Description:** Explicit description of what is wrong and what the fix should look like.

**Acceptance Criteria:**

- [ ] Specific verifiable criterion
- [ ] Another criterion
- [ ] Typecheck and lint pass
\`\`\`

Keep revision items small and independently committable. Do not combine unrelated problems into a single revision item.

When the plan is finalized, write it to \`${planPath}\` using your file-writing tools.`;
}

/**
 * Gets the git diff of all changes made on the workspace branch vs its merge base.
 */
function getGitDiff(targetDir: string, branchName: string): string {
  try {
    const diff = execSync(`git diff main...${branchName}`, {
      cwd: targetDir,
      encoding: "utf-8",
      maxBuffer: 1024 * 1024 * 10,
    });
    return diff || "(no changes)";
  } catch {
    return "(could not generate diff)";
  }
}
