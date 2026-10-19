import path from "node:path";
import { defineConfig } from "vitest/config";

/**
 * Tests run against a real SQLite database (prisma/test.db), created from the
 * same schema the app uses, so the queries, constraints and transactions under
 * test are the real ones rather than mocks.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      // `server-only` is a build-time guard for React Server Components and
      // throws when imported in plain Node. The services under test are
      // server code by definition, so it is stubbed out here.
      "server-only": path.resolve(__dirname, "tests/stubs/server-only.ts"),
    },
  },
  test: {
    globals: true,
    environment: "node",
    include: ["tests/**/*.test.ts"],
    globalSetup: ["./tests/global-setup.ts"],
    setupFiles: ["./tests/setup.ts"],
    // One SQLite file, so test files must not write to it concurrently.
    fileParallelism: false,
    sequence: { concurrent: false },
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
