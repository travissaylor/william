#!/usr/bin/env tsx
/**
 * Skill helper for `/william prd`.
 * Subcommands:
 *   context                – load PRD template and project config for the skill
 */
import * as path from "path";
import * as fs from "fs";
import { loadProjectConfig } from "../lib/config.js";
import { resolveTemplatePath } from "../lib/paths.js";

function cmdContext(): void {
  const cwd = process.cwd();
  const config = loadProjectConfig(cwd);

  let defaultOutputDir: string;
  if (config) {
    defaultOutputDir = config.prdOutput
      ? path.resolve(cwd, config.prdOutput)
      : path.resolve(cwd, ".william", "prds");
  } else {
    defaultOutputDir = path.resolve(cwd, ".william", "prds");
  }

  const relativeOutputDir = path.relative(cwd, defaultOutputDir) || ".";

  // Ensure output dir exists
  fs.mkdirSync(defaultOutputDir, { recursive: true });

  // Load the PRD template
  const templatePath = resolveTemplatePath("prd-instructions.md");
  const template = fs.readFileSync(templatePath, "utf-8");

  console.log(
    JSON.stringify({
      template,
      defaultOutputDir: relativeOutputDir,
      prdOutputConfigured: !!config?.prdOutput,
      projectName: config?.projectName ?? path.basename(cwd),
    }),
  );
}

// --- main ---

const [subcommand] = process.argv.slice(2);

try {
  switch (subcommand) {
    case "context":
      cmdContext();
      break;
    default:
      console.error(
        JSON.stringify({
          error: `Unknown subcommand: ${subcommand}. Valid: context`,
        }),
      );
      process.exit(1);
  }
} catch (err) {
  console.error(
    JSON.stringify({
      error: err instanceof Error ? err.message : String(err),
    }),
  );
  process.exit(1);
}
