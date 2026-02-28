import * as fs from "fs";
import * as path from "path";

export interface ProjectConfig {
  projectName?: string;
  branchPrefix?: string;
  prdOutput?: string;
  skipDefaults?: boolean;
  setupCommands?: string[];
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
  try {
    return JSON.parse(raw) as ProjectConfig;
  } catch {
    console.error(
      `[william] Warning: invalid JSON in ${configPath}, ignoring config`,
    );
    return null;
  }
}
