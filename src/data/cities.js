/**
 * Major world cities used for city marker rendering on both globes.
 *
 * Used by both EarthGlobe and HoloEarth via buildCityBars.js.
 * EarthGlobe uses the coordinates as-is.
 * HoloEarth shifts each longitude by ±180° inside its getBase/getLon callbacks
 * to compensate for the globe's +π Y-rotation offset.
 *
 * Format: [latitude, longitude, population (millions), name]
 *
 * Population drives the marker tier (cluster density):
 *   Tier 0 (≥15M) — 3-bar cluster  (dominant tall + 2 smaller)
 *   Tier 1 (≥6M)  — 2-bar cluster  (dominant + 1 smaller)
 *   Tier 2 (<6M)  — 1-bar          (dominant only)
 *
 * To add a city: append [lat, lon, population, name] with a comment.
 * To remove a city: delete or comment out its row.
 * Thresholds are defined in src/shaders/cityBarShaders.js → getTier().
 */
export const CITIES = [
  // ── Americas ──────────────────────────────────────────────────────────────
  [ 40.7,  -74.0,  18.8, 'New York'],
  [ 34.1, -118.2,  13.0, 'Los Angeles'],
  [ 41.9,  -87.6,   9.5, 'Chicago'],
  [ 29.8,  -95.4,   7.1, 'Houston'],
  [ 43.7,  -79.4,   6.4, 'Toronto'],
  [ 49.3, -123.1,   2.6, 'Vancouver'],
  [ 19.4,  -99.1,  21.6, 'Mexico City'],
  [-23.5,  -46.6,  22.0, 'São Paulo'],
  [-34.6,  -58.4,  15.3, 'Buenos Aires'],
  [-12.0,  -77.0,  11.1, 'Lima'],
  [  4.7,  -74.1,  11.0, 'Bogotá'],
  [-33.5,  -70.7,   6.8, 'Santiago'],
  [ 21.3, -157.8,   1.4, 'Honolulu'],
  [ 40.8, -111.8,   2.1, 'Salt Lake City'],
  [ 25.8,  -80.2,   2.7, 'Miami'],
  [ 39.7, -104.9,   2.9, 'Denver'],
  [ 33.4, -112.1,   1.6, 'Phoenix'],
  [ 36.2, -115.1,   2.3, 'Las Vegas'],
  [ -22.9, -43.2,   6.7, 'Rio de Janeiro'],

  // ── Europe ────────────────────────────────────────────────────────────────
  [ 51.5,   -0.1,   9.3, 'London'],
  [ 48.9,    2.4,  11.1, 'Paris'],
  [ 52.5,   13.4,   3.7, 'Berlin'],
  [ 40.4,   -3.7,   6.7, 'Madrid'],
  [ 41.9,   12.5,   4.3, 'Rome'],
  [ 55.8,   37.6,  12.5, 'Moscow'],
  [ 41.0,   28.9,  15.1, 'Istanbul'],
  [ 59.3,   18.1,   2.5, 'Stockholm'],
  [ 45.8,    4.8,   1.9, 'Lyon'],
  [ 50.1,   14.4,   1.3, 'Prague'],
  [ 43.7,   -7.2,   1.7, 'Porto'],
  [ 60.2,   24.9,   1.3, 'Helsinki'],
  [ 47.5,    8.3,   0.6, 'Zurich'],

  // ── Africa ────────────────────────────────────────────────────────────────
  [ 33.6,   -7.6,   3.8, 'Casablanca'],
  [ 30.1,   31.2,  21.3, 'Cairo'],
  [  6.5,    3.4,  15.0, 'Lagos'],
  [ -4.3,   15.3,  14.0, 'Kinshasa'],
  [ -1.3,   36.8,   4.7, 'Nairobi'],
  [  9.0,   38.7,   5.0, 'Addis Ababa'],
  [-26.2,   28.0,   5.9, 'Johannesburg'],

  // ── Middle East ───────────────────────────────────────────────────────────
  [ 25.2,   55.3,   3.5, 'Dubai'],
  [ 24.7,   46.7,   7.7, 'Riyadh'],

  // ── Asia ──────────────────────────────────────────────────────────────────
  [ 28.6,   77.2,  32.9, 'Delhi'],
  [ 19.1,   72.9,  20.7, 'Mumbai'],
  [ 23.8,   90.4,  22.5, 'Dhaka'],
  [ 13.8,  100.5,  10.9, 'Bangkok'],
  [  3.1,  101.7,   8.4, 'Kuala Lumpur'],
  [  1.4,  103.8,   5.9, 'Singapore'],
  [ -6.2,  106.8,  11.0, 'Jakarta'],
  [ 39.9,  116.4,  21.5, 'Beijing'],
  [ 31.2,  121.5,  28.5, 'Shanghai'],
  [ 25.0,  121.5,   7.0, 'Taipei'],
  [ 22.3,  114.2,   7.5, 'Hong Kong'],
  [ 37.6,  127.0,   9.7, 'Seoul'],
  [ 35.7,  139.7,  37.4, 'Tokyo'],
  [ 29.7,  106.5,   8.4, 'Chongqing'],

  // ── Oceania ───────────────────────────────────────────────────────────────
  [-33.9,  151.2,   5.3, 'Sydney'],
  [-37.8,  145.0,   5.1, 'Melbourne'],
  [-36.8,  174.7,   1.7, 'Auckland'],
]
