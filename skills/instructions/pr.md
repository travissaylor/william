# /william pr [workspace]

Push the workspace branch and create (or update) a GitHub PR.

## Arguments

- `[workspace]` — Optional workspace name. If omitted, auto-detect from conversation context (set by `/william new` or `/william start`).

## Steps

### 1. Resolve Workspace

If a workspace name was provided as an argument, use it. Otherwise, look for a workspace name established earlier in this conversation (from `/william new`). If neither is available, display: `No workspace specified. Usage: /william pr [workspace]`

### 2. Get PR Context

Run the context helper:

```bash
npx tsx "$WILLIAM_ROOT/src/skill/pr.ts" context "<workspace>"
```

Parse the JSON output. Key fields:

| Field | Description |
|-------|-------------|
| `workspaceName` | Workspace name |
| `projectName` | Project name |
| `workspaceDir` | Path to workspace directory |
| `branchName` | Git branch name |
| `targetDir` | Target project directory |
| `worktreePath` | Worktree path (null in branch mode) |
| `workingDir` | Effective working directory for git operations |
| `hasUpstream` | Whether the branch already has a remote tracking branch |
| `incompleteStories` | Array of story IDs that are not yet complete |
| `template` | PR description template content |
| `prdContent` | Original PRD content |
| `gitDiff` | Diff from main to workspace branch |
| `gitLog` | Commit log from main to workspace branch |
| `storyStatus` | Formatted story status list |

### 3. Warn About Incomplete Stories

If `incompleteStories` is non-empty, warn the user:

```
Warning: N incomplete story/stories: US-001, US-002, ...
```

Ask the user if they want to proceed anyway. If they decline, stop.

### 4. Generate PR Description

Using the `template` field from the context, replace the placeholders:

- `{{prd}}` → `prdContent`
- `{{git_diff}}` → `gitDiff`
- `{{git_log}}` → `gitLog`
- `{{story_status}}` → `storyStatus`

Then follow the filled-in template instructions to generate a JSON object with `title` and `body` fields. The template asks you to write a PR title and description as a senior engineer would.

### 5. Push the Branch

Push the workspace branch to the remote. Use the `workingDir` from context:

- If `hasUpstream` is `true`: run `git push` in the working directory
- If `hasUpstream` is `false`: run `git push -u origin <branchName>` in the working directory

### 6. Check for Existing PR

Check if a PR already exists for this branch:

```bash
gh pr list --head <branchName> --base main --json number,url --limit 1
```

Run this in the `workingDir`.

### 7. Create or Update the PR

**If an existing PR was found:** Update it:

```bash
gh pr edit <number> --title '<title>' --body '<body>'
```

Report: `Pull request #N updated: <url>`

**If no existing PR:** Create one:

```bash
gh pr create --base main --title '<title>' --body '<body>'
```

The command outputs the PR URL. Report: `Pull request created: <url>`

**Important:** When passing title and body to `gh`, use a heredoc or file-based approach to avoid shell escaping issues with special characters in the PR body.

### 8. Report Result

Display the PR URL prominently so the user can access it.

## Error Handling

- If the context helper fails, display the error and stop
- If `git push` fails, display the error (common cause: no remote configured, auth issues)
- If `gh` commands fail, display the error (common cause: `gh` not installed, not authenticated)
- If the working directory doesn't exist, display the error from the context helper
