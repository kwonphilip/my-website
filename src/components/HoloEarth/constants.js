// Shared camera + rotation constants (duplicated between WireframeEarth and HoloEarth).
export { ZOOM_DEFAULT, ZOOM_IN, AXIAL_TILT, AXIAL_TILT_Z, IDLE_RETURN_MS } from '../../constants.js'

// ── Selective bloom ───────────────────────────────────────────────────────
// Objects tagged with this Three.js layer are processed by the bloom composer,
// giving them a glow without washing out the elevation dot colours.
// Assign to planes, trails, pings, and brackets.
export const BLOOM_LAYER = 1

// ── Elevation dots ────────────────────────────────────────────────────────
// Adjust STEP for dot density (lower = more dots, higher GPU cost).
// Adjust DOT_MAX_H to exaggerate or flatten the terrain height effect.
export const STEP       = 0.30    // lat/lon step in degrees
export const DOT_RADIUS = 0.0021  // radius of each sphere dot
export const DOT_MIN_H  = 0.0035  // minimum height above globe surface
export const DOT_MAX_H  = 0.07    // maximum height (reached when bump map = 1.0)

// ── Flight lanes ──────────────────────────────────────────────────────────
// Globe group scale is 0.9, so 1.018 × 0.9 ≈ 0.916 in world units.
export const PLANE_ORBIT_RADIUS = 1.018
