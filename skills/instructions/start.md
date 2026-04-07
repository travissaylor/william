# /william start

Execute stories in the current workspace using wave-based parallel subagents.

## Behavior

### Worktree Mode
- For each wave, create a temporary worktree per story with branch naming `{workspace-branch}/{story-id}`
- Spawn parallel subagents (one per story in the wave) using the Agent tool with `run_in_background: true`
- Wait for all agents in the wave to complete
- Merge each story worktree back into the workspace branch
- Checkpoint state to `state.json` after each wave completes
- Proceed to the next wave

### Branch Mode
- Execute stories sequentially (one at a time) due to lack of worktree isolation
- Checkpoint state after each story completes

### Resume
- If `state.json` has a `currentWave` > 0, resume from the last incomplete wave
- Skip stories already marked as passed

### Failure Handling
- If a story fails in a wave, pause execution
- Report which stories failed and which downstream stories are blocked
- Ask the user whether to: retry, skip, or re-plan

### Subagent Prompts
- Build prompts from `$WILLIAM_ROOT/templates/agent-instructions.md`
- Use `replacePlaceholders()` from the shared lib for template interpolation
- Include chain context from all previously completed stories

### Progress Reporting
- Report wave-level progress as each story completes
- Show per-story status (pass/fail/in-progress)
