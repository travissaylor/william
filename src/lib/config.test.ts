import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { loadProjectConfig, normalizeGitConfig } from "./config.js";

describe("loadProjectConfig", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "william-config-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns null when .william/config.json does not exist", () => {
    expect(loadProjectConfig(tmpDir)).toBeNull();
  });

  it("returns parsed config when file exists with valid JSON", () => {
    const configDir = path.join(tmpDir, ".william");
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(
      path.join(configDir, "config.json"),
      JSON.stringify({
        projectName: "my-app",
        branchPrefix: "feature/",
        prdOutput: "docs/prds",
        skipDefaults: true,
        setupCommands: ["cp .env.example .env", "pnpm db:seed"],
      }),
    );

    // eslint-disable-next-line @typescript-eslint/no-empty-function
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const config = loadProjectConfig(tmpDir);
    expect(config).toEqual({
      projectName: "my-app",
      branchPrefix: "feature/",
      prdOutput: "docs/prds",
      skipDefaults: true,
      setupCommands: ["cp .env.example .env", "pnpm db:seed"],
      git: {
        branchPrefix: "feature/",
        worktreeSetupCommands: ["cp .env.example .env", "pnpm db:seed"],
      },
    });
    warnSpy.mockRestore();
  });

  it("returns null and warns on invalid JSON", () => {
    const configDir = path.join(tmpDir, ".william");
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(path.join(configDir, "config.json"), "not valid json{{{");

    // eslint-disable-next-line @typescript-eslint/no-empty-function
    const stderrSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const config = loadProjectConfig(tmpDir);

    expect(config).toBeNull();
    expect(stderrSpy).toHaveBeenCalledWith(
      expect.stringContaining("invalid JSON"),
    );
    stderrSpy.mockRestore();
  });

  it("silently ignores unknown keys (forward compatibility)", () => {
    const configDir = path.join(tmpDir, ".william");
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(
      path.join(configDir, "config.json"),
      JSON.stringify({
        projectName: "my-app",
        unknownFutureField: true,
        anotherUnknown: [1, 2, 3],
      }),
    );

    const config = loadProjectConfig(tmpDir);
    expect(config).not.toBeNull();
    expect(config?.projectName).toBe("my-app");
  });

  it("returns empty object for empty JSON object", () => {
    const configDir = path.join(tmpDir, ".william");
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(path.join(configDir, "config.json"), "{}");

    const config = loadProjectConfig(tmpDir);
    expect(config).toEqual({});
  });

  it("handles partial config with only some fields", () => {
    const configDir = path.join(tmpDir, ".william");
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(
      path.join(configDir, "config.json"),
      JSON.stringify({ branchPrefix: "fix/" }),
    );

    // eslint-disable-next-line @typescript-eslint/no-empty-function
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const config = loadProjectConfig(tmpDir);
    expect(config).toEqual({
      branchPrefix: "fix/",
      git: { branchPrefix: "fix/" },
    });
    expect(config?.projectName).toBeUndefined();
    expect(config?.skipDefaults).toBeUndefined();
    warnSpy.mockRestore();
  });

  it("reads williamPath from config", () => {
    const configDir = path.join(tmpDir, ".william");
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(
      path.join(configDir, "config.json"),
      JSON.stringify({
        projectName: "my-app",
        williamPath: "/home/user/william",
      }),
    );

    const config = loadProjectConfig(tmpDir);
    expect(config?.williamPath).toBe("/home/user/william");
  });

  it("reads git object directly when present", () => {
    const configDir = path.join(tmpDir, ".william");
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(
      path.join(configDir, "config.json"),
      JSON.stringify({
        projectName: "my-app",
        git: {
          workflow: "branch",
          branchPrefix: "feat/",
          worktreeSetupCommands: ["pnpm install"],
        },
      }),
    );

    const config = loadProjectConfig(tmpDir);
    expect(config?.git?.workflow).toBe("branch");
    expect(config?.git?.branchPrefix).toBe("feat/");
    expect(config?.git?.worktreeSetupCommands).toEqual(["pnpm install"]);
  });

  it("does not override git object values with legacy values", () => {
    const configDir = path.join(tmpDir, ".william");
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(
      path.join(configDir, "config.json"),
      JSON.stringify({
        branchPrefix: "old/",
        setupCommands: ["old-cmd"],
        git: {
          branchPrefix: "new/",
          worktreeSetupCommands: ["new-cmd"],
        },
      }),
    );

    const config = loadProjectConfig(tmpDir);
    expect(config?.git?.branchPrefix).toBe("new/");
    expect(config?.git?.worktreeSetupCommands).toEqual(["new-cmd"]);
  });
});

describe("normalizeGitConfig", () => {
  it("migrates top-level branchPrefix into git object with deprecation warning", () => {
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = normalizeGitConfig({ branchPrefix: "feat/" });

    expect(result.git?.branchPrefix).toBe("feat/");
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("branchPrefix"),
    );
    warnSpy.mockRestore();
  });

  it("migrates top-level setupCommands into git.worktreeSetupCommands with deprecation warning", () => {
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = normalizeGitConfig({
      setupCommands: ["pnpm install"],
    });

    expect(result.git?.worktreeSetupCommands).toEqual(["pnpm install"]);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("setupCommands"),
    );
    warnSpy.mockRestore();
  });

  it("defaults git.workflow to undefined (resolved as worktree by consumers)", () => {
    const result = normalizeGitConfig({ projectName: "test" });
    expect(result.git).toBeUndefined();
  });
});
