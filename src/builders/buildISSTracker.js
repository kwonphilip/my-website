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

const { PI, sin, cos, min } = Math

// Controls how far the ISS model is from the globe surface (for visibility, not to scale).
const ORBIT_FACTOR = 1.3

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

export function buildISSTracker(globe, globeRadius, { shiftLon = x => x } = {}) {
  const orbitRadius = globeRadius * ORBIT_FACTOR

  // ── 3D ISS model ──────────────────────────────────────────────────────────
  const issGroup = new THREE.Group()
  issGroup.visible = false
  globe.add(issGroup)

  const tex = new THREE.TextureLoader().load(issTexUrl)
  tex.flipY = false  // OBJ/MTL textures use DirectX UV convention
  const issMat = new THREE.MeshBasicMaterial({
    map: tex, toneMapped: false, side: THREE.DoubleSide,
  })

  new OBJLoader().load(issObjUrl, (obj) => {
    obj.traverse(child => { if (child.isMesh) child.material = issMat })
    obj.scale.setScalar(ISS_SCALE)
    issGroup.add(obj)
  })

  // "ISS" sprite label — always faces the camera, floats above the model.
  // issGroup local +Y = outward from globe (set in updateISS), so y=0.05 floats
  // the label radially above the model.
  const labelCanvas = document.createElement('canvas')
  labelCanvas.width = 128; labelCanvas.height = 40
  const lctx = labelCanvas.getContext('2d')
  lctx.clearRect(0, 0, 128, 40)
  lctx.fillStyle = '#88ccff'
  lctx.font = 'bold 22px "Courier New", monospace'
  lctx.textAlign = 'center'
  lctx.fillText('ISS', 64, 28)
  const labelTex = new THREE.CanvasTexture(labelCanvas)
  const labelMat = new THREE.SpriteMaterial({
    map: labelTex, transparent: true, toneMapped: false,
    blending: THREE.AdditiveBlending,
  })
  const label = new THREE.Sprite(labelMat)
  label.position.set(0, 0.06, 0)
  label.scale.set(0.08, 0.025, 1)
  issGroup.add(label)

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
    color: 0x4499ff, transparent: true, opacity: 0.40,
    depthTest: false, depthWrite: false,
    blending: THREE.AdditiveBlending, toneMapped: false,
  })
  const orbitLine = new THREE.Line(orbitGeo, orbitMat)
  orbitLine.visible = false
  orbitLine.renderOrder = 999  // always render on top
  globe.add(orbitLine)

  // ── Position state ────────────────────────────────────────────────────────
  let posA    = null   // older snapshot
  let posB    = null   // most recent snapshot
  let enabled = true   // toggled by setISSVisible

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
  }

  return {
    updateISS,
    setISSVisible(v) {
      enabled = v
      if (!v) {
        issGroup.visible  = false
        ring.visible      = false
        orbitLine.visible = false
      }
    },
    disposeISS() {
      clearInterval(pollId)
      tex.dispose()
      issMat.dispose()
      labelTex.dispose()
      labelMat.dispose()
      ringMat.dispose()
      ringGeo.dispose()
      orbitGeo.dispose()
      orbitMat.dispose()
    },
  }
}
