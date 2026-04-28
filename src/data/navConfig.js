/**
 * Navigation link definitions and derived globe-targeting data for App.jsx.
 *
 * Keeping these here rather than inline in App avoids recomputing the derived
 * arrays on every render and makes it easy to add/rename nav destinations in
 * one place without touching component logic.
 *
 * Why LOCATIONS_HOLO differs from LOCATIONS:
 *   HoloEarth's globe starts at rotation.y = π (180°) so the face that appears
 *   at lon 0 on a standard globe appears at lon ±180 on HoloEarth. Any target
 *   passed to rotateTo must be shifted ±180° so the camera lands on the right
 *   hemisphere.
 *
 * Why NAV_CITY_INDICES:
 *   When the user hovers a nav link, the globe rotates to that location and
 *   shows a ping ring + bracket. If a city bar sits exactly at that spot it
 *   visually blocks the marker, so the bar is temporarily hidden. This array
 *   pre-computes the nearest city index once so App.jsx doesn't scan CITIES on
 *   every hover.
 */

import { CITIES } from './cities.js'

export const NAV_LINKS = [
  { label: 'About',    lat: 40.7, lon: -73.9,  desc: 'Current:\n\tSoftware Developer\nHistory:\n\tMechanical Engineer\n\tIP\\Patent Attorney' },
  { label: 'Hobbies',  lat: 34.1, lon: -118.2, desc: 'Brazilian Jiu-Jitsu\nMuai Thai\nCycling\nReading' },
  { label: 'TEMP 1',   lat: 37.6, lon:  127.0, desc: 'Coming soon...' },
  { label: 'TEMP 2',   lat: 48.9, lon:    2.4, desc: 'Coming soon...' },
  { label: 'Contact',  lat: 90.0, lon:    0,   desc: "Santa's workshop" },
]

// Standard { lat, lon } targets passed to WireframeEarth.
export const LOCATIONS = NAV_LINKS.map(l => ({ lat: l.lat, lon: l.lon }))

// Shifted { lat, lon } targets passed to HoloEarth.
// lon < 0 → lon + 180;  lon ≥ 0 → lon − 180
export const LOCATIONS_HOLO = NAV_LINKS.map(l => ({
  lat: l.lat,
  lon: l.lon < 0 ? l.lon + 180 : l.lon - 180,
}))

// Index of the nearest city in CITIES for each nav location.
// Uses Euclidean distance in lat/lon space (fine for a 5° threshold check).
// Returns -1 if no city falls within the 5° radius (5² = 25 threshold).
export const NAV_CITY_INDICES = LOCATIONS.map(loc => {
  let bestIdx = -1, bestDist = Infinity
  CITIES.forEach(([lat, lon], i) => {
    const d = (lat - loc.lat) ** 2 + (lon - loc.lon) ** 2
    if (d < bestDist) { bestDist = d; bestIdx = i }
  })
  return bestDist < 25 ? bestIdx : -1
})

/**
 * Converts the terrain-detail slider value (50–150) to dot mesh parameters.
 *
 * Two piecewise-linear segments share a common midpoint at the default (v=100):
 *   v = 50  → step=0.45, dotRadius=0.00315  (coarsest — fewest dots, largest)
 *   v = 100 → step=0.30, dotRadius=0.0021   (default)
 *   v = 150 → step=0.20, dotRadius=0.0014   (finest  — most dots, smallest)
 *
 * Dot radius shrinks as density increases to prevent dots from overlapping at
 * high zoom levels; the relationship isn't perfectly linear but was tuned visually.
 *
 * @param {number} v  Slider value in [50, 150].
 * @returns {{ step: number, dotRadius: number }}
 */
export function detailToParams(v) {
  const t = (v - 50) / 100  // normalise to [0, 1]
  if (t <= 0.5) {
    const r = t / 0.5
    return {
      step:      0.45 + r * (0.30 - 0.45),
      dotRadius: 0.00315 + r * (0.0021 - 0.00315),
    }
  }
  const r = (t - 0.5) / 0.5
  return {
    step:      0.30 + r * (0.20 - 0.30),
    dotRadius: 0.0021 + r * (0.0014 - 0.0021),
  }
}
