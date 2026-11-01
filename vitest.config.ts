import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "server-only": fileURLToPath(new URL("./tests/helpers/empty.ts", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    globalSetup: ["./tests/helpers/global-setup.ts"],
    env: {
      DATABASE_URL: process.env.TEST_DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/m_advisory_test",
      APP_ENV: "test",
      AUTH_PROVIDER: "local",
      PAYMENT_PROVIDER: "mock",
      STORAGE_PROVIDER: "local",
      SESSION_SECRET: "test-secret-test-secret-test-secret-0123456789",
    },
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 60_000,
  },
});
