# /william new <prd-path>

Create a new workspace from a PRD file with zero interactive prompts, using defaults from `.william/config.json`.

## Arguments

- `<prd-path>` — Path to the PRD markdown file (required)

## Steps

1. **Validate the PRD file exists** at the given path. If not, report an error.

2. **Load project config** from `.william/config.json` in the current working directory. If no config exists, use defaults:
   - `git.workflow`: `"worktree"`
   - `git.branchPrefix`: `""`
   - `git.worktreeSetupCommands`: `[]`

3. **Parse the PRD** to extract the workspace name, stories, and dependencies.

4. **Create the workspace** using the shared library functions:
   - Derive the workspace name from the PRD filename (without extension)
   - Derive the branch name using the configured prefix
   - Set the target directory to the current working directory
   - Use the git workflow from config

5. **Initialize state** from the parsed PRD, including wave computation if dependencies exist.

6. **Report** the created workspace details:
   - Workspace name
   - Branch name
   - Number of stories
   - Number of waves (if dependencies present)
   - Next step: `/william start`
