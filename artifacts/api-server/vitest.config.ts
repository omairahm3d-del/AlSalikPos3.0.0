import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: false,
    include: ["src/**/*.test.ts"],
    setupFiles: ["./src/__tests__/setup.ts"],
    pool: "forks",
    poolOptions: {
      forks: { singleFork: true },
    },
    testTimeout: 20_000,
    hookTimeout: 20_000,
  },
});
