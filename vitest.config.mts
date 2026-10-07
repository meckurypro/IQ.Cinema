import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // React 17+ automatic JSX runtime (no `import React` needed in components).
  oxc: { jsx: { runtime: "automatic" } },
  resolve: { alias: { "@": path.resolve(import.meta.dirname) } },
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/**/*.test.{ts,tsx}"],
    testTimeout: 20_000,
  },
} as any);
