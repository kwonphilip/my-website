/**
 * Major shipping / flight routes used for the animated plane trails.
 *
 * Format: [latA, lonA, latB, lonB]  (standard geographic coordinates)
 * All longitudes use the standard −180…+180 range.
 *
 * To add a route: append [latA, lonA, latB, lonB] with a comment.
 * To remove a route: delete or comment out its row.
 *
 * EarthGlobe uses ROUTES directly — standard coordinates work because the
 * globe starts at rotation.y = 0.
 *
 * HoloEarth's globe is rotated 180° (rotation.y = π), so its routes need
 * longitudes shifted by ±180°. Use shiftRoutesForHolo() below before passing
 * routes to HoloEarth's buildShippingLanes builder.
 *
 * Trail length is controlled by TRAIL_N in src/shaders/flightShaders.js.
 * Animation speed is controlled by the 0.065 factor in the vertex shader.
 */
export const ROUTES = [
  [ 31.2,  121.5,  33.7, -118.2], // Shanghai      → Los Angeles
  [ 51.9,    4.5,  40.7,  -74.0], // Rotterdam     → New York
  [  1.3,  103.8,  51.9,    4.5], // Singapore     → Rotterdam
  [ 33.7, -118.2,  35.5,  139.6], // Los Angeles   → Tokyo
  [ 31.2,  121.5,  25.2,   55.3], // Shanghai      → Dubai
  [ 51.9,    4.5, -33.9,   18.4], // Rotterdam     → Cape Town
  [ 40.7,  -74.0, -23.9,  -46.3], // New York      → Santos
  [ 18.9,   72.8, -33.9,   18.4], // Mumbai        → Cape Town
  [ 33.7, -118.2,  40.7,  -74.0], // Los Angeles   → New York
  [ 40.7,  -74.0,  33.7, -118.2], // New York      → Los Angeles
  [ 37.6,  127.0,  38.9,  -77.0], // Seoul         → Washington DC
  [ 48.9,    2.4,  55.8,   37.6], // Paris         → Moscow
  [ 55.8,   37.6,  48.9,    2.4], // Moscow        → Paris
  [ 38.9,  -77.0,  31.2,  121.5], // Washington DC → Shanghai
  [-33.9,  151.2,  37.6,  127.0], // Sydney        → Seoul
  [-33.9,  151.2,  31.2,  121.5], // Sydney        → Shanghai
  [ 30.0,   31.2,  39.5,  116.4], // Suez Canal    → Beijing
  [ 39.5,  116.4,  30.0,   31.2], // Beijing       → Suez Canal
  [ 25.2,   55.3,  40.7,  -74.0], // Dubai         → New York
  [ 40.7,  -74.0,  25.2,   55.3], // New York      → Dubai
  [ 31.2,  121.5,  48.9,    2.4], // Shanghai      → Paris
  [ 48.9,    2.4,  31.2,  121.5], // Paris         → Shanghai
  [ 21.3, -157.8,  33.7, -118.2], // Honolulu      → Los Angeles
  [ 33.7, -118.2,  21.3, -157.8], // Los Angeles   → Honolulu
  [ 21.3, -157.8,  37.6,  127.0], // Honolulu      → Seoul
  [ 37.6,  127.0,  21.3, -157.8], // Seoul         → Honolulu
  [-22.9,  -43.2,  40.7,  -74.0], // Rio de Janeiro → New York
  [ 40.7,  -74.0, -22.9,  -43.2], // New York      → Rio de Janeiro
  [ 39.5,  116.4, -33.9,  151.2], // Beijing       → Sydney
  [ 31.2,  121.5, -33.9,  151.2], // Shanghai      → Sydney
  [-33.9,  151.2,  31.2,  121.5], // Sydney        → Shanghai
  [ 31.2,  121.5,  37.6,  127.0], // Shanghai      → Seoul
  [ 37.6,  127.0,  31.2,  121.5], // Seoul         → Shanghai
]

/**
 * Shifts each longitude by ±180° to account for HoloEarth's globe being
 * rotated 180° on the Y axis (rotation.y = π at rest).
 * Positive lons become negative (lon − 180) and vice versa (lon + 180).
 */
export function shiftRoutesForHolo(routes) {
  const shift = lon => (lon < 0 ? lon + 180 : lon - 180)
  return routes.map(([latA, lonA, latB, lonB]) => [latA, shift(lonA), latB, shift(lonB)])
}
