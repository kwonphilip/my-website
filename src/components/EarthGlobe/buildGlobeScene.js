/**
 * Assembles all EarthGlobe geometry into a THREE.Group.
 * Called once on mount; all geometry is added to the returned globe Group,
 * which is then added to the Three.js scene.
 *
 * Returns an object with materials and groups needed by the animation loop
 * and imperative API:
 *
 *   globe         — THREE.Group; add to scene, set rotation.y for sync
 *   coastMats     — [landMat, haloMat]; call .resolution.set(w, h) on resize
 *   dotsMat       — hex-dot ShaderMaterial; set uniforms.uTime.value each frame
 *   landTex       — canvas texture; dispose() on unmount
 *   lanesMat      — flight-lane ShaderMaterial; set uniforms.uTime.value each frame
 *   pingMat       — ping-ring ShaderMaterial; set uniforms.uTime.value each frame
 *   bracketGroups — LineSegments2[]; toggle .visible per nav hover
 *   bracketMat    — LineMaterial; call .resolution.set(w, h) on resize
 *   cityGroup     — THREE.Group; toggle .visible to show/hide city markers
 *
 * To add cities:   edit src/data/cities.js
 * To add routes:   edit src/data/routes.js
 * To adjust bloom: tune UnrealBloomPass params in EarthGlobe.jsx
 * To adjust trails: edit src/shaders/flightShaders.js
 */

import * as THREE from 'three'
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js'

import { latLonToVec3, addGeoLines, addThickGeoLines, buildLandMaskTexture, worldData, topojson } from '../../utils/geo.js'
import { DOTS_VERT, DOTS_FRAG }  from '../../shaders/dotShaders.js'
import { buildShippingLanes }    from '../../builders/buildShippingLanes.js'
import { buildCityBuildings }    from '../../builders/buildCityBuildings.js'
import { buildPingsAndBrackets } from '../../builders/buildPingsAndBrackets.js'
import { buildISSTracker }       from '../../builders/buildISSTracker.js'
import { CITIES }                from '../../data/cities.js'
import { ROUTES }                from '../../data/routes.js'
import { RADIUS, DOT_SPHERE_SEGMENTS, PLANE_ORBIT_RADIUS } from './constants.js'
import starsUrl                  from '../../assets/textures/8k_stars.jpg'

/**
 * @param {{ lat: number, lon: number }[]} locations  Nav-link ping/bracket positions.
 * @param {number} w  Canvas width in pixels (for LineMaterial resolution).
 * @param {number} h  Canvas height in pixels.
 * @param {HTMLElement|null} [labelContainer]  Overlay div for DOM labels (city + ISS).
 */
export function buildGlobeScene(locations, w, h, labelContainer = null) {
  const globe = new THREE.Group()

  // Faint dark fill sphere — provides globe body and depth.
  globe.add(new THREE.Mesh(
    new THREE.SphereGeometry(RADIUS, 32, 32),
    new THREE.MeshBasicMaterial({ color: 0x000d1a, transparent: true, opacity: 0.25, depthWrite: false }),
  ))

  // Dim lat/lon grid lines for geographic reference.
  const gridMat = new THREE.LineBasicMaterial({ color: 0x7ac8ff, transparent: true, opacity: 0.1 })
  for (let lat = -80; lat <= 80; lat += 20) {
    const pts = []
    for (let lon = 0; lon <= 360; lon += 2) pts.push(latLonToVec3(lat, lon, RADIUS))
    globe.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), gridMat))
  }
  for (let lon = 0; lon < 360; lon += 20) {
    const pts = []
    for (let lat = -90; lat <= 90; lat += 2) pts.push(latLonToVec3(lat, lon, RADIUS))
    globe.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), gridMat))
  }

  // Double-layer coastlines: inner line + outer halo for a glowing edge effect.
  const res         = new THREE.Vector2(w, h)
  const landMat     = new LineMaterial({ color: 0xb8e0ff, transparent: true, opacity: 0.15, linewidth: 1.5, resolution: res })
  const landHaloMat = new LineMaterial({ color: 0xb8e0ff, transparent: true, opacity: 0.15, linewidth: 1.5, resolution: res })
  const land = topojson.feature(worldData, worldData.objects.land)
  for (const feature of land.features) {
    addThickGeoLines(globe, feature.geometry, landMat,     RADIUS * 1.001)
    addThickGeoLines(globe, feature.geometry, landHaloMat, RADIUS * 1.005)
  }

  // Softer country borders (less dominant than coastlines).
  const countryMat = new THREE.LineBasicMaterial({
    color: 0x7ac8ff, transparent: true, opacity: 0.18,
    blending: THREE.AdditiveBlending, toneMapped: false,
  })
  const countries = topojson.feature(worldData, worldData.objects.countries)
  for (const feature of countries.features) {
    addGeoLines(globe, feature.geometry, countryMat, RADIUS * 1.001)
  }

  // Nav-location pings and hover brackets.
  // pingPoints[i].visible controls per-location ping visibility (hidden by default).
  // No bloomLayer here — EarthGlobe uses a global UnrealBloomPass instead.
  const { pingMat, pingPoints, bracketGroups, bracketMat } = buildPingsAndBrackets(globe, locations, {
    pingRadius:     RADIUS * 1.005,
    bracketRadius:  RADIUS * 1.007,
    resolution:     res,
    bracketOpacity: 0.3,
  })

  // Hex-grid dot overlay (land-masked, CPU-free — all logic in GLSL).
  // See src/shaders/dotShaders.js to adjust dot density, size, and animation.
  const landTex = buildLandMaskTexture()
  const dotsMat = new THREE.ShaderMaterial({
    vertexShader:   DOTS_VERT,
    fragmentShader: DOTS_FRAG,
    uniforms:       { uLandMask: { value: landTex }, uTime: { value: 0 } },
    transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending, toneMapped: false, side: THREE.DoubleSide,
  })
  const dotsMesh = new THREE.Mesh(new THREE.SphereGeometry(RADIUS * 1.002, DOT_SPHERE_SEGMENTS, 64), dotsMat)
  globe.add(dotsMesh)

  // City marker bars — tiered cuboid clusters based on population.
  // EarthGlobe uses a fixed base height (no terrain sampling needed).
  // citySubGroups[i] corresponds to CITIES[i]; toggle .visible to hide/show one city.
  const { cityGroup, citySubGroups, buildingMats } = buildCityBuildings(globe, CITIES, {
    getBase:       (lat, lon) => latLonToVec3(lat, lon, RADIUS * 1.001),
    buildingColor: 0xaabbcc,
  })

  // Animated flight lanes — planes + trails.
  // EarthGlobe uses standard coords (no lon shift needed).
  const { lanesMat, lanesGroup, updatePlanes } = buildShippingLanes(globe, ROUTES, {
    orbitRadius: PLANE_ORBIT_RADIUS,
    trailColor:  [0.5, 0.88, 1.0],  // cyan
    planeColor:  0x999999,           // dimmed — global UnrealBloomPass amplifies brightness
  })

  // Real-time ISS tracker — 3D model + orbit trace + sub-satellite ring + DOM label.
  const { updateISS, updateISSLabel, disposeISS, setISSVisible, issGroup, issRing, issBeam, issScan, issSpot } = buildISSTracker(globe, RADIUS, { container: labelContainer })

  // Starfield — giant sphere textured on its inside surface with 8k_stars.jpg.
  // Added to the scene directly (not globe group) so it rotates independently.
  const starsTex    = new THREE.TextureLoader().load(starsUrl)
  const starSphere  = new THREE.Mesh(
    new THREE.SphereGeometry(50, 64, 64),
    new THREE.MeshBasicMaterial({ map: starsTex, side: THREE.BackSide, opacity: 0.15, transparent: true }),
  )

  return {
    globe, starSphere,
    coastMats: [landMat, landHaloMat],
    dotsMat, dotsMesh, landTex,
    lanesMat, lanesGroup, updatePlanes, pingMat, pingPoints,
    bracketGroups, bracketMat,
    cityGroup, citySubGroups, buildingMats,
    updateISS, updateISSLabel, disposeISS, setISSVisible, issGroup, issRing, issBeam, issScan, issSpot,
  }
}
