/**
 * Default interval a data-driven widget's `refetchInterval` uses when the
 * widget doesn't configure its own (research.md Decision 6, SC-002's 30s
 * freshness bound).
 */
export const WIDGET_REFRESH_INTERVAL_MS = 30_000

/**
 * Responsive breakpoint pixel thresholds, matching `WidgetLayout.breakpoint`'s
 * three tiers. A viewport at or below `MOBILE_MAX_WIDTH` is "mobile"; at or
 * below `TABLET_MAX_WIDTH` (and above mobile) is "tablet"; anything wider is
 * "desktop". Mirrors the app shell's `useBreakpoint` single-threshold pattern,
 * extended to three tiers.
 */
export const MOBILE_MAX_WIDTH = 767
export const TABLET_MAX_WIDTH = 1279

/**
 * `AnalyticsSnapshot` staleness window (research.md Decision 12) — a
 * snapshot older than this is recomputed on next read rather than served
 * as-is. Aligned with SC-002's 30-second freshness bound.
 */
export const ANALYTICS_SNAPSHOT_TTL_MS = 30_000

/**
 * Retention cap for `Report` rows per user (research.md Decision 17) — the
 * oldest report(s) beyond this count are pruned when a new one is created.
 */
export const REPORT_RETENTION_LIMIT_PER_USER = 50
