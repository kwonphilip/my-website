/**
 * Animated city label overlay — shared by both EarthGlobe and HoloEarth.
 *
 * Previously lived in components/HoloEarth/ but was imported by EarthGlobe too,
 * so it was moved here to correctly reflect its shared/utility nature.
 *
 * Behaviour:
 *   Selects ~40% of CITIES at a time (well-separated by angular distance),
 *   projects their 3D globe positions to 2D screen coords each frame, and
 *   runs a typewriter animation: type name → type coords → pause → fade out → pick new city.
 *
 * Usage:
 *   const sys = createCityLabelSystem(containerDiv, { lonTransform, anchorRadius })
 *   // in animation loop (after renderer.render so matrixWorld is current):
 *   sys.update(elapsedSeconds, globe, camera, renderer.domElement)
 *   // on cleanup:
 *   sys.dispose()
 *
 * The `lonTransform` option lets HoloEarth shift its city longitudes by ±180° to
 * compensate for the globe's +π initial rotation. EarthGlobe omits it (identity).
 * The `anchorRadius` option controls where on the globe the label anchor sits;
 * EarthGlobe uses 0.93 to match its sphere radius, HoloEarth uses the default 1.03.
 */

import * as THREE from 'three'
import { CITIES } from '../data/cities.js'
import { latLonToVec3 } from './geo.js'

const { PI, sin, cos, abs, acos, max, min, round, floor, random } = Math

// ── Style presets ─────────────────────────────────────────────────────────────
// Currently all modes use the same white/blue-tint palette for readability on
// dark backgrounds. Separate entries exist so individual modes can be tuned
// without changing unrelated ones.
const LABEL_STYLE_WHITE = {
  border: 'rgba(255,255,255,0.55)',
  name:   'rgba(255,255,255,0.95)',
  coord:  'rgba(220,240,255,0.92)',
  tick:   'rgba(255,255,255,0.9)',
}
const LABEL_STYLES = {
  hologram:  LABEL_STYLE_WHITE,
  night:     LABEL_STYLE_WHITE,
  nightalt2: LABEL_STYLE_WHITE,
  white:     LABEL_STYLE_WHITE,
  day:       LABEL_STYLE_WHITE,
}

// ── Timing / density constants ────────────────────────────────────────────────
const ACTIVE_COUNT  = max(1, round(CITIES.length * 0.40))  // ~40% of cities visible at once
const MIN_SEP_RAD   = 28 * PI / 180  // ~28° min angular gap; prevents label crowding
const CHARS_PER_SEC = 13             // typewriter typing speed
const PAUSE_SEC     = 3.8            // how long a fully-typed label stays visible
const FADE_SEC      = 0.2            // fade-out duration
const STAGGER_SEC   = 2.2            // offset between slot start times on first load

// ── Geometry helpers ──────────────────────────────────────────────────────────

/** Great-circle angular distance (radians) between two lat/lon points. */
function angularDist(lat1, lon1, lat2, lon2) {
  const r   = PI / 180
  const dot = sin(lat1*r)*sin(lat2*r) + cos(lat1*r)*cos(lat2*r)*cos((lon2-lon1)*r)
  return acos(max(-1, min(1, dot)))
}

/** Formats a lat/lon pair as e.g. "40.7°N  73.9°W". */
function formatCoords(lat, lon) {
  const la = `${abs(lat).toFixed(1)}\u00b0${lat >= 0 ? 'N' : 'S'}`
  const lo = `${abs(lon).toFixed(1)}\u00b0${lon >= 0 ? 'E' : 'W'}`
  return `${la}  ${lo}`
}

/** Returns a randomly shuffled array of [0 .. CITIES.length-1]. */
function shuffledIndices() {
  const arr = Array.from({ length: CITIES.length }, (_, i) => i)
  for (let i = arr.length - 1; i > 0; i--) {
    const j = floor(random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

/**
 * Picks a city index not already in excludeSet, with at least MIN_SEP_RAD
 * angular separation from all excluded cities. Falls back to any non-active
 * city if the angular constraint cannot be satisfied.
 */
function pickCity(excludeSet) {
  for (const idx of shuffledIndices()) {
    if (excludeSet.has(idx)) continue
    const [lat, lon] = CITIES[idx]
    const tooClose = [...excludeSet].some(ei => {
      const [elat, elon] = CITIES[ei]
      return angularDist(lat, lon, elat, elon) < MIN_SEP_RAD
    })
    if (!tooClose) return idx
  }
  // Fallback: ignore angular constraint — at least don't repeat an active city.
  for (const idx of shuffledIndices()) {
    if (!excludeSet.has(idx)) return idx
  }
  return 0
}

/** Picks `count` well-separated cities to populate the initial label set. */
function pickInitialSet(count) {
  const chosen = []
  for (let i = 0; i < count; i++) chosen.push(pickCity(new Set(chosen)))
  return chosen
}

// ── DOM helpers ───────────────────────────────────────────────────────────────

/**
 * Creates a single label DOM element (box + city name + coords + tick line)
 * and appends it to the container. Returns refs to the sub-elements.
 *
 * Uses inline styles rather than CSS classes so the label system stays
 * self-contained and doesn't require stylesheet additions.
 */
function makeLabel(container) {
  const el = document.createElement('div')
  el.style.cssText =
    'position:absolute;pointer-events:none;' +
    'transform:translate(-50%,calc(-100% - 22px));' +
    'padding:4px 9px 5px 9px;' +
    'background:rgba(0,12,30,0.82);' +
    'border:1px solid rgba(255,255,255,0.55);' +
    'border-radius:2px;white-space:nowrap;opacity:0;' +
    'will-change:transform,opacity;'

  const nameEl = document.createElement('div')
  nameEl.style.cssText =
    'font-family:monospace;font-size:0.62rem;letter-spacing:0.14em;' +
    'text-transform:uppercase;color:rgba(255,255,255,0.95);font-weight:700;'

  const coordEl = document.createElement('div')
  coordEl.style.cssText =
    'font-family:monospace;font-size:0.54rem;letter-spacing:0.07em;' +
    'color:rgba(220,240,255,0.92);margin-top:2px;'

  // Vertical tick connecting the label box to the city point on the globe.
  const tick = document.createElement('div')
  tick.style.cssText =
    'position:absolute;bottom:-24px;left:50%;' +
    'transform:translateX(-50%);width:1px;height:24px;' +
    'background:rgba(255,255,255,0.9);'

  el.appendChild(nameEl)
  el.appendChild(coordEl)
  el.appendChild(tick)
  container.appendChild(el)

  return { el, nameEl, coordEl, tick }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Creates and returns a city label system.
 *
 * @param {HTMLElement} container      Absolutely-positioned overlay element.
 * @param {object}      opts
 * @param {function}    [opts.lonTransform]   Maps a city longitude before projecting.
 *   HoloEarth passes shiftLon (±180° shift) to account for its +π globe rotation.
 *   EarthGlobe omits this (identity, no shift).
 * @param {number|function} [opts.anchorRadius]  Globe-surface radius to place the anchor at.
 *   Pass a number for a fixed radius, or a function (lat, lon) => number for a per-city
 *   terrain-aware radius. EarthGlobe uses 0.93; HoloEarth passes a function that reads
 *   the bump map so the anchor stays above building tops on high terrain.
 */
export function createCityLabelSystem(container, { lonTransform = lon => lon, anchorRadius = 1.03 } = {}) {
  const initialSet = pickInitialSet(ACTIVE_COUNT)
  const slots = []

  // Each slot tracks one label element and its animation state.
  for (let i = 0; i < ACTIVE_COUNT; i++) {
    const { el, nameEl, coordEl, tick } = makeLabel(container)
    const idx = initialSet[i]
    const [lat, lon,, name = `City ${idx}`] = CITIES[idx]
    slots.push({
      el, nameEl, coordEl, tick,
      cityIdx: idx,
      lat, lon,
      name,
      coords:   formatCoords(lat, lon),
      state:    'typing',    // 'typing' | 'paused' | 'fading'
      startT:   i * STAGGER_SEC,  // stagger so labels don't all appear at once
      pauseT:   0,
      fadeT:    0,
      hiddenAt: 0,  // non-zero while the city is on the globe's back side
    })
  }

  // Reused THREE objects to avoid per-frame allocations.
  const _v  = new THREE.Vector3()
  const _n  = new THREE.Vector3()
  const _cd = new THREE.Vector3()

  let systemVisible = true
  let currentStyle  = LABEL_STYLES.hologram

  const activeSet = () => new Set(slots.map(s => s.cityIdx))

  /** Fades out a slot and schedules it to pick a new city shortly. */
  function reassign(slot, currentT) {
    const next = pickCity(activeSet())
    const [lat, lon,, name = `City ${next}`] = CITIES[next]
    slot.cityIdx  = next
    slot.lat      = lat
    slot.lon      = lon
    slot.name     = name
    slot.coords   = formatCoords(lat, lon)
    slot.state    = 'typing'
    // Random delay so reassigned labels don't all start at the same time.
    slot.startT   = currentT + 1.0 + random() * 2.5
    slot.pauseT   = 0
    slot.fadeT    = 0
    slot.hiddenAt = 0
    slot.nameEl.textContent  = ''
    slot.coordEl.textContent = ''
    slot.el.style.opacity    = '0'
  }

  /** Applies a colour preset to all label DOM elements. */
  function setStyle(mode) {
    currentStyle = LABEL_STYLES[mode] ?? LABEL_STYLES.hologram
    for (const s of slots) {
      s.el.style.border       = `1px solid ${currentStyle.border}`
      s.nameEl.style.color    = currentStyle.name
      s.coordEl.style.color   = currentStyle.coord
      s.tick.style.background = currentStyle.tick
    }
  }

  /** Shows or hides all labels without destroying state. */
  function setVisible(v) {
    systemVisible = v
    if (!v) {
      for (const s of slots) s.el.style.opacity = '0'
    }
  }

  /**
   * Per-frame update: projects each city to screen coords, drives typewriter
   * animation, and handles occlusion (city on back side of globe).
   *
   * Must be called *after* renderer.render() so globe.matrixWorld is current.
   */
  function update(t, globe, camera, domEl) {
    if (!systemVisible) return

    const rect = domEl.getBoundingClientRect()
    const W = rect.width
    const H = rect.height
    if (!W || !H) return

    globe.updateWorldMatrix(true, false)

    for (const s of slots) {
      // World-space position of the city (at anchorRadius above centre).
      const r = typeof anchorRadius === 'function' ? anchorRadius(s.lat, s.lon) : anchorRadius
      _v.copy(latLonToVec3(s.lat, lonTransform(s.lon), r))
      _v.applyMatrix4(globe.matrixWorld)

      // Facing check: is the city on the hemisphere pointing toward the camera?
      // A dot product < 0.12 means the city is at the globe's edge or behind it.
      _n.copy(_v).normalize()
      _cd.subVectors(camera.position, _v).normalize()
      const isOccluded = _n.dot(_cd) < 0.12

      // Project from world space to canvas pixels.
      _v.project(camera)
      const sx = (_v.x *  0.5 + 0.5) * W
      const sy = (1 - (_v.y * 0.5 + 0.5)) * H

      s.el.style.left = `${sx}px`
      s.el.style.top  = `${sy}px`

      if (isOccluded || _v.z > 1) {
        // Record when occlusion began (only after the slot's animation has started).
        if (!s.hiddenAt && t >= s.startT) s.hiddenAt = t
        s.el.style.opacity = '0'
        continue
      }

      // City just became visible again — shift timing refs forward by the hidden
      // duration so the animation resumes exactly where it left off.
      if (s.hiddenAt) {
        const hiddenDur = t - s.hiddenAt
        s.startT += hiddenDur
        if (s.state === 'paused') s.pauseT += hiddenDur
        if (s.state === 'fading') s.fadeT  += hiddenDur
        s.hiddenAt = 0
      }

      const dt = t - s.startT
      if (dt < 0) { s.el.style.opacity = '0'; continue }

      const nameLen  = s.name.length
      const coordLen = s.coords.length
      const typed    = floor(dt * CHARS_PER_SEC)

      if (s.state === 'typing') {
        s.el.style.opacity = '1'
        s.nameEl.textContent  = s.name.slice(0, min(typed, nameLen))
        s.coordEl.textContent = s.coords.slice(0, max(0, min(typed - nameLen, coordLen)))
        if (typed >= nameLen + coordLen) {
          s.state  = 'paused'
          s.pauseT = t
        }

      } else if (s.state === 'paused') {
        s.el.style.opacity    = '1'
        s.nameEl.textContent  = s.name
        s.coordEl.textContent = s.coords
        if (t - s.pauseT >= PAUSE_SEC) {
          s.state = 'fading'
          s.fadeT = t
        }

      } else if (s.state === 'fading') {
        const p = (t - s.fadeT) / FADE_SEC
        s.el.style.opacity = String(max(0, 1 - p))
        if (p >= 1) reassign(s, t)
      }
    }
  }

  /** Removes all label DOM elements. Call on component unmount. */
  function dispose() {
    for (const s of slots) s.el.parentNode?.removeChild(s.el)
  }

  return { update, setVisible, setStyle, dispose }
}
