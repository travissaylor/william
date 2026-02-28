import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

vi.mock("@inquirer/prompts", () => ({
  input: vi.fn(),
}));

vi.mock("./config.js", () => ({
  loadProjectConfig: vi.fn(),
}));

import { input } from "@inquirer/prompts";
import { loadProjectConfig } from "./config.js";
import { runNewWizard, buildPrdWizardResult } from "./wizard.js";

const mockInput = vi.mocked(input);
const mockLoadConfig = vi.mocked(loadProjectConfig);

describe("runNewWizard", () => {
  let tmpDir: string;
  let originalCwd: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "william-wizard-test-"));
    // Create a .git dir so target dir validation passes
    fs.mkdirSync(path.join(tmpDir, ".git"));
    // Create a dummy PRD file
    fs.writeFileSync(path.join(tmpDir, "feature.md"), "# PRD");
    originalCwd = process.cwd();
    process.chdir(tmpDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tmpDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it("works without project config (identical to today)", async () => {
    mockLoadConfig.mockReturnValue(null);
    const prdPath = path.join(tmpDir, "feature.md");

    mockInput
      .mockResolvedValueOnce(prdPath) // prdFile
      .mockResolvedValueOnce("feature") // workspaceName
      .mockResolvedValueOnce(tmpDir) // targetDir
      .mockResolvedValueOnce("my-project") // projectName
      .mockResolvedValueOnce("feature"); // branchName

    const result = await runNewWizard();

    expect(result.projectName).toBe("my-project");
    expect(result.branchName).toBe("feature");
    expect(mockInput).toHaveBeenCalledTimes(5);
  });

  it("uses config.projectName as project name prompt default", async () => {
    mockLoadConfig.mockReturnValue({ projectName: "configured-app" });
    const prdPath = path.join(tmpDir, "feature.md");

    mockInput
      .mockResolvedValueOnce(prdPath)
      .mockResolvedValueOnce("feature")
      .mockResolvedValueOnce(tmpDir)
      .mockResolvedValueOnce("configured-app") // user accepts default
      .mockResolvedValueOnce("feature");

    await runNewWizard();

    // The 4th call (projectName) should have config value as default
    const projectNameCall = mockInput.mock.calls[3][0];
    expect(projectNameCall.default).toBe("configured-app");
  });

  it("uses branchPrefix + workspaceName as branch name prompt default", async () => {
    mockLoadConfig.mockReturnValue({ branchPrefix: "feature/" });
    const prdPath = path.join(tmpDir, "feature.md");

    mockInput
      .mockResolvedValueOnce(prdPath)
      .mockResolvedValueOnce("my-workspace")
      .mockResolvedValueOnce(tmpDir)
      .mockResolvedValueOnce("my-project")
      .mockResolvedValueOnce("feature/my-workspace");

    await runNewWizard();

    // The 5th call (branchName) should have prefix + workspace as default
    const branchCall = mockInput.mock.calls[4][0];
    expect(branchCall.default).toBe("feature/my-workspace");
  });

  it("skips projectName prompt when skipDefaults is true and projectName is set", async () => {
    mockLoadConfig.mockReturnValue({
      projectName: "auto-project",
      skipDefaults: true,
    });
    const prdPath = path.join(tmpDir, "feature.md");

    mockInput
      .mockResolvedValueOnce(prdPath) // prdFile
      .mockResolvedValueOnce("feature") // workspaceName
      .mockResolvedValueOnce(tmpDir) // targetDir
      .mockResolvedValueOnce("feature"); // branchName (still prompted, no branchPrefix)

    const result = await runNewWizard();

    expect(result.projectName).toBe("auto-project");
    // Only 4 prompts: prd, workspace, targetDir, branch (projectName skipped)
    expect(mockInput).toHaveBeenCalledTimes(4);
  });

  it("skips branchName prompt when skipDefaults is true and branchPrefix is set", async () => {
    mockLoadConfig.mockReturnValue({
      branchPrefix: "feat/",
      skipDefaults: true,
    });
    const prdPath = path.join(tmpDir, "feature.md");

    mockInput
      .mockResolvedValueOnce(prdPath) // prdFile
      .mockResolvedValueOnce("my-ws") // workspaceName
      .mockResolvedValueOnce(tmpDir) // targetDir
      .mockResolvedValueOnce("my-project"); // projectName (still prompted, no projectName in config)

    const result = await runNewWizard();

    expect(result.branchName).toBe("feat/my-ws");
    // Only 4 prompts: prd, workspace, targetDir, projectName (branchName skipped)
    expect(mockInput).toHaveBeenCalledTimes(4);
  });

  it("skips both projectName and branchName when skipDefaults is true and both are configured", async () => {
    mockLoadConfig.mockReturnValue({
      projectName: "auto-project",
      branchPrefix: "feat/",
      skipDefaults: true,
    });
    const prdPath = path.join(tmpDir, "feature.md");

    mockInput
      .mockResolvedValueOnce(prdPath) // prdFile
      .mockResolvedValueOnce("my-ws") // workspaceName
      .mockResolvedValueOnce(tmpDir); // targetDir

    const result = await runNewWizard();

    expect(result.projectName).toBe("auto-project");
    expect(result.branchName).toBe("feat/my-ws");
    // Only 3 prompts: prd, workspace, targetDir
    expect(mockInput).toHaveBeenCalledTimes(3);
  });

  it("still prompts when skipDefaults is true but config value is not set", async () => {
    mockLoadConfig.mockReturnValue({ skipDefaults: true });
    const prdPath = path.join(tmpDir, "feature.md");

    mockInput
      .mockResolvedValueOnce(prdPath)
      .mockResolvedValueOnce("feature")
      .mockResolvedValueOnce(tmpDir)
      .mockResolvedValueOnce("my-project") // projectName prompted (not in config)
      .mockResolvedValueOnce("feature"); // branchName prompted (no branchPrefix)

    const result = await runNewWizard();

    expect(result.projectName).toBe("my-project");
    expect(result.branchName).toBe("feature");
    expect(mockInput).toHaveBeenCalledTimes(5);
  });

  it("does not skip prompts when skipDefaults is false even with config values", async () => {
    mockLoadConfig.mockReturnValue({
      projectName: "configured-app",
      branchPrefix: "fix/",
      skipDefaults: false,
    });
    const prdPath = path.join(tmpDir, "feature.md");

    mockInput
      .mockResolvedValueOnce(prdPath)
      .mockResolvedValueOnce("bugfix")
      .mockResolvedValueOnce(tmpDir)
      .mockResolvedValueOnce("configured-app") // pre-filled but still prompted
      .mockResolvedValueOnce("fix/bugfix"); // pre-filled but still prompted

    const result = await runNewWizard();

    expect(result.projectName).toBe("configured-app");
    expect(result.branchName).toBe("fix/bugfix");
    // All 5 prompts shown
    expect(mockInput).toHaveBeenCalledTimes(5);

    // Verify defaults were pre-filled
    const projectNameCall = mockInput.mock.calls[3][0];
    expect(projectNameCall.default).toBe("configured-app");
    const branchCall = mockInput.mock.calls[4][0];
    expect(branchCall.default).toBe("fix/bugfix");
  });

  it("falls back to directory basename when config exists but projectName is not set", async () => {
    mockLoadConfig.mockReturnValue({ branchPrefix: "feature/" });
    const prdPath = path.join(tmpDir, "feature.md");
    const dirBasename = path.basename(tmpDir);

    mockInput
      .mockResolvedValueOnce(prdPath)
      .mockResolvedValueOnce("ws")
      .mockResolvedValueOnce(tmpDir)
      .mockResolvedValueOnce(dirBasename) // falls back to dir basename
      .mockResolvedValueOnce("feature/ws");

    await runNewWizard();

    const projectNameCall = mockInput.mock.calls[3][0];
    expect(projectNameCall.default).toBe(dirBasename);
  });

  it("uses bare workspaceName as branch default when branchPrefix is not set", async () => {
    mockLoadConfig.mockReturnValue({ projectName: "my-app" });
    const prdPath = path.join(tmpDir, "feature.md");

    mockInput
      .mockResolvedValueOnce(prdPath)
      .mockResolvedValueOnce("my-workspace")
      .mockResolvedValueOnce(tmpDir)
      .mockResolvedValueOnce("my-app")
      .mockResolvedValueOnce("my-workspace");

    await runNewWizard();

    const branchCall = mockInput.mock.calls[4][0];
    expect(branchCall.default).toBe("my-workspace");
  });
});

describe("buildPrdWizardResult", () => {
  let tmpDir: string;
  let originalCwd: string;

  beforeEach(() => {
    tmpDir = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), "william-prd-flag-test-")),
    );
    fs.mkdirSync(path.join(tmpDir, ".git"));
    fs.writeFileSync(path.join(tmpDir, "my-feature.md"), "# PRD");
    originalCwd = process.cwd();
    process.chdir(tmpDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tmpDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it("derives workspace name from PRD filename without .md", () => {
    mockLoadConfig.mockReturnValue(null);
    const result = buildPrdWizardResult("my-feature.md");

    expect(result.workspaceName).toBe("my-feature");
    expect(result.prdFile).toBe(path.resolve("my-feature.md"));
    expect(result.targetDir).toBe(tmpDir);
  });

  it("uses cwd basename as project name when no config", () => {
    mockLoadConfig.mockReturnValue(null);
    const result = buildPrdWizardResult("my-feature.md");

    expect(result.projectName).toBe(path.basename(tmpDir));
  });

  it("uses config.projectName when available", () => {
    mockLoadConfig.mockReturnValue({ projectName: "configured-app" });
    const result = buildPrdWizardResult("my-feature.md");

    expect(result.projectName).toBe("configured-app");
  });

  it("uses workspace name as branch when no branchPrefix", () => {
    mockLoadConfig.mockReturnValue(null);
    const result = buildPrdWizardResult("my-feature.md");

    expect(result.branchName).toBe("my-feature");
  });

  it("uses branchPrefix + workspace name as branch when config has branchPrefix", () => {
    mockLoadConfig.mockReturnValue({ branchPrefix: "feature/" });
    const result = buildPrdWizardResult("my-feature.md");

    expect(result.branchName).toBe("feature/my-feature");
  });

  it("resolves relative PRD path to absolute", () => {
    mockLoadConfig.mockReturnValue(null);
    const result = buildPrdWizardResult("my-feature.md");

    expect(path.isAbsolute(result.prdFile)).toBe(true);
    expect(result.prdFile).toBe(path.join(tmpDir, "my-feature.md"));
  });

  it("throws if PRD file does not exist", () => {
    mockLoadConfig.mockReturnValue(null);

    expect(() => buildPrdWizardResult("nonexistent.md")).toThrow(
      "PRD file not found",
    );
  });

  it("throws if PRD file does not end with .md", () => {
    fs.writeFileSync(path.join(tmpDir, "feature.txt"), "# PRD");
    mockLoadConfig.mockReturnValue(null);

    expect(() => buildPrdWizardResult("feature.txt")).toThrow(
      "PRD file must be a .md file",
    );
  });

  it("throws if cwd is not a git repository", () => {
    fs.rmSync(path.join(tmpDir, ".git"), { recursive: true });
    mockLoadConfig.mockReturnValue(null);

    expect(() => buildPrdWizardResult("my-feature.md")).toThrow(
      "Not a git repository",
    );
  });

  it("does not call any interactive prompts", () => {
    mockLoadConfig.mockReturnValue(null);
    buildPrdWizardResult("my-feature.md");

    expect(mockInput).not.toHaveBeenCalled();
  });

  it("works with both projectName and branchPrefix from config", () => {
    mockLoadConfig.mockReturnValue({
      projectName: "my-app",
      branchPrefix: "feat/",
    });
    const result = buildPrdWizardResult("my-feature.md");

    expect(result.projectName).toBe("my-app");
    expect(result.branchName).toBe("feat/my-feature");
    expect(result.workspaceName).toBe("my-feature");
    expect(result.targetDir).toBe(tmpDir);
  });
});
