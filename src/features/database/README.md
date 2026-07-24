# Database Feature

The client-side module for the SpatialMindAI-WebGIS database foundation
(`specs/003-database-foundation/`) — Projects, Layers, and Features
(spatial data + attributes + styles). This module owns the client
`services/`/`hooks/`/`store/` layer that talks to the Projects/Layers/Features
API; the server-side Prisma/PostGIS access lives in `src/server/` and is
never imported by anything under `src/features/` (Research Decision 2).

## Purpose

Establishes, for the first time in this project, a persisted data hierarchy:

```
User 1──* Project 1──* Layer 1──* Feature 1──* FeatureAttribute
                                      └──0..1 FeatureStyle
```

Every future map-editing/GIS feature builds on this module rather than
talking to the database directly.

## Public API

Exported from `index.ts`:

- **Services** — `projectService`, `layerService`, `featureService`: typed
  `fetch` wrappers around `/api/projects*`, `/api/layers*`, `/api/features*`.
- **Hooks** — `useProjects`/`useCreateProject`/`useUpdateProject`/
  `useDeleteProject`; `useLayers`/`useCreateLayer`/`useRenameLayer`/
  `useReorderLayers`/`useDeleteLayer`; `useFeatures`/`useCreateFeature`/
  `useUpdateFeature`/`useDeleteFeature`. All server data lives in the React
  Query cache; none of it is copied into the Zustand store.
- **Store** — `useDatabaseStore`: client-only selection state
  (`selectedProjectId`/`selectedLayerId`/`selectedFeatureId`), no server data,
  no persistence.
- **Types** — `Project`, `Layer`, `Feature`, and their `Create`/`Update`
  input types, re-exported from `src/shared/contracts/`.

## Usage Example

```ts
import { useCreateProject, useProjects } from "@/features/database"

function ProjectList() {
  const { data: projects } = useProjects()
  const createProject = useCreateProject()

  return (
    <button onClick={() => createProject.mutate({ name: "New Project" })}>
      {projects?.length ?? 0} projects
    </button>
  )
}
```

## Known Limitations

These are deliberate, documented scope boundaries for this phase — not
oversights:

- **No management UI yet.** `components/` is intentionally empty. This
  module ships the data-access layer only; a future feature builds the
  actual project/layer/feature screens on top of these hooks.
- **Interim authentication seam.** Every Route Handler resolves the acting
  user via `src/server/auth/getCurrentUser.ts`, a placeholder backed by a
  single seeded `DEV_USER_ID` — there is no real login system anywhere in
  this codebase yet (Research Decision 6). This is not production-safe as
  shipped and MUST be replaced before any multi-user or public deployment.
- **Single-instance rate limiter.** `src/server/security/rateLimiter.ts` is
  in-memory and per-process; it resets on restart and isn't shared across
  multiple deployed instances (Research Decision 9).
- **Free-form feature attributes.** `FeatureAttribute` is unstructured
  per-feature (no per-layer fixed schema) — a confirmed, intentional
  trade-off (Research Decision 12), not a missing validation layer.
