# Environment Variables

## Search feature (Phase 2)

All three are optional — the search feature works with no `.env` file at all,
falling back to the defaults below. See `.env.example` for the same list with
inline comments.

| Variable | Default | Description |
|---|---|---|
| `NOMINATIM_BASE_URL` | `https://nominatim.openstreetmap.org` | Base URL of the Nominatim-compatible geocoding service the Route Handlers call server-side. |
| `SEARCH_USER_AGENT` | `SpatialMindAI/1.0 (contact: support@spatialmind.ai)` | Required by Nominatim's usage policy: a custom, application-identifying `User-Agent` sent on every outbound request. **Set this to your own deployment's contact info before going to production.** |
| `SEARCH_RATE_LIMIT_PER_SECOND` | `1` | Maximum outbound requests per second to the geocoding provider, enforced by the local in-memory rate limiter (`src/features/search/api/rateLimiter.ts`). Matches Nominatim's ~1 req/s usage policy. |

None of these are secrets — Nominatim is keyless. If a future provider
(ArcGIS, Google Places, Mapbox — see `docs/geocoding-providers.md`) is added,
its API key must be read the same way (`process.env`, module-scope, never
committed) but declared in that provider's own module, not `config.ts`.

Read once at module scope in `src/features/search/api/config.ts` — never
re-read per request.

## Database foundation (Phase 3)

Both are **required** — Route Handlers throw on startup/first request if
either is unset. See `.env.example` for the same list with inline comments.

| Variable | Example | Description |
|---|---|---|
| `DATABASE_URL` | `postgresql://user:password@localhost:5432/spatialmind?schema=public` | PostgreSQL connection string for a database with the PostGIS extension available. **Secret, server-only** — never `NEXT_PUBLIC_*`, never committed. |
| `DEV_USER_ID` | `dev-user-1` | The id of the seeded "default" user every Route Handler resolves as the acting user via the interim authentication seam (`src/server/auth/getCurrentUser.ts`, Research Decision 6). **Development/staging only** — remove once a real authentication module ships. |

`DATABASE_URL` is read by both Prisma (`prisma.config.ts`, `prisma/schema.prisma`)
and the application's Prisma Client singleton
(`src/server/db/prismaClient.ts`) — set it once per environment (local,
CI test container, staging, production) via that environment's own secret
management, never hardcoded.

## Enterprise deployment & production operations (specs/010-deployment-enterprise)

All of these are **optional** — the application starts and runs without any
of them, with the specific capability each backs degrading gracefully
(fail-open cache/rate-limiting, no cross-origin API access, no operators
authorized) rather than blocking startup. `env.ts`'s Production-mode check
(`src/server/config/env.ts`) additionally rejects `DEBUG_MODE=true`.

| Variable | Default | Description |
|---|---|---|
| `DIRECT_URL` | _(none)_ | Non-pooled PostgreSQL connection string, used only by `prisma migrate deploy` in CI/deploy — never read by the running application at request time. Required for a real Production deploy against a pooled provider (e.g. Supabase); not needed locally where `DATABASE_URL` is already a direct connection. |
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` | _(none)_ | Upstash Redis REST credentials (`@upstash/redis` — REST-protocol only, **not** a `redis://` connection string). Backs the shared cache (`src/server/cache/cache.ts`) and the Redis-backed rate-limiter mode (`src/server/security/rateLimiter.ts`'s `checkRateLimitRedis`). Both fall back to a permanent cache-miss / the existing in-memory limiter when unset. |
| `CRON_SECRET` | _(none)_ | Shared secret the scheduled `POST /api/ops/*/run-due` endpoints require via `Authorization: Bearer <CRON_SECRET>`. Reused from `009-administration-security`'s convention (research.md §4/§17), not redefined. **Required** for scheduled backup/retention/metrics jobs to run in Production. Also reused by `008-dashboard-analytics`'s `POST /api/reports/scheduled/run-due` (research.md Decision 10) — the **same variable**, one value configured once per deployment, but checked via a **different header convention** on that endpoint: `X-Cron-Secret: <CRON_SECRET>` (a plain header, not `Authorization: Bearer`). Configure your scheduler to send whichever header the endpoint it targets expects. |
| `ALLOWED_ORIGINS` | _(none — fail-closed)_ | Comma-separated list of origins permitted to call `/api/ops/*` cross-origin (`src/server/http/corsHeaders.ts`). An unset value allows **zero** cross-origin access, matching this codebase's fail-closed default posture. |
| `OPERATOR_USER_IDS` | _(none — fail-closed)_ | Comma-separated list of `User.id` values authorized as operators for `/api/ops/*` endpoints (`src/server/ops/assertIsOperator.ts`) — the interim gate ahead of `009-administration-security`'s `assertSystemPermission`. An unset value authorizes no one. |
| `DEBUG_MODE` | `false` | Recognized debug flag rejected outright when `NODE_ENV=production` (spec FR-003). Not read anywhere else in the codebase; exists specifically to give Production-mode environment validation a concrete value to enforce against. |

None of `UPSTASH_REDIS_REST_TOKEN`/`CRON_SECRET` may ever be logged — see
`src/server/repositories/logRepository.ts`'s secret-key denylist for the
enforced convention.
