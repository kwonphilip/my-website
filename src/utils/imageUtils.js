/**
 * Image loading and pixel-sampling utilities.
 *
 * HoloEarth only — used to read terrain textures (spec map for land mask,
 * bump map for elevation heights) and map textures (day, night, etc.) on the
 * CPU for colouring the elevation-dot InstancedMesh and positioning city bars.
 *
 * WireframeEarth does not use these — its land mask is a canvas texture built in
 * geo.js, and its dot pattern runs entirely in the GLSL shader (dotShaders.js).
 */

import { Color } from 'three'

// ── Image loading ─────────────────────────────────────────────────────────

/**
 * Fetches an image URL and returns its raw RGBA pixel data as
 * { data: Uint8ClampedArray, width: number, height: number }.
 * Used to sample terrain/map textures on the CPU for dot coloring.
 */
export async function loadImageData(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status} loading ${url}`)
  const blob = await res.blob()
  const bmp  = await createImageBitmap(blob)
  const { width, height } = bmp
  const canvas = new OffscreenCanvas(width, height)
  const ctx    = canvas.getContext('2d')
  ctx.drawImage(bmp, 0, 0)
  bmp.close()
  return {
    data: ctx.getImageData(0, 0, width, height).data,
    width,
    height,
  }
}

// ── Pixel sampling ────────────────────────────────────────────────────────

/**
 * Samples the red channel (0–1) of an image at normalised UV coordinates.
 * Used to read the spec map (ocean mask) and bump map (terrain height).
 */
export function sampleR({ data, width, height }, u, v) {
  const x = Math.min(Math.floor(u * width),  width  - 1)
  const y = Math.min(Math.floor(v * height), height - 1)
  return data[(y * width + x) * 4] / 255
}

/**
 * Samples all three colour channels (0–1) of an image at normalised UVs.
 * Used to read day/night map textures for dot colouring.
 */
export function sampleRGB({ data, width, height }, u, v) {
  const x = Math.min(Math.floor(u * width),  width  - 1)
  const y = Math.min(Math.floor(v * height), height - 1)
  const i = (y * width + x) * 4
  return { r: data[i] / 255, g: data[i + 1] / 255, b: data[i + 2] / 255 }
}

// ── Colour gradient sampling ──────────────────────────────────────────────

// Scratch colours reused across frames to avoid GC pressure.
const _gradA = new Color()
const _gradB = new Color()

/**
 * Interpolates a colour gradient at position t (0–1).
 *
 * @param {Array<{at: number, color: THREE.Color}>} stops  Gradient stop array, sorted by `at`.
 * @param {number}        t    Position along the gradient (0 = first stop, 1 = last stop).
 * @param {THREE.Color}   out  Output colour modified in-place and returned.
 */
export function sampleGradient(stops, t, out) {
  if (t <= stops[0].at) return out.copy(stops[0].color)
  for (let i = 1; i < stops.length; i++) {
    if (t <= stops[i].at) {
      const span = stops[i].at - stops[i - 1].at
      const f    = (t - stops[i - 1].at) / span
      _gradA.copy(stops[i - 1].color)
      _gradB.copy(stops[i].color)
      return out.lerpColors(_gradA, _gradB, f)
    }
  }
  return out.copy(stops[stops.length - 1].color)
}
