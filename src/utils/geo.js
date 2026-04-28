/**
 * Geographic / Three.js geometry utilities shared across both globe components.
 *
 * Used by:
 *   WireframeEarth — latLonToVec3, addGeoLines, addThickGeoLines, buildLandMaskTexture,
 *                worldData, topojson
 *   HoloEarth  — latLonToVec3 only (no coastlines or land mask — uses elevation dots instead)
 *   Builders   — latLonToVec3 used in buildShippingLanes, buildPingsAndBrackets
 */

import * as THREE from 'three'
import { Line2 } from 'three/examples/jsm/lines/Line2.js'
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js'
import * as topojson from 'topojson-client'
import worldData from 'world-atlas/countries-110m.json'

const { PI, sin, cos } = Math

// ── Coordinate conversion ─────────────────────────────────────────────────

/**
 * Converts geographic coordinates to a Three.js Vector3 on a sphere of radius r.
 * Uses the convention: +Y = north pole, +Z = prime meridian (lon=0), +X = lon=90°E.
 */
export function latLonToVec3(lat, lon, r = 1) {
  const φ = lat * PI / 180
  const λ = lon * PI / 180
  return new THREE.Vector3(r * cos(φ) * sin(λ), r * sin(φ), r * cos(φ) * cos(λ))
}

// ── GeoJSON line drawing ──────────────────────────────────────────────────

/**
 * Adds thin THREE.Line segments for a GeoJSON Polygon or MultiPolygon geometry.
 * Used by WireframeEarth for country borders (doesn't need thickness > 1px).
 * Not used by HoloEarth — it has no coastline or border lines.
 */
export function addGeoLines(globe, geometry, material, r = 1) {
  const rings = extractRings(geometry)
  for (const ring of rings) {
    const pts = ring.map(([lon, lat]) => latLonToVec3(lat, lon, r))
    globe.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), material))
  }
}

/**
 * Adds thick Line2 segments for a GeoJSON Polygon or MultiPolygon geometry.
 * Used by WireframeEarth for the double-layer glowing coastlines (requires LineMaterial
 * for linewidth > 1px). Not used by HoloEarth.
 */
export function addThickGeoLines(globe, geometry, material, r = 1) {
  const rings = extractRings(geometry)
  for (const ring of rings) {
    if (ring.length < 2) continue
    const positions = []
    for (const [lon, lat] of ring) {
      const v = latLonToVec3(lat, lon, r)
      positions.push(v.x, v.y, v.z)
    }
    const geo = new LineGeometry()
    geo.setPositions(positions)
    globe.add(new Line2(geo, material))
  }
}

/** Extracts coordinate rings from a Polygon or MultiPolygon geometry. */
function extractRings(geometry) {
  const rings = []
  if (geometry.type === 'Polygon') {
    rings.push(...geometry.coordinates)
  } else if (geometry.type === 'MultiPolygon') {
    for (const poly of geometry.coordinates) rings.push(...poly)
  }
  return rings
}

// ── Land mask texture ─────────────────────────────────────────────────────

/**
 * Builds a 2048×1024 equirectangular land mask canvas texture.
 * White pixels = land, black = ocean.
 *
 * WireframeEarth only — used by the hex-dot overlay shader (dotShaders.js) to
 * restrict animated dots to landmasses. HoloEarth uses the spec map image
 * (02_earthspec1k.jpg) for the same purpose, sampled on the CPU instead.
 *
 * The texture's wrapS = RepeatWrapping so the shader can offset UVs by 0.25
 * to align the canvas projection seam with the Three.js sphere seam (lon=−90°).
 */
export function buildLandMaskTexture() {
  const W = 2048, H = 1024
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, W, H)
  ctx.fillStyle = '#fff'
  drawLandOnCanvas(ctx, W, H)
  const tex = new THREE.CanvasTexture(canvas)
  tex.wrapS = THREE.RepeatWrapping
  return tex
}

/**
 * Draws all world land polygons onto an existing 2D canvas context.
 * Handles antimeridian-crossing rings by normalising longitude deltas and
 * drawing each ring three times (shifted by −W, 0, +W) to fill edge cases.
 */
export function drawLandOnCanvas(ctx, W, H) {
  const drawRing = (ring, xOff) => {
    ctx.beginPath()
    let prevLon = null, shift = 0
    for (let i = 0; i < ring.length; i++) {
      const [rawLon, lat] = ring[i]
      if (prevLon !== null) {
        const delta = rawLon - prevLon
        if (delta >  180) shift -= 360
        if (delta < -180) shift += 360
      }
      prevLon = rawLon
      const x = (rawLon + shift + 180) / 360 * W + xOff
      const y = (90 - lat) / 180 * H
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
    }
    ctx.closePath()
    ctx.fill()
  }

  const land = topojson.feature(worldData, worldData.objects.land)
  for (const feature of land.features) {
    const rings = []
    const { type, coordinates } = feature.geometry
    if (type === 'Polygon') rings.push(...coordinates)
    else if (type === 'MultiPolygon') for (const p of coordinates) rings.push(...p)
    for (const ring of rings) {
      drawRing(ring,  0)
      drawRing(ring, -W)
      drawRing(ring,  W)
    }
  }
}

/**
 * Exposes world topology data for callers that need to draw coastlines/borders.
 * Used by WireframeEarth only — HoloEarth does not draw geographic lines.
 */
export { worldData, topojson }
