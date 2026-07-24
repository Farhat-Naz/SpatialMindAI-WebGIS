const METERS_PER_KM = 1000
const SQUARE_METERS_PER_HECTARE = 10_000

/** Formats a distance/perimeter value (meters) as meters or kilometers, whichever reads better. */
export function formatDistance(meters: number): string {
  if (meters >= METERS_PER_KM) {
    return `${(meters / METERS_PER_KM).toFixed(2)} km`
  }
  return `${meters.toFixed(1)} m`
}

/** Formats an area value (square meters) as square meters or hectares, whichever reads better. */
export function formatArea(squareMeters: number): string {
  if (squareMeters >= SQUARE_METERS_PER_HECTARE) {
    return `${(squareMeters / SQUARE_METERS_PER_HECTARE).toFixed(2)} ha`
  }
  return `${squareMeters.toFixed(1)} m²`
}
