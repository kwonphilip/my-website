export const STAR_VERT = /* glsl */`
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

export const STAR_FRAG = /* glsl */`
  varying vec3 vDir;

  float hash(vec2 p) {
    vec2 q = fract(p * vec2(127.1, 311.7));
    q += dot(q, q + 45.32);
    return fract(q.x * q.y);
  }

  void main() {
    vec3 d = normalize(vDir);

    float lon = atan(d.z, d.x);
    float lat = asin(clamp(d.y, -1.0, 1.0));
    vec2 uv = vec2(lon / 6.2832 + 0.5, lat / 3.1416 + 0.5);

    float scale = 180.0;
    vec2 grid = uv * vec2(scale, scale * 0.5);
    vec2 cell = floor(grid);
    vec2 f    = fract(grid);

    float brightness = 0.0;
    float warmth     = 0.0;

    for (int j = -1; j <= 1; j++) {
      for (int i = -1; i <= 1; i++) {
        vec2 nb = cell + vec2(float(i), float(j));

        float h1 = hash(nb);
        float h2 = hash(nb + vec2(3.7,  8.1));
        float h3 = hash(nb + vec2(17.3, 4.9));
        float h4 = hash(nb + vec2(5.1, 22.6));

        if (h1 > 0.22) continue; // ~78% of cells are empty

        vec2  starPos = vec2(h2, h3);
        float dist    = length(f - vec2(float(i), float(j)) - starPos);
        float size    = 0.05 + h1 * 0.12;

        if (dist < size) {
          float b = pow(1.0 - dist / size, 3.0);
          float mag = b * (0.4 + h1 * 1.2); // brighter for rarer stars
          if (mag > brightness) {
            brightness = mag;
            warmth     = h4 * 2.0 - 1.0; // -1 cool blue, +1 warm yellow
          }
        }
      }
    }

    brightness = clamp(brightness, 0.0, 1.0);
    // Subtle warm/cool tint so stars aren't all identical white
    vec3 color = vec3(
      brightness * (1.0 + warmth * 0.15),
      brightness,
      brightness * (1.0 - warmth * 0.15)
    );
    gl_FragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
  }
`
