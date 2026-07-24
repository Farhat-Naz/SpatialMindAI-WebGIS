import { execSync } from "node:child_process"

/**
 * Connection string for the ephemeral PostGIS test container defined in
 * docker-compose.test.yml (Research Decision 11) — started separately via
 * `npm run test:db:up` before `npm test` runs.
 */
const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  "postgresql://test:test@localhost:55432/spatialmind_test?schema=public"

/**
 * Vitest global setup: points DATABASE_URL at the test container and applies
 * every Prisma migration before any test file runs, so repository/API tests
 * always start from a known, fully-migrated schema (real PostGIS, not a
 * mocked Prisma Client).
 *
 * Migration failure (e.g., `npm run test:db:up` was not run first) is logged
 * as a warning, not thrown — this suite also contains unit/component/hook
 * tests for other features that never touch the database, and those must
 * still run. Tests that require the database are responsible for skipping
 * themselves if it is unreachable (see repository/API test setup).
 */
export default function setup() {
  process.env.DATABASE_URL = TEST_DATABASE_URL

  try {
    execSync("npx prisma migrate deploy", {
      stdio: "pipe",
      env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
    })
  } catch (error) {
    console.warn(
      "[vitest.global-setup] Could not apply Prisma migrations to the test " +
        "database — is it running? (`npm run test:db:up`). Tests that " +
        "require the database will fail or skip individually.\n" +
        (error instanceof Error ? error.message : String(error)),
    )
  }
}
