/**
 * GLSL shaders for the 3D OBJ city building markers (buildCityBuildings.js).
 *
 * BUILDING_VERT  — passes normalised height and per-city phase offset to the fragment.
 * BUILDING_FRAG  — height gradient + travelling ripple wave effect.
 *
 * Uniforms (per ShaderMaterial instance):
 *   uColor       — base tint colour (THREE.Color)
 *   uRippleColor — colour of the travelling wave highlight (THREE.Color)
 *   uBaseOpacity — overall opacity multiplier (float)
 *   uYMin        — raw model-space Y minimum (set from bounding box after OBJ load)
 *   uYMax        — raw model-space Y maximum (set from bounding box after OBJ load)
 *   uTime        — elapsed seconds since scene start (updated each frame)
 *
 * Per-vertex attribute:
 *   aPhaseOffset — city-specific phase (0–1.4) so each building's ripple is offset.
 *
 * ── Visual levers ─────────────────────────────────────────────────────────
 *   uTime * 0.5          Ripple travel speed. Increase for faster waves; decrease
 *                        for a slow, contemplative pulse. Try 0.2–1.5.
 *   mod(..., 1.4)        Ripple period (seconds). Each wave completes a full trip
 *                        from base to top in 1.4 s, then restarts. Shorter = rapid
 *                        flicker; longer = slow sweep. Should match STAGGER_SEC in
 *                        buildCityBuildings.js so all cities stay visually in phase.
 *   exp(-dist*dist*80.0) Wave sharpness. 80.0 makes a tight Gaussian spike. Lower
 *                        (e.g. 20.0) gives a broad, soft glow; higher (200.0) gives
 *                        a razor-thin scanline.
 *   * 0.85               Peak wave brightness. 1.0 = fully saturated ripple colour
 *                        at the wave peak; reduce to soften the highlight.
 *   0.15 + 0.85*(1-vH)   Base opacity formula. Bottom of building (vHeight=0) has
 *                        opacity 0.15+0.85=1.0 (fully opaque); top (vHeight=1) has
 *                        0.15 (nearly transparent). This makes taller buildings fade
 *                        out toward the skyline for a holographic feel.
 */

export const BUILDING_VERT = /* glsl */`
  attribute float aPhaseOffset;
  varying float vHeight;
  varying float vPhaseOffset;
  uniform float uYMin;
  uniform float uYMax;
  void main() {
    vHeight      = clamp((position.y - uYMin) / (uYMax - uYMin), 0.0, 1.0);
    vPhaseOffset = aPhaseOffset;
    gl_Position  = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

export const BUILDING_FRAG = /* glsl */`
  varying float vHeight;
  varying float vPhaseOffset;
  uniform vec3  uColor;
  uniform vec3  uRippleColor;
  uniform float uBaseOpacity;
  uniform float uTime;
  void main() {
    // phase runs 0→1.4 and repeats; vPhaseOffset staggers each city so they
    // don't all ripple simultaneously. The wave position is vHeight-phase so
    // the pulse travels upward (from base toward the top of the building).
    float phase = mod(uTime * 0.5 + vPhaseOffset, 1.4);
    float dist  = vHeight - phase;
    // Gaussian spike: maximum at dist=0 (the wave front), falling off sharply on both sides.
    float wave  = exp(-dist * dist * 80.0) * 0.85;
    // Base alpha is highest at the building base (vHeight=0) and fades toward the top.
    // The wave term adds a bright highlight that travels up the building.
    float alpha = max(0.0, uBaseOpacity * (0.15 + 0.85 * (1.0 - vHeight)) + wave);
    // Lerp from the base color to the ripple color proportional to wave intensity.
    vec3  color = mix(uColor, uRippleColor, wave);
    gl_FragColor = vec4(color, alpha);
  }
`
