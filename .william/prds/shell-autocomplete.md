# PRD: Shell Autocomplete for William CLI

## Introduction

Add tab-completion support for the `william` CLI across Bash, Zsh, and Fish shells. Users will get completions for command names, options/flags, and workspace names. Workspace name completions are context-aware — for example, `william start` only suggests non-running workspaces, while `william stop` only suggests running ones. Users can install completions via a `william completions` command or be prompted during `william init`.

## Goals

- Provide tab-completion for all william commands, their flags, and workspace names
- Support Bash, Zsh, and Fish shells
- Make workspace completions context-aware based on which command is being used
- Offer both manual and automatic installation of completion scripts
- Prompt users to install completions during `william init`

## User Stories

### US-001: Add `completions` command that outputs shell scripts

**Description:** As a user, I want to run `william completions` to get a shell completion script so that I can source it in my shell profile.

**Acceptance Criteria:**

- [ ] `william completions` outputs a completion script for the user's current shell (auto-detected via `$SHELL` or `$0`)
- [ ] `william completions --shell bash` outputs the Bash completion script
- [ ] `william completions --shell zsh` outputs the Zsh completion script
- [ ] `william completions --shell fish` outputs the Fish completion script
- [ ] Script is printed to stdout so users can pipe or redirect it (e.g. `william completions > ~/.william-completions.zsh`)
- [ ] If the shell cannot be detected and `--shell` is not provided, print an error with usage instructions
- [ ] Typecheck and lint pass

### US-002: Add `--install` flag for automatic completion installation

**Description:** As a user, I want to run `william completions --install` to automatically set up completions so that I don't have to manually edit my shell profile.

**Acceptance Criteria:**

- [ ] `william completions --install` detects the current shell and installs the appropriate completion script
- [ ] For Bash: appends a `source` line to `~/.bashrc` (or `~/.bash_profile` on macOS) pointing to a generated completion file
- [ ] For Zsh: writes the completion script to a file and appends a `source` line to `~/.zshrc`
- [ ] For Fish: writes the completion script to `~/.config/fish/completions/william.fish`
- [ ] The completion script file is written to `~/.william/completions/william.<shell-ext>` (e.g. `william.zsh`, `william.bash`, `william.fish`)
- [ ] If completions are already installed (source line already present), print a message and skip — do not duplicate
- [ ] `--shell` flag works with `--install` to override auto-detection
- [ ] Prints confirmation message with the path of the installed script and which profile was updated
- [ ] Typecheck and lint pass

### US-003: Complete command names

**Description:** As a user, I want tab-completion for william command names so I can type faster and discover available commands.

**Acceptance Criteria:**

- [ ] Typing `william <TAB>` suggests all top-level commands: `new`, `init`, `start`, `stop`, `status`, `archive`, `list`, `migrate`, `prd`, `problem`, `revise`, `pr`, `completions`
- [ ] Partial matches work: `william st<TAB>` suggests `start`, `stop`, `status`
- [ ] Works in Bash, Zsh, and Fish
- [ ] Typecheck and lint pass

### US-004: Complete options and flags per command

**Description:** As a user, I want tab-completion for command-specific flags so I don't have to remember them.

**Acceptance Criteria:**

- [ ] `william start --<TAB>` suggests `--max-iterations` and `--tool`
- [ ] `william new --<TAB>` suggests `--prd`
- [ ] `william prd --<TAB>` suggests `--output`
- [ ] `william pr --<TAB>` suggests `--draft` and `--dry-run`
- [ ] `william completions --<TAB>` suggests `--shell` and `--install`
- [ ] Global flags (e.g. `--help`, `--version`) are suggested where appropriate
- [ ] Works in Bash, Zsh, and Fish
- [ ] Typecheck and lint pass

### US-005: Context-aware workspace name completions

**Description:** As a user, I want workspace name suggestions to be relevant to the command I'm typing, so I don't see workspaces I can't act on.

**Acceptance Criteria:**

- [ ] `william start <TAB>` suggests only workspaces that are **not** currently running (stopped, paused, or new/pending)
- [ ] `william stop <TAB>` suggests only workspaces that are currently **running**
- [ ] `william archive <TAB>` suggests only workspaces that are **stopped or completed**
- [ ] `william status <TAB>` suggests **all** workspaces
- [ ] `william revise <TAB>` suggests only workspaces where **all stories are completed**
- [ ] `william pr <TAB>` suggests **all** workspaces
- [ ] Workspace names are suggested in `project/workspace` format (e.g. `william/add-completions`)
- [ ] Works in Bash, Zsh, and Fish
- [ ] Typecheck and lint pass

### US-006: Add completion script helper subcommand for dynamic completions

**Description:** As a developer, I need a hidden subcommand that the completion scripts can call at runtime to get context-aware suggestions, so that workspace lists and statuses are always current.

**Acceptance Criteria:**

- [ ] `william _completions --command <cmd> --position <arg-position>` returns a newline-separated list of valid completions for the given command and argument position
- [ ] The subcommand is hidden (not shown in `--help` or command completion lists)
- [ ] Returns workspace names filtered by command context (per US-005 rules)
- [ ] Returns flag names when `--position` indicates a flag context
- [ ] Exits with code 0 and outputs nothing when no completions are available
- [ ] Fast execution — avoids heavy imports or initialization; only reads workspace state files
- [ ] Typecheck and lint pass

### US-007: Prompt to install completions during `william init`

**Description:** As a new user running `william init`, I want to be asked if I'd like to install shell completions, so I get a smooth setup experience.

**Acceptance Criteria:**

- [ ] After the existing `william init` prompts, a new prompt asks: "Install shell completions? (auto-detected: zsh)" (or whichever shell is detected)
- [ ] If the user says yes, run the same install logic as `william completions --install`
- [ ] If the user says no, skip and continue with the normal init output
- [ ] If completions are already installed, skip the prompt entirely
- [ ] Typecheck and lint pass

## Functional Requirements

- FR-1: Register a `completions` command in `src/cli.ts` with `--shell <bash|zsh|fish>` and `--install` options
- FR-2: Register a hidden `_completions` command in `src/cli.ts` for dynamic runtime completion lookups
- FR-3: Generate Bash completion scripts that use `complete -F` with a function that calls `william _completions`
- FR-4: Generate Zsh completion scripts that use `compdef` with a function that calls `william _completions`
- FR-5: Generate Fish completion scripts that use `complete -c william` with subcommands that call `william _completions`
- FR-6: The `_completions` subcommand must read workspace `state.json` files and `.stopped`/`.paused` signal files to determine workspace status
- FR-7: The `_completions` subcommand must filter workspace suggestions based on the command context (start → non-running, stop → running, archive → stopped/completed, revise → all-stories-completed)
- FR-8: The `--install` flag must write the completion script to `~/.william/completions/` and append a source line to the appropriate shell profile file
- FR-9: The `--install` flag must be idempotent — running it twice does not duplicate the source line
- FR-10: Add a completion installation prompt to `runInit()` in `src/init.ts`, after the existing prompts
- FR-11: Auto-detect the user's shell from `$SHELL` environment variable; fall back to requiring `--shell`

## Non-Goals

- No support for PowerShell or Windows CMD
- No completions for workspace content (story names, PRD paths within workspaces)
- No real-time completion of PRD file paths for `william new --prd <path>` (standard shell file completion handles this)
- No completion for `william prd` description arguments (free text)
- No automatic updating of completion scripts when new commands are added — users re-run `william completions --install`

## Technical Considerations

- The `_completions` hidden subcommand must be fast. It runs on every `<TAB>` press. Avoid importing heavy dependencies (ink, react, @inquirer/prompts). Consider making it a lightweight code path that only reads the filesystem.
- Workspace state is determined by reading `~/.william/workspaces/{project}/{workspace}/state.json` and checking for `.stopped`/`.paused` sentinel files, consistent with `getWorkspaceStatus()` in `src/workspace.ts`.
- Commander.js v12 does not have built-in completion support — the completion scripts and `_completions` subcommand must be implemented manually.
- Shell profile detection on macOS: prefer `~/.zshrc` for Zsh (default shell), `~/.bash_profile` for Bash.
- The completion script files at `~/.william/completions/` should be regenerable — if the user updates william, they can re-run `william completions --install` to get updated completions.

## Success Metrics

- Tab-completing `william <TAB>` shows all commands in under 200ms
- Tab-completing `william start <TAB>` shows only startable workspaces
- `william completions --install` works on a fresh machine with no manual shell configuration
- Zero additional latency for users who don't use completions (completion logic is isolated)

## Open Questions

- Should `william completions --uninstall` be supported to cleanly remove the source line and completion files?
- Should revision workspaces (e.g. `project/workspace/revision-1`) appear in completions, or only top-level workspaces?
