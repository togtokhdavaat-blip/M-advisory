import { execFileSync } from "node:child_process";

/** Recreate the test database from the shim + migrations before the suite. */
export default function setup() {
  execFileSync("npx", ["tsx", "scripts/db-reset.ts"], {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: process.env.TEST_DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/m_advisory_test" },
  });
}
