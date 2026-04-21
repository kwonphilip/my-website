/**
 * Asynchronously builds the HoloEarth elevation-dot mesh and city bars.
 *
 * Pipeline:
 *   1. Load all terrain images in parallel (spec, bump, day, night, nightalt2).
 *   2. Iterate the lat/lon grid; skip ocean pixels (spec map > 0.8 → ocean).
 *      lonStep adapts to cos(lat) so dots are evenly spaced in world space.
 *   3. Build an InstancedMesh — one sphere dot per land point at terrain height.
 *   4. Apply initial dot colours based on initialColorMode.
 *   5. Build city bar geometry with terrain-aware base heights.
 *      Each bar's base samples the bump map so it clears the elevation dot beneath it.
 *
 * Returns null if the required spec/bump images fail to load.
 *
 * To add/remove cities:      edit src/data/cities.js
 * To adjust dot density:     edit STEP in ./constants.js
 * To adjust terrain height:  edit DOT_MIN_H / DOT_MAX_H in ./constants.js
 * To adjust bar appearance:  edit src/shaders/cityBarShaders.js
 */

import * as THREE from 'three'

import { latLonToVec3 }           from '../../utils/geo.js'
import { loadImageData, sampleR } from '../../utils/imageUtils.js'
import { buildCityBuildings }     from '../../builders/buildCityBuildings.js'
import { CITIES }                 from '../../data/cities.js'
import { STEP, DOT_RADIUS, DOT_MIN_H, DOT_MAX_H } from './constants.js'
import {
  shiftLon,
  applyGradientColors, applyWhiteColors, applyMapColors,
  COLOR_MODE_URLS, COLOR_MODE_SAT,
} from './colorModes.js'

import specUrl      from '../../assets/textures/02_earthspec1k.jpg'
import bumpUrl      from '../../assets/textures/01_earthbump1k.jpg'
import dayUrl       from '../../assets/textures/8k_earth.jpg'
import nightUrl     from '../../assets/textures/earth_night_4096.jpg'
import nightAlt2Url from '../../assets/textures/earth_lights_2048.png'

const { PI, cos } = Math

/**
 * @param {THREE.Group} globe              Globe group to add dots and city bars to.
 * @param {object}      opts
 * @param {string}      opts.initialColorMode    Colour mode at the time of load.
 * @param {boolean}     opts.initialShowCities   Whether city bars start visible.
 * @param {number}      opts.step                Lat/lon step in degrees (default: STEP).
 * @param {number}      opts.dotRadius           Radius of each dot (default: DOT_RADIUS).
 * @param {object|null} opts.preloadedImages     Pre-loaded { specImg, bumpImg, imgCache } to skip fetching.
 * @returns {Promise<{ mesh, points, imgCache, specImg, bumpImg, cityGroup, citySubGroups, buildingMats } | null>}
 */
export async function buildElevationDots(globe, {
  initialColorMode  = 'hologram',
  initialShowCities = true,
  step              = STEP,
  dotRadius         = DOT_RADIUS,
  preloadedImages   = null,
} = {}) {
  let specImg, bumpImg, imgCache

  if (preloadedImages) {
    specImg  = preloadedImages.specImg
    bumpImg  = preloadedImages.bumpImg
    imgCache = { ...preloadedImages.imgCache }
  } else {
    const [specR, bumpR, dayR, nightR, nightAlt2R] = await Promise.allSettled([
      loadImageData(specUrl),
      loadImageData(bumpUrl),
      loadImageData(dayUrl),
      loadImageData(nightUrl),
      loadImageData(nightAlt2Url),
    ])

    if (specR.status !== 'fulfilled' || bumpR.status !== 'fulfilled') return null

    specImg  = specR.value
    bumpImg  = bumpR.value
    imgCache = {}
    if (dayR.status       === 'fulfilled') imgCache[dayUrl]       = dayR.value
    if (nightR.status     === 'fulfilled') imgCache[nightUrl]     = nightR.value
    if (nightAlt2R.status === 'fulfilled') imgCache[nightAlt2Url] = nightAlt2R.value
  }

  // ── Build dot positions ──────────────────────────────────────────────────
  const points = []
  for (let lat = -89; lat <= 89; lat += step) {
    const cosLat  = cos(lat * PI / 180)
    const lonStep = step / Math.max(cosLat, 0.15)
    for (let lon = 0; lon < 360; lon += lonStep) {
      const u    = lon / 360
      const v    = (90 - lat) / 180
      const land = 1 - sampleR(specImg, u, v)
      if (land < 0.2) continue
      const bump = sampleR(bumpImg, u, v)
      points.push({ lat, lon, bump })
    }
  }

  // ── Build instanced mesh ─────────────────────────────────────────────────
  const dotGeo = new THREE.SphereGeometry(dotRadius, 6, 6)
  const dotMat = new THREE.MeshBasicMaterial({ blending: THREE.AdditiveBlending, depthWrite: true })
  const mesh   = new THREE.InstancedMesh(dotGeo, dotMat, points.length)
  const dummy  = new THREE.Object3D()

  points.forEach((pt, i) => {
    const height = DOT_MIN_H + pt.bump * (DOT_MAX_H - DOT_MIN_H)
    dummy.position.copy(latLonToVec3(pt.lat, pt.lon, 1 + height))
    dummy.quaternion.identity()
    dummy.scale.setScalar(1)
    dummy.updateMatrix()
    mesh.setMatrixAt(i, dummy.matrix)
  })
  mesh.instanceMatrix.needsUpdate = true
  globe.add(mesh)

  // ── Apply initial dot colours ────────────────────────────────────────────
  if (initialColorMode === 'hologram') {
    applyGradientColors(mesh, points)
  } else if (initialColorMode === 'white') {
    applyWhiteColors(mesh, points)
  } else {
    const url = COLOR_MODE_URLS[initialColorMode]
    const sat = COLOR_MODE_SAT[initialColorMode] ?? 1
    if (url && imgCache[url]) applyMapColors(mesh, points, imgCache[url], sat)
    else applyGradientColors(mesh, points)
  }

  // ── Build city bars ──────────────────────────────────────────────────────
  // citySubGroups[i] corresponds to CITIES[i]; toggle .visible to hide/show one city.
  // getBase samples the bump map so each bar sits just above the terrain dot.
  // Longitudes are shifted ±180° to match HoloEarth's +π globe rotation.
  // gradBase/gradRange/alphaOuter are higher than EarthGlobe because selective
  // bloom skips city bars — they must be bright enough on their own.
  const { cityGroup, citySubGroups, buildingMats } = buildCityBuildings(globe, CITIES, {
    buildingColor: 0xddeeff,
    rippleColor:   0xffffff,
    opacityScale:  0.25,
    getBase: (lat, lon) => {
      const holoLon  = shiftLon(lon)
      const u        = ((holoLon / 360) % 1 + 1) % 1
      const v        = (90 - lat) / 180
      const bump     = sampleR(bumpImg, u, v)
      const terrainH = DOT_MIN_H + bump * (DOT_MAX_H - DOT_MIN_H)
      return latLonToVec3(lat, holoLon, 1.0 + terrainH + 0.003)
    },
  })
  cityGroup.visible = initialShowCities

  return { mesh, points, imgCache, specImg, bumpImg, cityGroup, citySubGroups, buildingMats }
}
