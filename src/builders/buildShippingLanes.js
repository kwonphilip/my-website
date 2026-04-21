/**
 * Builds the animated flight-lane geometry (3D airplane models + trailing lines)
 * and adds it to the given globe Group.
 *
 * Planes are rendered as 3D OBJ models oriented to face their direction of travel,
 * including pitch as they arc up and down over the globe surface.
 * Trails are GPU-driven line segments via a shared uTime uniform.
 *
 * Returns:
 *   lanesMat    — ShaderMaterial whose uniforms.uTime.value must be updated each frame
 *   lanesGroup  — Group for show/hide toggling
 *   updatePlanes — function(elapsedSeconds) — call each frame to move/orient 3D planes
 */

import * as THREE from 'three'
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js'
import modelUrl from '../assets/models/airplane/model.obj?url' // Airplane by Poly by Google [CC-BY] via Poly Pizza
import { TRAIL_N, TRAIL_DT, makeTrailVert, makeTrailFrag } from '../shaders/flightShaders.js'

const { PI, sin, cos, acos, max, min } = Math

const PLANE_SCALE  = 0.000050  // world-space size of each 3D airplane
const FLIGHT_SPEED = 0.065   // arc traversal rate (matches trail shader)
const LIFT_HEIGHT  = 0.08    // peak height above orbitRadius at t = 0.5

// Model has nose at +Z; rotate it to -Z so makeBasis sends nose → forward.
const BASE_ROT = new THREE.Matrix4().makeRotationY(PI)

function smoothstepVal(edge0, edge1, x) {
  const t = max(0, min(1, (x - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

// SLERP position along a great-circle arc with a sinusoidal lift above the surface.
function slerpPos(vA, vB, t, radius) {
  const omega = acos(max(-1, min(1, vA.dot(vB))))
  const sinO  = sin(omega)
  let pos
  if (sinO < 0.001) {
    pos = vA.clone().lerp(vB, t).normalize()
  } else {
    pos = vA.clone().multiplyScalar(sin((1 - t) * omega) / sinO)
    pos.addScaledVector(vB, sin(t * omega) / sinO)
  }
  return pos.multiplyScalar(radius + sin(t * PI) * LIFT_HEIGHT)
}

// Load OBJ once; resolve with the template Object3D.
// Materials are overridden after load, so MTL is not needed.
function loadAirplaneTemplate() {
  return new Promise((resolve) => {
    new OBJLoader().load(modelUrl, resolve)
  })
}

/**
 * @param {THREE.Group} globe        The globe group to add lanes to.
 * @param {number[][]}  routes       Array of [latA, lonA, latB, lonB].
 * @param {object}      options
 * @param {number}      options.orbitRadius  Plane flight radius in local units.
 * @param {number[]}    options.trailColor   [r, g, b] trail colour (0–1 each).
 * @param {number}      [options.bloomLayer]  Three.js layer to enable for bloom.
 * @param {number}      [options.planeColor]  Hex color for plane material (default 0xffffff).
 */
export function buildShippingLanes(globe, routes, { orbitRadius, trailColor, bloomLayer, planeColor = 0xffffff } = {}) {
  const nDots       = routes.length
  const nTrailVerts = nDots * TRAIL_N * 2

  // ── Per-trail-vertex attributes ─────────────────────────────────────────────
  const tStart   = new Float32Array(nTrailVerts * 3)
  const tEnd     = new Float32Array(nTrailVerts * 3)
  const tPhase   = new Float32Array(nTrailVerts)
  const tSegIdx  = new Float32Array(nTrailVerts)
  const tVertPos = new Float32Array(nTrailVerts)

  // Pre-computed route vectors (reused by both trail GPU attrs and plane CPU update).
  const routeVectors = routes.map(([latA, lonA, latB, lonB], ri) => {
    const φA = latA * PI / 180, λA = lonA * PI / 180
    const φB = latB * PI / 180, λB = lonB * PI / 180
    const vA = new THREE.Vector3(cos(φA)*sin(λA), sin(φA), cos(φA)*cos(λA)).normalize()
    const vB = new THREE.Vector3(cos(φB)*sin(λB), sin(φB), cos(φB)*cos(λB)).normalize()

    for (let k = 0; k < TRAIL_N; k++) {
      const base = (ri * TRAIL_N + k) * 2
      for (let v = 0; v < 2; v++) {
        const vi = base + v
        tStart  [vi*3] = vA.x; tStart  [vi*3+1] = vA.y; tStart  [vi*3+2] = vA.z
        tEnd    [vi*3] = vB.x; tEnd    [vi*3+1] = vB.y; tEnd    [vi*3+2] = vB.z
        tPhase  [vi]   = ri / routes.length
        tSegIdx [vi]   = k
        tVertPos[vi]   = v
      }
    }

    return { vA, vB, phase: ri / routes.length }
  })

  // ── Trail line segments ────────────────────────────────────────────────
  const trailGeo = new THREE.BufferGeometry()
  trailGeo.setAttribute('position',  new THREE.Float32BufferAttribute(new Float32Array(nTrailVerts * 3), 3))
  trailGeo.setAttribute('aStart',    new THREE.Float32BufferAttribute(tStart,   3))
  trailGeo.setAttribute('aEnd',      new THREE.Float32BufferAttribute(tEnd,     3))
  trailGeo.setAttribute('aPhase',    new THREE.Float32BufferAttribute(tPhase,   1))
  trailGeo.setAttribute('aSegIdx',   new THREE.Float32BufferAttribute(tSegIdx,  1))
  trailGeo.setAttribute('aVertPos',  new THREE.Float32BufferAttribute(tVertPos, 1))

  const trailTimeUniform = { value: 0 }
  const [r, g, b] = trailColor ?? [1, 1, 1]
  const trailMat = new THREE.ShaderMaterial({
    vertexShader:   makeTrailVert(orbitRadius),
    fragmentShader: makeTrailFrag(r, g, b),
    uniforms:       { uTime: trailTimeUniform },
    transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending, toneMapped: false,
  })
  const trailLines = new THREE.LineSegments(trailGeo, trailMat)
  if (bloomLayer != null) trailLines.layers.enable(bloomLayer)

  const lanesGroup = new THREE.Group()
  lanesGroup.add(trailLines)
  globe.add(lanesGroup)

  // ── 3D airplane models (loaded async) ─────────────────────────────────
  const planeMeshes = []
  const planeMat = new THREE.MeshBasicMaterial({
    color: planeColor,
    toneMapped: false,
    side: THREE.DoubleSide,
  })

  loadAirplaneTemplate().then((template) => {
    // Override all sub-mesh materials with glowing white.
    template.traverse((child) => {
      if (child.isMesh) child.material = planeMat
    })

    routeVectors.forEach((rv, ri) => {
      const plane = template.clone()
      plane.scale.setScalar(PLANE_SCALE)
      plane.visible = false

      if (bloomLayer != null) {
        plane.traverse(child => {
          child.layers.enable(bloomLayer)
        })
      }

      lanesGroup.add(plane)
      planeMeshes.push({ mesh: plane, ...rv })
    })
  })

  // ── Per-frame update for 3D plane positions and orientations ──────────
  const _forward = new THREE.Vector3()
  const _outward = new THREE.Vector3()
  const _right   = new THREE.Vector3()
  const _up      = new THREE.Vector3()
  const _mat4    = new THREE.Matrix4()

  function updatePlanes(elapsedTime) {
    for (const { mesh, vA, vB, phase } of planeMeshes) {
      const t = ((elapsedTime * FLIGHT_SPEED + phase) % 1 + 1) % 1
      const alpha = smoothstepVal(0, 0.12, t) * smoothstepVal(1, 0.98, t)

      if (alpha < 0.01) {
        mesh.visible = false
        continue
      }
      mesh.visible = true

      const pos  = slerpPos(vA, vB, t,       orbitRadius)
      const pos2 = slerpPos(vA, vB, t + 0.001, orbitRadius)

      mesh.position.copy(pos)

      // Build orientation so the plane nose (model -Z) faces the direction of travel,
      // with the plane's belly roughly toward the globe center.
      //
      // The model has: nose at -Z, right wing at +X, top at +Y.
      // We want: nose → forward, right wing → right, top → outward from globe.
      //
      // Correct right-handed basis for this mapping:
      //   col0 (model +X → world): right  = cross(forward, outward)
      //   col1 (model +Y → world): up     = cross(right, forward)
      //   col2 (model +Z → world): -forward   (so model -Z → +forward = nose direction)
      _forward.subVectors(pos2, pos).normalize()
      _outward.copy(pos).normalize()
      _right.crossVectors(_forward, _outward).normalize()
      _up.crossVectors(_right, _forward).normalize()

      _mat4.makeBasis(_right, _up, _forward.negate())
      _mat4.multiply(BASE_ROT)
      mesh.setRotationFromMatrix(_mat4)
    }
  }

  // lanesMat is trailMat — exposes uTime for the caller's animation loop.
  return { lanesMat: trailMat, lanesGroup, updatePlanes }
}
