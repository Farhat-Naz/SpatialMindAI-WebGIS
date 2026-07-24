/**
 * North Arrow (US2, Research Decision 16) — a static map overlay; the map
 * itself never rotates, so a fixed "up is north" indicator is all this
 * needs to be (no compass/bearing logic).
 */
export function NorthArrow() {
  return (
    <div
      aria-label="North"
      role="img"
      className="pointer-events-none flex h-10 w-10 items-center justify-center rounded-full border bg-background/90 text-foreground shadow-sm"
    >
      <svg
        viewBox="0 0 24 24"
        width="20"
        height="20"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M12 2v20" />
        <path d="M12 2l5 9-5-3-5 3z" fill="currentColor" stroke="none" />
      </svg>
      <span className="sr-only">North</span>
    </div>
  )
}
