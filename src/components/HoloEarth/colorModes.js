/**
 * Colour mode configuration and dot-colouring utilities for HoloEarth.
 *
 * To add a new colour mode:
 *   1. Add a key to COLOR_MODE_URLS (map image URL) and COLOR_MODE_SAT (saturation boost).
 *   2. Add a key to COLOR_MODE_FILL for the fill-sphere colour and opacity.
 *   3. Add a matching <option> in App.jsx's holo-mode-select dropdown.
 *
 * To adjust the hologram or white colour schemes, edit the gradient stop arrays
 * below. Each stop: { at: 0..1, color: THREE.Color } where `at` is the bump value.
 */

import * as THREE from 'three'
import { sampleGradient, sampleRGB, loadImageData } from '../../utils/imageUtils.js'

import dayUrl       from '../../assets/textures/8k_earth.jpg'
import nightUrl     from '../../assets/textures/earth_night_4096.jpg'
import nightAlt2Url from '../../assets/textures/earth_lights_2048.png'

// ── City bar tint per colour mode ─────────────────────────────────────────
// Tint applied to bar sides, top caps, and wireframe edges.
// Adjust these to change how city markers look in each mode.
export const COLOR_MODE_BAR_COLOR = {
  hologram:  0xffffff,
  white:     0xaaddff,
  day:       0xaaddff,
  night:     0xffffff,
  nightalt2: 0xaaddff,
}

// ── Ping ring color per colour mode ───────────────────────────────────────
// Color of the expanding pulse rings shown on nav-link hover.
export const COLOR_MODE_PING_COLOR = {
  hologram:  0x73e0ff,
  white:     0x73e0ff,
  day:       0x73e0ff,
  night:     0x73e0ff,
  nightalt2: 0x73e0ff,
}

// ── Ping center dot color per colour mode ─────────────────────────────────
// Color of the small solid dot at the center of the ping sprite.
// Defaults to white for a bright focal point; adjust per mode for contrast.
export const COLOR_MODE_PING_CENTER_COLOR = {
  hologram:  0xffffff,
  white:     0xffffff,
  day:       0xffffff,
  night:     0xffffff,
  nightalt2: 0xffffff,
}

// ── Bracket color per colour mode ─────────────────────────────────────────
// Color of the four-corner hover brackets shown on nav-link hover.
export const COLOR_MODE_BRACKET_COLOR = {
  hologram:  0xffffff,
  white:     0xffffff,
  day:       0xffffff,
  night:     0xffffff,
  nightalt2: 0xffffff,
}

// ── Longitude shift ───────────────────────────────────────────────────────
// HoloEarth's globe starts at rotation.y = π (180°), so all city and route
// longitudes must be shifted ±180° to align with the visual "front" of the globe.
export const shiftLon = lon => (lon < 0 ? lon + 180 : lon - 180)

// ── Map image URLs ────────────────────────────────────────────────────────
// Maps each colour mode key to the image used for dot colouring.
// Modes not listed here (hologram, white) use gradient-based colouring instead.
export const COLOR_MODE_URLS = {
  day:       dayUrl,
  night:     nightUrl,
  nightalt2: nightAlt2Url,
}

// Saturation boost multiplier applied on top of raw map RGB values.
export const COLOR_MODE_SAT = {
  day:       2.5,
  night:     2.0,
  nightalt2: 1.7,
}

// Fill sphere colour and opacity per mode.
// The fill sphere gives the globe interior its base body colour.
export const COLOR_MODE_FILL = {
  hologram:  { color: 0x001a2e, opacity: 0.50 },
  white:     { color: 0x111318, opacity: 0.35 },
  day:       { color: 0x0a1e30, opacity: 0.40 },
  night:     { color: 0x000005, opacity: 0.55 },
  nightalt2: { color: 0x000005, opacity: 0.55 },
}

// ── Dot colour gradients ──────────────────────────────────────────────────
// Sampled by bump value (0 = sea level, 1 = mountain peak).

export const HOLOGRAM_GRADIENT = [
  { at: 0.00, color: new THREE.Color(0x003344) },
  { at: 0.40, color: new THREE.Color(0x0077aa) },
  { at: 0.70, color: new THREE.Color(0x00bbdd) },
  { at: 1.00, color: new THREE.Color(0x00eeff) },
]

export const WHITE_GRADIENT = [
  { at: 0.00, color: new THREE.Color(0x8899aa) },
  { at: 0.40, color: new THREE.Color(0xaabbcc) },
  { at: 0.70, color: new THREE.Color(0xddeeff) },
  { at: 1.00, color: new THREE.Color(0xffffff) },
]

// ── Dot colouring functions ───────────────────────────────────────────────

export function applyGradientColors(mesh, points) {
  const color = new THREE.Color()
  points.forEach((pt, i) => { sampleGradient(HOLOGRAM_GRADIENT, pt.bump, color); mesh.setColorAt(i, color) })
  mesh.instanceColor.needsUpdate = true
}

export function applyWhiteColors(mesh, points) {
  const color = new THREE.Color()
  points.forEach((pt, i) => { sampleGradient(WHITE_GRADIENT, pt.bump, color); mesh.setColorAt(i, color) })
  mesh.instanceColor.needsUpdate = true
}

export function applyMapColors(mesh, points, mapImg, satBoost = 1) {
  const color = new THREE.Color()
  const hsl   = {}
  points.forEach((pt, i) => {
    const { r, g, b } = sampleRGB(mapImg, pt.lon / 360, (90 - pt.lat) / 180)
    color.setRGB(r, g, b)
    if (satBoost !== 1) {
      color.getHSL(hsl)
      color.setHSL(hsl.h, Math.min(hsl.s * satBoost, 1), hsl.l)
    }
    mesh.setColorAt(i, color)
  })
  mesh.instanceColor.needsUpdate = true
}

// ── Composite helpers ─────────────────────────────────────────────────────────
// These bundle the repeated "which colouring function do I call, and do I need
// to fetch the image first?" logic that previously appeared three times in
// HoloEarth.jsx (after initial async build, in the colorMode effect, and after
// the detail-level rebuild).

/**
 * Re-colours the elevation-dot InstancedMesh to match s.colorMode.
 *
 * No-ops if the mesh hasn't loaded yet (s.mesh is null) — the initial build
 * will apply the correct colour once it finishes.
 *
 * For map-based modes the texture may need to be fetched; if a cached copy
 * exists in s.imgCache it is used synchronously, otherwise an async fetch
 * kicks off and the mesh is coloured when the image resolves.
 *
 * @param {object} s  stateRef.current from HoloEarth.jsx
 */
export function recolorDots(s) {
  if (!s.mesh || !s.points) return

  const { colorMode, imgCache } = s

  if (colorMode === 'hologram') { applyGradientColors(s.mesh, s.points); return }
  if (colorMode === 'white')    { applyWhiteColors(s.mesh, s.points);    return }

  const url = COLOR_MODE_URLS[colorMode]
  if (!url) return
  const sat    = COLOR_MODE_SAT[colorMode] ?? 1
  const cached = imgCache[url]
  if (cached) {
    applyMapColors(s.mesh, s.points, cached, sat)
  } else {
    loadImageData(url).then(img => {
      imgCache[url] = img
      // Guard against stale mesh (rebuild) or colorMode change during the fetch.
      if (s.mesh && s.points && s.colorMode === colorMode) {
        applyMapColors(s.mesh, s.points, img, sat)
      }
    })
  }
}

/**
 * Applies the per-colorMode tint to all marker materials in the scene:
 * city building materials (buildingMats[]), ping rings, and hover brackets.
 *
 * buildingMats may be empty if the async dot build hasn't finished yet —
 * the initial build callback calls this again once the mesh is ready.
 *
 * @param {object} s  stateRef.current from HoloEarth.jsx
 */
export function applyMarkerColors(s) {
  const barHex        = COLOR_MODE_BAR_COLOR[s.colorMode]         ?? 0xffffff
  const pingHex       = COLOR_MODE_PING_COLOR[s.colorMode]        ?? 0x73e0ff
  const pingCenterHex = COLOR_MODE_PING_CENTER_COLOR[s.colorMode] ?? 0xffffff
  const bracketHex    = COLOR_MODE_BRACKET_COLOR[s.colorMode]     ?? 0xffffff
  for (const mat of s.buildingMats) mat.uniforms.uColor.value.setHex(barHex)
  if (s.pingMat) {
    s.pingMat.uniforms.uColor.value.setHex(pingHex)
    s.pingMat.uniforms.uCenterColor.value.setHex(pingCenterHex)
  }
  if (s.bracketMat) s.bracketMat.color.setHex(bracketHex)
}
