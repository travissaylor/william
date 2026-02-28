import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import type { ProjectConfig } from "./config.js";

vi.mock("@inquirer/prompts", () => ({
  input: vi.fn(),
  confirm: vi.fn(),
  editor: vi.fn(),
}));

import { input, confirm, editor } from "@inquirer/prompts";
import { runInit } from "./init.js";

const mockInput = vi.mocked(input);
const mockConfirm = vi.mocked(confirm);
const mockEditor = vi.mocked(editor);

function readConfig(filePath: string): ProjectConfig {
  return JSON.parse(fs.readFileSync(filePath, "utf-8")) as ProjectConfig;
}

describe("runInit", () => {
  let tmpDir: string;
  let originalCwd: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "william-init-test-"));
    originalCwd = process.cwd();
    process.chdir(tmpDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tmpDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it("creates .william/config.json with all fields", async () => {
    mockInput
      .mockResolvedValueOnce("my-project") // projectName
      .mockResolvedValueOnce("feature/") // branchPrefix
      .mockResolvedValueOnce("docs/prds"); // prdOutput
    mockEditor.mockResolvedValueOnce("cp .env.example .env\npnpm db:seed\n");
    mockConfirm.mockResolvedValueOnce(false); // gitignore

    await runInit();

    const configPath = path.join(tmpDir, ".william", "config.json");
    expect(fs.existsSync(configPath)).toBe(true);

    const config = readConfig(configPath);
    expect(config).toEqual({
      projectName: "my-project",
      branchPrefix: "feature/",
      prdOutput: "docs/prds",
      setupCommands: ["cp .env.example .env", "pnpm db:seed"],
    });
  });

  it("omits branchPrefix when empty", async () => {
    mockInput
      .mockResolvedValueOnce("my-project")
      .mockResolvedValueOnce("") // no branch prefix
      .mockResolvedValueOnce(".william/prds"); // default prdOutput
    mockEditor.mockResolvedValueOnce("");
    mockConfirm.mockResolvedValueOnce(false);

    await runInit();

    const config = readConfig(path.join(tmpDir, ".william", "config.json"));
    expect(config.branchPrefix).toBeUndefined();
    expect(config.setupCommands).toBeUndefined();
  });

  it("omits prdOutput when set to the default .william/prds", async () => {
    mockInput
      .mockResolvedValueOnce("my-project")
      .mockResolvedValueOnce("")
      .mockResolvedValueOnce(".william/prds");
    mockEditor.mockResolvedValueOnce("");
    mockConfirm.mockResolvedValueOnce(false);

    await runInit();

    const config = readConfig(path.join(tmpDir, ".william", "config.json"));
    expect(config.prdOutput).toBeUndefined();
  });

  it("appends .william/ to existing .gitignore", async () => {
    fs.writeFileSync(path.join(tmpDir, ".gitignore"), "node_modules/\ndist/\n");

    mockInput
      .mockResolvedValueOnce("my-project")
      .mockResolvedValueOnce("")
      .mockResolvedValueOnce(".william/prds");
    mockEditor.mockResolvedValueOnce("");
    mockConfirm.mockResolvedValueOnce(true); // add to gitignore

    await runInit();

    const gitignore = fs.readFileSync(path.join(tmpDir, ".gitignore"), "utf-8");
    expect(gitignore).toContain(".william/");
    expect(gitignore).toContain("node_modules/");
  });

  it("creates .gitignore if it doesn't exist", async () => {
    mockInput
      .mockResolvedValueOnce("my-project")
      .mockResolvedValueOnce("")
      .mockResolvedValueOnce(".william/prds");
    mockEditor.mockResolvedValueOnce("");
    mockConfirm.mockResolvedValueOnce(true);

    await runInit();

    const gitignorePath = path.join(tmpDir, ".gitignore");
    expect(fs.existsSync(gitignorePath)).toBe(true);
    expect(fs.readFileSync(gitignorePath, "utf-8")).toBe(".william/\n");
  });

  it("does not duplicate .william/ in .gitignore if already present", async () => {
    fs.writeFileSync(
      path.join(tmpDir, ".gitignore"),
      "node_modules/\n.william/\n",
    );

    mockInput
      .mockResolvedValueOnce("my-project")
      .mockResolvedValueOnce("")
      .mockResolvedValueOnce(".william/prds");
    mockEditor.mockResolvedValueOnce("");
    mockConfirm.mockResolvedValueOnce(true);

    await runInit();

    const gitignore = fs.readFileSync(path.join(tmpDir, ".gitignore"), "utf-8");
    const count = (gitignore.match(/\.william\//g) ?? []).length;
    expect(count).toBe(1);
  });

  it("warns and asks to overwrite if config already exists", async () => {
    // Create existing config
    const configDir = path.join(tmpDir, ".william");
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(
      path.join(configDir, "config.json"),
      JSON.stringify({ projectName: "old" }),
    );

    // User declines overwrite
    mockConfirm.mockResolvedValueOnce(false);

    await runInit();

    // Config should be unchanged
    const config = readConfig(path.join(configDir, "config.json"));
    expect(config.projectName).toBe("old");
  });

  it("overwrites config when user confirms", async () => {
    // Create existing config
    const configDir = path.join(tmpDir, ".william");
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(
      path.join(configDir, "config.json"),
      JSON.stringify({ projectName: "old" }),
    );

    // User confirms overwrite, then fills prompts
    mockConfirm
      .mockResolvedValueOnce(true) // overwrite
      .mockResolvedValueOnce(false); // gitignore
    mockInput
      .mockResolvedValueOnce("new-project")
      .mockResolvedValueOnce("")
      .mockResolvedValueOnce(".william/prds");
    mockEditor.mockResolvedValueOnce("");

    await runInit();

    const config = readConfig(path.join(configDir, "config.json"));
    expect(config.projectName).toBe("new-project");
  });

  it("filters empty lines from setup commands", async () => {
    mockInput
      .mockResolvedValueOnce("my-project")
      .mockResolvedValueOnce("")
      .mockResolvedValueOnce(".william/prds");
    mockEditor.mockResolvedValueOnce(
      "\n  cp .env.example .env  \n\n  pnpm db:seed\n\n",
    );
    mockConfirm.mockResolvedValueOnce(false);

    await runInit();

    const config = readConfig(path.join(tmpDir, ".william", "config.json"));
    expect(config.setupCommands).toEqual([
      "cp .env.example .env",
      "pnpm db:seed",
    ]);
  });

  it("appends newline separator to .gitignore without trailing newline", async () => {
    fs.writeFileSync(path.join(tmpDir, ".gitignore"), "node_modules/");

    mockInput
      .mockResolvedValueOnce("my-project")
      .mockResolvedValueOnce("")
      .mockResolvedValueOnce(".william/prds");
    mockEditor.mockResolvedValueOnce("");
    mockConfirm.mockResolvedValueOnce(true);

    await runInit();

    const gitignore = fs.readFileSync(path.join(tmpDir, ".gitignore"), "utf-8");
    expect(gitignore).toBe("node_modules/\n.william/\n");
  });
});
