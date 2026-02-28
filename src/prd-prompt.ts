import * as fs from "fs";
import { resolveTemplatePath } from "./paths.js";

export function buildPrdPrompt(options: {
  description?: string;
  output?: string;
  defaultOutputDir?: string;
}): string {
  const templatePath = resolveTemplatePath("prd-instructions.md");
  const template = fs.readFileSync(templatePath, "utf-8");

  let prompt = template;

  prompt += "\n\n## Agent Instructions\n\n";
  prompt +=
    "Wrap the final PRD in `<prd>...</prd>` XML tags so it can be extracted programmatically.\n";
  prompt +=
    "\nAfter generating the PRD, you MUST write it to disk using your file-writing tools (Write tool). Create any parent directories if needed.\n";

  if (options.output) {
    prompt += `\nThe user specified an output path: \`${options.output}\`. Save the PRD to that exact path.\n`;
  } else {
    const outputDir = options.defaultOutputDir ?? "prds";
    prompt += `\nNo output path was specified. The default save location is \`${outputDir}/<feature-name>.md\` (where feature-name is kebab-case derived from the PRD title). Ask the user where to save if they haven't specified, mentioning the default \`${outputDir}/<feature-name>.md\`.\n`;
  }

  if (options.description) {
    prompt += `\n\n## Feature Description\n\n${options.description}`;
  } else {
    prompt +=
      "\n\nNo feature description was provided. Start by asking the user to describe the feature they want to build.";
  }

  return prompt;
}
