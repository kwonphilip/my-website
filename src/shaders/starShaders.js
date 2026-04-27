/**
 * GLSL shaders for the procedurally generated star-field skybox (both globes).
 *
 * A large sphere wraps the entire scene; these shaders run on its inner surface.
 * Stars are placed procedurally — no texture atlas or precomputed star catalog —
 * so the field looks unique at every view angle without any asset load cost.
 *
 * ── Visual levers ─────────────────────────────────────────────────────────
 *   scale = 180          Grid density. Higher → more, smaller cells → more stars.
 *                        Lower → fewer, larger stars. Try 120–240.
 *   h1 > 0.22            Star density threshold. 0.22 means ~22% of cells
 *                        contain a star. Raise toward 1.0 for a sparser sky;
 *                        lower toward 0.0 for a denser, milky-way-style sky.
 *   size = 0.05 + h1*0.12  Star radius range. Minimum 0.05, maximum 0.17.
 *                        Increase the multiplier (0.12) for more size variation.
 *   mag  = b*(0.4 + h1*1.2) Brightness range. Minimum ~0.4, maximum ~1.6 (clamped).
 *                        Increase 1.2 for more contrast between faint and bright stars.
 *   warmth tint ±0.15    Color variation. The ±0.15 multiplier controls how
 *                        blue/yellow stars can drift from pure white. 0 = all white;
 *                        0.4 = noticeably colorful (like a real star field).
 */

export const STAR_VERT = /* glsl */`
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

export const STAR_FRAG = /* glsl */`
  varying vec3 vDir;

  // Pseudo-random float in [0,1] from a 2D integer cell coordinate.
  // Uses two rounds of dot-product folding to spread entropy across the mantissa.
  // Different seed offsets (3.7/8.1, 17.3/4.9, 5.1/22.6) give decorrelated draws
  // from the same cell — used to independently randomise star position, size, and color.
  float hash(vec2 p) {
    vec2 q = fract(p * vec2(127.1, 311.7));
    q += dot(q, q + 45.32);
    return fract(q.x * q.y);
  }

  void main() {
    vec3 d = normalize(vDir);

    // Convert sphere direction to equirectangular UV so we can tile a grid over it.
    float lon = atan(d.z, d.x);
    float lat = asin(clamp(d.y, -1.0, 1.0));
    vec2 uv = vec2(lon / 6.2832 + 0.5, lat / 3.1416 + 0.5);

    // Divide the UV plane into a grid of cells. The 0.5 on the Y axis compensates
    // for equirectangular distortion: at the poles, cells are squashed, so halving
    // the row count keeps stars roughly equally spaced in solid angle everywhere.
    float scale = 180.0;
    vec2 grid = uv * vec2(scale, scale * 0.5);
    vec2 cell = floor(grid);   // integer cell index
    vec2 f    = fract(grid);   // fractional position within the current cell

    float brightness = 0.0;
    float warmth     = 0.0;

    // Check the current cell AND all 8 neighbours. Without this a star placed near
    // a cell edge would be clipped — we'd see only one half of the disc.
    for (int j = -1; j <= 1; j++) {
      for (int i = -1; i <= 1; i++) {
        vec2 nb = cell + vec2(float(i), float(j));

        // Four independent hash draws per cell, each seeded differently so the
        // values are uncorrelated: h1=presence/brightness, h2/h3=position, h4=color.
        float h1 = hash(nb);
        float h2 = hash(nb + vec2(3.7,  8.1));
        float h3 = hash(nb + vec2(17.3, 4.9));
        float h4 = hash(nb + vec2(5.1, 22.6));

        if (h1 > 0.22) continue; // ~78% of cells are empty — controls star density

        // Place the star at a random position within its cell.
        vec2  starPos = vec2(h2, h3);
        float dist    = length(f - vec2(float(i), float(j)) - starPos);
        float size    = 0.05 + h1 * 0.12; // radius: rare stars (low h1) are smaller

        if (dist < size) {
          // Cubic falloff so the star has a bright core and soft edges.
          float b = pow(1.0 - dist / size, 3.0);
          // Rarer stars (lower h1) are brighter — mirrors the real inverse relationship
          // between star abundance and luminosity (IMF).
          float mag = b * (0.4 + h1 * 1.2);
          // Keep only the brightest contribution if cells overlap.
          if (mag > brightness) {
            brightness = mag;
            warmth     = h4 * 2.0 - 1.0; // -1 = cool blue, 0 = white, +1 = warm yellow
          }
        }
      }
    }

    brightness = clamp(brightness, 0.0, 1.0);
    // Subtle warm/cool tint so stars aren't all identical white — the ±0.15 multiplier
    // shifts the red and blue channels in opposite directions by up to 15%.
    vec3 color = vec3(
      brightness * (1.0 + warmth * 0.15),
      brightness,
      brightness * (1.0 - warmth * 0.15)
    );
    gl_FragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
  }
`
