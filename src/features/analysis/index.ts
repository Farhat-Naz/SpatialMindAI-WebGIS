// Public barrel — services, hooks, store, and types other features may
// consume. Internal repository/Route Handler code is server-only and lives
// outside src/features/ entirely (see src/server/, matching the database
// feature's established boundary).
export { analysisService } from "./services/analysisService"
export { measurementService } from "./services/measurementService"
export {
  exportAnalysisResult,
  exportLayerAsCsv,
  exportLayerAsGeoJson,
  exportLayerAsKml,
  exportLayerAsShapefile,
} from "./services/exportService"
export { queryKeys } from "./services/queryKeys"

export {
  useAnalysisRun,
  useAnalysisRuns,
  useCancelAnalysis,
  useDeleteAnalysisRun,
  useDiscardAnalysisResult,
  useRerunAnalysis,
  useRunAnalysis,
} from "./hooks/useAnalysis"
export { useDeletePreset, usePresets, useSavePreset } from "./hooks/useAnalysisPresets"
export { useDeleteMeasurement, useMeasurementHistory, useSaveMeasurement } from "./hooks/useMeasurements"
export { useExportHistory, useExportResult } from "./hooks/useExportHistory"
export {
  useAnalysisActiveTab,
  useAnalysisDockPosition,
  useAnalysisPanelOpen,
  useAnalysisPanelWidth,
  useCloseAnalysisPanel,
  useOpenAnalysisPanel,
  useSelectedHistoryRunId,
  useSelectHistoryRun,
  useSetAnalysisActiveTab,
  useSetAnalysisDockPosition,
  useSetAnalysisPanelWidth,
  useToggleAnalysisPanel,
} from "./hooks/useAnalysisPanel"

export { useAnalysisStore } from "./store/analysisStore"
export { useAnalysisPanelStore } from "./store/analysisPanelStore"

export { AnalysisToolbox } from "./components/AnalysisToolbox"
export { OperationConfigForm } from "./components/OperationConfigForm"
export { ProgressDialog } from "./components/ProgressDialog"
export { ResultPanel } from "./components/ResultPanel"
export { MeasureToolbar } from "./components/MeasureToolbar"
export { StatisticsCards, type StatisticsResult } from "./components/StatisticsCards"
export { AnalysisSummary } from "./components/AnalysisSummary"
export { AnalysisPanel, AnalysisPanelMount } from "./components/AnalysisPanel"
export { HeatmapLayer } from "./components/HeatmapLayer"
export { HistoryPanel } from "./components/HistoryPanel"
export { PropertyPanel } from "./components/PropertyPanel"
export { PresetPicker } from "./components/PresetPicker"
