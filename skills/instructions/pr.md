# /william pr

Push the workspace branch and create (or update) a GitHub PR.

## Behavior

1. **Identify the current workspace** from the working directory context and state.

2. **Load workspace state** to get the branch name, PRD context, and story outcomes.

3. **Build PR description** using the PR template from `$WILLIAM_ROOT/templates/pr-description-instructions.md`.

4. **Push the branch** to the remote repository.

5. **Create or update the PR** using `gh pr create` or `gh pr edit`:
   - Title derived from the workspace/PRD name
   - Body includes the generated description with story completion summary
   - Link to the PRD if available

6. **Report** the PR URL to the user.
