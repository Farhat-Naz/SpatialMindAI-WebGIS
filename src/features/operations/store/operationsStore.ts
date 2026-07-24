import { create } from "zustand"
import type { Environment, LogCategory, LogLevel } from "../types/operations.types"

type OperationsTab = "overview" | "deployments" | "backups" | "logs" | "maintenance"

interface LogFilterDraft {
  category?: LogCategory
  level?: LogLevel
}

interface OperationsState {
  selectedEnvironment: Environment | "ALL"
  logFilterDraft: LogFilterDraft
  activeTab: OperationsTab
}

interface OperationsActions {
  setSelectedEnvironment: (env: Environment | "ALL") => void
  setLogFilterDraft: (filter: Partial<LogFilterDraft>) => void
  setActiveTab: (tab: OperationsTab) => void
}

type OperationsStore = OperationsState & OperationsActions

/**
 * Client-only UI state for the operations dashboard (contracts/client-api.md)
 * — selected environment filter, log search/filter draft, active tab. Never
 * a shadow cache of server data; server state is owned entirely by React
 * Query via `opsService`/`opsKeys` (Constitution's State Management
 * standard).
 */
export const useOperationsStore = create<OperationsStore>()((set) => ({
  selectedEnvironment: "ALL",
  logFilterDraft: {},
  activeTab: "overview",
  setSelectedEnvironment: (env) => set({ selectedEnvironment: env }),
  setLogFilterDraft: (filter) =>
    set((state) => ({ logFilterDraft: { ...state.logFilterDraft, ...filter } })),
  setActiveTab: (tab) => set({ activeTab: tab }),
}))
