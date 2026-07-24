import type { LogCategory, LogEntry, LogLevel, Prisma } from "@prisma/client"
import { prismaClient } from "@/server/db/prismaClient"

export interface RecordLogEntryInput {
  category: LogCategory
  level: LogLevel
  message: string
  requestId?: string
  source?: string
  context?: Record<string, unknown>
}

/**
 * Case-insensitive substrings that must never appear as a key in a
 * persisted `LogEntry.context` (FR-024, defense-in-depth beyond the
 * documentation-only convention every other `logger.*` call already
 * follows). Matching keys are stripped, not merely redacted, before the
 * row is written.
 */
const SECRET_KEY_DENYLIST = ["password", "secret", "token", "database_url", "authorization", "cookie"]

function stripSecretKeys(context: Record<string, unknown> | undefined): Prisma.InputJsonValue | undefined {
  if (!context) {
    return undefined
  }
  const sanitized: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(context)) {
    const lowerKey = key.toLowerCase()
    if (SECRET_KEY_DENYLIST.some((denied) => lowerKey.includes(denied))) {
      continue
    }
    sanitized[key] = value
  }
  return sanitized as Prisma.InputJsonValue
}

/**
 * Writes one centralized `LogEntry` row (FR-019–FR-024). This is the
 * **only** function permitted to write `LogEntry` — every other call site
 * goes through `logger.persist()` (`src/shared/lib/logger.ts`), which
 * calls this function, never `prismaClient.logEntry.create` directly.
 */
export async function recordLogEntry(input: RecordLogEntryInput): Promise<LogEntry> {
  return prismaClient.logEntry.create({
    data: {
      category: input.category,
      level: input.level,
      message: input.message,
      requestId: input.requestId,
      source: input.source,
      context: stripSecretKeys(input.context),
    },
  })
}

export interface QueryLogsFilter {
  category?: LogCategory
  level?: LogLevel
  from?: Date
  to?: Date
  cursor?: string
  limit?: number
}

export interface QueryLogsResult {
  entries: LogEntry[]
  nextCursor: string | null
}

/** Cursor-paginated centralized log search (FR-023, SC-008). */
export async function queryLogs(filter: QueryLogsFilter): Promise<QueryLogsResult> {
  const take = filter.limit ?? 50

  const entries = await prismaClient.logEntry.findMany({
    where: {
      category: filter.category,
      level: filter.level,
      occurredAt: {
        gte: filter.from,
        lte: filter.to,
      },
    },
    orderBy: { occurredAt: "desc" },
    take: take + 1,
    ...(filter.cursor ? { cursor: { id: filter.cursor }, skip: 1 } : {}),
  })

  const hasMore = entries.length > take
  const page = hasMore ? entries.slice(0, take) : entries

  return {
    entries: page,
    nextCursor: hasMore ? (page[page.length - 1]?.id ?? null) : null,
  }
}
