type LogLevel = "debug" | "info" | "warn" | "error"

interface RequestLogFields {
  method: string
  path: string
  status: number
  durationMs: number
}

function write(level: LogLevel, message: string, fields?: object): void {
  const line = JSON.stringify({ level, message, ...fields })

  if (level === "error") {
    console.error(line)
  } else if (level === "warn") {
    console.warn(line)
  } else {
    console.log(line)
  }
}

/**
 * Shared logging wrapper (Constitution Principle XV) — the only place
 * `console.*` should be called from feature code, so verbosity/destination
 * can be changed in one place.
 */
export const logger = {
  /** No-op in production builds; use for local-only diagnostic output. */
  debug(message: string, fields?: Record<string, unknown>): void {
    if (process.env.NODE_ENV === "production") {
      return
    }
    write("debug", message, fields)
  },
  info(message: string, fields?: Record<string, unknown>): void {
    write("info", message, fields)
  },
  warn(message: string, fields?: Record<string, unknown>): void {
    write("warn", message, fields)
  },
  error(message: string, fields?: Record<string, unknown>): void {
    write("error", message, fields)
  },
  /** Structured method/path/status/duration log line for a Route Handler request. */
  request(fields: RequestLogFields): void {
    write("info", "request", fields)
  },
  /**
   * Persists a centralized, queryable log entry (specs/010-deployment-
   * enterprise, FR-019–FR-024) in addition to the existing stdout line every
   * other method already writes. Additive only — every pre-existing method
   * above is unchanged. Server-only: on the client this is a stdout-only
   * no-op, since `LogEntry` persistence requires database access. Never
   * throws — a logging failure must not break the request it's logging
   * (research.md §8). The database write is wired in by
   * `src/server/repositories/logRepository.ts` (specs/010-deployment-
   * enterprise Phase 6); until then this call is stdout-only.
   */
  async persist(entry: PersistedLogEntry): Promise<void> {
    write(entry.level === "error" ? "error" : entry.level === "warn" ? "warn" : "info", entry.message, {
      persisted: true,
      category: entry.category,
      requestId: entry.requestId,
      source: entry.source,
      context: entry.context,
    })

    if (typeof window !== "undefined") {
      return
    }

    try {
      const mod = (await import("@/server/repositories/logRepository").catch(() => null)) as
        | { recordLogEntry?: (input: PersistedLogEntry) => Promise<unknown> }
        | null
      await mod?.recordLogEntry?.(entry)
    } catch (error) {
      write("error", "logger.persist: failed to write LogEntry", {
        originalMessage: entry.message,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  },
}

export interface PersistedLogEntry {
  category: "APPLICATION" | "DATABASE" | "SECURITY" | "AUDIT"
  level: LogLevel
  message: string
  requestId?: string
  source?: string
  context?: Record<string, unknown>
}
