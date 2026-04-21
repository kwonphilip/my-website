/**
 * Builds the nav-location markers: pulsing ping rings and hover brackets.
 * Used by both EarthGlobe and HoloEarth with different options (see below).
 *
 * Pings — one THREE.Points per location, initially hidden.
 *         Show/hide per-location via pingPoints[i].visible.
 *         All share a single ShaderMaterial (pingMat); update uniforms.uTime
 *         each frame to drive the pulsing animation.
 *
 * Brackets — one per location, hidden until that nav link is hovered.
 *            Each bracket is a four-corner crosshair (two L-shaped arms per
 *            corner) rendered with thick LineMaterial.
 *            Show/hide via bracketGroups[i].visible.
 *
 * Returns { pingMat, pingPoints, bracketGroups, bracketMat } where:
 *   pingMat       — ShaderMaterial; update uniforms.uTime.value each frame.
 *   pingPoints    — Points[]; toggle pingPoints[i].visible on nav hover.
 *   bracketGroups — LineSegments2[]; toggle bracketGroups[i].visible on nav hover.
 *   bracketMat    — LineMaterial; update resolution.set(w, h) on resize.
 *
 * ── Options ───────────────────────────────────────────────────────────────
 *   pingRadius     — radius at which ping points sit above the surface.
 *                    EarthGlobe: RADIUS * 1.005  (= ~0.9045, local units).
 *                    HoloEarth:  1.005           (local units; globe scale = 0.9).
 *
 *   bracketRadius  — radius at which bracket corners sit (slightly higher than pings).
 *                    EarthGlobe: RADIUS * 1.007  |  HoloEarth: 1.007
 *
 *   resolution     — THREE.Vector2(w, h) for pixel-accurate LineMaterial linewidth.
 *                    Both globes pass their canvas dimensions; must be updated on resize
 *                    via bracketMat.resolution.set(w, h).
 *
 *   bloomLayer     — optional Three.js layer index for selective bloom.
 *                    HoloEarth: pass BLOOM_LAYER (= 1) — pings and brackets are tagged
 *                    so the bloomComposer gives them a glow without affecting the dots.
 *                    EarthGlobe: omit — global UnrealBloomPass handles bloom uniformly.
 */

import * as THREE from 'three'
import { LineMaterial }         from 'three/examples/jsm/lines/LineMaterial.js'
import { LineSegments2 }        from 'three/examples/jsm/lines/LineSegments2.js'
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js'
import { latLonToVec3 }         from '../utils/geo.js'
import { PING_VERT, PING_FRAG } from '../shaders/pingShaders.js'

/**
 * @param {THREE.Group}    globe      Globe group to add markers to.
 * @param {{lat,lon}[]}    locations  Array of { lat, lon } objects.
 * @param {object}         options
 * @param {number}         options.pingRadius     Surface radius for ping points.
 * @param {number}         options.bracketRadius  Surface radius for bracket corners.
 * @param {THREE.Vector2}  options.resolution     Viewport size for LineMaterial.
 * @param {number}         [options.bloomLayer]        Layer index for selective bloom.
 * @param {number}         [options.pingColor]         Hex color for ping rings.        Default 0x73e0ff.
 * @param {number}         [options.pingCenterColor]   Hex color for ping center dot.   Default 0xffffff.
 * @param {number}         [options.bracketColor]      Hex color for hover brackets.    Default 0xffffff.
 * @param {number}         [options.bracketOpacity]    Opacity for hover brackets.      Default 0.3.
 *
 * All three colors can be updated at runtime:
 *   pingMat.uniforms.uColor.value.setHex(hex)        — ring color
 *   pingMat.uniforms.uCenterColor.value.setHex(hex)  — center dot color
 *   bracketMat.color.setHex(hex)                     — bracket color
 *
 * @returns {{ pingMat, pingPoints, bracketGroups, bracketMat }}
 */
export function buildPingsAndBrackets(globe, locations, {
  pingRadius,
  bracketRadius,
  resolution,
  bloomLayer,
  pingColor       = 0x73e0ff,
  pingCenterColor = 0xffffff,
  bracketColor    = 0xffffff,
  bracketOpacity  = 0.3,
} = {}) {

  // ── Ping rings ─────────────────────────────────────────────────────────
  // One Points object per location so each can be shown/hidden individually.
  // All share a single ShaderMaterial — updating uTime once drives all of them.
  const pingMat = new THREE.ShaderMaterial({
    vertexShader:   PING_VERT,
    fragmentShader: PING_FRAG,
    uniforms: {
      uTime:        { value: 0 },
      uColor:       { value: new THREE.Color(pingColor) },
      uCenterColor: { value: new THREE.Color(pingCenterColor) },
    },
    transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending, toneMapped: false,
  })

  const pingPoints = locations.map((loc, i) => {
    const v = latLonToVec3(loc.lat, loc.lon, pingRadius)

    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute([v.x, v.y, v.z], 3))
    // aPhase staggers the pulse timing so each location has a consistent phase.
    geo.setAttribute('aPhase', new THREE.Float32BufferAttribute([i / locations.length], 1))

    const pts = new THREE.Points(geo, pingMat)
    pts.visible = false  // hidden by default; shown only on nav-link hover
    if (bloomLayer != null) pts.layers.enable(bloomLayer)
    globe.add(pts)
    return pts
  })

  // ── Hover brackets ─────────────────────────────────────────────────────
  // Each bracket has 4 L-shaped corners. Each corner contributes 4 line
  // segments (2 arms of 2 lines each).
  //
  // BCORNERS: [signRt, signUp, deltaHRt, deltaHUp, deltaVRt, deltaVUp]
  //   signRt/signUp  — which quadrant the corner sits in (±1)
  //   deltaH*        — direction of the horizontal arm from the corner
  //   deltaV*        — direction of the vertical arm from the corner
  const BSIZE   = 0.024  // half-size of the bracket square
  const BARM    = 0.012  // length of each bracket arm
  const BCORNERS = [
    [-1,  1,  1,  0,  0, -1],  // top-left
    [ 1,  1, -1,  0,  0, -1],  // top-right
    [-1, -1,  1,  0,  0,  1],  // bottom-left
    [ 1, -1, -1,  0,  0,  1],  // bottom-right
  ]

  const worldY = new THREE.Vector3(0, 1, 0)

  const bracketMat = new LineMaterial({
    color: bracketColor, linewidth: 2,
    transparent: true, opacity: bracketOpacity,
    blending: THREE.AdditiveBlending, toneMapped: false, depthWrite: false,
    resolution,
  })

  const bracketGroups = locations.map(loc => {
    const P  = latLonToVec3(loc.lat, loc.lon, bracketRadius)
    const N  = P.clone().normalize()
    const up = worldY.clone().addScaledVector(N, -worldY.dot(N)).normalize()
    const rt = new THREE.Vector3().crossVectors(up, N).normalize()

    const pts = []
    for (const [sr, su, dhr, dhu, dvr, dvu] of BCORNERS) {
      const corner = P.clone()
        .addScaledVector(rt, sr * BSIZE)
        .addScaledVector(up, su * BSIZE)
      const hEnd = corner.clone()
        .addScaledVector(rt, dhr * BARM)
        .addScaledVector(up, dhu * BARM)
      const vEnd = corner.clone()
        .addScaledVector(rt, dvr * BARM)
        .addScaledVector(up, dvu * BARM)
      pts.push(corner.x, corner.y, corner.z, hEnd.x, hEnd.y, hEnd.z)
      pts.push(corner.x, corner.y, corner.z, vEnd.x, vEnd.y, vEnd.z)
    }

    const geo   = new LineSegmentsGeometry()
    geo.setPositions(new Float32Array(pts))
    const lines = new LineSegments2(geo, bracketMat)
    // Brackets intentionally excluded from bloomLayer — bloom makes the lines
    // look blown out. Pings still bloom; brackets rely on opacity/color alone.
    lines.visible = false  // shown only on nav-link hover
    globe.add(lines)
    return lines
  })

  return { pingMat, pingPoints, bracketGroups, bracketMat }
}
