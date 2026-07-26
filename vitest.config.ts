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
    // Note on the intermittent "Failed to start forks worker" abort seen
    // on Windows: it is fork-spawn churn (~126 spawns per run, one file
    // each), not any single test — it hit two different, unrelated files
    // on separate runs and both passed in isolation. There is no supported
    // config fix in Vitest 4: `poolOptions.forks.singleFork` was removed
    // (top-level options now), `fileParallelism: false` already pins
    // workers to 1, and `pool: "threads"` cannot load this project's
    // native Prisma bindings. `isolate: false` would reuse one process but
    // would also share module state across files, which the paragraph
    // above explains this suite specifically cannot tolerate. Re-run on
    // the rare occasion it fires.
  },
})
