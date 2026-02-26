# Branch Protection Rules for `main`

These instructions configure GitHub branch protection so that pull requests cannot be merged until CI passes.

## Prerequisites

- You must have **Admin** access to the repository on GitHub.
- The CI workflow (`.github/workflows/ci.yml`) must have run at least once on a pull request so GitHub can recognize the status check name.

## Steps

1. **Open repository settings**
   Go to your repository on GitHub and click the **Settings** tab in the top navigation bar.

2. **Navigate to branch rules**
   In the left sidebar, click **Branches** (under the "Code and automation" section).

3. **Add a branch protection rule**
   Click **Add branch ruleset** (or **Add rule** under "Branch protection rules" if your repository uses the classic UI).

   ### Classic branch protection (most common)

   If you see "Branch protection rules":

   a. Click **Add rule**.

   b. In **Branch name pattern**, enter: `main`

   c. Check **Require a pull request before merging**.

   d. Check **Require status checks to pass before merging**.

   e. Check **Require branches to be up to date before merging** (nested under status checks).

   f. In the status check search box, search for `ci` and select the **ci** job (this matches the job name in `.github/workflows/ci.yml`).

   g. Click **Create** (or **Save changes**).

   ### Rulesets (newer repositories)

   If you see "Rulesets" instead:

   a. Click **New ruleset** > **New branch ruleset**.

   b. Give the ruleset a name (e.g., `Protect main`).

   c. Set **Enforcement status** to **Active**.

   d. Under **Target branches**, click **Add target** > **Include by pattern** and enter `main`.

   e. Under **Rules**, enable **Require status checks to pass**.

   f. Click **Add checks**, search for `ci`, and select it.

   g. Check **Require branches to be up to date before merging**.

   h. Optionally enable **Require a pull request before merging**.

   i. Click **Create**.

## Verifying the Configuration

1. Create a test branch and open a pull request targeting `main`.
2. Confirm that the CI workflow runs automatically.
3. Before CI completes (or if it fails), the **Merge** button should be disabled with a message indicating required checks have not passed.
4. Once CI passes and the branch is up to date with `main`, the **Merge** button should become enabled.

## Required Status Check Reference

| Check name | Source workflow | Job name |
|------------|---------------|----------|
| `ci`       | `.github/workflows/ci.yml` | `ci` |

The check name that GitHub uses corresponds to the **job name** in the workflow file (`jobs.ci`).
