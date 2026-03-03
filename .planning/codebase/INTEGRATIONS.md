# External Integrations

**Analysis Date:** 2026-03-03

## APIs & External Services

**Claude AI:**
- Claude CLI - Primary AI orchestrator for autonomous task execution
  - Spawning: `src/adapters/claude.ts` defines spawn patterns
  - Interactive mode: `spawnInteractive()` - stdio inherited for user interaction
  - Capture mode: `spawnCapture()` - Captures NDJSON output stream for parsing
  - Flags: `--output-format stream-json`, `--verbose`, `--dangerously-skip-permissions`, `--resume` for session continuity
  - Stream parsing: `src/stream/ndjson-parser.ts` parses message stream
  - Session tracking: Extracts sessionId from stream for multi-turn conversations

**GitHub CLI (gh):**
- PR operations in `src/pr.ts`:
  - Check existing PRs: `gh pr list --head <branch> --base main --json number,url`
  - Create PR: `gh pr create --base main --title <title> --body <body>`
  - Edit PR: `gh pr edit <number> --title <title> --body <body>`
  - Mark ready: `gh pr ready <number> --undo` (draft→ready)
  - Git operations: `git push -u origin <branch>`, `git push`, `git diff`, `git log`

## Data Storage

**Databases:**
- None - Workspaces stored as directory structures in local filesystem
- State tracking: JSON files (`state.json`) per workspace at `<workspace-dir>/state.json`
  - Structure: `WorkspaceState` type in `src/types.ts`
  - Loaded/saved via `src/prd/tracker.ts` functions
  - Contains: PRD metadata, story status, execution state

**File Storage:**
- Local filesystem only
- Workspace hierarchy: `.william/workspaces/<project>/<workspace>/`
- PRD files: `.william/prds/` (configurable via project config)
- State files: workspace-level `state.json`
- Output files: Generated within workspace directories

**Caching:**
- None - No external caching service used

## Authentication & Identity

**Auth Provider:**
- None required - Local CLI tool
- GitHub CLI (`gh`) handles GitHub authentication via OS keychain/credential store
- Claude CLI handles Claude authentication via `.claude` configuration

**Implementation:**
- GitHub: Uses `gh` CLI (assumes `gh` is authenticated)
- Claude: Uses `claude` CLI (assumes `claude` is configured)
- No OAuth or token management in william codebase

## Monitoring & Observability

**Error Tracking:**
- None - Errors logged to stderr and console

**Logs:**
- Console output via process.stdout/process.stderr
- Notifier: macOS desktop notifications via osascript (see `src/notifier.ts`)
- Project-level logging: No structured logging framework

**Debugging:**
- Verbose output from Claude via `--verbose` flag
- User-facing progress via Ink terminal UI (React components)

## CI/CD & Deployment

**Hosting:**
- GitHub Actions - CI only (no deployment pipeline)

**CI Pipeline:**
- GitHub Actions (`.github/workflows/ci.yml`)
- Trigger: PRs targeting `main` branch
- Jobs:
  - `pnpm install --frozen-lockfile` (pnpm cache: Node 22)
  - `pnpm typecheck` - TypeScript type checking
  - `pnpm lint` - ESLint code quality
  - `pnpm test` - Vitest unit tests

## Environment Configuration

**Required env vars:**
- None mandatory - All config via `.william/config.json`

**Optional env vars:**
- `SHELL` - Detected for shell completion script generation in `src/completions.ts`
- `HUSKY` - Set to "0" in CI (disables git hooks during GitHub Actions)

**Secrets location:**
- No secrets managed by william
- External service auth delegated to: `.claude` (Claude CLI config), GitHub credential store

## Webhooks & Callbacks

**Incoming:**
- None

**Outgoing:**
- Git push events (implicit via `git push` to origin)
- GitHub PR creation/updates (via `gh pr` commands)
- Workspace state persistence (JSON writes to local filesystem)

## Stream Processing

**NDJSON Stream Parsing:**
- Claude's `--output-format stream-json` produces newline-delimited JSON
- Parser: `src/stream/ndjson-parser.ts` (NdjsonParser class)
- Message types: "assistant", "user", "error", etc.
- Session tracking: Extracts `sessionId` for `--resume` continuity
- Text extraction: Walks message.content blocks for text type
- Output consumption: `src/stream/consume.ts` for streaming output handling

## Git Integration

**Operations:**
- Workspace creation uses git worktrees
- Branch management: creates, switches, pushes branches
- Diff generation: `git diff main...<branch>` for PR descriptions
- Log generation: `git log main...<branch> --oneline` for commit history
- Push: `git push -u origin <branch>` (first push), `git push` (subsequent)

## Process Execution

**Child Process Control:**
- execa 9 - For spawning subprocesses (setup commands, git, gh, claude)
- spawnSync - For synchronous operations (notifications via osascript)
- stdio modes: "pipe" for capture, "inherit" for interactive passthrough

---

*Integration audit: 2026-03-03*
