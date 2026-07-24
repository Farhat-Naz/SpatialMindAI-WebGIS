import { PrismaClient } from "@prisma/client";

/**
 * Singleton Prisma Client, cached on `globalThis` in development so Next.js's
 * hot-reload doesn't open a new connection pool on every module reload.
 */
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prismaClient = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prismaClient;
}
