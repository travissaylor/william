import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    exclude: ["workspaces/**", "archive/**", "dist/**", "node_modules/**"],
  },
});
