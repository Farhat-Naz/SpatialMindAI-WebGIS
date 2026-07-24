import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { DashboardLayout } from "../components/DashboardLayout"
import { useDashboardStore } from "../store/dashboardStore"
import { useMapStore } from "@/features/map/store/mapStore"

vi.mock("next/dynamic", () => ({
  default: () =>
    function MockedMapCore() {
      return <div data-testid="mock-map-core" />
    },
}))

vi.mock("react-leaflet", () => ({
  MapContainer: ({ children }: { children?: ReactNode }) => (
    <div data-testid="mock-leaflet-map-container">{children}</div>
  ),
  TileLayer: () => null,
  ZoomControl: () => null,
  ScaleControl: () => null,
  useMap: () => ({
    getContainer: () => document.createElement("div"),
    invalidateSize: () => {},
  }),
  useMapEvents: () => null,
}))

vi.mock("@/features/database/services/projectService", () => ({
  projectService: { list: vi.fn().mockResolvedValue({ projects: [] }) },
}))

function stubDesktopMatchMedia() {
  window.matchMedia = (query: string): MediaQueryList => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })
}

describe("DashboardLayout", () => {
  beforeEach(() => {
    stubDesktopMatchMedia()
    useDashboardStore.setState({
      sidebarState: "expanded",
      desktopSidebarPreference: "expanded",
    })
    useMapStore.setState({
      center: { lat: 20, lng: 0 },
      zoom: 2,
      activeBasemapId: "osm-street",
      mapStatus: "idle",
      lastKnownCoords: null,
      errorMessage: null,
    })
  })

  it("renders the navbar, sidebar, mocked map container, and status bar", () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    render(
      <QueryClientProvider client={queryClient}>
        <DashboardLayout />
      </QueryClientProvider>,
    )

    const banner = screen.getByRole("banner")
    expect(banner).toBeTruthy()

    const sidebar = screen.getByRole("complementary", {
      name: "Main navigation",
    })
    expect(sidebar).toBeTruthy()
    expect(sidebar.tagName).toBe("ASIDE")

    const mockMapCore = screen.getByTestId("mock-map-core")
    expect(mockMapCore).toBeTruthy()

    const statusBar = screen.getByRole("contentinfo")
    expect(statusBar).toBeTruthy()
  })
})
