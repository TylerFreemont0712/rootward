import { defineConfig } from "vitest/config";

// LEARN: one root config runs every workspace package as its own Vitest "project", so `pnpm test` covers the whole
// monorepo while `pnpm --filter <package> test` still works from inside a single package.
export default defineConfig({
  test: {
    projects: ["packages/*", "apps/*"],
  },
});
