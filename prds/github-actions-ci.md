# PRD: GitHub Actions CI Pipeline

## Introduction

Set up a GitHub Actions CI workflow that runs typecheck, lint, and test suite on every pull request targeting `main`. Configure GitHub branch protection rules to prevent merging until all checks pass. This ensures code quality stays consistent and regressions are caught before they reach the main branch.

## Goals

- Automatically run `pnpm typecheck`, `pnpm lint`, and `pnpm test` on every pull request
- Block PR merges until all three checks pass
- Provide clear, fast feedback to contributors on check failures
- Require no manual intervention once configured

## User Stories

### US-001: Create CI workflow file

**Description:** As a developer, I want a GitHub Actions workflow that runs on pull requests so that code quality checks happen automatically.

**Acceptance Criteria:**

- [ ] Create `.github/workflows/ci.yml`
- [ ] Workflow triggers on `pull_request` events targeting the `main` branch
- [ ] Workflow uses Node.js 22
- [ ] Workflow uses `pnpm` for dependency installation (with caching)
- [ ] Workflow runs three steps in order: `pnpm typecheck`, `pnpm lint`, `pnpm test`
- [ ] All three commands use the existing package.json scripts
- [ ] Workflow passes when run against the current `main` branch

### US-002: Configure GitHub branch protection rules

**Description:** As a repository maintainer, I want branch protection rules on `main` so that PRs cannot be merged until CI passes.

**Acceptance Criteria:**

- [ ] Document steps to enable branch protection on `main` via GitHub Settings
- [ ] "Require status checks to pass before merging" is enabled
- [ ] The CI workflow job is added as a required status check
- [ ] "Require branches to be up to date before merging" is enabled
- [ ] Instructions are clear enough for someone unfamiliar with GitHub settings to follow

### US-003: Update CLAUDE.md with CI information

**Description:** As a developer, I want project docs to mention CI so that contributors know checks run automatically.

**Acceptance Criteria:**

- [ ] Add a brief CI section to `CLAUDE.md` noting that PRs run typecheck, lint, and tests via GitHub Actions
- [ ] Mention that all checks must pass before merging

## Functional Requirements

- FR-1: The workflow file must live at `.github/workflows/ci.yml`
- FR-2: The workflow must trigger on `pull_request` events targeting the `main` branch
- FR-3: The workflow must use `pnpm` (not npm or yarn) with dependency caching via `pnpm/action-setup`
- FR-4: The workflow must run on `ubuntu-latest`
- FR-5: The workflow must use Node.js version 22 via `actions/setup-node`
- FR-6: The workflow must execute `pnpm typecheck`, `pnpm lint`, and `pnpm test` (in that order)
- FR-7: If any of the three commands exits non-zero, the workflow must fail
- FR-8: Branch protection on `main` must require the CI job to pass before merging
- FR-9: Branch protection must require the PR branch to be up to date with `main`

## Non-Goals

- No code coverage thresholds or reporting
- No build/bundle step in CI
- No deployment or release automation
- No matrix strategy for multiple Node versions
- No caching of test results or build artifacts
- No Slack/email notifications on failure

## Technical Considerations

- The project uses `pnpm` as its package manager — the workflow needs `pnpm/action-setup` to install it
- Check `packageManager` field or lockfile to determine the correct pnpm version for the action
- Existing scripts: `pnpm typecheck` (tsc --noEmit), `pnpm lint` (eslint src/), `pnpm test` (vitest run)
- Husky git hooks are installed via `prepare` script — CI should skip hook installation (set `HUSKY=0` env var)

## Success Metrics

- CI runs on every new PR and every push to an open PR
- PRs cannot be merged with failing checks
- CI completes in under 3 minutes for the current codebase

## Open Questions

- Should the workflow also trigger on pushes to `main` (in addition to PRs)?
- Is there a specific pnpm version to pin in the workflow, or should it read from `packageManager` in `package.json`?
