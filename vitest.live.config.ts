import { defineConfig } from "vitest/config";
import { config as loadEnv } from "dotenv";

// Live tests make real network calls, so they read the real keys from .env.
loadEnv({ path: ".env", quiet: true });

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    environment: "node",
    include: ["tests/live/**/*.live.test.ts"],
    testTimeout: 120_000,
    hookTimeout: 120_000,
    // Real API calls — keep concurrency low so rate limits aren't the thing
    // under test.
    fileParallelism: false,
    maxConcurrency: 2,
  },
});
