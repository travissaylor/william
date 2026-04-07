# /william revise

Create and execute a revision workspace for the current workspace.

## Behavior

1. **Identify the current workspace** from the working directory context.

2. **Collect revision problems** — ask the user what needs to be fixed or changed.

3. **Generate a revision plan** based on the problems and the current workspace state.

4. **Create a nested revision workspace** under the parent workspace directory.

5. **Execute the revision** through the same wave-based machinery as `/william start`.

6. **Merge results** back into the parent workspace on completion.

7. **Update parent state** to reflect the revision outcomes.
