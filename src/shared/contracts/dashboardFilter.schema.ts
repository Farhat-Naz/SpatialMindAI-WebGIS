import { z } from "zod"
import { geometrySchema } from "./geometry.schema"

const attributeOperator = z.enum(["eq", "neq", "contains", "gt", "lt", "gte", "lte"])

/** Per-`filterType` `config` shape, mirroring `widget.schema.ts`'s per-`type` pattern (data-model.md `DashboardFilter.config`). */
const filterConfigByType = {
  date: z.object({
    field: z.string().trim().min(1).optional(),
    from: z.iso.datetime().optional(),
    to: z.iso.datetime().optional(),
  }),
  layer: z.object({ layerIds: z.array(z.string().trim().min(1)).min(1) }),
  project: z.object({ projectIds: z.array(z.string().trim().min(1)).min(1) }),
  attribute: z.object({
    key: z.string().trim().min(1),
    operator: attributeOperator,
    value: z.unknown(),
  }),
  /** MUST pass `ST_IsValid` before persistence (repository-enforced, Constitution Principle IV) — this schema only checks GeoJSON structure. */
  spatial: z.object({ geometry: geometrySchema }),
} as const

export const filterTypeSchema = z.enum(["date", "layer", "project", "attribute", "spatial"])
export type FilterTypeInput = z.infer<typeof filterTypeSchema>

export function filterConfigSchemaFor(filterType: FilterTypeInput) {
  return filterConfigByType[filterType]
}

export const createFilterRequestSchema = z.object({
  widgetId: z.string().trim().min(1).optional(),
  filterType: filterTypeSchema,
  config: z.record(z.string(), z.unknown()),
})
export type CreateFilterRequestInput = z.infer<typeof createFilterRequestSchema>
