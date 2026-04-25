export function fmtCoords(lat, lon) {
  const la = Math.abs(lat).toFixed(1)
  const lo = Math.abs(lon).toFixed(1)
  return `${la}°${lat >= 0 ? 'N' : 'S'} ${lo}°${lon >= 0 ? 'E' : 'W'}`
}
