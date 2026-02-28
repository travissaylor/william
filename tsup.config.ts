import { readFileSync, writeFileSync } from "fs";
import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/cli.ts"],
  format: "esm",
  target: "node22",
  outDir: "dist",
  platform: "node",
  splitting: false,
  bundle: true,
  // Bundle all runtime dependencies so node_modules is not needed.
  // Listed explicitly so Node.js builtins remain properly external.
  noExternal: [
    "@inquirer/prompts",
    "chokidar",
    "commander",
    "execa",
    "ink",
    "ink-spinner",
    "marked",
    "marked-terminal",
    "react",
  ],
  banner: {
    // Provide require() for CJS dependencies bundled into ESM
    js: `import { createRequire as __createRequire } from "module"; const require = __createRequire(import.meta.url);`,
  },
  // Handle JSX for ink/React components
  esbuildOptions(options) {
    options.jsx = "automatic";
    // Stub out react-devtools-core (optional ink dep, not installed)
    options.alias = {
      "react-devtools-core": "./src/stubs/react-devtools-core.ts",
    };
  },
  // Ensure the output has the correct Node shebang (replacing the tsx one from source)
  async onSuccess() {
    const file = "dist/cli.js";
    const content = readFileSync(file, "utf8");
    writeFileSync(file, content.replace(/^#!.*\n/, "#!/usr/bin/env node\n"));
  },
});
