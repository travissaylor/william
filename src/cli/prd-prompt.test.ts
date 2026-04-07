import { describe, it, expect } from "vitest";
import { buildPrdPrompt } from "./prd-prompt.js";

describe("buildPrdPrompt", () => {
  // Extract just the Agent Instructions section to avoid matching template boilerplate
  function getAgentInstructions(prompt: string): string {
    const idx = prompt.indexOf("## Agent Instructions");
    return idx >= 0 ? prompt.slice(idx) : prompt;
  }

  it("uses prds/ as default output dir when no config or output specified", () => {
    const prompt = buildPrdPrompt({ description: "A feature" });
    const instructions = getAgentInstructions(prompt);
    expect(instructions).toContain(
      "The default save location is `prds/<feature-name>.md`",
    );
  });

  it("uses explicit output path when -o flag is provided", () => {
    const prompt = buildPrdPrompt({
      description: "A feature",
      output: "docs/my-prd.md",
    });
    const instructions = getAgentInstructions(prompt);
    expect(instructions).toContain("`docs/my-prd.md`");
    expect(instructions).not.toContain("default save location");
  });

  it("uses config-derived defaultOutputDir when provided", () => {
    const prompt = buildPrdPrompt({
      description: "A feature",
      defaultOutputDir: ".william/prds",
    });
    const instructions = getAgentInstructions(prompt);
    expect(instructions).toContain(
      "The default save location is `.william/prds/<feature-name>.md`",
    );
  });

  it("uses custom prdOutput dir from config", () => {
    const prompt = buildPrdPrompt({
      description: "A feature",
      defaultOutputDir: "docs/prds",
    });
    const instructions = getAgentInstructions(prompt);
    expect(instructions).toContain(
      "The default save location is `docs/prds/<feature-name>.md`",
    );
  });

  it("-o flag overrides defaultOutputDir", () => {
    const prompt = buildPrdPrompt({
      description: "A feature",
      output: "custom/output.md",
      defaultOutputDir: ".william/prds",
    });
    const instructions = getAgentInstructions(prompt);
    expect(instructions).toContain("`custom/output.md`");
    expect(instructions).not.toContain(".william/prds");
  });

  it("includes feature description when provided", () => {
    const prompt = buildPrdPrompt({ description: "Build a login page" });
    expect(prompt).toContain("Build a login page");
  });

  it("asks user for description when none provided", () => {
    const prompt = buildPrdPrompt({});
    expect(prompt).toContain("No feature description was provided");
  });
});
