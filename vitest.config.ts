import { defineConfig } from "vitest/config";

export default defineConfig({
  // Resolves the `@/*` paths from tsconfig.json natively — no plugin needed.
  resolve: { tsconfigPaths: true },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // Live tests need real keys and network; run them with `npm run test:live`.
    exclude: ["tests/live/**"],
    // `lib/db/connection.ts` throws at import time when these are unset, and the
    // engine's import chain reaches it via the integration node handler. Nothing
    // here connects to anything — the values only need to exist.
    env: {
      MONGODB_URI: "mongodb://127.0.0.1:27017/flowys-test",
      AUTH_SECRET: "test-secret-not-used-for-anything",
      ENCRYPTION_KEY: "test-encryption-key-32-chars-000",
      OPENAI_API_KEY: "sk-test-not-called",
      ANTHROPIC_API_KEY: "sk-ant-test-not-called",
    },
  },
});
