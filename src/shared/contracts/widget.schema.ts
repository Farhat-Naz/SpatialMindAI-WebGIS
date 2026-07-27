import { z } from "zod"

/** Mirrors `analysisOperations.ts`'s `StatisticType` — kept as a parallel literal union here (Constitution Principle I: `shared/contracts` never imports from `server/repositories`). */
const statisticType = z.enum([
  "featureCount",
  "totalLength",
  "averageLength",
  "averageArea",
  "extent",
  "areaCalculation",
  "lengthCalculation",
  "centroid",
  "convexHull",
  "boundingBox",
  "densityAnalysis",
])

const widgetDataSourceType = z.enum([
  "layer",
  "analysisRun",
  "projectStats",
  "layerStats",
  "featureStats",
  "activity",
  "systemStats",
  "storageStats",
])

const gaugeThreshold = z.object({ value: z.number(), color: z.string().trim().min(1) })

/** Per-`type` `config` shape (research.md Decision 1). Every field is optional-safe with a sensible widget-side default, since a widget must render something even with a bare-minimum config. */
const widgetConfigByType = {
  map: z.object({ showLegend: z.boolean().optional(), baseLayer: z.string().trim().optional() }),
  statistics: z.object({ statType: statisticType, label: z.string().trim().max(200).optional() }),
  table: z.object({
    columns: z.array(z.string().trim().min(1)).optional(),
    pageSize: z.number().int().positive().max(100).optional(),
  }),
  chartBar: z.object({ groupByAttribute: z.string().trim().min(1).optional(), statType: statisticType.optional() }),
  chartLine: z.object({ groupByAttribute: z.string().trim().min(1).optional(), statType: statisticType.optional() }),
  chartArea: z.object({ groupByAttribute: z.string().trim().min(1).optional(), statType: statisticType.optional() }),
  chartPie: z.object({ groupByAttribute: z.string().trim().min(1).optional(), statType: statisticType.optional() }),
  gauge: z.object({
    statType: statisticType,
    min: z.number(),
    max: z.number(),
    thresholds: z.array(gaugeThreshold).optional(),
  }),
  metricCard: z.object({ statType: statisticType, label: z.string().trim().max(200).optional() }),
  text: z.object({ content: z.string().max(50_000) }),
  image: z.object({ url: z.string().trim().min(1).max(2000), alt: z.string().trim().max(500).optional() }),
  html: z.object({ content: z.string().max(50_000) }),
} as const

export const widgetTypeSchema = z.enum([
  "map",
  "statistics",
  "table",
  "chartBar",
  "chartLine",
  "chartArea",
  "chartPie",
  "gauge",
  "metricCard",
  "text",
  "image",
  "html",
])
export type WidgetTypeInput = z.infer<typeof widgetTypeSchema>

/** Validates `config` against the schema for the given `type` — the one place `DashboardWidget.config`'s per-type shape is enforced (data-model.md). */
export function widgetConfigSchemaFor(type: WidgetTypeInput) {
  return widgetConfigByType[type]
}

const layoutItem = z.object({
  widgetId: z.string().trim().min(1),
  x: z.number().int().min(0),
  y: z.number().int().min(0),
  w: z.number().int().min(1),
  h: z.number().int().min(1),
})

export const createWidgetRequestSchema = z.object({
  type: widgetTypeSchema,
  title: z.string().trim().max(200).optional(),
  dataSourceType: widgetDataSourceType.optional(),
  dataSourceId: z.string().trim().min(1).optional(),
  config: z.record(z.string(), z.unknown()),
  layout: z.array(layoutItem.omit({ widgetId: true })).optional(),
})
export type CreateWidgetRequestInput = z.infer<typeof createWidgetRequestSchema>

export const updateWidgetRequestSchema = z
  .object({
    title: z.string().trim().max(200).nullable().optional(),
    dataSourceType: widgetDataSourceType.nullable().optional(),
    dataSourceId: z.string().trim().min(1).nullable().optional(),
    config: z.record(z.string(), z.unknown()).optional(),
    groupId: z.string().trim().min(1).nullable().optional(),
    isCollapsed: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: "At least one field must be provided." })
export type UpdateWidgetRequestInput = z.infer<typeof updateWidgetRequestSchema>

export const saveLayoutRequestSchema = z.object({
  breakpoint: z.enum(["desktop", "tablet", "mobile"]),
  items: z.array(layoutItem).max(200),
})
export type SaveLayoutRequestInput = z.infer<typeof saveLayoutRequestSchema>
