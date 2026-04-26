/**
 * Real-time ISS (International Space Station) tracker.
 *
 * Fetches live position from api.wheretheiss.at every 10 s and smoothly
 * extrapolates between updates so the model glides rather than jumps.
 *
 * Adds to the globe group:
 *   issGroup   — 3D ISS OBJ model oriented to face direction of travel
 *   ring       — sub-satellite ring on the globe surface (pulsing opacity)
 *   orbitLine  — full orbital-plane great-circle trace (always-on top, depth-ignored)
 *
 * Returns { updateISS(t), disposeISS() }
 */

import * as THREE from 'three'
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js'
import issObjUrl from '../assets/models/iss/InternationalSpaceStation.obj?url'
import issTexUrl from '../assets/models/iss/InternationalSpaceStation_BaseColor.png?url'
import { latLonToVec3 } from '../utils/geo.js'

const { PI, sin, cos, min, abs } = Math

// Controls how far the ISS model is from the globe surface (for visibility, not to scale).
const ORBIT_FACTOR = 1.3

// Dot-product threshold below which the ISS label is occluded by the globe.
// For a point at orbitRadius = globeRadius * ORBIT_FACTOR, the exact tangency
// condition (ray from camera to ISS grazes the globe surface) gives:
//   (_ln · _lc) = -sqrt(1 - (globeRadius/orbitRadius)²) = -sqrt(1 - 1/ORBIT_FACTOR²)
// This is independent of camera distance and exact for any zoom level.
const OCCLUSION_DOT = -Math.sqrt(1 - 1 / (ORBIT_FACTOR * ORBIT_FACTOR))

const PULSE_SWEEP_S  = 0.7            // seconds for one full rotation
const PULSE_DELAY_S  = 3          // pause at ISS before next pulse
const PULSE_CYCLE_S  = PULSE_SWEEP_S + PULSE_DELAY_S
const TRAIL_SEGS     = 64             // rings along the trail (GPU-computed)
const TUBE_SIDES     = 8              // vertices around the tube circumference
const TRAIL_SPAN     = PI * (5 / 3)  // ~300° — max trail arc

// World-space scale for the OBJ (model units are cm at ~1:200 scale).
// At RADIUS=0.9, this makes the ISS clearly visible; bloomPass amplifies brightness.
const ISS_SCALE = 0.0012

const POLL_MS    = 10_000   // position fetch interval
const ORBIT_SEGS = 128      // vertices in the orbit trace circle

/**
 * Returns the eastward unit vector at a given lat/lon in globe-local space.
 * Derived analytically: ∂(latLonToVec3)/∂lon = (cos(lat)*cos(lon), 0, -cos(lat)*sin(lon)),
 * normalised to (cos(lon), 0, -sin(lon)) — independent of latitude.
 * Used as a fallback forward direction before the second API poll arrives.
 */
function eastwardAt(lonDeg) {
  const λ = lonDeg * PI / 180
  return new THREE.Vector3(cos(λ), 0, -sin(λ))
}

export function buildISSTracker(globe, globeRadius, { shiftLon = x => x, container = null } = {}) {
  const orbitRadius = globeRadius * ORBIT_FACTOR

  // ── 3D ISS model ──────────────────────────────────────────────────────────
  const issGroup = new THREE.Group()
  issGroup.visible = false
  globe.add(issGroup)

  const tex = new THREE.TextureLoader().load(issTexUrl)
  tex.flipY = false  // OBJ/MTL textures use DirectX UV convention

  const issUniforms = {
    uMap:    { value: tex },
    uTime:   { value: 0 },
    uCenter: { value: new THREE.Vector3() },
    uRadius: { value: 1 },
  }
  const issMat = new THREE.ShaderMaterial({
    uniforms: issUniforms,
    vertexShader: /* glsl */`
      uniform vec3  uCenter;
      uniform float uRadius;
      varying vec2  vUv;
      varying float vDist;
      void main() {
        vUv   = uv;
        vDist = (position.z - uCenter.z) / uRadius;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */`
      uniform sampler2D uMap;
      uniform float     uTime;
      varying vec2  vUv;
      varying float vDist;
      void main() {
        vec4  texColor = texture2D(uMap, vUv);
        float phase    = mod(uTime * 0.7, 1.8);
        float halfW    = 0.1;
        float absD     = abs(vDist) - phase;
        float wave     = smoothstep(-halfW, 0.0, absD) * (1.0 - smoothstep(0.0, halfW, absD));
        vec3  ripple   = vec3(0.5, 0.88, 1.0);
        gl_FragColor   = vec4(texColor.rgb + ripple * wave * 8.0, texColor.a);
      }
    `,
    side: THREE.DoubleSide,
    toneMapped: false,
  })

  new OBJLoader().load(issObjUrl, (obj) => {
    const box = new THREE.Box3().setFromObject(obj)
    issUniforms.uCenter.value.copy(box.getCenter(new THREE.Vector3()))
    issUniforms.uRadius.value = (box.max.z - box.min.z) * 0.5
    obj.traverse(child => { if (child.isMesh) child.material = issMat })
    obj.scale.set(ISS_SCALE, ISS_SCALE * 2, ISS_SCALE)
    issGroup.add(obj)
  })

  // DOM label — same visual style as city labels (box + name + coords + tick).
  // Created only if a container element is provided.
  let issLabelEl = null, issNameEl = null, issCoordEl = null

  if (container) {
    issLabelEl = document.createElement('div')
    issLabelEl.style.cssText =
      'position:absolute;pointer-events:none;' +
      'transform:translate(-50%,calc(-100% - 22px));' +
      'padding:4px 9px 5px 9px;' +
      'background:rgba(0,12,30,0.82);' +
      'border:1px solid rgba(255,255,255,0.55);' +
      'border-radius:2px;white-space:nowrap;opacity:0;' +
      'will-change:transform,opacity;'

    issNameEl = document.createElement('div')
    issNameEl.style.cssText =
      'font-family:monospace;font-size:0.62rem;letter-spacing:0.14em;' +
      'text-transform:uppercase;color:rgba(255,255,255,0.95);font-weight:700;'
    issNameEl.textContent = 'Intl. Space Station'

    issCoordEl = document.createElement('div')
    issCoordEl.style.cssText =
      'font-family:monospace;font-size:0.54rem;letter-spacing:0.07em;' +
      'color:rgba(220,240,255,0.92);margin-top:2px;'

    const tick = document.createElement('div')
    tick.style.cssText =
      'position:absolute;bottom:-24px;left:50%;' +
      'transform:translateX(-50%);width:1px;height:24px;' +
      'background:rgba(255,255,255,0.9);'

    issLabelEl.appendChild(issNameEl)
    issLabelEl.appendChild(issCoordEl)
    issLabelEl.appendChild(tick)
    container.appendChild(issLabelEl)
  }

  // ── Sub-satellite ring on globe surface ───────────────────────────────────
  const ringGeo = new THREE.RingGeometry(globeRadius * 0.035, globeRadius * 0.050, 64)
  const ringMat = new THREE.MeshBasicMaterial({
    color: 0x44aaff, transparent: true, opacity: 0.5,
    side: THREE.DoubleSide, depthWrite: false,
    blending: THREE.AdditiveBlending, toneMapped: false,
  })
  const ring = new THREE.Mesh(ringGeo, ringMat)
  ring.visible = false
  globe.add(ring)

  // ── Orbit trace — great circle in the current orbital plane ───────────────
  // depthTest:false so the trace is always visible even on the far side of the globe.
  const orbitBuf = new Float32Array((ORBIT_SEGS + 1) * 3)
  const orbitGeo = new THREE.BufferGeometry()
  orbitGeo.setAttribute('position', new THREE.Float32BufferAttribute(orbitBuf, 3))
  const orbitMat = new THREE.LineBasicMaterial({
    color: 0xb8e0ff, transparent: true, opacity: 0.40,
    depthTest: false, depthWrite: false,
    blending: THREE.AdditiveBlending, toneMapped: false,
  })
  const orbitLine = new THREE.Line(orbitGeo, orbitMat)
  orbitLine.visible = false
  orbitLine.renderOrder = 999  // always render on top
  globe.add(orbitLine)

  // ── Comet trail — tapered tube mesh ──────────────────────────────────────
  // (TRAIL_SEGS+1) rings of TUBE_SIDES verts; radius = uTubeRadius*vFade so
  // the tube is fattest at the head and tapers to a point at the tail.
  // Cross-section axes: e1 = radial outward, e2 = orbital-plane normal.
  const nTubeVerts = (TRAIL_SEGS + 1) * TUBE_SIDES
  const segIdxBuf  = new Float32Array(nTubeVerts)
  const sideIdxBuf = new Float32Array(nTubeVerts)
  for (let i = 0; i <= TRAIL_SEGS; i++) {
    for (let j = 0; j < TUBE_SIDES; j++) {
      const vi = i * TUBE_SIDES + j
      segIdxBuf[vi]  = i
      sideIdxBuf[vi] = j
    }
  }
  const trailIdx = new Uint16Array(TRAIL_SEGS * TUBE_SIDES * 6)
  let tIdx = 0
  for (let i = 0; i < TRAIL_SEGS; i++) {
    for (let j = 0; j < TUBE_SIDES; j++) {
      const j1 = (j + 1) % TUBE_SIDES
      const a = i * TUBE_SIDES + j,  b = i * TUBE_SIDES + j1
      const c = (i+1) * TUBE_SIDES + j, d = (i+1) * TUBE_SIDES + j1
      trailIdx[tIdx++] = a; trailIdx[tIdx++] = c; trailIdx[tIdx++] = b
      trailIdx[tIdx++] = b; trailIdx[tIdx++] = c; trailIdx[tIdx++] = d
    }
  }
  const trailGeo = new THREE.BufferGeometry()
  trailGeo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(nTubeVerts * 3), 3))
  trailGeo.setAttribute('aSegIdx',  new THREE.Float32BufferAttribute(segIdxBuf,  1))
  trailGeo.setAttribute('aSideIdx', new THREE.Float32BufferAttribute(sideIdxBuf, 1))
  trailGeo.setIndex(new THREE.BufferAttribute(trailIdx, 1))

  const trailUniforms = {
    uOut:         { value: new THREE.Vector3() },
    uFwd:         { value: new THREE.Vector3() },
    uNormal:      { value: new THREE.Vector3() },
    uOrbitRadius: { value: orbitRadius },
    uTubeRadius:  { value: globeRadius * 0.002 },
    uTheta:       { value: 0 },
    uSpan:        { value: 0 },
  }
  const trailMat = new THREE.ShaderMaterial({
    uniforms: trailUniforms,
    vertexShader: /* glsl */`
      attribute float aSegIdx;
      attribute float aSideIdx;
      uniform vec3  uOut;
      uniform vec3  uFwd;
      uniform vec3  uNormal;
      uniform float uOrbitRadius;
      uniform float uTubeRadius;
      uniform float uTheta;
      uniform float uSpan;
      varying float vFade;
      void main() {
        float t      = aSegIdx / ${TRAIL_SEGS}.0;
        vFade        = 1.0 - t;
        float theta  = uTheta - t * uSpan;
        float c = cos(theta), s = sin(theta);
        vec3 center  = uOrbitRadius * (uOut * c + uFwd * s);
        vec3 e1      = uOut * c + uFwd * s;          // radial outward (unit)
        vec3 e2      = uNormal;                       // orbital-plane normal (unit)
        float phi    = aSideIdx * 6.28318530 / ${TUBE_SIDES}.0;
        float r      = uTubeRadius * vFade;
        vec3 pos     = center + r * (e1 * cos(phi) + e2 * sin(phi));
        gl_Position  = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
      }
    `,
    fragmentShader: /* glsl */`
      varying float vFade;
      void main() {
        if (vFade < 0.01) discard;
        gl_FragColor = vec4(vec3(0.5, 0.88, 1.0) * vFade, vFade * 0.9);
      }
    `,
    transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending, toneMapped: false,
  })
  const trailLine = new THREE.Mesh(trailGeo, trailMat)
  trailLine.renderOrder = 999
  trailLine.visible = false
  globe.add(trailLine)

  // ── Position state ────────────────────────────────────────────────────────
  let posA       = null   // older snapshot
  let posB       = null   // most recent snapshot
  let enabled    = true   // toggled by setISSVisible
  let _curLat    = 0
  let _curLon    = 0

  async function fetchISS() {
    try {
      const data = await fetch('https://api.wheretheiss.at/v1/satellites/25544')
        .then(r => r.json())
      const snap = { lat: data.latitude, lon: data.longitude, ts: Date.now() }
      posA = posB ? { ...posB } : { ...snap }
      posB = snap
    } catch (e) {
      console.warn('[ISS] fetch failed:', e.message)
    }
  }

  fetchISS()
  // Quick second fetch to establish true orbital direction before the normal interval kicks in.
  const initPollId = setTimeout(fetchISS, 2000)
  const pollId = setInterval(fetchISS, POLL_MS)

  // ── Pre-allocated scratch objects ─────────────────────────────────────────
  const _out  = new THREE.Vector3()
  const _fwd  = new THREE.Vector3()
  const _rgt  = new THREE.Vector3()
  const _mat4 = new THREE.Matrix4()
  const _pA   = new THREE.Vector3()
  const _pB   = new THREE.Vector3()
  const _zUp  = new THREE.Vector3(0, 0, 1)  // default ring normal

  function updateISS(t) {
    if (!posB || !enabled) return
    issUniforms.uTime.value = t

    // Interpolate/extrapolate between the two most recent position snapshots.
    const alpha = min(2.0, (Date.now() - posB.ts) / POLL_MS)

    // Handle antimeridian wrap (longitude ±180°).
    let dLon = posB.lon - posA.lon
    if (dLon >  180) dLon -= 360
    if (dLon < -180) dLon += 360

    const lat = posB.lat + (posB.lat - posA.lat) * alpha
    const lon = shiftLon(posB.lon + dLon * alpha)

    _pB.copy(latLonToVec3(lat, lon, orbitRadius))
    issGroup.position.copy(_pB)
    issGroup.visible = true
    _curLat = lat
    _curLon = lon

    // Radial outward direction at current position.
    _out.copy(_pB).normalize()

    // Tangential forward direction: delta(posA→posB) projected onto the tangent plane.
    _pA.copy(latLonToVec3(posA.lat, shiftLon(posA.lon), orbitRadius))
    const delta = _pB.clone().sub(_pA)
    _fwd.copy(delta).addScaledVector(_out, -delta.dot(_out)).normalize()

    // Fall back to the eastward direction on the first load (posA===posB, delta≈0).
    const hasTrueFwd = _fwd.lengthSq() > 0.0001
    if (!hasTrueFwd) {
      _fwd.copy(eastwardAt(lon))  // lon is already shifted here
    }

    // Orient issGroup:
    //   model +X → forward (direction of travel; X = ±14 units = module axis)
    //   model +Y → outward (radially away from globe; the "up" direction for the ISS)
    //   model +Z → starboard (Z = ±28 units = main truss / solar panels perpendicular to velocity)
    _rgt.crossVectors(_fwd, _out).normalize()
    _mat4.makeBasis(_fwd, _out, _rgt)
    issGroup.setRotationFromMatrix(_mat4)

    // Sub-satellite ring: flat on globe surface, normal aligned with outward.
    const surfPos = latLonToVec3(lat, lon, globeRadius * 1.001)
    ring.position.copy(surfPos)
    ring.quaternion.setFromUnitVectors(_zUp, _out)
    ring.visible = true
    ringMat.opacity = 0.35 + 0.15 * sin(t * 2.5)

    // Orbit trace: full great circle in the current orbital plane.
    // P(θ) = orbitRadius * (outward·cos θ + forward·sin θ)
    orbitLine.visible = true
    const posAttr = orbitGeo.attributes.position
    for (let i = 0; i <= ORBIT_SEGS; i++) {
      const θ = (i / ORBIT_SEGS) * 2 * PI
      const c = cos(θ), s = sin(θ)
      posAttr.setXYZ(i,
        (_out.x * c + _fwd.x * s) * orbitRadius,
        (_out.y * c + _fwd.y * s) * orbitRadius,
        (_out.z * c + _fwd.z * s) * orbitRadius,
      )
    }
    posAttr.needsUpdate = true

    // Pulse: one full rotation in PULSE_SWEEP_S, then silent for PULSE_DELAY_S.
    // cycleT goes 0→1 during the sweep; ≥1 means we're in the delay gap.
    const cycleT = (t % PULSE_CYCLE_S) / PULSE_SWEEP_S
    if (cycleT >= 1.0) {
      trailLine.visible = false
      return
    }

    // θ=0 in the orbit parameterization maps to _out * orbitRadius = ISS position,
    // so the pulse always starts and ends at the ISS.
    const θDot = cycleT * 2 * PI

    // Trail grows from zero at launch, caps at TRAIL_SPAN — never wraps past origin.
    // All math is GPU-side; just push the four uniforms.
    trailUniforms.uOut.value.copy(_out)
    trailUniforms.uFwd.value.copy(_fwd)
    trailUniforms.uNormal.value.copy(_rgt)
    trailUniforms.uTheta.value = θDot
    trailUniforms.uSpan.value  = min(θDot, TRAIL_SPAN)
    trailLine.visible = true
  }

  // ── DOM label projection ──────────────────────────────────────────────────
  const _lv = new THREE.Vector3()
  const _ln = new THREE.Vector3()
  const _lc = new THREE.Vector3()

  function formatCoords(lat, lon) {
    const la = `${abs(lat).toFixed(1)}°${lat >= 0 ? 'N' : 'S'}`
    const lo = `${abs(lon).toFixed(1)}°${lon >= 0 ? 'E' : 'W'}`
    return `${la}  ${lo}`
  }

  function updateISSLabel(globeGroup, camera, domEl) {
    if (!issLabelEl) return
    if (!enabled || !posB) {
      issLabelEl.style.opacity = '0'
      return
    }

    const rect = domEl.getBoundingClientRect()
    const W = rect.width, H = rect.height
    if (!W || !H) return

    globeGroup.updateWorldMatrix(true, false)

    // World-space position of the ISS.
    _lv.copy(latLonToVec3(_curLat, _curLon, orbitRadius))
    _lv.applyMatrix4(globeGroup.matrixWorld)

    // Occlusion: hide when ISS is on the back hemisphere (dot < 0 means facing away).
    _ln.copy(_lv).normalize()
    _lc.subVectors(camera.position, _lv).normalize()
    if (_ln.dot(_lc) < OCCLUSION_DOT) {
      issLabelEl.style.opacity = '0'
      return
    }

    _lv.project(camera)
    const sx = (_lv.x *  0.5 + 0.5) * W
    const sy = (1 - (_lv.y * 0.5 + 0.5)) * H

    issLabelEl.style.left = `${sx}px`
    issLabelEl.style.top  = `${sy}px`
    issNameEl.textContent  = 'Intl. Space Station'
    issCoordEl.textContent = formatCoords(_curLat, _curLon)
    issLabelEl.style.opacity = '1'
  }

  return {
    updateISS,
    updateISSLabel,
    issGroup,
    issRing: ring,
    setISSVisible(v) {
      enabled = v
      if (!v) {
        issGroup.visible  = false
        ring.visible      = false
        orbitLine.visible = false
        trailLine.visible = false
        if (issLabelEl) issLabelEl.style.opacity = '0'
      }
    },
    disposeISS() {
      clearTimeout(initPollId)
      clearInterval(pollId)
      tex.dispose()
      issMat.dispose()
      ringMat.dispose()
      ringGeo.dispose()
      orbitGeo.dispose()
      orbitMat.dispose()
      trailGeo.dispose()
      trailMat.dispose()
      issLabelEl?.parentNode?.removeChild(issLabelEl)
    },
  }
}
