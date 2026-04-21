/**
 * GLSL shaders for the animated plane icons and flight trail lines.
 * Used by both EarthGlobe and HoloEarth via buildShippingLanes.js.
 *
 * Each route has one "dot" (the plane icon, rendered as a gl_Points sprite)
 * and TRAIL_N line segments behind it forming a fading tail.
 *
 * The two globes differ in:
 *   • Trail colour  — EarthGlobe uses cyan [0.5, 0.88, 1.0]; HoloEarth uses white [1, 1, 1].
 *                     Set via the trailColor option in buildShippingLanes.js.
 *   • Orbit radius  — EarthGlobe: RADIUS * 1.018 ≈ 0.916 local units.
 *                     HoloEarth:  1.018 local units (globe scale=0.9, so same world size).
 *                     Set via the orbitRadius option in buildShippingLanes.js.
 *   • Bloom         — HoloEarth tags planes and trails with BLOOM_LAYER for selective bloom.
 *                     EarthGlobe relies on its global UnrealBloomPass instead.
 *   • Routes        — HoloEarth passes shiftRoutesForHolo(ROUTES) to compensate for its
 *                     +π Y-rotation; EarthGlobe passes ROUTES directly.
 *                     See src/data/routes.js.
 *
 * ── Adjusting the trail ──────────────────────────────────────────────────
 *   Trail LENGTH  — increase TRAIL_N (more segments = longer tail).
 *                   Each segment covers TRAIL_DT arc-time, so the total
 *                   covered arc = TRAIL_N × TRAIL_DT. At the default values
 *                   the tail spans ~28.8% of the animation cycle.
 *
 *   Trail SPEED   — change the 0.065 multiplier in makeTrailVert
 *                   (higher = faster).  All routes share the same speed.
 *
 *   Trail FADE    — the smoothstep(1.0, 0.72, tHead) in makeTrailVert controls
 *                   how early the tail starts fading before the dot completes
 *                   its arc. Lower second value = earlier fade-out.
 *
 *   Plane SIZE    — change PLANE_SCALE in buildShippingLanes.js.
 *
 *   LIFT HEIGHT   — the 0.08 multiplier in sin(t * π) * 0.08 in both shaders
 *                   controls how high above the surface planes arc.
 */

// ── Trail configuration ──────────────────────────────────────────────────

/**
 * Number of line segments per trail.
 * Increase to make trails longer; decrease to shorten them.
 * Each segment covers TRAIL_DT units of arc time.
 */
export const TRAIL_N = 36

/**
 * Arc-time covered by each trail segment.
 * Total trail arc = TRAIL_N × TRAIL_DT.
 */
export const TRAIL_DT = 0.008

// ── Trail vertex shader ──────────────────────────────────────────────────

/**
 * Returns the trail vertex shader source for a given orbit radius.
 *
 * @param {number} orbitRadius  Radius (in local globe units) at which planes fly.
 *   EarthGlobe  uses ~0.916 (RADIUS * 1.018, where RADIUS = 0.9).
 *   HoloEarth   uses ~1.018 (globe local-space, scaled to 0.9 in world space).
 */
export function makeTrailVert(orbitRadius) {
  return /* glsl */`
    attribute vec3  aStart;
    attribute vec3  aEnd;
    attribute float aPhase;
    attribute float aSegIdx;   // segment index (same for both verts of a segment)
    attribute float aVertPos;  // 0 = near end of segment, 1 = far end
    uniform   float uTime;
    varying   float vFade;

    void main() {
      float tHead = fract(uTime * 0.065 + aPhase);

      // Clip the whole segment when its far vertex would wrap via fract.
      // aSegIdx is shared by both vertices so both get the same decision —
      // the segment is either fully valid or fully clipped, never a partial chord.
      if ((aSegIdx + 1.0) * ${TRAIL_DT} >= tHead) {
        vFade = 0.0;
        gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
        return;
      }

      // Fade the entire trail in/out at the start/end of each arc.
      float dotAlpha = smoothstep(0.0, 0.12, tHead) * smoothstep(1.0, 0.72, tHead);
      // Per-vertex linear fade from head → tail; GPU interpolates along each segment.
      vFade = max(0.0, 1.0 - (aSegIdx + aVertPos) / ${TRAIL_N - 1}.0) * dotAlpha;

      float offset = (aSegIdx + aVertPos) * ${TRAIL_DT};
      float t      = tHead - offset;   // guaranteed in [0, tHead], no fract needed

      // Spherical linear interpolation (SLERP) along the great-circle arc.
      float omega = acos(clamp(dot(aStart, aEnd), -1.0, 1.0));
      vec3  pos;
      if (omega < 0.001) {
        pos = aStart;
      } else {
        float s = sin(omega);
        pos = (sin((1.0 - t) * omega) / s) * aStart
            + (sin(t * omega)          / s) * aEnd;
      }

      // Arc the plane above the surface (peaks at t=0.5).
      float lift = sin(t * 3.14159265) * 0.08;
      pos = normalize(pos) * (${orbitRadius} + lift);
      gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
    }
  `
}

// ── Trail fragment shader ─────────────────────────────────────────────────

/**
 * Returns the trail fragment shader source.
 * @param {number} r  Red channel of the trail colour (0–1).
 * @param {number} g  Green channel.
 * @param {number} b  Blue channel.
 *   EarthGlobe uses cyan  (0.5, 0.88, 1.0).
 *   HoloEarth  uses white (1.0, 1.0,  1.0).
 */
export function makeTrailFrag(r, g, b) {
  return /* glsl */`
    varying float vFade;
    void main() {
      if (vFade < 0.01) discard;
      gl_FragColor = vec4(vec3(${r}, ${g}, ${b}) * vFade, vFade * 0.9);
    }
  `
}

