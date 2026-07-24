export type OfflineMutationType = "create" | "update" | "delete"
export type OfflineQueueStatus = "pending" | "submitted" | "conflicted"

export interface OfflineQueueEntry {
  id: string
  mutationType: OfflineMutationType
  featureId?: string
  layerId?: string
  payload: unknown
  featureExpectedUpdatedAt?: string
  status: OfflineQueueStatus
  createdAt: string
}

const DB_NAME = "spatialmind-offline-queue"
const STORE_NAME = "mutations"
const DB_VERSION = 1

/**
 * A small wrapper over the native `indexedDB` API storing queued feature
 * mutations made while disconnected (research.md Decision 6) — no new npm
 * dependency. Rows are replayed in order, one at a time, through the
 * existing React Query mutation hooks once connectivity returns
 * (`useOfflineQueue`, Phase 6).
 */
function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function withStore<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, mode)
    const store = tx.objectStore(STORE_NAME)
    const request = fn(store)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

/** Adds a mutation to the queue, defaulting `status` to `"pending"`. */
export async function enqueue(
  entry: Omit<OfflineQueueEntry, "status" | "createdAt"> & { status?: OfflineQueueStatus },
): Promise<void> {
  const fullEntry: OfflineQueueEntry = {
    ...entry,
    status: entry.status ?? "pending",
    createdAt: new Date().toISOString(),
  }
  await withStore("readwrite", (store) => store.put(fullEntry))
}

/** Lists every pending (not yet submitted) queued mutation, oldest first. */
export async function listPending(): Promise<OfflineQueueEntry[]> {
  const all = await withStore<OfflineQueueEntry[]>("readonly", (store) => store.getAll())
  return all
    .filter((entry) => entry.status === "pending")
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
}

/** Marks a queued mutation as successfully submitted. */
export async function markSubmitted(id: string): Promise<void> {
  const entry = await withStore<OfflineQueueEntry | undefined>("readonly", (store) => store.get(id))
  if (!entry) return
  await withStore("readwrite", (store) => store.put({ ...entry, status: "submitted" as const }))
}

/** Marks a queued mutation as conflicted (the server rejected it with a 409 on replay). */
export async function markConflicted(id: string): Promise<void> {
  const entry = await withStore<OfflineQueueEntry | undefined>("readonly", (store) => store.get(id))
  if (!entry) return
  await withStore("readwrite", (store) => store.put({ ...entry, status: "conflicted" as const }))
}

/** Removes a queued mutation entirely (e.g., after the client has resolved a conflict). */
export async function remove(id: string): Promise<void> {
  await withStore("readwrite", (store) => store.delete(id))
}
