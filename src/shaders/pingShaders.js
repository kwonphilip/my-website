/**
 * GLSL shaders for the pulsing ping rings drawn at nav-link locations.
 * Used by both WireframeEarth and HoloEarth via buildPingsAndBrackets.js.
 *
 * In HoloEarth the ping Points mesh is tagged with BLOOM_LAYER so the
 * selective bloom composer gives it a glow. In WireframeEarth the global
 * UnrealBloomPass handles bloom for all objects uniformly.
 *
 * Each ping renders as a gl_Points sprite containing:
 *   • A small solid center dot
 *   • Two expanding rings that fade as they grow (offset by half a cycle)
 *
 * ── Adjusting pings ───────────────────────────────────────────────────────
 *   Ring color     — update pingMat.uniforms.uColor.value (THREE.Color)
 *   Center color   — update pingMat.uniforms.uCenterColor.value (THREE.Color)
 *   Ring speed     — change the 0.45 multiplier in PING_VERT (higher = faster)
 *   Ring start/end — change 0.20 + t1 * 0.75 (inner radius → outer radius)
 *   Ring width     — change ringW (currently 0.07)
 *   Center size    — change the smoothstep thresholds (0.04, 0.25)
 *   Sprite size    — change 190.0 in gl_PointSize = 190.0 / -mvPos.z
 */

export const PING_VERT = /* glsl */`
  attribute float aPhase;
  uniform   float uTime;
  varying   float vRing;

  void main() {
    vRing = fract(uTime * 0.45 + aPhase);
    vec4 mvPos   = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = 190.0 / -mvPos.z;
    gl_Position  = projectionMatrix * mvPos;
  }
`

export const PING_FRAG = /* glsl */`
  uniform vec3  uColor;
  uniform vec3  uCenterColor;
  varying float vRing;

  void main() {
    vec2  uv   = gl_PointCoord - 0.5;
    float dist = length(uv) * 2.0;

    // Solid center dot
    float center = 1.0 - smoothstep(0.04, 0.25, dist);

    // Two expanding rings, offset by half a cycle so they alternate.
    float ringW = 0.07;
    float t1    = vRing;
    float t2    = fract(vRing + 0.5);

    float r1    = 0.20 + t1 * 0.75;
    float f1    = (1.0 - t1) * (1.0 - t1);    // fade as ring expands
    float ring1 = (1.0 - smoothstep(0.0, ringW, abs(dist - r1))) * f1;

    float r2    = 0.30 + t2 * 0.75;
    float f2    = (1.0 - t2) * (1.0 - t2);
    float ring2 = (1.0 - smoothstep(0.0, ringW, abs(dist - r2))) * f2;

    float rings = max(ring1, ring2);
    float value = max(center, rings);
    if (value < 0.01) discard;

    // Rings use uColor; center dot uses uCenterColor.
    // Update pingMat.uniforms.uColor / uCenterColor to recolour at runtime.
    vec3 col = mix(uColor, uCenterColor, center);
    gl_FragColor = vec4(col * value, value);
  }
`
