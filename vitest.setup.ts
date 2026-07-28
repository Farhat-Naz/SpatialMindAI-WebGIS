import { afterEach } from "vitest"
import { cleanup } from "@testing-library/react"

// `afterEach`/`describe`/`it` are imported per-file (no vitest `globals: true`
// config), so @testing-library/react's own auto-cleanup detection never
// fires. Unmount after every test here instead, so renders across `it()`
// blocks in the same file don't accumulate in the document.
afterEach(() => {
  cleanup()
})

// jsdom does not implement ResizeObserver; cmdk (shadcn's Command component)
// relies on it to measure the results list. Stub it globally so any test
// rendering a `Command` tree doesn't need to repeat this per-file.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver
}

// jsdom does not implement scrollIntoView either; cmdk calls it when the
// keyboard-highlighted item changes.
if (typeof Element.prototype.scrollIntoView === "undefined") {
  Element.prototype.scrollIntoView = function scrollIntoView() {}
}

// jsdom does not implement IntersectionObserver, which specs/008-dashboard-
// analytics's `DashboardGrid` (T301, research.md Decision 16) uses for
// viewport-gated lazy widget mounting. jsdom also computes no real layout,
// so there is no meaningful "is this actually on screen" signal to give it
// here — every observed element is reported intersecting immediately,
// matching this suite's existing behavior (every widget mounts/fetches
// right away) for every test that doesn't care about lazy-mount
// specifically. `DashboardGrid.performance.test.tsx` (T314) overrides this
// stub locally with `vi.stubGlobal` to test the non-trivial case.
class IntersectionObserverStub implements IntersectionObserver {
  readonly root: Element | Document | null = null
  readonly rootMargin: string = ""
  readonly scrollMargin: string = ""
  readonly thresholds: ReadonlyArray<number> = []
  #callback: IntersectionObserverCallback

  constructor(callback: IntersectionObserverCallback) {
    this.#callback = callback
  }

  observe(target: Element) {
    this.#callback(
      [
        {
          isIntersecting: true,
          target,
          boundingClientRect: target.getBoundingClientRect(),
          intersectionRatio: 1,
          intersectionRect: target.getBoundingClientRect(),
          rootBounds: null,
          time: Date.now(),
        },
      ],
      this,
    )
  }

  unobserve() {}
  disconnect() {}
  takeRecords(): IntersectionObserverEntry[] {
    return []
  }
}

if (typeof globalThis.IntersectionObserver === "undefined") {
  globalThis.IntersectionObserver = IntersectionObserverStub as unknown as typeof IntersectionObserver
}
