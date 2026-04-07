# /william new <prd-path>

Create a new workspace from a PRD file with zero interactive prompts, using defaults from `.william/config.json`.

## Arguments

- `<prd-path>` — Path to the PRD markdown file (required)

## Steps

1. **Validate the PRD file exists** at the given path. If not, report an error and stop.

2. **Run the workspace creator** using the helper script. Execute:

   ```bash
   npx tsx "$WILLIAM_ROOT/src/skill/new.ts" "<prd-path>"
   ```

   This script:
   - Loads project config from `.william/config.json` in the current working directory
   - Parses the PRD to extract title, stories, and dependencies
   - Derives the workspace name from the PRD title (kebab-cased)
   - Derives the branch name using the configured prefix
   - Creates the git worktree or branch per config
   - Initializes `state.json` with wave plan (if dependencies exist)
   - Copies the PRD into the workspace directory
   - Outputs JSON on success with workspace details

3. **Parse the JSON output** and report the results to the user:
   - Workspace name
   - Project name
   - Branch name
   - Git workflow mode
   - Number of stories
   - Number of waves (if dependencies present)

4. **Store the workspace name** in conversation context by noting it clearly, so that subsequent `/william start` can auto-detect which workspace to use.

## Error Handling

- If `<prd-path>` is missing, display: `Missing required argument. Usage: /william new <prd-path>`
- If the PRD file doesn't exist, display the error from the script
- If workspace creation fails (e.g., already exists, not a git repo), display the error from the script

## Output Format

On success, display something like:

```
Workspace created:
  Name:      my-feature
  Project:   my-project
  Branch:    feature/my-feature
  Workflow:  worktree
  Stories:   12
  Waves:     4

Next step: /william start
```
