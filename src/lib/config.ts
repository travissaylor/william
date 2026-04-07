import * as fs from "fs";
import * as path from "path";

export interface GitConfig {
  workflow?: "worktree" | "branch";
  branchPrefix?: string;
  worktreeSetupCommands?: string[];
}

export interface ProjectConfig {
  projectName?: string;
  /** @deprecated Use `git.branchPrefix` instead. */
  branchPrefix?: string;
  prdOutput?: string;
  skipDefaults?: boolean;
  /** @deprecated Use `git.worktreeSetupCommands` instead. */
  setupCommands?: string[];
  git?: GitConfig;
}

/**
 * Load project config from `<dir>/.william/config.json`.
 * Returns parsed config or `null` if the file doesn't exist.
 * Invalid JSON logs a warning to stderr and returns `null`.
 */
export function loadProjectConfig(dir: string): ProjectConfig | null {
  const configPath = path.join(dir, ".william", "config.json");
  let raw: string;
  try {
    raw = fs.readFileSync(configPath, "utf-8");
  } catch {
    return null;
  }
  let config: ProjectConfig;
  try {
    config = JSON.parse(raw) as ProjectConfig;
  } catch {
    console.error(
      `[william] Warning: invalid JSON in ${configPath}, ignoring config`,
    );
    return null;
  }

  return normalizeGitConfig(config);
}

/**
 * Migrate top-level `branchPrefix` and `setupCommands` into the `git` object
 * when the `git.*` equivalents are absent. Logs deprecation warnings.
 */
export function normalizeGitConfig(config: ProjectConfig): ProjectConfig {
  const git: GitConfig = { ...config.git };
  let migrated = false;

  /* eslint-disable @typescript-eslint/no-deprecated -- intentional legacy field access */
  if (config.branchPrefix !== undefined && git.branchPrefix === undefined) {
    git.branchPrefix = config.branchPrefix;
    migrated = true;
    console.warn(
      "[william] Deprecation: top-level `branchPrefix` is deprecated — use `git.branchPrefix` instead.",
    );
  }

  if (
    config.setupCommands !== undefined &&
    git.worktreeSetupCommands === undefined
  ) {
    git.worktreeSetupCommands = config.setupCommands;
    migrated = true;
    console.warn(
      "[william] Deprecation: top-level `setupCommands` is deprecated — use `git.worktreeSetupCommands` instead.",
    );
  }
  /* eslint-enable @typescript-eslint/no-deprecated */

  if (migrated || config.git) {
    return { ...config, git };
  }

  return config;
}
