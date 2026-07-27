import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { renderHook, waitFor } from "@testing-library/react"
import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  useCreateDashboard,
  useDashboard,
  useDashboards,
  useDashboardTemplates,
  useDeleteDashboard,
  useDuplicateDashboard,
  useRenameDashboard,
  useSetDashboardVisibility,
  useSetFavorite,
} from "../useDashboards"
import { dashboardService } from "../../services/dashboardService"

vi.mock("../../services/dashboardService", () => ({
  dashboardService: {
    listDashboards: vi.fn(),
    getDashboard: vi.fn(),
    createDashboard: vi.fn(),
    renameDashboard: vi.fn(),
    setVisibility: vi.fn(),
    deleteDashboard: vi.fn(),
    duplicateDashboard: vi.fn(),
    setFavorite: vi.fn(),
    listTemplates: vi.fn(),
  },
}))

const mockedService = vi.mocked(dashboardService)

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
  return { Wrapper, queryClient }
}

const dashboard = {
  id: "d1",
  projectId: "p1",
  ownerId: "u1",
  name: "Ops",
  templateId: null,
  visibility: "private" as const,
  effectivePermission: "owner" as const,
  isFavorite: false,
  sharedWithMe: false,
  createdAt: "t",
  updatedAt: "t",
}

describe("useDashboards hooks", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("useDashboards: lists dashboards for a project", async () => {
    mockedService.listDashboards.mockResolvedValue({ dashboards: [dashboard], nextCursor: null })
    const { Wrapper } = createWrapper()
    const { result } = renderHook(() => useDashboards("p1"), { wrapper: Wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.dashboards).toHaveLength(1)
  })

  it("useDashboard: fetches a single dashboard", async () => {
    mockedService.getDashboard.mockResolvedValue({ dashboard })
    const { Wrapper } = createWrapper()
    const { result } = renderHook(() => useDashboard("d1"), { wrapper: Wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.dashboard.id).toBe("d1")
  })

  it("useCreateDashboard: does not retry on failure (a retry would duplicate the dashboard)", async () => {
    mockedService.createDashboard.mockRejectedValue(new Error("boom"))
    const { Wrapper } = createWrapper()
    const { result } = renderHook(() => useCreateDashboard("p1"), { wrapper: Wrapper })

    result.current.mutate({ name: "X" })

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(mockedService.createDashboard).toHaveBeenCalledTimes(1)
  })

  it("useCreateDashboard: invalidates the project's dashboard list on success", async () => {
    mockedService.createDashboard.mockResolvedValue({ dashboard })
    const { Wrapper, queryClient } = createWrapper()
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries")
    const { result } = renderHook(() => useCreateDashboard("p1"), { wrapper: Wrapper })

    result.current.mutate({ name: "Ops" })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["projects", "p1", "dashboards"] })
  })

  it("useRenameDashboard: invalidates both the list and the dashboard's own detail", async () => {
    mockedService.renameDashboard.mockResolvedValue({ dashboard })
    const { Wrapper, queryClient } = createWrapper()
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries")
    const { result } = renderHook(() => useRenameDashboard("p1"), { wrapper: Wrapper })

    result.current.mutate({ dashboardId: "d1", name: "New" })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["projects", "p1", "dashboards"] })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["dashboards", "d1"] })
  })

  it("useSetDashboardVisibility: invalidates list and detail", async () => {
    mockedService.setVisibility.mockResolvedValue({ dashboard })
    const { Wrapper, queryClient } = createWrapper()
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries")
    const { result } = renderHook(() => useSetDashboardVisibility("p1"), { wrapper: Wrapper })

    result.current.mutate({ dashboardId: "d1", visibility: "public" })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["dashboards", "d1"] })
  })

  it("useDeleteDashboard: invalidates the project's dashboard list", async () => {
    mockedService.deleteDashboard.mockResolvedValue(undefined)
    const { Wrapper, queryClient } = createWrapper()
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries")
    const { result } = renderHook(() => useDeleteDashboard("p1"), { wrapper: Wrapper })

    result.current.mutate("d1")

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["projects", "p1", "dashboards"] })
  })

  it("useDuplicateDashboard: invalidates the project's dashboard list", async () => {
    mockedService.duplicateDashboard.mockResolvedValue({ dashboard })
    const { Wrapper, queryClient } = createWrapper()
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries")
    const { result } = renderHook(() => useDuplicateDashboard("p1"), { wrapper: Wrapper })

    result.current.mutate("d1")

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["projects", "p1", "dashboards"] })
  })

  it("useSetFavorite: invalidates the project's dashboard list", async () => {
    mockedService.setFavorite.mockResolvedValue({ isFavorite: true })
    const { Wrapper, queryClient } = createWrapper()
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries")
    const { result } = renderHook(() => useSetFavorite("p1"), { wrapper: Wrapper })

    result.current.mutate({ dashboardId: "d1", isFavorite: true })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["projects", "p1", "dashboards"] })
  })

  it("useDashboardTemplates: fetches the platform-wide template list", async () => {
    mockedService.listTemplates.mockResolvedValue({ templates: [] })
    const { Wrapper } = createWrapper()
    const { result } = renderHook(() => useDashboardTemplates(), { wrapper: Wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(mockedService.listTemplates).toHaveBeenCalledTimes(1)
  })
})
