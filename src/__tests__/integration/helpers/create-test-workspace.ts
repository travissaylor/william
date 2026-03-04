import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { parsePrd } from "../../../prd/parser.js";
import { initStateFromPrd } from "../../../prd/tracker.js";
import type { InitStateOpts } from "../../../prd/tracker.js";

export interface TestWorkspaceResult {
  workspaceDir: string;
  statePath: string;
  prdPath: string;
  progressPath: string;
  cleanup: () => void;
}

export interface TestWorkspaceOpts {
  prdText: string;
  workspaceName?: string;
  projectName?: string;
  branchName?: string;
  stateOverrides?: Partial<InitStateOpts>;
}

/**
 * Creates a temporary workspace directory with valid state.json, prd.md,
 * and progress.txt for integration tests.
 */
export function createTestWorkspace(
  opts: TestWorkspaceOpts,
): TestWorkspaceResult {
  const workspaceDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "william-test-workspace-"),
  );

  const prdPath = path.join(workspaceDir, "prd.md");
  const statePath = path.join(workspaceDir, "state.json");
  const progressPath = path.join(workspaceDir, "progress.txt");

  // Write PRD
  fs.writeFileSync(prdPath, opts.prdText, "utf-8");

  // Write empty progress file
  fs.writeFileSync(progressPath, "", "utf-8");

  // Parse PRD and generate state
  const parsedPrd = parsePrd(opts.prdText);
  const state = initStateFromPrd(parsedPrd, {
    workspace: opts.workspaceName ?? "test-workspace",
    project: opts.projectName ?? "test-project",
    targetDir: workspaceDir,
    branchName: opts.branchName ?? "test-branch",
    sourceFile: prdPath,
    worktreePath: workspaceDir,
    ...opts.stateOverrides,
  });

  fs.writeFileSync(statePath, JSON.stringify(state, null, 2), "utf-8");

  const cleanup = () => {
    fs.rmSync(workspaceDir, { recursive: true, force: true });
  };

  return { workspaceDir, statePath, prdPath, progressPath, cleanup };
}

/** Minimal PRD with a single story for simple tests. */
export const SINGLE_STORY_PRD = `# Test PRD

## Introduction

A test PRD with one story.

## User Stories

### US-001: Implement feature A

**Description:** As a developer, I want feature A so that tests can run.

**Acceptance Criteria:**

- Feature A works correctly
- Tests pass
`;

/** PRD with three stories for sequential execution tests. */
export const THREE_STORY_PRD = `# Test PRD

## Introduction

A test PRD with three stories.

## User Stories

### US-001: Implement feature A

**Description:** As a developer, I want feature A.

**Acceptance Criteria:**

- Feature A works correctly

### US-002: Implement feature B

**Description:** As a developer, I want feature B.

**Acceptance Criteria:**

- Feature B works correctly

### US-003: Implement feature C

**Description:** As a developer, I want feature C.

**Acceptance Criteria:**

- Feature C works correctly
`;
