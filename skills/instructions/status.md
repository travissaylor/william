# /william status [workspace]

Display workspace progress including wave information, story breakdown, and current execution state.

## Arguments

- `[workspace]` — Optional workspace name. If omitted, auto-detect from conversation context (set by `/william new`). If no context available, list all workspaces for the current project.

## Steps

### 1. Determine Mode

- If a workspace name was provided as an argument, use **single workspace mode**.
- If no argument but a workspace name is available from conversation context (from `/william new`), use **single workspace mode** with that name.
- If neither is available, use **list mode**.

### 2a. List Mode — Show All Workspaces

Run the list helper, passing the current directory's project name (basename of cwd):

```bash
npx tsx "$WILLIAM_ROOT/src/skill/status.ts" list
```

Parse the JSON output. The `workspaces` array contains entries with: `projectName`, `workspaceName`, `branchName`, `totalStories`, `completedStories`, `allDone`, `startedAt`.

Display a table like:

```
William Workspaces

Project       Workspace         Branch                  Progress     Status
my-project    my-feature        feature/my-feature      8/12         In Progress
my-project    auth-revamp       feature/auth-revamp     5/5          Complete
```

If no workspaces exist, display: `No workspaces found. Create one with: /william new <prd-path>`

### 2b. Single Workspace Mode — Detailed Status

Run the status helper:

```bash
npx tsx "$WILLIAM_ROOT/src/skill/status.ts" status "<workspace>"
```

Parse the JSON output. Key fields:

| Field | Description |
|-------|-------------|
| `workspaceName` | Workspace name |
| `projectName` | Project name |
| `branchName` | Git branch |
| `gitWorkflow` | `"worktree"` or `"branch"` |
| `totalStories` | Total story count |
| `completedStories` | Passed story count |
| `skippedStories` | Skipped story count |
| `failedStories` | Failed story count (attempts > 0, not passed/skipped) |
| `totalWaves` | Number of waves |
| `currentWave` | Current wave number (1-based) |
| `allDone` | Whether all stories are complete |
| `startedAt` | Workspace creation timestamp |
| `waveBreakdown` | Array of wave objects with story details |
| `waveResults` | Array of completed wave results |
| `revisions` | Array of revision entries |

### 3. Format Output

Display the status in this format:

```
Workspace: my-feature
Project:   my-project
Branch:    feature/my-feature
Workflow:  worktree
Progress:  Wave 2/4 — 5/12 stories complete

Wave 1 ✓
  ✓ US-001  Extract shared library          (1 attempt)
  ✓ US-002  Add dependency parsing           (1 attempt)
  ✓ US-003  Build wave planner               (2 attempts)

Wave 2 (current)
  ✓ US-004  Extend state format              (1 attempt)
  → US-005  Create skill entry point         (in progress, 1 attempt)
  · US-006  Implement /william new           (pending)

Wave 3
  · US-007  Implement /william start         (pending)

Wave 4
  · US-008  Implement /william prd           (pending)
```

Status icons:
- `✓` — passed
- `✗` — failed (has attempts but not passed/skipped)
- `⊘` — skipped
- `→` — in-progress
- `·` — pending

### 4. Show Attempt Counts

For stories with more than 1 attempt, or for failed/in-progress stories, always show the attempt count in parentheses.

### 5. Show Revision History

If revisions exist, append:

```
Revisions:
  revision-1  3 items  completed 2024-01-15
  revision-2  2 items  completed 2024-01-16
```

### 6. Suggest Next Action

At the end, suggest the next step:

- If all stories complete: `Next step: /william pr`
- If stories remain pending: `Next step: /william start`
- If failures exist: `Consider: /william start (to retry) or /william revise (to re-plan)`

## Error Handling

- If workspace not found, display the error and suggest: `Create a workspace first with: /william new <prd-path>`
- If `npx tsx` fails, display the error from JSON output and stop.
