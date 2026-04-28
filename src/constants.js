/**
 * Globe constants shared by both WireframeEarth and HoloEarth.
 * Each component's own constants.js re-exports these alongside its unique values.
 */

const { PI } = Math

// ── Camera ────────────────────────────────────────────────────────────────
export const ZOOM_DEFAULT = 2.9    // default camera Z distance
export const ZOOM_IN      = 2.3    // camera Z when a nav location is focused

// ── Globe rotation ────────────────────────────────────────────────────────
export const AXIAL_TILT    = 23 * PI / 180   // X tilt during auto-rotate
export const AXIAL_TILT_Z  = -15 * PI / 180  // Z tilt during auto-rotate
export const IDLE_RETURN_MS = 2000            // ms of drag inactivity before auto-rotate resumes
