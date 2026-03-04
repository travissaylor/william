import * as fs from "fs";
import * as path from "path";
import { loadState, saveState, markStoryInterrupted } from "../prd/tracker.js";

export interface PidEntry {
  pid: number;
  storyId: string;
  startedAt: string;
}

const REGISTRY_FILENAME = "pid-registry.json";

/**
 * Reads the PID registry file from the workspace directory.
 * Returns an empty array if the file doesn't exist or has invalid JSON.
 */
export function readRegistry(workspaceDir: string): PidEntry[] {
  const registryPath = path.join(workspaceDir, REGISTRY_FILENAME);
  if (!fs.existsSync(registryPath)) {
    return [];
  }
  try {
    const raw = fs.readFileSync(registryPath, "utf-8");
    return JSON.parse(raw) as PidEntry[];
  } catch {
    return [];
  }
}

/**
 * Registers a PID for a running story agent.
 * Appends an entry with pid, storyId, and startedAt to the registry file.
 * Uses synchronous fs — one write per spawn, called from parent process only.
 */
export function registerPid(
  workspaceDir: string,
  storyId: string,
  pid: number,
): void {
  const entries = readRegistry(workspaceDir);
  entries.push({ pid, storyId, startedAt: new Date().toISOString() });
  const registryPath = path.join(workspaceDir, REGISTRY_FILENAME);
  fs.writeFileSync(registryPath, JSON.stringify(entries, null, 2), "utf-8");
}

/**
 * Removes an entry from the registry by PID.
 * Deletes the registry file entirely if no entries remain.
 */
export function deregisterPid(workspaceDir: string, pid: number): void {
  const entries = readRegistry(workspaceDir);
  const filtered = entries.filter((e) => e.pid !== pid);
  const registryPath = path.join(workspaceDir, REGISTRY_FILENAME);
  if (filtered.length === 0) {
    if (fs.existsSync(registryPath)) {
      fs.unlinkSync(registryPath);
    }
    return;
  }
  fs.writeFileSync(registryPath, JSON.stringify(filtered, null, 2), "utf-8");
}

/**
 * Checks if a process is alive using signal 0.
 * Returns true if the process exists, false if it does not.
 */
export function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Scans the PID registry for orphaned processes (dead PIDs from a previous crash).
 * For each orphaned PID:
 *   - Marks the associated story as 'interrupted' in state.json
 *   - Removes the PID from the registry
 * Logs a notice if any orphans were cleaned up.
 *
 * Uses saveState (not locked) because cleanup runs at startup before concurrent access.
 */
export function cleanupOrphans(workspaceDir: string, statePath: string): void {
  const entries = readRegistry(workspaceDir);
  if (entries.length === 0) return;

  const orphans = entries.filter((e) => !isProcessAlive(e.pid));
  if (orphans.length === 0) return;

  // Load state and mark orphaned stories as interrupted
  let state = loadState(statePath);
  for (const orphan of orphans) {
    // Only mark story interrupted if it exists in state (guard against stale registry entries)
    const storyExists = Object.prototype.hasOwnProperty.call(
      state.stories,
      orphan.storyId,
    );
    if (storyExists) {
      state = markStoryInterrupted(state, orphan.storyId);
    }
    deregisterPid(workspaceDir, orphan.pid);
  }
  saveState(statePath, state);

  console.log(
    `[william] Cleaned up stale PID registry from previous run (${orphans.length} orphaned PID(s)).`,
  );
}
