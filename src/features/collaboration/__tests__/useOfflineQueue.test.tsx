import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { renderHook, waitFor } from "@testing-library/react"
import type { ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { useOfflineQueue } from "../hooks/useOfflineQueue"

vi.mock("@/features/database/services/featureService", () => ({
  featureService: { create: vi.fn(), update: vi.fn(), remove: vi.fn() },
}))

vi.mock("@/features/database/services/queryKeys", () => ({
  queryKeys: { featuresList: (layerId: string) => ["layers", layerId, "features"] },
}))

/**
 * A minimal, in-memory mock of the small `indexedDB` surface
 * `offlineQueue.ts` actually uses (single object store, keyPath `id`,
 * `put`/`get`/`getAll`/`delete`) — this project's existing
 * browser-API-mocking convention (see `vitest.setup.ts`'s `ResizeObserver`
 * stub) rather than adding a new `fake-indexeddb` dependency.
 */
function installFakeIndexedDb(): void {
  const store = new Map<string, unknown>()

  function makeRequest<T>(run: () => T): { onsuccess: (() => void) | null; onerror: (() => void) | null; result: T; error: null } {
    const request = { onsuccess: null as (() => void) | null, onerror: null as (() => void) | null, result: undefined as T, error: null }
    queueMicrotask(() => {
      request.result = run()
      request.onsuccess?.()
    })
    return request as never
  }

  const fakeObjectStore = {
    put: (value: { id: string }) => makeRequest(() => void store.set(value.id, value)),
    get: (id: string) => makeRequest(() => store.get(id)),
    getAll: () => makeRequest(() => [...store.values()]),
    delete: (id: string) => makeRequest(() => void store.delete(id)),
  }

  const fakeDb = {
    objectStoreNames: { contains: () => true },
    transaction: () => ({ objectStore: () => fakeObjectStore }),
  }

  const fakeIndexedDb = {
    open: () => {
      const request = { onupgradeneeded: null as (() => void) | null, onsuccess: null as (() => void) | null, onerror: null as (() => void) | null, result: fakeDb }
      queueMicrotask(() => request.onsuccess?.())
      return request
    },
  }
  // Minimal test double, not a full IDBFactory implementation — matches this
  // project's existing browser-API-mocking convention (vitest.setup.ts).
  globalThis.indexedDB = fakeIndexedDb as unknown as IDBFactory
}

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
  return { Wrapper }
}

describe("useOfflineQueue", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    installFakeIndexedDb()
    Object.defineProperty(navigator, "onLine", { value: true, writable: true, configurable: true })
  })

  afterEach(() => {
    // @ts-expect-error cleanup of the test double
    delete globalThis.indexedDB
  })

  it("queues a create while offline, persisting across a simulated reload (re-read via listPending)", async () => {
    Object.defineProperty(navigator, "onLine", { value: false, writable: true, configurable: true })
    const { Wrapper } = createWrapper()
    const { result } = renderHook(() => useOfflineQueue(), { wrapper: Wrapper })

    await waitFor(() => expect(result.current.isOnline).toBe(false))
    await result.current.queueCreate("layer-1", { geometry: { type: "Point", coordinates: [0, 0] } })

    const { listPending } = await import("../services/offlineQueue")
    const pending = await listPending()
    expect(pending).toHaveLength(1)
    expect(pending[0].mutationType).toBe("create")
  })

  it("replays pending mutations in order through the underlying feature service on reconnect", async () => {
    const { enqueue } = await import("../services/offlineQueue")
    await enqueue({
      id: "e1",
      mutationType: "create",
      layerId: "layer-1",
      payload: { geometry: { type: "Point", coordinates: [0, 0] } },
    })

    const { featureService } = await import("@/features/database/services/featureService")
    vi.mocked(featureService.create).mockResolvedValue({
      feature: { id: "f1", layerId: "layer-1", geometry: { type: "Point", coordinates: [0, 0] }, attributes: [], style: null, createdAt: "t", updatedAt: "t" },
    })

    const { Wrapper } = createWrapper()
    const { result } = renderHook(() => useOfflineQueue(), { wrapper: Wrapper })

    await result.current.replayPending()

    expect(featureService.create).toHaveBeenCalledWith("layer-1", { geometry: { type: "Point", coordinates: [0, 0] } })

    const { listPending } = await import("../services/offlineQueue")
    expect(await listPending()).toHaveLength(0)
  })
})
