import { describe, expect, it } from "vitest"
import { exportLayerAsGeoJson } from "../exportService"
import { exportLayerAsGeoJson as databaseExportLayerAsGeoJson } from "@/features/database/services/exportLayer"

describe("exportService (T081 shell)", () => {
  it("exportLayerAsGeoJson re-exports database's existing function unchanged, not a duplicate", () => {
    expect(exportLayerAsGeoJson).toBe(databaseExportLayerAsGeoJson)
  })
})
