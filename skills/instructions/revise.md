# /william revise [workspace]

Collect problems conversationally, generate a revision plan, create a nested revision workspace, and execute it through the same wave-based machinery as `/william start`.

## Arguments

- `[workspace]` — Optional workspace name. If omitted, auto-detect from conversation context (set by `/william new` or `/william start`).

## Steps

### 1. Resolve Workspace

If a workspace name was provided as an argument, use it. Otherwise, look for a workspace name established earlier in this conversation. If neither is available, display: `No workspace specified. Usage: /william revise [workspace]`

### 2. Get Workspace Context

Run the context helper to gather revision context:

```bash
npx tsx "$WILLIAM_ROOT/src/skill/revise.ts" context "<workspace>"
```

Parse the JSON output. Key fields:

| Field | Description |
|-------|-------------|
| `workspaceName` | Workspace name |
| `projectName` | Project name |
| `workspaceDir` | Path to workspace directory |
| `branchName` | Workspace branch name |
| `targetDir` | Path to the target project |
| `worktreePath` | Path to workspace worktree (worktree mode) |
| `gitWorkflow` | `"worktree"` or `"branch"` |
| `storySummary` | Human-readable story completion summary |
| `template` | The revision plan template content |
| `originalPrd` | The workspace's original PRD |
| `progress` | The workspace's progress.txt content |
| `gitDiff` | Git diff of workspace changes vs main |
| `stuckHints` | Any stuck hints from the workspace |

### 3. Collect Problems

Ask the user to describe what's wrong. This should be **conversational**, not structured prompts:

```
What problems do you see with the current implementation? Describe each issue — I'll collect them all before generating a revision plan.

Workspace: <projectName>/<workspaceName>
Status: <storySummary>
```

Keep collecting problems until the user indicates they're done (e.g., "that's it", "done", "no more", or an empty response after at least one problem).

Summarize the collected problems back to the user for confirmation:

```
Collected problems:
1. <problem 1>
2. <problem 2>
...

Shall I generate a revision plan based on these?
```

### 4. Generate Revision Plan

Using the `template` from the context response, build the revision plan prompt by replacing placeholders with the collected context:

- `{{problems}}` — The numbered list of collected problems
- `{{progress}}` — The `progress` field from context
- `{{git_diff}}` — The `gitDiff` field from context
- `{{original_prd}}` — The `originalPrd` field from context
- `{{stuck_hints}}` — The `stuckHints` field from context

Present the filled template as context, then generate the revision plan yourself. The plan must:

1. Analyze each problem against the workspace's changes and PRD
2. Decompose problems into discrete revision items using `RI-XXX` format
3. Each item has a title, description, and acceptance criteria with checkboxes
4. Items should be small and independently committable
5. The plan must be wrapped in `<revision-plan>...</revision-plan>` XML tags

### 5. Present Plan for Approval

Display the generated plan to the user:

```
--- Revision Plan ---

<plan content>

--- End of Plan ---

Approve this plan? (yes / or provide feedback for changes)
```

- If the user approves: proceed to step 6
- If the user provides feedback: regenerate the plan incorporating the feedback and present again

### 6. Create Revision Workspace

Extract the plan content from between the `<revision-plan>` tags. Pass it to the create helper:

```bash
npx tsx "$WILLIAM_ROOT/src/skill/revise.ts" create "<workspace>" '<plan-content>'
```

**Important:** The plan content may be large. If it exceeds shell argument limits, write it to a temp file first and read it in the command, or use a heredoc.

Parse the JSON output:

| Field | Description |
|-------|-------------|
| `revisionDir` | Path to the created revision workspace |
| `revisionNumber` | The revision number (1, 2, ...) |
| `revisionWorkspaceName` | Name for use with start.ts (e.g., `workspace/revision-1`) |
| `fullPath` | Full path including project (e.g., `project/workspace/revision-1`) |
| `itemCount` | Number of revision items in the plan |

Report to the user:

```
Revision workspace created: <fullPath>
  Items: <itemCount>
  Path: <revisionDir>

Starting revision execution...
```

### 7. Execute Revision via `/william start`

The revision workspace is a standard workspace with its own state.json and PRD. Execute it using the same `/william start` machinery:

1. Read the start instructions from `$WILLIAM_ROOT/skills/instructions/start.md`
2. Follow those instructions using `<revisionWorkspaceName>` as the workspace name

The revision workspace inherits the parent's:
- `targetDir` — same project directory
- `branchName` — same branch (changes go to the same branch)
- `worktreePath` — same worktree path (worktree mode) or no worktree (branch mode)
- `gitWorkflow` — same mode

### 8. Update Parent State

After all revision items complete successfully, update the parent workspace:

```bash
npx tsx "$WILLIAM_ROOT/src/skill/revise.ts" update-parent "<workspace>" "<revisionNumber>" "<itemCount>"
```

Report completion:

```
Revision <revisionNumber> completed. Parent workspace "<projectName>/<workspaceName>" updated.

Revision summary:
  Items: <itemCount>
  All items passed.

Next steps:
  - /william revise — to start another revision
  - /william pr — to create a pull request
  - /william status — to view workspace status
```

## Error Handling

- If `npx tsx` commands fail, display the error from the JSON output and stop.
- If workspace not found, suggest: `Workspace not found. Create one first with: /william new <prd-path>`
- If the revision workspace creation fails, display the error and stop.
- If revision execution has failures, they are handled by the `/william start` flow (retry, skip, or stop).
