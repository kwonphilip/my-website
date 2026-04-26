/**
 * HoloEarth — holographic elevation-dot globe.
 *
 * Features:
 *   • Instanced elevation-dot mesh coloured by terrain, map, or gradient
 *   • Multiple colour modes: Hologram (blue gradient), White, Day, Night, Night Alt
 *   • Animated flight lanes with plane icons, trails, and selective bloom glow
 *   • City marker bars (3D cuboids) adjusted to sit above terrain elevation
 *   • Pulsing ping rings + hover brackets at nav locations (bloom-tagged)
 *   • Lat/lon grid + faint fill sphere
 *   • Drag-to-rotate (returns to auto-rotate after 2 s idle)
 *   • Selective bloom: planes/trails/brackets glow via a separate composer pass;
 *     the rest of the scene renders normally to preserve elevation dot colours
 *
 * Props:
 *   locations  — { lat, lon }[] for nav-link ping/bracket markers
 *   initialY   — initial Y rotation in radians
 *   colorMode  — 'hologram' | 'white' | 'day' | 'night' | 'nightalt2'
 *   onReady    — callback fired once async elevation dots finish loading
 *   showCities — whether city bar markers are visible
 *
 * Imperative API (via ref):
 *   rotateTo(lat, lon)   — rotate to a location and zoom in
 *   resumeAutoRotate()   — resume auto-spin
 *   getRotationY()       — current Y rotation (strips the +π offset for callers)
 *   setRotationY(y)      — set Y rotation without animation (adds +π internally)
 *   showBracket(i)       — show bracket i, hide all others
 *   hideBracket()        — hide all brackets
 *   setZoom(percent)     — scale the globe to percent% of its default size (100 = default)
 *
 * Why longitudes are shifted:
 *   HoloEarth's globe starts at rotation.y = π so the "front" matches EarthGlobe.
 *   All route and city longitudes are shifted ±180°: lon < 0 → lon+180, lon ≥ 0 → lon−180.
 *
 * Colour modes:   ./HoloEarth/colorModes.js
 * Dot building:   ./HoloEarth/buildElevationDots.js
 * Constants:      ./HoloEarth/constants.js
 */

import { useEffect, useRef, useState, forwardRef, useImperativeHandle } from 'react'
import * as THREE from 'three'
import { EffectComposer }  from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass }      from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'

import { latLonToVec3 }          from '../utils/geo.js'
import { buildShippingLanes }    from '../builders/buildShippingLanes.js'
import { buildPingsAndBrackets } from '../builders/buildPingsAndBrackets.js'
import { buildISSTracker }       from '../builders/buildISSTracker.js'
import { ROUTES, shiftRoutesForHolo } from '../data/routes.js'
import starsUrl from '../assets/textures/8k_stars.jpg'

import { buildElevationDots } from './HoloEarth/buildElevationDots.js'
import { createCityLabelSystem } from '../utils/cityLabels.js'
import { sampleR } from '../utils/imageUtils.js'
import { setupGlobeDrag } from '../hooks/globeDrag.js'
import {
  shiftLon, COLOR_MODE_FILL,
  recolorDots, applyMarkerColors,
} from './HoloEarth/colorModes.js'
import {
  ZOOM_DEFAULT, ZOOM_IN, AXIAL_TILT, AXIAL_TILT_Z,
  IDLE_RETURN_MS, BLOOM_LAYER, PLANE_ORBIT_RADIUS,
  STEP, DOT_RADIUS, DOT_MIN_H, DOT_MAX_H,
} from './HoloEarth/constants.js'

const { PI } = Math

// Pre-shift routes once at module load (not per render).
const HOLO_ROUTES = shiftRoutesForHolo(ROUTES)

const HoloEarth = forwardRef(function HoloEarth(
  { locations = [], initialY = 0, colorMode = 'hologram', onReady, showCities = true, showFlights = true, starsRotating = true, showISS = false, navCityIndices = [], dotStep = STEP, dotRadius = DOT_RADIUS },
  ref,
) {
  const mountRef      = useRef(null)
  const labelsRef     = useRef(null)
  const [loading, setLoading] = useState(true)

  // All mutable Three.js state lives here — avoids React re-renders triggering
  // scene rebuilds. Never read/write this inside render; only inside effects.
  const stateRef = useRef({
    globe:          null,
    camera:         null,
    bloomComposer:  null,
    mainComposer:   null,
    fillMat:        null,
    autoRotate:     true,
    autoY:          initialY + PI,
    targetX:        0,
    targetY:        initialY + PI,
    targetZoom:     ZOOM_DEFAULT,
    targetCameraY:  0,
    cancelAnim:     null,
    mesh:           null,
    points:         null,
    imgCache:       {},
    lanesMat:       null,
    lanesGroup:     null,
    updatePlanes:   null,
    pingMat:        null,
    pingPoints:     [],
    bracketGroups:  [],
    bracketMat:     null,
    buildingMats:         [],
    cityGroup:            null,
    citySubGroups:        [],
    navCityIndices:       navCityIndices,
    pendingHideCityNavIdx: null,
    colorMode:      colorMode,
    updateISS:       null,
    updateISSLabel:  null,
    disposeISS:      null,
    setISSVisible:   null,
    isDragging:     false,
    dragLastX:      0,
    dragLastY:      0,
    showCitiesFlag:  showCities,
    zoomScale:       1,
    starSphere:      null,
    starsRotating:   starsRotating,
    specImg:         null,
    bumpImg:         null,
    cityLabelSystem: null,
  })

  // ── Imperative API ──────────────────────────────────────────────────────
  useImperativeHandle(ref, () => ({
    rotateTo(lat, lon) {
      const s = stateRef.current
      if (!s.globe) return
      s.autoRotate = false
      s.targetZoom = ZOOM_IN / s.zoomScale
      s.targetCameraY = 0
      const curY = ((s.globe.rotation.y % (2*PI)) + 2*PI) % (2*PI)
      let   tgtY = ((-lon * PI / 180)             % (2*PI) + 2*PI) % (2*PI)
      let   diff = tgtY - curY
      if (diff >  PI) diff -= 2*PI
      if (diff < -PI) diff += 2*PI
      s.globe.rotation.y = curY
      s.targetY = curY + diff
      s.targetX = lat * PI / 180
    },
    setPoleView() {
      const s = stateRef.current
      if (!s.globe) return
      s.autoRotate = false
      s.targetZoom = 0.28 / s.zoomScale
      s.targetCameraY = 0.9
      s.targetX = 0
      const curY = ((s.globe.rotation.y % (2*PI)) + 2*PI) % (2*PI)
      s.globe.rotation.y = curY
      s.targetY = curY
    },
    resumeAutoRotate() {
      const s = stateRef.current
      if (s.globe) s.autoY = s.globe.rotation.y
      s.autoRotate = true
      s.targetZoom = ZOOM_DEFAULT / s.zoomScale
      s.targetCameraY = 0
    },
    // Strip the internal +π offset before returning — external callers use standard coords.
    getRotationY()  { return (stateRef.current.globe?.rotation.y ?? PI) - PI },
    setRotationY(y) {
      const s = stateRef.current
      if (!s.globe) return
      s.globe.rotation.y = y + PI
      s.autoY            = y + PI
      s.targetY          = y + PI
    },
    showBracket(i) {
      stateRef.current.bracketGroups.forEach((b, j) => { b.visible = j === i })
    },
    hideBracket() {
      stateRef.current.bracketGroups.forEach(b => { b.visible = false })
    },
    showPing(i) {
      stateRef.current.pingPoints.forEach((p, j) => { p.visible = j === i })
    },
    hideAllPings() {
      stateRef.current.pingPoints.forEach(p => { p.visible = false })
    },
    hideCityBar(navIdx) {
      const s = stateRef.current
      s.pendingHideCityNavIdx = navIdx
      const cityIdx = s.navCityIndices[navIdx]
      if (cityIdx >= 0 && s.citySubGroups[cityIdx]) s.citySubGroups[cityIdx].visible = false
    },
    showCityBar(navIdx) {
      const s = stateRef.current
      if (s.pendingHideCityNavIdx === navIdx) s.pendingHideCityNavIdx = null
      const cityIdx = s.navCityIndices[navIdx]
      if (cityIdx >= 0 && s.citySubGroups[cityIdx]) s.citySubGroups[cityIdx].visible = true
    },
    setZoom(percent) {
      const s = stateRef.current
      s.zoomScale  = percent / 100
      s.targetZoom = (s.autoRotate ? ZOOM_DEFAULT : ZOOM_IN) / s.zoomScale
    },
    getLatLonFromScreen(clientX, clientY) {
      const s = stateRef.current
      if (!s.globe || !s.camera) return null
      const canvas = mountRef.current?.querySelector('canvas')
      if (!canvas) return null
      const rect = canvas.getBoundingClientRect()
      const ndcX =  ((clientX - rect.left) / rect.width)  * 2 - 1
      const ndcY = -((clientY - rect.top)  / rect.height) * 2 + 1
      const raycaster = new THREE.Raycaster()
      raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), s.camera)
      const { origin, direction } = raycaster.ray
      // Transform ray into globe local space — this automatically undoes the +π
      // starting rotation, so lat/lon comes out in standard geographic coordinates.
      const inv = s.globe.matrixWorld.clone().invert()
      const lo  = origin.clone().applyMatrix4(inv)
      const ld  = direction.clone().transformDirection(inv)
      const a = ld.dot(ld), b = 2 * lo.dot(ld), c = lo.dot(lo) - 1
      const disc = b * b - 4 * a * c
      if (disc < 0) return null
      const t = (-b - Math.sqrt(disc)) / (2 * a)
      if (t < 0) return null
      const hit = lo.clone().addScaledVector(ld, t).normalize()
      const rawLon = Math.round(Math.atan2(hit.x, hit.z) * 1800 / Math.PI) / 10
      return {
        lat: Math.round(Math.asin(Math.max(-1, Math.min(1, hit.y))) * 1800 / Math.PI) / 10,
        lon: rawLon > 0 ? rawLon - 180 : rawLon + 180,
      }
    },
  }))

  // ── Scene setup (runs once on mount) ───────────────────────────────────
  useEffect(() => {
    const mount = mountRef.current
    const s     = stateRef.current
    const w     = mount.clientWidth
    const h     = mount.clientHeight

    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setPixelRatio(window.devicePixelRatio)
    renderer.setSize(w, h)
    renderer.setClearColor(0x000000, 1)
    mount.appendChild(renderer.domElement)

    // Camera uses a view offset to shift the globe right on desktop, keeping
    // hero text on the left. On mobile (≤900px) no offset is applied.
    const isMobile = w <= 900
    const scene  = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(42, w / h, 0.1, 100)
    camera.position.z = ZOOM_DEFAULT
    if (!isMobile) camera.setViewOffset(w, h, -w * 0.22, 0, w, h)
    s.camera = camera

    // ── Selective bloom setup ────────────────────────────────────────────
    // bloomComposer renders only BLOOM_LAYER objects (planes, trails, brackets)
    // to an offscreen texture. The main render draws everything normally, then
    // the bloom texture is additively blended in via a fullscreen quad.
    const bloomComposer = new EffectComposer(renderer)
    bloomComposer.renderToScreen = false
    bloomComposer.addPass(new RenderPass(scene, camera))
    bloomComposer.addPass(new UnrealBloomPass(new THREE.Vector2(w, h), 0.3, 0.6, 0.0))
    s.bloomComposer = bloomComposer

    // mainComposer routes the full scene through the same compositor pipeline as
    // EarthGlobe, ensuring identical sRGB output encoding. No bloom pass here —
    // the starfield relies solely on matching EarthGlobe's NormalBlending/opacity.
    const mainComposer = new EffectComposer(renderer)
    mainComposer.addPass(new RenderPass(scene, camera))
    s.mainComposer = mainComposer

    const overlayScene  = new THREE.Scene()
    const overlayCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
    const overlayMat = new THREE.MeshBasicMaterial({
      map: bloomComposer.readBuffer.texture,
      blending: THREE.AdditiveBlending,
      depthTest: false, depthWrite: false, transparent: true,
    })
    overlayScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), overlayMat))

    // ── Starfield ────────────────────────────────────────────────────────
    // Texture sphere on BLOOM_LAYER so the selective bloom pass enhances the stars.
    // bloomComposer strength is dialed down to 0.6 to avoid over-blooming.
    const starsTex   = new THREE.TextureLoader().load(starsUrl)
    const starSphere = new THREE.Mesh(
      new THREE.SphereGeometry(50, 64, 64),
      new THREE.MeshBasicMaterial({ map: starsTex, side: THREE.BackSide, opacity: 0.085, transparent: true }),
    )
    starSphere.layers.enable(BLOOM_LAYER)
    scene.add(starSphere)
    s.starSphere = starSphere

    // ── Globe group ──────────────────────────────────────────────────────
    const globe = new THREE.Group()
    globe.scale.setScalar(0.9)       // scaled down to match EarthGlobe's world size
    globe.rotation.order = 'XZY'
    globe.rotation.y     = initialY + PI  // +PI so "front" matches EarthGlobe
    scene.add(globe)
    s.globe = globe

    // Faint fill sphere — colour updated per colorMode in the recolor effect below.
    const fillMat = new THREE.MeshBasicMaterial({
      color: 0x001a2e, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.FrontSide,
    })
    globe.add(new THREE.Mesh(new THREE.SphereGeometry(1.007, 32, 32), fillMat))
    s.fillMat = fillMat

    // Lat/lon reference grid.
    const gridMat = new THREE.LineBasicMaterial({ color: 0x1a3d6e, transparent: true, opacity: 0.5 })
    for (let lat = -80; lat <= 80; lat += 20) {
      const pts = []
      for (let lon = 0; lon <= 360; lon += 2) pts.push(latLonToVec3(lat, lon, 1.005))
      globe.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), gridMat))
    }
    for (let lon = 0; lon < 360; lon += 20) {
      const pts = []
      for (let lat = -90; lat <= 90; lat += 2) pts.push(latLonToVec3(lat, lon, 1.005))
      globe.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), gridMat))
    }

    // Nav-location pings and brackets (bloom-tagged for selective glow).
    const { pingMat, pingPoints, bracketGroups, bracketMat } = buildPingsAndBrackets(globe, locations, {
      pingRadius:     1.005,
      bracketRadius:  1.02,
      resolution:     new THREE.Vector2(w, h),
      bloomLayer:     BLOOM_LAYER,
      bracketOpacity: 1.0,
    })
    s.pingMat       = pingMat
    s.pingPoints    = pingPoints
    s.bracketGroups = bracketGroups
    s.bracketMat    = bracketMat

    // Flight lanes (bloom-tagged).
    // Routes are pre-shifted ±180° in HOLO_ROUTES to match the +π globe rotation.
    const { lanesMat, lanesGroup, updatePlanes } = buildShippingLanes(globe, HOLO_ROUTES, {
      orbitRadius: PLANE_ORBIT_RADIUS,
      trailColor:  [1.0, 1.0, 1.0],  // white
      bloomLayer:  BLOOM_LAYER,
    })
    s.lanesMat      = lanesMat
    s.lanesGroup    = lanesGroup
    s.updatePlanes  = updatePlanes
    lanesGroup.visible = showFlights

    // ISS tracker — uses shiftLon so positions align with HoloEarth's +π rotation.
    const { updateISS, updateISSLabel, disposeISS, setISSVisible } = buildISSTracker(globe, 1.0, { shiftLon, container: labelsRef.current })
    s.updateISS     = updateISS
    s.updateISSLabel = updateISSLabel
    s.disposeISS    = disposeISS
    s.setISSVisible = setISSVisible

    // ── Elevation dots and city bars (async) ─────────────────────────────
    // See ./HoloEarth/buildElevationDots.js for the full pipeline.
    // `cancelled` guards against React StrictMode's double-invoke: the first
    // (stale) build is discarded when cleanup runs before the second mount.
    let cancelled = false
    buildElevationDots(globe, {
      initialColorMode:  s.colorMode,
      initialShowCities: s.showCitiesFlag,
      step:              dotStep,
      dotRadius:         dotRadius,
    }).then(result => {
      if (cancelled || !result) return
      Object.assign(s, result)
      // Reconcile visibility — showCitiesFlag may have changed while dots were loading.
      if (s.cityGroup) s.cityGroup.visible = s.showCitiesFlag
      // Re-apply per-city hidden state (hideCityBar may have been called before build finished).
      if (s.pendingHideCityNavIdx !== null) {
        const cityIdx = s.navCityIndices[s.pendingHideCityNavIdx]
        if (cityIdx >= 0 && s.citySubGroups[cityIdx]) s.citySubGroups[cityIdx].visible = false
      }
      // The colorMode effect ran before dots were ready and exited early (no mesh),
      // so we apply the correct dot colour and marker tint now that the mesh exists.
      recolorDots(s)
      applyMarkerColors(s)
      setLoading(false)
      onReady?.()
    })

    // ── City label overlay ──────────────────────────────────────────────
    if (labelsRef.current) {
      s.cityLabelSystem = createCityLabelSystem(labelsRef.current, {
        lonTransform: shiftLon,
        // Anchor above the building top for each city, accounting for terrain height.
        // Building tops reach base_radius + 0.037 (full S1 span × scale).
        // Falls back to a safe fixed radius until the bump map finishes loading.
        anchorRadius: (lat, lon) => {
          const bumpImg = s.bumpImg
          if (!bumpImg) return 1.12
          const holoLon = shiftLon(lon)
          const u = ((holoLon / 360) % 1 + 1) % 1
          const v = (90 - lat) / 180
          const bump     = sampleR(bumpImg, u, v)
          const terrainH = DOT_MIN_H + bump * (DOT_MAX_H - DOT_MIN_H)
          return 1.0 + terrainH + 0.003 + 0.038  // base + tallest building top
        },
      })
      s.cityLabelSystem.setStyle(s.colorMode)
      if (!s.showCitiesFlag) s.cityLabelSystem.setVisible(false)
    }

    // ── Animation loop ──────────────────────────────────────────────────
    // Three-pass render: bloom (layer 1 only) → normal scene → bloom overlay.
    const startTime = Date.now()
    let rafId

    function animate() {
      rafId = requestAnimationFrame(animate)
      const st = stateRef.current

      if (st.autoRotate) {
        st.autoY += 0.0025
        globe.rotation.y  = st.autoY
        globe.rotation.x += (AXIAL_TILT   - globe.rotation.x) * 0.03
        globe.rotation.z += (AXIAL_TILT_Z - globe.rotation.z) * 0.03
      } else if (!st.isDragging) {
        globe.rotation.x += (st.targetX - globe.rotation.x) * 0.04
        globe.rotation.y += (st.targetY - globe.rotation.y) * 0.04
        globe.rotation.z += (0          - globe.rotation.z) * 0.04
      } else {
        globe.rotation.z += (0 - globe.rotation.z) * 0.04
      }

      camera.position.z += (st.targetZoom    - camera.position.z) * 0.06
      camera.position.y += (st.targetCameraY - camera.position.y) * 0.04
      camera.lookAt(0, camera.position.y, 0)

      // Slowly rotate the starfield sphere.
      if (st.starSphere && st.starsRotating) st.starSphere.rotation.y += 0.0002

      const t = (Date.now() - startTime) / 1000
      if (st.lanesMat)     st.lanesMat.uniforms.uTime.value  = t
      if (st.updatePlanes) st.updatePlanes(t)
      if (st.updateISS)    st.updateISS(t)
      if (st.pingMat)      st.pingMat.uniforms.uTime.value   = t
      for (const m of st.buildingMats) m.uniforms.uTime.value = t

      // Pass 1: bloom — renders only BLOOM_LAYER objects to offscreen buffer.
      camera.layers.set(BLOOM_LAYER)
      bloomComposer.render()

      // Pass 2: full scene with high-threshold bloom (boosts bright stars only).
      camera.layers.enableAll()
      mainComposer.render()

      // Pass 3: overlay — additively blend bloom texture over the normal render.
      renderer.autoClear = false
      renderer.render(overlayScene, overlayCamera)
      renderer.autoClear = true

      // Update city label positions and typing animation (after render so matrixWorld is fresh).
      if (st.cityLabelSystem)  st.cityLabelSystem.update(t, globe, camera, renderer.domElement)
      if (st.updateISSLabel)   st.updateISSLabel(globe, camera, renderer.domElement)
    }
    animate()
    s.cancelAnim = () => cancelAnimationFrame(rafId)

    // ── Drag-to-rotate ──────────────────────────────────────────────────
    // Mouse + touch logic lives in src/hooks/globeDrag.js — shared with EarthGlobe.
    const cleanupDrag = setupGlobeDrag(renderer.domElement, stateRef, camera, {
      zoomDefault:  ZOOM_DEFAULT,
      idleReturnMs: IDLE_RETURN_MS,
    })

    // ── Resize handler ──────────────────────────────────────────────────
    const onResize = () => {
      const w2 = mount.clientWidth
      const h2 = mount.clientHeight
      if (!w2 || !h2) return  // element is hidden (display:none); skip to avoid setSize(0,0)
      camera.aspect = w2 / h2
      if (w2 <= 900) {
        camera.clearViewOffset()
      } else {
        camera.setViewOffset(w2, h2, -w2 * 0.22, 0, w2, h2)
      }
      camera.updateProjectionMatrix()
      renderer.setSize(w2, h2)
      bloomComposer.setSize(w2, h2)
      mainComposer.setSize(w2, h2)
      s.bracketMat?.resolution.set(w2, h2)
    }
    window.addEventListener('resize', onResize)

    // ── Cleanup ─────────────────────────────────────────────────────────
    return () => {
      cancelled = true  // discard any in-flight buildElevationDots result
      s.cancelAnim?.()
      cleanupDrag()
      window.removeEventListener('resize', onResize)
      if (mount.contains(renderer.domElement)) mount.removeChild(renderer.domElement)
      s.starSphere?.material.map?.dispose()
      s.cityLabelSystem?.dispose()
      s.disposeISS?.()
      renderer.dispose()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Colour mode changes ─────────────────────────────────────────────────
  // Runs whenever the colorMode prop changes. Updates the fill sphere colour,
  // marker tints, label style, and elevation-dot colours. If dots haven't
  // loaded yet, recolorDots no-ops — the initial build callback will apply the
  // correct colour once the async mesh is ready.
  useEffect(() => {
    const s = stateRef.current
    s.colorMode = colorMode

    if (s.fillMat) {
      const fill = COLOR_MODE_FILL[colorMode] ?? COLOR_MODE_FILL.hologram
      s.fillMat.color.setHex(fill.color)
      s.fillMat.opacity = fill.opacity
    }

    applyMarkerColors(s)
    s.cityLabelSystem?.setStyle(colorMode)
    recolorDots(s)
  }, [colorMode])

  // ── City visibility toggle ──────────────────────────────────────────────
  useEffect(() => {
    const s = stateRef.current
    s.showCitiesFlag = showCities
    if (s.cityGroup) s.cityGroup.visible = showCities
    s.cityLabelSystem?.setVisible(showCities)
  }, [showCities])

  // ── Flight visibility toggle ────────────────────────────────────────────
  useEffect(() => {
    if (stateRef.current.lanesGroup) stateRef.current.lanesGroup.visible = showFlights
  }, [showFlights])

  // ── ISS visibility toggle ───────────────────────────────────────────────
  useEffect(() => {
    stateRef.current.setISSVisible?.(showISS)
  }, [showISS])

  // ── Starfield rotation toggle ───────────────────────────────────────────
  useEffect(() => {
    stateRef.current.starsRotating = starsRotating
  }, [starsRotating])

  // ── Dot detail level rebuild ────────────────────────────────────────────
  // Runs when dotStep or dotRadius props change after the initial build. Tears
  // down the existing dot mesh and city bars then rebuilds at the new density.
  useEffect(() => {
    const s = stateRef.current
    if (!s.mesh) return  // initial async build not yet done — it will use latest props

    // Tear down old geometry
    s.globe.remove(s.mesh)
    s.mesh.geometry.dispose()
    s.mesh.material.dispose()
    if (s.cityGroup) s.globe.remove(s.cityGroup)
    s.mesh = null
    s.cityGroup = null
    s.citySubGroups = []

    const preloadedImages = s.specImg
      ? { specImg: s.specImg, bumpImg: s.bumpImg, imgCache: s.imgCache }
      : null

    buildElevationDots(s.globe, {
      initialColorMode:  s.colorMode,
      initialShowCities: s.showCitiesFlag,
      step:              dotStep,
      dotRadius:         dotRadius,
      preloadedImages,
    }).then(result => {
      if (!result) return
      Object.assign(s, result)
      if (s.cityGroup) s.cityGroup.visible = s.showCitiesFlag
      if (s.pendingHideCityNavIdx !== null) {
        const cityIdx = s.navCityIndices[s.pendingHideCityNavIdx]
        if (cityIdx >= 0 && s.citySubGroups[cityIdx]) s.citySubGroups[cityIdx].visible = false
      }
      // Re-apply colours — buildElevationDots applied the initial colour during
      // construction, but colorMode/markers may have changed while the rebuild
      // was in-flight.
      recolorDots(s)
      applyMarkerColors(s)
    })
  }, [dotStep, dotRadius]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── JSX ─────────────────────────────────────────────────────────────────

  const canvas = (
    <div ref={mountRef} style={{ width: '100%', height: '100%' }} />
  )

  const loadingOverlay = loading ? (
    <div style={{
      position: 'absolute', inset: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      pointerEvents: 'none',
    }}>
      <span style={{
        color: 'rgba(0,180,255,0.7)', fontSize: '0.75rem',
        letterSpacing: '0.15em', textTransform: 'uppercase', fontFamily: 'monospace',
      }}>
        Loading…
      </span>
    </div>
  ) : null

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      {canvas}
      <div
        ref={labelsRef}
        style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}
      />
      {loadingOverlay}
    </div>
  )
})

export default HoloEarth
