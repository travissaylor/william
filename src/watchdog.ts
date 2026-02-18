import type { WorkspaceState } from './types.js';

export interface WatchdogResult {
  action: 'continue' | 'hint' | 'notify' | 'skip' | 'pause';
}

/**
 * Stub implementation — US-008 will replace this with full stuck-detection logic.
 */
export function runWatchdog(
  _state: WorkspaceState,
  _workspaceDir: string,
  _lastOutput: string,
): WatchdogResult {
  return { action: 'continue' };
}
