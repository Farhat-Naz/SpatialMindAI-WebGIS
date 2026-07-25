import { prismaClient } from "@/server/db/prismaClient"

/**
 * Cancels a running PostgreSQL backend by pid via `pg_cancel_backend`
 * (research.md Decision 5) — the immediate-cancellation half of an
 * `AnalysisRun`'s two-layer cancel: between chunks the execution loop
 * checks `cancelRequestedAt` and stops on its own, but a single chunk
 * already in flight (e.g. an expensive `ST_Union`) needs this to stop
 * before finishing. Kept separate from `analysisRepository.ts` so it has
 * no analysis-specific knowledge and is trivially unit-testable with a
 * mocked client.
 *
 * Never throws for a pid that has already finished or does not exist —
 * `pg_cancel_backend` itself returns `false` in that case rather than
 * erroring, and this wrapper does not turn that into an error either,
 * since "the query was already done" is not a failure for a caller whose
 * only intent was "make sure it stops."
 */
export async function cancelBackendPid(pid: number): Promise<void> {
  await prismaClient.$executeRaw`SELECT pg_cancel_backend(${pid})`
}
