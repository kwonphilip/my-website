// Shared camera + rotation constants (duplicated between WireframeEarth and HoloEarth).
export { ZOOM_DEFAULT, ZOOM_IN, AXIAL_TILT, AXIAL_TILT_Z, IDLE_RETURN_MS } from '../../constants.js'

// ── Globe dimensions ──────────────────────────────────────────────────────
// Adjust these to change the overall globe size and camera framing.

export const RADIUS   = 0.9        // sphere radius in Three.js local units
export const BG_COLOR = 0x000000

// ── Dot overlay ───────────────────────────────────────────────────────────
// Increase DOT_SPHERE_SEGMENTS for a smoother hex-dot sphere (costs performance).
export const DOT_SPHERE_SEGMENTS = 128

// ── Flight lanes ──────────────────────────────────────────────────────────
// Radius at which planes orbit (~0.916 world units, just above the surface).
export const PLANE_ORBIT_RADIUS = RADIUS * 1.018
