import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { loadProjectConfig } from "./config.js";

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

    const config = loadProjectConfig(tmpDir);
    expect(config).toEqual({
      projectName: "my-app",
      branchPrefix: "feature/",
      prdOutput: "docs/prds",
      skipDefaults: true,
      setupCommands: ["cp .env.example .env", "pnpm db:seed"],
    });
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

    const config = loadProjectConfig(tmpDir);
    expect(config).toEqual({ branchPrefix: "fix/" });
    expect(config?.projectName).toBeUndefined();
    expect(config?.skipDefaults).toBeUndefined();
  });
});
