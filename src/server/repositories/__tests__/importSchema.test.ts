import { beforeAll, describe, expect, it } from "vitest"
import { prismaClient } from "@/server/db/prismaClient"
import { hasFeatureGeometryGistIndex, isDatabaseAvailable } from "./testHelpers"

/**
 * Schema-level guards for specs/005-import-export Phase 2 (T032).
 *
 * These assert properties of the migrated database itself rather than of any
 * repository function — each one is something a future auto-generated
 * migration could silently undo.
 */

const databaseAvailable = await isDatabaseAvailable()

describe.skipIf(!databaseAvailable)("import/export schema", () => {
  beforeAll(async () => {
    await prismaClient.$queryRaw`SELECT 1`
  })

  it("keeps the spatial GiST index on Feature.geometry", async () => {
    // Constitution Principle III requires it, and the existing-layer duplicate
    // probe (research.md Decision 8) narrows candidates with `&&` before
    // ST_OrderingEquals — without GiST that probe is a sequential scan.
    //
    // This index has already been lost once: created in
    // 20260721203400_add_feature, dropped by
    // 20260724193417_add_collaboration_and_ops as `prisma migrate dev`
    // collateral (Prisma cannot represent an index method on an
    // `Unsupported()` column), restored in
    // 20260727080000_add_import_jobs_and_export_scope. A generated migration
    // can drop it again the same way, so the regression is guarded here.
    await expect(hasFeatureGeometryGistIndex()).resolves.toBe(true)
  })

  it("carries the index that makes rollback an index scan", async () => {
    const rows = await prismaClient.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*)::bigint AS count FROM pg_indexes
      WHERE tablename = 'Feature' AND indexname = 'Feature_importJobId_idx'
    `
    expect(Number(rows[0].count)).toBe(1)
  })

  it("populates spatial_ref_sys, which ST_Transform depends on", async () => {
    // research.md Decision 4 — the persisted coordinate transform runs in
    // PostGIS, so an empty EPSG catalog would break every projected import.
    const rows = await prismaClient.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*)::bigint AS count FROM spatial_ref_sys
    `
    expect(Number(rows[0].count)).toBeGreaterThan(1000)
  })

  it("defaults ExportJob.scope to 'layer' so pre-existing rows stay valid", async () => {
    const rows = await prismaClient.$queryRaw<{ column_default: string | null }[]>`
      SELECT column_default FROM information_schema.columns
      WHERE table_name = 'ExportJob' AND column_name = 'scope'
    `
    expect(rows[0]?.column_default).toContain("layer")
  })

  it("keeps Feature.importJobId nullable so existing write paths are unaffected", async () => {
    // A NOT NULL column here would have broken createFeature, updateFeature,
    // importFeatures, and every analysis result-layer writer.
    const rows = await prismaClient.$queryRaw<{ is_nullable: string }[]>`
      SELECT is_nullable FROM information_schema.columns
      WHERE table_name = 'Feature' AND column_name = 'importJobId'
    `
    expect(rows[0]?.is_nullable).toBe("YES")
  })

  it("sets ImportJob.targetLayerId to null on layer delete rather than cascading", async () => {
    // FR-079 — a history entry must survive its target layer's deletion.
    const rows = await prismaClient.$queryRaw<{ confdeltype: string }[]>`
      SELECT confdeltype FROM pg_constraint
      WHERE conname = 'ImportJob_targetLayerId_fkey'
    `
    expect(rows[0]?.confdeltype).toBe("n") // 'n' = SET NULL
  })

  it("sets Feature.importJobId to null on job delete rather than deleting map data", async () => {
    const rows = await prismaClient.$queryRaw<{ confdeltype: string }[]>`
      SELECT confdeltype FROM pg_constraint
      WHERE conname = 'Feature_importJobId_fkey'
    `
    expect(rows[0]?.confdeltype).toBe("n") // 'n' = SET NULL
  })

  it("cascades ImportIssue rows when their job is deleted", async () => {
    const rows = await prismaClient.$queryRaw<{ confdeltype: string }[]>`
      SELECT confdeltype FROM pg_constraint
      WHERE conname = 'ImportIssue_importJobId_fkey'
    `
    expect(rows[0]?.confdeltype).toBe("c") // 'c' = CASCADE
  })
})
