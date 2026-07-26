import { fileURLToPath } from "node:url"
import { defineConfig } from "vitest/config"

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  oxc: {
    // tsconfig.json sets "jsx": "preserve" for Next.js's SWC transform;
    // override it here so Vite's oxc transformer strips JSX for the test build.
    jsx: { runtime: "automatic" },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    globalSetup: ["./vitest.global-setup.ts"],
    // API/integration test files share one fixed TEST_OWNER_ID (testHelpers.ts)
    // and one process-wide, in-memory rate-limit Map (rateLimiter.ts). Each
    // file's beforeEach/beforeAll resets that limiter for a clean start, which
    // only actually yields a clean start if files run one at a time — under
    // Vitest's default file-level parallelism, two files racing against the
    // same DATABASE_URL and TEST_OWNER_ID cause real, reproducible
    // cross-file failures (discovered running specs/006-collaboration and
    // specs/010-deployment-enterprise's test suites against a real database
    // for the first time). Disabling file parallelism is a test-execution-
    // strategy fix only — no application/rate-limiter code changes — and
    // trades some suite wall-clock time for a suite that is reliably green.
    fileParallelism: false,
    poolOptions: {
      forks: {
        // `fileParallelism: false` already serializes files, but Vitest
        // still spawns a fresh fork per file — ~126 process spawns per
        // run, and on Windows one of them intermittently fails with
        // "Failed to start forks worker", aborting an otherwise green
        // suite (seen on two different, unrelated files). Reusing one
        // fork removes the spawn churn; `isolate` stays on its default,
        // so each file still gets a fresh module registry and the
        // per-file rate-limiter reset above keeps working.
        singleFork: true,
      },
    },
  },
})
