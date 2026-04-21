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
    float phase = mod(uTime * 0.5 + vPhaseOffset, 1.4);
    float dist  = vHeight - phase;
    float wave  = exp(-dist * dist * 80.0) * 0.85;
    float alpha = max(0.0, uBaseOpacity * (0.15 + 0.85 * (1.0 - vHeight)) + wave);
    vec3  color = mix(uColor, uRippleColor, wave);
    gl_FragColor = vec4(color, alpha);
  }
`
