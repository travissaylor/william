import { readRegistry, isProcessAlive } from "./pid-registry.js";

export interface ShutdownOptions {
  workspaceDir: string;
  /** Defaults to process.exit; injectable for testing */
  onExit?: (code: number) => void;
}

// Module-level state — prevents duplicate shutdown on double Ctrl+C
let shuttingDown = false;

/**
 * Registers SIGINT, SIGTERM, and SIGHUP handlers that trigger graceful shutdown.
 * Must be called before starting workspace to ensure handlers fire even if
 * startWorkspace throws during setup.
 */
export function registerShutdownHandlers(options: ShutdownOptions): void {
  const handler = (signal: string) => {
    void gracefulShutdown(signal, options);
  };

  process.on("SIGINT", () => {
    handler("SIGINT");
  });
  process.on("SIGTERM", () => {
    handler("SIGTERM");
  });
  process.on("SIGHUP", () => {
    handler("SIGHUP");
  });
}

/**
 * Performs graceful shutdown:
 * 1. If already shutting down (double Ctrl+C): SIGKILL all agents immediately.
 * 2. Otherwise: send SIGTERM, wait 5s, then SIGKILL survivors.
 * 3. Log summary and call onExit with appropriate exit code.
 */
export async function gracefulShutdown(
  signal: string,
  options: ShutdownOptions,
): Promise<void> {
  const onExit = options.onExit ?? ((code: number) => process.exit(code));

  // Double Ctrl+C: force-kill immediately
  if (shuttingDown) {
    console.log(
      "[william] Force shutdown requested. Killing all agents immediately...",
    );
    const entries = readRegistry(options.workspaceDir);
    for (const entry of entries) {
      if (isProcessAlive(entry.pid)) {
        try {
          process.kill(entry.pid, "SIGKILL");
        } catch {
          // Process already dead — ignore
        }
      }
    }
    onExit(1);
    return;
  }

  shuttingDown = true;

  const entries = readRegistry(options.workspaceDir);
  const aliveEntries = entries.filter((e) => isProcessAlive(e.pid));

  // Send SIGTERM to all alive processes
  for (const entry of aliveEntries) {
    try {
      process.kill(entry.pid, "SIGTERM");
    } catch {
      // Process already dead — ignore
    }
  }

  // Wait 5 seconds for graceful exit
  await new Promise<void>((resolve) => setTimeout(resolve, 5000));

  // Check for survivors and SIGKILL them
  let killedCount = aliveEntries.length;
  for (const entry of aliveEntries) {
    if (isProcessAlive(entry.pid)) {
      console.log(
        `[william] Agent [${entry.storyId}] did not respond to graceful shutdown, force-killed.`,
      );
      try {
        process.kill(entry.pid, "SIGKILL");
      } catch {
        // Process already dead — ignore
        killedCount--;
      }
    }
  }

  // Log summary
  console.log(
    `[william] Shutting down... killed ${killedCount} agent(s), state saved.`,
  );

  // Exit with appropriate signal code
  const exitCode = signal === "SIGINT" ? 130 : 143;
  onExit(exitCode);
}

/**
 * Kills all registered agents immediately via SIGTERM.
 * Used by `william stop` to actively kill agents rather than just writing a marker.
 */
export function killAllAgents(workspaceDir: string): void {
  const entries = readRegistry(workspaceDir);
  const aliveEntries = entries.filter((e) => isProcessAlive(e.pid));

  for (const entry of aliveEntries) {
    try {
      process.kill(entry.pid, "SIGTERM");
    } catch {
      // Process already dead — ignore
    }
  }

  console.log(`[william] Sent SIGTERM to ${aliveEntries.length} agent(s).`);
}

/**
 * Resets module-level shutdown state.
 * Exported for testing only — do not call in production code.
 */
export function resetShutdownState(): void {
  shuttingDown = false;
}
