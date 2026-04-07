# /william status

Display workspace and wave-level progress information.

## Behavior

1. **Identify the current workspace** from the working directory context.

2. **Load workspace state** from `state.json`.

3. **Display overview**:
   - Workspace name
   - Branch name
   - Git workflow mode
   - Overall progress (completed/total stories)

4. **Display wave progress** (if waves are present):
   - Current wave number
   - Per-wave breakdown showing which stories are in each wave
   - Per-story status within each wave: passed (check mark), failed (x), skipped, or pending

5. **Display story details**:
   - Story ID and title
   - Status (passed/failed/pending/skipped)
   - Number of attempts
   - Which wave the story belongs to

6. **Show next action suggestion**:
   - If stories remain: suggest `/william start`
   - If all complete: suggest `/william pr`
   - If failures exist: suggest retry or `/william revise`
