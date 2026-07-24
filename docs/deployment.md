# Deployment: Security Headers

Security headers are configured in [`next.config.ts`](../next.config.ts) via the
`headers()` function and applied to every route (`source: "/(.*)"`).

## The 5 Required Security Headers

| # | Header | Exact Value |
|---|---|---|
| 1 | `Content-Security-Policy` | See [Content Security Policy](#content-security-policy) below |
| 2 | `X-Frame-Options` | `DENY` |
| 3 | `X-Content-Type-Options` | `nosniff` |
| 4 | `Referrer-Policy` | `strict-origin-when-cross-origin` |
| 5 | `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` |

> **Note**: The deployment also sends a `Permissions-Policy` header
> (`camera=(), microphone=(), payment=(), usb=(), geolocation=(self)`) as an
> additional hardening measure beyond the 5 required headers above. It disables
> unused browser APIs; `geolocation=(self)` is reserved for a future
> "use my location" feature.

## Content Security Policy

The `Content-Security-Policy` header value is the following directives joined
with `; `:

```
default-src 'self';
script-src 'self' 'unsafe-inline';
style-src 'self' 'unsafe-inline';
font-src 'self';
img-src 'self' data: blob: https://*.tile.openstreetmap.org https://server.arcgisonline.com;
connect-src 'self' https://*.tile.openstreetmap.org https://server.arcgisonline.com;
object-src 'none';
frame-ancestors 'none';
base-uri 'self';
form-action 'self'
```

### `img-src`

```
img-src 'self' data: blob: https://*.tile.openstreetmap.org https://server.arcgisonline.com
```

Allows Leaflet to render:
- Same-origin assets (`'self'`)
- Inline/generated images (`data:`, `blob:`)
- OSM basemap tiles (`https://*.tile.openstreetmap.org` — covers the `a`/`b`/`c` tile subdomains)
- Esri World Imagery satellite tiles (`https://server.arcgisonline.com`)

### `connect-src`

```
connect-src 'self' https://*.tile.openstreetmap.org https://server.arcgisonline.com
```

Leaflet's `TileLayer` fetches tiles via XHR/`fetch`, so `connect-src` must
allow the same two origins as `img-src`:
- `https://*.tile.openstreetmap.org`
- `https://server.arcgisonline.com`

### Required allowlist entries

Both the `img-src` and `connect-src` directives must include these two entries
for the map basemaps to load:

- `*.tile.openstreetmap.org`
- `server.arcgisonline.com`

## Verifying Headers with `curl -I`

Run against the deployed URL and confirm each of the 5 headers (plus
`Permissions-Policy`) is present with the exact value documented above:

```bash
curl -I https://<your-deployment-domain>/
```

Expected output includes lines such as:

```
content-security-policy: default-src 'self'; script-src 'self' 'unsafe-inline'; ...
x-frame-options: DENY
x-content-type-options: nosniff
referrer-policy: strict-origin-when-cross-origin
strict-transport-security: max-age=31536000; includeSubDomains
permissions-policy: camera=(), microphone=(), payment=(), usb=(), geolocation=(self)
```

If any header is missing or its value differs from what's documented above,
check `next.config.ts` and confirm the deployment is serving the latest build.

## Validating with securityheaders.com

1. Deploy the application to a publicly reachable HTTPS URL (securityheaders.com
   cannot scan `localhost`).
2. Go to https://securityheaders.com and enter the deployment URL.
3. Run the scan and confirm:
   - An overall grade of **A** or better.
   - All 5 required headers above are detected and reported with no warnings.
   - No missing-header findings for CSP, X-Frame-Options,
     X-Content-Type-Options, Referrer-Policy, or Strict-Transport-Security.
4. If the scan flags the CSP as containing `'unsafe-inline'` for
   `script-src`/`style-src`, this is expected and required for Next.js App
   Router hydration and Tailwind/shadcn runtime style injection (see comments
   in `next.config.ts`) — it is not a regression to fix.

## Phase 2: Search

The search feature (`GET /api/search`, `GET /api/reverse-geocode`) calls
Nominatim (`nominatim.openstreetmap.org` by default) **server-side only**, so:

- **Outbound network access is required** from the production server/runtime
  to whichever host `NOMINATIM_BASE_URL` points at (see
  `docs/environment-variables.md`). If the deployment platform blocks
  outbound requests by default, allowlist that host.
- **No CSP changes are needed** for this feature — the browser only ever
  calls same-origin `/api/search` and `/api/reverse-geocode`, already covered
  by the existing `connect-src 'self'` above.
- **Rate limiting is enforced per server instance**, in-memory (see
  `src/features/search/api/rateLimiter.ts`). Nominatim's usage policy caps
  usage at ~1 request/second with a required, identifying `User-Agent`
  (`SEARCH_USER_AGENT`). If you deploy across multiple instances/regions,
  each instance enforces its own budget independently — the effective
  aggregate rate against Nominatim will be higher than the configured
  per-instance limit. Set `SEARCH_USER_AGENT` to your own deployment's
  contact info before going to production, per Nominatim's usage policy.

## Phase 3: Database Foundation

This phase introduces the project's first database — PostgreSQL with the
PostGIS extension, accessed via Prisma (`src/server/`) — and its first
Route Handlers under `/api/projects`, `/api/layers`, `/api/features`
(`specs/003-database-foundation/`).

- **Environment variables**: `DATABASE_URL` and `DEV_USER_ID` are both
  **required** in every environment (see `docs/environment-variables.md`).
  Neither is optional the way the Phase 2 search variables are.
- **Database migrations**: `prisma migrate deploy` (never `prisma migrate
  dev`, which is interactive and dev-only) MUST run as a build/deploy step
  — before the new application version receives traffic, not triggered by
  application code at request time. On Vercel, wire this into the project's
  build command (e.g., `prisma migrate deploy && next build`) or a
  pre-deploy hook.
- **PostGIS availability**: the target PostgreSQL instance must support the
  `postgis` extension (`CREATE EXTENSION IF NOT EXISTS postgis;`, applied
  automatically by the first migration). A managed Postgres offering that
  does not support installing PostGIS cannot host this application.
- **Node.js runtime required**: every Route Handler introduced by this
  phase depends on Prisma's query engine, which is not Edge-runtime
  compatible without an additional proxy layer (e.g., Prisma Accelerate),
  not used here. None of these Route Handlers may declare
  `export const runtime = 'edge'`. On Vercel, Route Handlers default to the
  Node.js runtime unless they opt into `edge`, so no extra configuration is
  needed beyond not adding that opt-in.
- **No CSP changes needed**: all database access is server-side only (via
  Prisma/PostGIS); the browser only ever calls same-origin
  `/api/projects*`, `/api/layers*`, `/api/features*`, already covered by the
  existing `connect-src 'self'` above.
- **Rate limiting is enforced per server instance**, in-memory (see
  `src/server/security/rateLimiter.ts`) — the same single-instance caveat as
  Phase 2's search limiter applies: each deployed instance enforces its own
  budget independently.
- **Known gap — no real authentication**: `DEV_USER_ID` (see
  `docs/environment-variables.md`) is an interim placeholder, not a login
  system. **Do not deploy this phase to a public, multi-user environment**
  until a real authentication module replaces
  `src/server/auth/getCurrentUser.ts`.
