import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import type { WorkspaceState } from "./types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WILLIAM_ROOT = path.resolve(__dirname, "..");

/**
 * Migrate existing flat workspaces (workspaces/<name>/) into
 * the project-grouped structure (workspaces/<project>/<name>/).
 *
 * 1. Creates a timestamped backup of the entire workspaces/ directory
 * 2. Reads each workspace's state.json to determine its project name
 * 3. Moves the workspace into workspaces/<project>/<name>/
 * 4. Prints a summary of what was moved
 */
export function migrateWorkspaces(): void {
  const workspacesDir = path.join(WILLIAM_ROOT, "workspaces");

  if (!fs.existsSync(workspacesDir)) {
    console.log("No workspaces/ directory found. Nothing to migrate.");
    return;
  }

  // Identify flat workspaces (directories that contain state.json directly)
  const entries = fs.readdirSync(workspacesDir).filter((entry) => {
    const full = path.join(workspacesDir, entry);
    return (
      fs.statSync(full).isDirectory() &&
      fs.existsSync(path.join(full, "state.json"))
    );
  });

  if (entries.length === 0) {
    console.log("No flat workspaces found to migrate. Already up to date.");
    return;
  }

  // Step 1: Create backup
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupDir = path.join(WILLIAM_ROOT, `workspaces-backup-${timestamp}`);
  console.log(`Backing up workspaces/ → ${path.basename(backupDir)}/`);
  fs.cpSync(workspacesDir, backupDir, { recursive: true });

  // Step 2: Migrate each flat workspace
  const moved: { name: string; project: string }[] = [];
  const errors: { name: string; reason: string }[] = [];

  for (const name of entries) {
    const srcDir = path.join(workspacesDir, name);
    const statePath = path.join(srcDir, "state.json");

    let project: string;
    try {
      const raw = fs.readFileSync(statePath, "utf-8");
      const state = JSON.parse(raw) as Partial<WorkspaceState>;
      project = state.project ?? "unknown";
    } catch {
      project = "unknown";
    }

    const destDir = path.join(workspacesDir, project, name);

    if (fs.existsSync(destDir)) {
      errors.push({
        name,
        reason: `destination already exists: ${project}/${name}`,
      });
      continue;
    }

    // Ensure project directory exists
    fs.mkdirSync(path.join(workspacesDir, project), { recursive: true });
    fs.renameSync(srcDir, destDir);
    moved.push({ name, project });
  }

  // Step 3: Print summary
  console.log(`\nMigration complete.`);
  if (moved.length > 0) {
    console.log(`\nMoved ${moved.length} workspace(s):`);
    for (const { name, project } of moved) {
      console.log(`  ${name} → ${project}/${name}`);
    }
  }
  if (errors.length > 0) {
    console.log(`\nSkipped ${errors.length} workspace(s):`);
    for (const { name, reason } of errors) {
      console.log(`  ${name} — ${reason}`);
    }
  }
  console.log(`\nBackup saved at: ${backupDir}`);
}

// Allow running directly with `tsx src/migrate.ts`
const isDirectRun = process.argv[1]?.endsWith("migrate.ts");
if (isDirectRun) {
  migrateWorkspaces();
}
