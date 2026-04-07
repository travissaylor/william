import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Resolves a template file path, checking `__dirname/templates/` first (dist mode),
 * then falling back to the repo root `templates/` directory (dev mode with tsx).
 */
export function resolveTemplatePath(filename: string): string {
  const bundled = path.join(__dirname, "templates", filename);
  if (fs.existsSync(bundled)) return bundled;
  // In dev mode __dirname is src/lib/, so go up two levels to reach the repo root
  return path.join(__dirname, "..", "..", "templates", filename);
}
