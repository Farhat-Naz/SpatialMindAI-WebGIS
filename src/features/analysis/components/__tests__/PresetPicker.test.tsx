import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { PresetPicker } from "../PresetPicker"
import { analysisService } from "../../services/analysisService"
import { useAnalysisStore } from "../../store/analysisStore"

vi.mock("../../services/analysisService", () => ({
  analysisService: { listPresets: vi.fn(), savePreset: vi.fn() },
}))

vi.mock("@/features/database", () => ({
  queryKeys: { layers: (projectId: string) => ["projects", projectId, "layers"] },
}))

const mockedService = vi.mocked(analysisService)

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
  return Wrapper
}

const BUFFER_PRESET = {
  id: "preset-1",
  projectId: "p1",
  userId: "u1",
  name: "500m walk",
  operationType: "buffer",
  parameters: { distance: 500, unit: "meters" },
  createdAt: "t",
  updatedAt: "t",
}

const CLIP_PRESET = { ...BUFFER_PRESET, id: "preset-2", name: "City clip", operationType: "clip", parameters: {} }

/** T223 (US8, FR-021) — saving and applying named parameter sets. */
describe("PresetPicker", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedService.listPresets.mockResolvedValue({ presets: [BUFFER_PRESET, CLIP_PRESET] } as never)
    useAnalysisStore.setState({
      selectedOperationType: null,
      draftParameters: null,
      selectedPresetId: null,
      lastError: null,
    })
  })

  it("lists only the presets for the operation it is scoped to", async () => {
    render(<PresetPicker projectId="p1" operationType="buffer" parametersToSave={{}} />, { wrapper: createWrapper() })

    await waitFor(() => expect(screen.getByRole("button", { name: /500m walk/i })).toBeTruthy())
    expect(screen.queryByRole("button", { name: /city clip/i })).toBeNull()
  })

  it("lists every preset when not scoped to an operation", async () => {
    render(<PresetPicker projectId="p1" />, { wrapper: createWrapper() })

    await waitFor(() => expect(screen.getByRole("button", { name: /500m walk/i })).toBeTruthy())
    expect(screen.getByRole("button", { name: /city clip/i })).toBeTruthy()
  })

  it("applying a preset sets the operation and its parameters together", async () => {
    render(<PresetPicker projectId="p1" operationType="buffer" parametersToSave={{}} />, { wrapper: createWrapper() })
    await waitFor(() => expect(screen.getByRole("button", { name: /500m walk/i })).toBeTruthy())

    fireEvent.click(screen.getByRole("button", { name: /500m walk/i }))

    const state = useAnalysisStore.getState()
    expect(state.selectedPresetId).toBe("preset-1")
    expect(state.selectedOperationType).toBe("buffer")
    // Applying must not leave the draft empty - that is the whole point.
    expect(state.draftParameters).toEqual({ distance: 500, unit: "meters" })
  })

  it("marks the applied preset as pressed", async () => {
    render(<PresetPicker projectId="p1" operationType="buffer" parametersToSave={{}} />, { wrapper: createWrapper() })
    await waitFor(() => expect(screen.getByRole("button", { name: /500m walk/i })).toBeTruthy())

    fireEvent.click(screen.getByRole("button", { name: /500m walk/i }))

    expect(screen.getByRole("button", { name: /500m walk/i }).getAttribute("aria-pressed")).toBe("true")
  })

  it("saves the current parameters under a given name", async () => {
    mockedService.savePreset.mockResolvedValue({ preset: BUFFER_PRESET } as never)
    render(<PresetPicker projectId="p1" operationType="buffer" parametersToSave={{ distance: 250, unit: "meters" }} />, {
      wrapper: createWrapper(),
    })

    fireEvent.change(screen.getByLabelText(/save current parameters as/i), { target: { value: "250m walk" } })
    fireEvent.click(screen.getByRole("button", { name: /save as preset/i }))

    await waitFor(() =>
      expect(mockedService.savePreset).toHaveBeenCalledWith("p1", {
        name: "250m walk",
        operationType: "buffer",
        parameters: { distance: 250, unit: "meters" },
      }),
    )
  })

  it("trims the name and clears the field after a successful save", async () => {
    mockedService.savePreset.mockResolvedValue({ preset: BUFFER_PRESET } as never)
    render(<PresetPicker projectId="p1" operationType="buffer" parametersToSave={{}} />, { wrapper: createWrapper() })

    const input = screen.getByLabelText(/save current parameters as/i) as HTMLInputElement
    fireEvent.change(input, { target: { value: "  spaced  " } })
    fireEvent.click(screen.getByRole("button", { name: /save as preset/i }))

    await waitFor(() => expect(mockedService.savePreset).toHaveBeenCalledWith("p1", expect.objectContaining({ name: "spaced" })))
    await waitFor(() => expect(input.value).toBe(""))
  })

  it("requires a name before saving", async () => {
    render(<PresetPicker projectId="p1" operationType="buffer" parametersToSave={{}} />, { wrapper: createWrapper() })

    fireEvent.click(screen.getByRole("button", { name: /save as preset/i }))

    expect(screen.getByRole("alert").textContent).toMatch(/name this preset/i)
    expect(mockedService.savePreset).not.toHaveBeenCalled()
  })

  it("surfaces a failed save rather than losing it silently", async () => {
    mockedService.savePreset.mockRejectedValue(new Error("A preset with that name already exists"))
    render(<PresetPicker projectId="p1" operationType="buffer" parametersToSave={{}} />, { wrapper: createWrapper() })

    fireEvent.change(screen.getByLabelText(/save current parameters as/i), { target: { value: "duplicate" } })
    fireEvent.click(screen.getByRole("button", { name: /save as preset/i }))

    await waitFor(() =>
      expect(useAnalysisStore.getState().lastError).toBe("A preset with that name already exists"),
    )
  })

  it("offers no save form when there are no parameters to capture", async () => {
    render(<PresetPicker projectId="p1" />, { wrapper: createWrapper() })

    await waitFor(() => expect(screen.getByRole("button", { name: /500m walk/i })).toBeTruthy())
    expect(screen.queryByRole("button", { name: /save as preset/i })).toBeNull()
  })

  it("says so when the operation has no presets yet", async () => {
    mockedService.listPresets.mockResolvedValue({ presets: [] } as never)
    render(<PresetPicker projectId="p1" operationType="buffer" parametersToSave={{}} />, { wrapper: createWrapper() })

    await waitFor(() => expect(screen.getByText(/no presets saved for this operation/i)).toBeTruthy())
  })
})
