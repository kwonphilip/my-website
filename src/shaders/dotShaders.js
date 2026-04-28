/**
 * GLSL shaders for the hex-grid dot overlay on WireframeEarth's landmasses.
 *
 * WireframeEarth only — HoloEarth uses a CPU-built InstancedMesh of sphere dots
 * instead, coloured from terrain textures via imageUtils.js.
 *
 * The dots are rendered on a sphere mesh just above the surface. A land-mask
 * texture (built from topojson data) discards dots over ocean. Each dot has
 * an independently randomised:
 *   • Idle breath  — slow blue glow (fully desynchronised per dot)
 *   • Warm blink   — occasional amber flash (~20% duty cycle, 10–60 s period)
 *
 * ── Adjusting the dot appearance ─────────────────────────────────────────
 *   Grid density   — change COLS/ROWS constants below.
 *   Dot size       — change the `radius` line (currently 0.09 + rng * 0.03).
 *   Breath speed   — change `0.6 + rng3 * 1.2` (rad/s range for idle breath).
 *   Blink period   — change `10.0 + rng2 * 50.0` (seconds).
 *   Blink duty     — adjust the smoothstep thresholds (0.17, 0.20).
 *   Idle colour    — change vec3(0.05, 0.45, 1.0) for the blue base.
 *   Blink colour   — change vec3(1.0, 0.98, 0.82) for the warm amber flash.
 */

export const DOTS_VERT = /* glsl */`
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

export const DOTS_FRAG = /* glsl */`
  uniform sampler2D uLandMask;
  uniform float     uTime;
  varying vec2      vUv;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }

  void main() {
    // Land mask — UV offset aligns canvas projection to sphere geometry seam (lon=−90°).
    vec2 maskUv = vec2(fract(vUv.x + 0.25), vUv.y);
    if (texture2D(uLandMask, maskUv).r < 0.5) discard;

    // Hex grid: 600 cols × 300 rows ≈ 1.2° per cell in both axes (isotropic).
    // Increase COLS/ROWS for a denser grid; decrease for a sparser one.
    const float COLS = 600.0;
    const float ROWS = 300.0;
    vec2 scaled = vec2(vUv.x * COLS, vUv.y * ROWS);

    // Two-grid hex cell finder — returns offset from nearest hex center.
    vec2 r  = vec2(1.0, 1.7320508);  // (1, sqrt(3))
    vec2 h  = r * 0.5;
    vec2 ga = mod(scaled,     r) - h;
    vec2 gb = mod(scaled + h, r) - h;
    vec2 gv = dot(ga, ga) < dot(gb, gb) ? ga : gb;

    vec2  cellId = scaled - gv;  // hex center coords (stable, used for hashing)
    float rng    = hash(cellId);
    float rng2   = hash(cellId + vec2(43.7, 19.3));  // seed for blink period
    float rng3   = hash(cellId + vec2(91.2, 55.8));  // seed for breath speed

    // Idle breath — each dot has its own speed (0.6–1.8 rad/s) AND phase so
    // dots never re-synchronise even after long run times.
    float breathSpeed = 0.6 + rng3 * 1.2;
    float pulse = sin(uTime * breathSpeed + rng * 6.2831) * 0.5 + 0.5;

    // Organic warm blink — long period keeps lights on like a building window.
    // ~5% duty cycle → ~5% of dots lit at any moment.
    // To adjust % of dots lit, tweak the smoothstep thresholds (currently 0.02, 0.05 for a ~3% duty cycle with a 1% snap-on).
    // For a sharper on-off, increase the gap between thresholds; for a softer fade, decrease the gap.
    // Quick snap-on (1% of cycle), gradual fade-off (3% of cycle).
    float period   = 10.0 + rng2 * 50.0;   // 10–60 s (on-time 2–12 s)
    float cyclePos = fract(uTime / period + rng);
    float lit = smoothstep(0.0, 0.01, cyclePos) *
                (1.0 - smoothstep(0.02, 0.05, cyclePos));

    // Dot radius relative to hex inradius; subtle size breath on idle.
    float radius = 0.09 + rng * 0.1;  // max radius is ~0.12 of hex inradius (0.144 of hex width)
    radius *= 0.88 + 0.12 * pulse;

    float dist   = length(gv);
    float circle = 1.0 - smoothstep(radius - 0.010, radius + 0.010, dist);
    if (circle < 0.01) discard;

    // Back-facing dots are dimmed to read as "seen through the globe".
    float depth = gl_FrontFacing ? 1.0 : 0.8;

    // Idle: cyan glow
    float idleBright = (0.75 + 0.45 * pulse) * depth;
    vec3  blueColor  = vec3(0.07, 0.27, 1.0) * idleBright;

    // Blink: warm amber overrides blue while lit
    vec3 warmColor = vec3(1.0, 0.98, 0.82);
    vec3 color     = mix(blueColor, warmColor * depth, lit);

    float alpha = circle * (0.75 + 0.25 * lit) * depth;
    gl_FragColor = vec4(color * alpha, alpha * 0.9);
  }
`
