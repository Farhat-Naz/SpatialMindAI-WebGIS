/**
 * Abort detection (specs/005-import-export).
 *
 * Its own module, deliberately: both the parser worker and the pipeline need it,
 * and putting it in `importPipeline` would make the worker import that module —
 * which pulls `importService`, `apiFetch`, and `fetch` into the worker bundle for
 * the sake of one four-line predicate, as well as creating a circular value
 * dependency with the worker's own message types.
 */

/**
 * Reports whether a caught value is a cancellation rather than a failure.
 *
 * Checks the **name**, not `instanceof DOMException`. That distinction is
 * load-bearing: `AbortSignal.throwIfAborted()` throws a `DOMException` created by
 * whichever realm owns the `AbortController`, and an `instanceof` test against
 * the ambient `DOMException` fails whenever those differ — Node's
 * `AbortController` under jsdom being the case that exposed it, but a worker or
 * iframe boundary does the same in production.
 *
 * Getting this wrong is not cosmetic: a cancelled import would be reported to the
 * user as a failed one, and `completeImportJob(…, "failed")` would be called on a
 * job the user deliberately stopped.
 */
export function isAbortError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    (error as { name?: unknown }).name === "AbortError"
  )
}

/** The abort reason this feature throws, so every cancellation looks the same. */
export function abortError(message = "The operation was cancelled."): DOMException {
  return new DOMException(message, "AbortError")
}
