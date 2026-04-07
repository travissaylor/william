# /william start [workspace]

Execute stories using wave-based parallel subagents with progress reporting and state checkpointing.

## Arguments

- `[workspace]` — Optional workspace name. If omitted, auto-detect from conversation context (set by `/william new`).

## Steps

### 1. Resolve Workspace

If a workspace name was provided as an argument, use it. Otherwise, look for a workspace name established earlier in this conversation (from `/william new`). If neither is available, display: `No workspace specified. Usage: /william start [workspace]`

### 2. Get Workspace Info

Run the info helper:

```bash
npx tsx "$WILLIAM_ROOT/src/skill/start.ts" info "<workspace>"
```

Parse the JSON output. Key fields:

| Field | Description |
|-------|-------------|
| `gitWorkflow` | `"worktree"` or `"branch"` |
| `hasWaves` | Whether dependency waves exist |
| `totalWaves` | Number of waves |
| `currentWave` | Wave index to start from (0-based) |
| `waveStories` | Story IDs to execute in current wave |
| `isResume` | Whether previous waves have completed |
| `allDone` | Whether all stories are complete |
| `branchName` | Workspace branch name |
| `worktreePath` | Path to workspace worktree (worktree mode) |
| `targetDir` | Path to the target project |
| `worktreeSetupCommands` | Commands to run in new worktrees |
| `storyDetails` | Map of story ID to `{ title, description }` |
| `waves` | Ordered array of story ID arrays |
| `stories` | Map of story ID to `{ passes, attempts }` |

### 3. Handle Edge Cases

- If `allDone` is true: Report "All stories already complete for workspace '<workspace>'. Run `/william pr` to create a pull request." and stop.
- If `isResume`: Report "Resuming workspace '<workspace>' from wave `<currentWave + 1>` of `<totalWaves>`"
- If `waveStories` is empty but `allDone` is false: checkpoint the current wave (empty outcomes) and re-run info to advance to the next wave.

### 4. Execute Stories

Follow the appropriate mode based on `gitWorkflow`:

---

#### Worktree Mode (`gitWorkflow === "worktree"`)

Loop through waves starting from `currentWave`:

##### a. Create per-story worktrees

For each story ID in `waveStories`, create a temporary worktree branching from the workspace worktree:

```bash
cd "<worktreePath>"
git worktree add "/tmp/william-wt-<workspace>-<storyId>" -b "<branchName>/<storyId>"
```

If `worktreeSetupCommands` is non-empty, run each command in the new worktree:

```bash
cd "/tmp/william-wt-<workspace>-<storyId>"
<command>
```

##### b. Generate prompts

For each story, generate the subagent prompt:

```bash
npx tsx "$WILLIAM_ROOT/src/skill/start.ts" prompt "<workspace>" "<storyId>" "<branchName>/<storyId>" "/tmp/william-wt-<workspace>-<storyId>"
```

This returns JSON with `promptFile` — the path to the generated prompt file. Read the file to get the full prompt.

##### c. Spawn parallel subagents

Use the **Agent tool** to spawn one subagent per story in the wave. For parallel execution, make **all Agent calls in a single message** with `run_in_background: true`.

For each story:

```
Agent tool:
  description: "Execute <storyId>"
  prompt: <contents of promptFile>
  run_in_background: true
```

##### d. Track results

As each background agent completes, check its result text for `<promise>STORY_COMPLETE</promise>` or `<promise>ALL_COMPLETE</promise>`.

- **If successful** (promise tag found):
  ```bash
  npx tsx "$WILLIAM_ROOT/src/skill/start.ts" mark-complete "<workspace>" "<storyId>"
  ```
  Report: `"<storyId> (<storyTitle>) completed successfully."`

- **If failed** (no promise tag, or error):
  ```bash
  npx tsx "$WILLIAM_ROOT/src/skill/start.ts" mark-failed "<workspace>" "<storyId>"
  ```
  Report: `"<storyId> (<storyTitle>) failed."`

After each completion, if others remain: `"Waiting on <remaining story IDs>..."`

##### e. Merge completed stories

After **all** stories in the wave finish, merge each **successful** story's branch into the workspace branch **sequentially**:

```bash
cd "<worktreePath>"
git merge "<branchName>/<storyId>" --no-edit
```

If a merge conflict occurs:
- If the conflict is straightforward (different sections of the same file), spawn a subagent to resolve it:
  ```
  Agent tool:
    description: "Resolve merge conflict for <storyId>"
    prompt: "You are in <worktreePath>. There is a merge conflict after merging <branchName>/<storyId>. Run `cd <worktreePath>` then `git diff` to see the conflicts. Resolve all conflict markers, stage the resolved files with `git add`, and complete the merge with `git commit --no-edit`. Only resolve conflicts — do not make any other changes."
  ```
- If ambiguous (complex structural changes): display the conflict diff to the user and ask for guidance.

##### f. Clean up worktrees

For each story in the wave:

```bash
git worktree remove "/tmp/william-wt-<workspace>-<storyId>" --force 2>/dev/null
git branch -d "<branchName>/<storyId>" 2>/dev/null
```

##### g. Checkpoint wave

Build an outcomes JSON mapping each story ID to `"pass"`, `"fail"`, or `"skip"`.

Summarize what completed stories did (based on their agent output) as chain context for the next wave.

```bash
npx tsx "$WILLIAM_ROOT/src/skill/start.ts" checkpoint-wave "<workspace>" "<waveNumber>" '{"US-001":"pass","US-002":"pass"}' 'Chain context summary here'
```

##### h. Handle failures

If any story failed in this wave:

1. Report which stories failed with error details
2. List downstream stories that are blocked (all stories in subsequent waves that depend on failed stories)
3. Ask the user: **"How would you like to proceed? (1) Retry failed stories, (2) Skip them and continue, (3) Stop and re-plan"**
   - **Retry**: Re-execute steps a–g for just the failed stories
   - **Skip**: Run `mark-complete` for failed stories (they'll show as `"skipped"` in state) and continue to next wave
   - **Stop**: Halt execution — state is already checkpointed for later resume

##### i. Next wave

After checkpointing, re-run `info` to get the next wave's stories. If `allDone` is true, go to step 5. Otherwise repeat from step (a) with the new `waveStories`.

---

#### Branch Mode (`gitWorkflow === "branch"`)

Execute stories **one at a time** (no parallelism due to lack of worktree isolation).

For each wave (starting from `currentWave`), and for each story in `waveStories`:

##### a. Generate prompt

```bash
npx tsx "$WILLIAM_ROOT/src/skill/start.ts" prompt "<workspace>" "<storyId>"
```

Read the prompt file from the JSON output.

##### b. Spawn subagent (foreground)

Use the **Agent tool** with the prompt. Do NOT use `run_in_background` — wait for each story to finish before starting the next.

```
Agent tool:
  description: "Execute <storyId>"
  prompt: <contents of promptFile>
```

##### c. Track result

Check for `<promise>STORY_COMPLETE</promise>` or `<promise>ALL_COMPLETE</promise>`.

If successful: run `mark-complete`. If failed: run `mark-failed`.

Report progress after each story.

##### d. Handle failure

Same as worktree mode step (h).

##### e. After all stories in the wave

Checkpoint the wave and continue to the next wave (re-run `info`).

---

### 5. Report Completion

When all waves are done, display a summary:

```
All stories complete for workspace "<workspace>".

Wave summary:
  Wave 1: US-001 pass, US-002 pass
  Wave 2: US-003 pass
  ...

Branch: <branchName>
Next step: /william pr
```

## Error Handling

- If `npx tsx` commands fail, display the error from the JSON output and stop.
- If workspace not found, suggest: `Workspace not found. Create one first with: /william new <prd-path>`
- If the workspace worktree directory doesn't exist, report the error and suggest re-creating the workspace.
