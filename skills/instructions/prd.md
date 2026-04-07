# /william prd

Generate a new PRD interactively within the current Claude Code conversation.

## Behavior

1. **Load the PRD template** from `$WILLIAM_ROOT/templates/prd-instructions.md`.

2. **Determine the output directory**:
   - If `.william/config.json` has a `prdOutput` field, use that (resolved relative to cwd)
   - Otherwise default to `.william/prds/`
   - Create the directory if it doesn't exist

3. **Follow the PRD template instructions** to guide the user through PRD creation:
   - Ask clarifying questions about the feature
   - Structure the PRD with goals, requirements, and user stories
   - Include `**Depends on:**` declarations between stories where appropriate

4. **Save the PRD** to the output directory once the user confirms.

5. **Support iterative edits** — if the user wants changes, overwrite the file with the updated version.

6. **Report** the saved file path and suggest next step: `/william new <path>`
