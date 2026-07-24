// Public barrel — services, hooks, and store selectors other features may
// consume. Internal repository/Route Handler code is server-only and lives
// outside src/features/ entirely (see src/server/, Research Decision 2).

export { projectService } from "./services/projectService"
export { layerService } from "./services/layerService"
export { featureService } from "./services/featureService"
export { exportLayerAsGeoJson } from "./services/exportLayer"
export { convertShapefileToFeatures } from "./services/shapefileImport"
export { queryKeys } from "./services/queryKeys"

export {
  useBulkDeleteFeatures,
  useCopyFeature,
  useCreateFeature,
  useCreateLayer,
  useCreateProject,
  useDeleteFeature,
  useDeleteLayer,
  useDeleteProject,
  useDuplicateFeature,
  useExportLayer,
  useFeatures,
  useImportFeatures,
  useKeyboardShortcuts,
  useLayers,
  usePasteFeature,
  useProjects,
  useRenameLayer,
  useReorderLayers,
  useUndoLastEdit,
  useUpdateFeature,
  useUpdateProject,
} from "./hooks"

export { useDatabaseStore } from "./store/databaseStore"
export { useEditingStore } from "./store/editingStore"

export { ProjectExplorer } from "./components/ProjectExplorer"
export { LayerTree } from "./components/LayerTree"
export { LayerTreeItem } from "./components/LayerTreeItem"
export { RightSidebar } from "./components/RightSidebar"
export { DrawingToolbar } from "./components/DrawingToolbar"
export { MeasurementToolbar } from "./components/MeasurementToolbar"
export { SelectionBox } from "./components/SelectionBox"
export { SelectionActions } from "./components/SelectionActions"
export { AttributeForm } from "./components/AttributeForm"
export { ImportExportControls } from "./components/ImportExportControls"
export { FeatureLayer } from "./components/FeatureLayer"
export { FeatureContextMenu } from "./components/FeatureContextMenu"
export { LayerContextMenu } from "./components/LayerContextMenu"
export { MapEditingLayer } from "./components/MapEditingLayer"
export { FitToDataButton } from "./components/FitToDataButton"
export { NorthArrow } from "./components/NorthArrow"
export { EditingErrorBanner } from "./components/EditingErrorBanner"

export type {
  CreateFeatureInput,
  CreateLayerInput,
  CreateProjectInput,
  Feature,
  GeoJSONGeometry,
  Layer,
  Project,
  RenameLayerInput,
  ReorderLayersInput,
  UpdateFeatureInput,
  UpdateProjectInput,
} from "./types/database.types"

export type {
  ActiveTool,
  Clipboard,
  ImportResult,
  MeasurementResult,
  UndoSnapshot,
} from "./types/editing.types"
