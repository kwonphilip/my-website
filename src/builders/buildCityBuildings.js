/**
 * Builds the city marker geometry using 3D OBJ skyscraper models and adds
 * them to the given globe Group.
 *
 * Three skyscraper models are used, assigned by tier (population):
 *   Tier 0 (≥15M pop) — Skyscrapers 1, 2, 3 in a cluster; S1 is tallest.
 *   Tier 1 (≥6M  pop) — Skyscrapers 2 and 3 side by side; S2 is taller.
 *   Tier 2 (<6M  pop) — Skyscraper 3 only.
 *
 * Models are loaded asynchronously (OBJLoader); buildings appear once loading
 * resolves. Each city gets its own THREE.Group (citySubGroups[i]) so individual
 * cities can be hidden without affecting others.
 *
 * Returns { cityGroup, citySubGroups, buildingMats }.
 *
 * Credits:
 *   Skyscraper 1 — Skyscraper by Jarlan Perez [CC-BY] via Poly Pizza
 *   Skyscraper 2 — Low Building by Kenney (CC0)
 *   Skyscraper 3 — Skyscraper by Kenney (CC0)
 */

import * as THREE from 'three'
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js'
import { BUILDING_VERT, BUILDING_FRAG } from '../shaders/buildingShaders.js'

import s1Url from '../assets/models/buildings/skyscraper1.obj?url' // Skyscraper by Jarlan Perez [CC-BY] via Poly Pizza
import s2Url from '../assets/models/buildings/skyscraper2.obj?url' // Low Building by Kenney (CC0)
import s3Url from '../assets/models/buildings/skyscraper3.obj?url' // Skyscraper by Kenney (CC0)

const getTier = pop => pop >= 15 ? 0 : pop >= 6 ? 1 : 2

// ── Scale / placement config per tier ────────────────────────────────────
//
// Each entry: { m, scale, yFloor, rt, fwd }
//   m:      model index (0=S1, 1=S2, 2=S3)
//   scale:  uniform scale applied to the model
//   yFloor: raw model Y-min (lifted by yFloor*scale along N so base sits on surface)
//   rt:     offset along east tangent  (globe-local units)
//   fwd:    offset along north tangent (globe-local units)
//
// Target heights after scale (globe units, RADIUS=0.9):
//   S1 raw span 3.08 → scale 0.0179 → height ≈ 0.055
//   S2 tier0   span 2.10 → scale 0.0167 → height ≈ 0.035
//   S2 tier1   span 2.10 → scale 0.0214 → height ≈ 0.045
//   S3         span 3.15 → scale 0.0095 → height ≈ 0.030
//
// S1 has Y-min = −1.72 in model space (not zero-based), so yFloor = 1.72.
// S2 and S3 have Y-min = 0, so yFloor = 0.

// scaleXZ controls footprint width independently from height (scale = Y only).
// Target widths: S1=0.014, S2=0.010, S3=0.007 globe units.
// scaleXZ = target_width / raw_model_XZ_span  (S1 span 0.65, S2 0.50, S3 1.24)
const S1_XZ = 0.0300   // 0.65 * 0.0300 ≈ 0.020
const S2_XZ = 0.0280   // 0.50 * 0.0280 = 0.014
const S3_XZ = 0.0099   // 1.24 * 0.0099 ≈ 0.012

const TIER_LAYOUT = [
  // tier 0: S1 front-center (tallest), S2 back-left, S3 back-right
  [
    { m: 0, scale: 0.0120, scaleXZ: S1_XZ, yFloor: 1.72, rt:  0.000, fwd:  0.009 },
    { m: 1, scale: 0.0112, scaleXZ: S2_XZ, yFloor: 0.00, rt: -0.007, fwd: -0.007 },
    { m: 2, scale: 0.0086, scaleXZ: S3_XZ, yFloor: 0.00, rt:  0.007, fwd: -0.007 },
  ],
  // tier 1: S2 left (taller), S3 right
  [
    { m: 1, scale: 0.0143, scaleXZ: S2_XZ, yFloor: 0.00, rt: -0.007, fwd: 0 },
    { m: 2, scale: 0.0086, scaleXZ: S3_XZ, yFloor: 0.00, rt:  0.007, fwd: 0 },
  ],
  // tier 2: S3 center
  [
    { m: 2, scale: 0.0086, scaleXZ: S3_XZ, yFloor: 0.00, rt: 0, fwd: 0 },
  ],
]

function loadOBJ(url) {
  return new Promise(resolve => new OBJLoader().load(url, resolve))
}

/**
 * @param {THREE.Group}  globe   The globe group to add markers to.
 * @param {number[][]}   cities  Array of [lat, lon, population].
 * @param {object}       options
 * @param {function}     options.getBase  (lat, lon) → THREE.Vector3 surface point.
 * @param {number}       [options.buildingColor]  Hex color for model material.
 * @returns {{ cityGroup: THREE.Group, citySubGroups: THREE.Group[], buildingMats: THREE.ShaderMaterial[] }}
 */
export function buildCityBuildings(globe, cities, {
  getBase,
  buildingColor = 0x88aacc,
  rippleColor   = 0xffffff,
  opacityScale  = 1.0,
} = {}) {
  const cityGroup     = new THREE.Group()
  const citySubGroups = []

  // Pre-build one THREE.Group per city; add them to the scene immediately so
  // the caller can toggle .visible before the async load resolves.
  for (const _ of cities) {
    const sub = new THREE.Group()
    citySubGroups.push(sub)
    cityGroup.add(sub)
  }
  globe.add(cityGroup)

  function makeGradientMat(baseOpacity) {
    return new THREE.ShaderMaterial({
      uniforms: {
        uColor:       { value: new THREE.Color(buildingColor) },
        uRippleColor: { value: new THREE.Color(rippleColor) },
        uBaseOpacity: { value: baseOpacity },
        uYMin:        { value: 0 },
        uYMax:        { value: 1 },
        uTime:        { value: 0 },
      },
      vertexShader:   BUILDING_VERT,
      fragmentShader: BUILDING_FRAG,
      transparent:    true,
      blending:       THREE.AdditiveBlending,
      depthWrite:     false,
      side:           THREE.DoubleSide,
      toneMapped:     false,
    })
  }

  const wireMat = new THREE.LineBasicMaterial({
    color: buildingColor,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    opacity: 0.20,
    toneMapped: false,
  })

  const buildingMats = [makeGradientMat(0.40 * opacityScale), makeGradientMat(0.60 * opacityScale), makeGradientMat(0.72 * opacityScale)]
  const worldY = new THREE.Vector3(0, 1, 0)

  // Load all three templates in parallel, then populate city sub-groups.
  Promise.all([loadOBJ(s1Url), loadOBJ(s2Url), loadOBJ(s3Url)]).then(templates => {
    for (let ti = 0; ti < templates.length; ti++) {
      const box = new THREE.Box3().setFromObject(templates[ti])
      buildingMats[ti].uniforms.uYMin.value = box.min.y
      buildingMats[ti].uniforms.uYMax.value = box.max.y
      templates[ti].traverse(child => { if (child.isMesh) child.material = buildingMats[ti] })
    }

    const orientMat = new THREE.Matrix4()
    const rt        = new THREE.Vector3()
    const fwd       = new THREE.Vector3()
    const worldZ    = new THREE.Vector3(0, 0, 1)

    for (let ci = 0; ci < cities.length; ci++) {
      const [lat, lon, pop] = cities[ci]
      const base = getBase(lat, lon)

      // Tangent frame at the surface point.
      // At the poles, N ≈ ±worldY so Gram-Schmidt against worldY collapses to
      // zero — fall back to worldZ as the reference axis instead.
      const N = base.clone().normalize()
      const NdotY = N.dot(worldY)
      if (Math.abs(NdotY) > 0.999) {
        fwd.copy(worldZ)
      } else {
        fwd.copy(worldY).addScaledVector(N, -NdotY).normalize()
      }
      rt.crossVectors(N, fwd).normalize()

      // Rotation: model +Y → world N, model +X → world rt, model +Z → world fwd.
      orientMat.makeBasis(rt, N, fwd)

      const tier   = getTier(pop)
      const layout = TIER_LAYOUT[tier]
      const sub    = citySubGroups[ci]

      const phaseOffset = (ci * 1.4) / cities.length

      for (const { m, scale, scaleXZ, yFloor, rt: rOff, fwd: fOff } of layout) {
        const mesh = templates[m].clone()
        mesh.traverse(child => {
          if (child.isMesh) {
            child.geometry = child.geometry.clone()
            const count = child.geometry.attributes.position.count
            child.geometry.setAttribute('aPhaseOffset', new THREE.BufferAttribute(new Float32Array(count).fill(phaseOffset), 1))
            child.add(new THREE.LineSegments(new THREE.EdgesGeometry(child.geometry, 15), wireMat))
          }
        })
        mesh.scale.set(scaleXZ, scale, scaleXZ)
        mesh.position
          .copy(base)
          .addScaledVector(rt, rOff)
          .addScaledVector(fwd, fOff)
          .addScaledVector(N, yFloor * scale)
        mesh.setRotationFromMatrix(orientMat)
        sub.add(mesh)
      }
    }
  })

  return { cityGroup, citySubGroups, buildingMats }
}
