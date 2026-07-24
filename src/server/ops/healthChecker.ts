import { prismaClient } from "@/server/db/prismaClient"

export type HealthComponentStatus = "healthy" | "degraded" | "unhealthy"

export interface ComponentHealthResult {
  status: HealthComponentStatus
  latencyMs: number | null
  detail?: string
}

const CHECK_TIMEOUT_MS = 3_000

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("Health check timed out")), timeoutMs)
  })
  try {
    return await Promise.race([promise, timeout])
  } finally {
    clearTimeout(timer!)
  }
}

/**
 * The application process itself is reachable and able to run code — always
 * healthy if this function executes at all (a crash-in-progress process
 * cannot return an "unhealthy" response by definition).
 */
export function checkApplicationHealth(): ComponentHealthResult {
  return { status: "healthy", latencyMs: 0 }
}

/**
 * Confirms the database is reachable (`SELECT 1`) and, where relevant, that
 * the PostGIS extension is installed (Constitution Principle III — every
 * environment's database must support PostGIS). Never hangs indefinitely —
 * bounded by `CHECK_TIMEOUT_MS`.
 */
export async function checkDatabaseHealth(): Promise<ComponentHealthResult> {
  const startedAt = Date.now()
  try {
    const rows = await withTimeout(
      prismaClient.$queryRaw<Array<{ postgis_version: string | null }>>`SELECT PostGIS_Version() AS postgis_version`,
      CHECK_TIMEOUT_MS,
    )
    const latencyMs = Date.now() - startedAt
    const hasPostgis = rows.length > 0 && rows[0]?.postgis_version != null
    if (!hasPostgis) {
      return { status: "degraded", latencyMs, detail: "PostGIS extension not detected" }
    }
    return { status: "healthy", latencyMs }
  } catch (error) {
    return {
      status: "unhealthy",
      latencyMs: Date.now() - startedAt,
      detail: error instanceof Error ? error.message : String(error),
    }
  }
}

/**
 * The API layer's own health — a lightweight, synchronous check standing in
 * for "the Route Handler layer is able to construct and return a response."
 * Distinct from `checkApplicationHealth` for symmetry with the three-
 * component vocabulary spec FR-016 requires (application/database/API),
 * even though today they share the same trivially-true implementation.
 */
export function checkApiHealth(): ComponentHealthResult {
  return { status: "healthy", latencyMs: 0 }
}

export interface AllComponentsHealth {
  application: ComponentHealthResult
  database: ComponentHealthResult
  api: ComponentHealthResult
}

/** Runs all three component checks and reports each independently (FR-016). */
export async function checkAllComponents(): Promise<AllComponentsHealth> {
  const [application, database, api] = await Promise.all([
    Promise.resolve(checkApplicationHealth()),
    checkDatabaseHealth(),
    Promise.resolve(checkApiHealth()),
  ])
  return { application, database, api }
}

/** Worst-of-three overall status, used for the top-level `status` field and HTTP code. */
export function overallStatus(health: AllComponentsHealth): HealthComponentStatus {
  const statuses = [health.application.status, health.database.status, health.api.status]
  if (statuses.includes("unhealthy")) return "unhealthy"
  if (statuses.includes("degraded")) return "degraded"
  return "healthy"
}
