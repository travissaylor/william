# /william prd

Generate a new PRD interactively within the current Claude Code conversation.

## Steps

1. **Load project context** by running the helper script:

   ```bash
   npx tsx "$WILLIAM_ROOT/src/skill/prd.ts" context
   ```

   This returns JSON with:
   - `template` — the full PRD instructions template
   - `defaultOutputDir` — resolved output directory (relative path)
   - `prdOutputConfigured` — whether `prdOutput` was set in config
   - `projectName` — the project name from config

2. **Parse the JSON output** and extract the `template` field. This template contains the full PRD generation instructions including the structure, examples, and clarifying question flow.

3. **Follow the template instructions exactly** to guide the user through PRD creation:
   - If the user provided a description after `/william prd`, use it as the initial feature description
   - Otherwise, ask the user to describe the feature they want to build
   - Ask clarifying questions using the `AskUserQuestion` tool (2-4 rounds of 3-5 questions)
   - Structure the PRD with all required sections (Introduction, Goals, User Stories, Functional Requirements, Non-Goals, etc.)
   - Include `**Depends on:**` declarations between stories where appropriate

4. **Determine the save path**:
   - If `prdOutputConfigured` is `true`, use the `defaultOutputDir` directly
   - If `prdOutputConfigured` is `false`, ask the user where to save and suggest the default: `{defaultOutputDir}/<feature-name>.md`
   - The filename should be the PRD title in kebab-case with `.md` extension

5. **Save the PRD** using the Write tool to `{outputDir}/{feature-name}.md`. Create parent directories if needed.

6. **Support iterative edits** — if the user requests changes after saving, update the PRD and overwrite the file. Each edit replaces the file entirely.

7. **Report** the saved file path and suggest the next step:

   ```
   PRD saved to {path}

   Next step: /william new {path}
   ```

## Important Notes

- Do NOT implement any code. Your only job is to produce and save a PRD.
- Wrap the final PRD content in `<prd>...</prd>` XML tags in your response so it can be extracted programmatically, but save only the inner content (without the XML tags) to the file.
- The PRD template already contains the full structure and example — follow it closely.
- Every user story should end with an acceptance criterion: "Typecheck and lint pass".
