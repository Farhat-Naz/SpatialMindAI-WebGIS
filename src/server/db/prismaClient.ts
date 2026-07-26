import { PrismaClient } from "@prisma/client";

/**
 * Singleton Prisma Client, cached on `globalThis` in development so Next.js's
 * hot-reload doesn't open a new connection pool on every module reload.
 */
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

/**
 * Ceiling on a single statement's execution time (T263).
 *
 * Every long PostGIS operation in 007-spatial-analysis is already split
 * into chunks, so no *individual* statement should run for minutes. A
 * statement that does is pathological — an unindexed cross join, a
 * degenerate geometry — and without a ceiling it holds its connection
 * open indefinitely, which starves the pool for everyone else. Failing
 * cleanly with a Postgres timeout error surfaces as a failed run with a
 * message, rather than a job stuck in `running` forever.
 *
 * Set generously (2 minutes): the goal is to catch runaway statements,
 * not to cap legitimately slow ones on large inputs.
 */
const STATEMENT_TIMEOUT_MS = 120_000

function createPrismaClient(): PrismaClient {
  const client = new PrismaClient()
  // Applied per connection rather than baked into DATABASE_URL so the
  // value stays visible in code and does not depend on every deployment's
  // connection string being written correctly.
  client.$connect().then(
    () => client.$executeRawUnsafe(`SET statement_timeout = ${STATEMENT_TIMEOUT_MS}`).catch(() => {}),
    () => {},
  )
  return client
}

export const prismaClient = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prismaClient;
}
