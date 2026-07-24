// Re-exports of the shared, Zod-derived contract types (Constitution
// Principle II) so this feature's components/hooks can import from a
// feature-local path rather than reaching into src/shared/contracts/ directly.

export type {
  CreateProjectInput,
  Project,
  UpdateProjectInput,
} from "@/shared/contracts/project.schema"
export type {
  CreateLayerInput,
  Layer,
  RenameLayerInput,
  ReorderLayersInput,
} from "@/shared/contracts/layer.schema"
export type {
  CreateFeatureInput,
  Feature,
  UpdateFeatureInput,
} from "@/shared/contracts/feature.schema"
export type { GeoJSONGeometry } from "@/shared/contracts/geometry.schema"
