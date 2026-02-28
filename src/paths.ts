import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Resolves a template file path, checking `__dirname/templates/` first (dist mode),
 * then falling back to `__dirname/../templates/` (dev mode with tsx).
 */
export function resolveTemplatePath(filename: string): string {
  const bundled = path.join(__dirname, "templates", filename);
  if (fs.existsSync(bundled)) return bundled;
  return path.join(__dirname, "..", "templates", filename);
}
