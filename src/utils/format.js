/**
 * Formats a lat/lon pair for the HUD readout, e.g. "40.7°N 74.0°W".
 * Intentionally simpler than cityLabels.js's formatCoords (single space separator,
 * no double-space padding) since the HUD uses a monospace font with fixed columns.
 */
export function fmtCoords(lat, lon) {
  const la = Math.abs(lat).toFixed(1)
  const lo = Math.abs(lon).toFixed(1)
  return `${la}°${lat >= 0 ? 'N' : 'S'} ${lo}°${lon >= 0 ? 'E' : 'W'}`
}
