/**
 * WireframeEarth — standard blue-tech globe.
 *
 * Features:
 *   • Hex-grid dot overlay on landmasses (breathing + warm blinks)
 *   • Thick glowing coastlines + thin country borders
 *   • Animated flight lanes with plane icons and trailing lines
 *   • City marker bars (3D cuboids, tiered by population)
 *   • Pulsing ping rings + hover brackets at nav locations
 *   • Drag-to-rotate (returns to auto-rotate after 2 s idle)
 *   • Post-processing UnrealBloomPass (global — all bright objects glow)
 *
 * Props:
 *   locations  — { lat, lon }[] for nav-link ping/bracket markers
 *   initialY   — initial Y rotation in radians (synced from HoloEarth on toggle)
 *   showCities — whether city bar markers are visible (controlled by toggle in App)
 *
 * Imperative API (via ref):
 *   rotateTo(lat, lon)   — smoothly rotate to a location and zoom in
 *   resumeAutoRotate()   — cancel any manual rotation and resume auto-spin
 *   getRotationY()       — current Y rotation (for sync when toggling to HoloEarth)
 *   setRotationY(y)      — set Y rotation without animation (sync on toggle)
 *   showBracket(i)       — show bracket for nav location i, hide all others
 *   hideBracket()        — hide all brackets
 *   setZoom(percent)     — scale the globe to percent% of its default size (100 = default)
 *
 * Scene geometry:  ./EarthGlobe/buildGlobeScene.js
 * Constants:       ./EarthGlobe/constants.js
 */

import { useEffect, useRef, forwardRef, useImperativeHandle } from 'react'
import * as THREE from 'three'
import { EffectComposer }  from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass }      from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { ShaderPass }      from 'three/examples/jsm/postprocessing/ShaderPass.js'

import { buildGlobeScene } from './EarthGlobe/buildGlobeScene.js'
import { createCityLabelSystem } from '../utils/cityLabels.js'
import { setupGlobeDrag } from '../hooks/globeDrag.js'
import {
  ZOOM_DEFAULT, ZOOM_IN, BG_COLOR, RADIUS,
  AXIAL_TILT, AXIAL_TILT_Z, IDLE_RETURN_MS,
} from './EarthGlobe/constants.js'

const { PI } = Math

const WireframeEarth = forwardRef(function WireframeEarth(
  { locations = [], initialY = 0, showCities = true, showFlights = true, showDots = true, starsRotating = true, showISS = false, navCityIndices = [] },
  ref,
) {
  const mountRef  = useRef(null)
  const labelsRef = useRef(null)

  // All mutable Three.js state lives here — avoids React re-renders triggering
  // scene rebuilds. Never read/write this inside render; only inside effects.
  const stateRef = useRef({
    globe:           null,
    starSphere:      null,
    camera:          null,
    autoRotate:      true,
    autoY:           initialY,
    targetX:         0,
    targetY:         initialY,
    targetZoom:      ZOOM_DEFAULT,
    targetCameraY:   0,
    cancelAnim:      null,
    coastMats:       [],
    dotsMat:         null,
    dotsMesh:        null,
    landTex:         null,
    lanesMat:        null,
    lanesGroup:      null,
    updatePlanes:    null,
    pingMat:         null,
    pingPoints:      [],
    bracketGroups:   [],
    bracketMat:      null,
    buildingMats:    [],
    cityGroup:       null,
    citySubGroups:   [],
    navCityIndices:  navCityIndices,
    updateISS:       null,
    updateISSLabel:  null,
    disposeISS:      null,
    setISSVisible:   null,
    issGroup:        null,
    issRing:         null,
    issBeam:         null,
    issScan:         null,
    issSpot:         null,
    isDragging:      false,
    dragLastX:       0,
    dragLastY:       0,
    zoomScale:       1,
    starsRotating:   starsRotating,
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
      // Shortest-path rotation: pick the diff that stays within ±π.
      const curY = ((s.globe.rotation.y % (2*PI)) + 2*PI) % (2*PI)
      let   tgtY = ((-lon * PI / 180)   % (2*PI) + 2*PI) % (2*PI)
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
      s.targetCameraY = RADIUS
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
    getRotationY()  { return stateRef.current.globe?.rotation.y ?? 0 },
    setRotationY(y) {
      const s = stateRef.current
      if (!s.globe) return
      s.globe.rotation.y = y
      s.autoY = y
      s.targetY = y
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
      const cityIdx = s.navCityIndices[navIdx]
      if (cityIdx >= 0 && s.citySubGroups[cityIdx]) s.citySubGroups[cityIdx].visible = false
    },
    showCityBar(navIdx) {
      const s = stateRef.current
      const cityIdx = s.navCityIndices[navIdx]
      if (cityIdx >= 0 && s.citySubGroups[cityIdx]) s.citySubGroups[cityIdx].visible = true
    },
    setZoom(percent) {
      const s = stateRef.current
      s.zoomScale  = percent / 100
      // Adjust current target zoom proportionally.
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
      // Transform ray into globe local space so we intersect the unit sphere there.
      const inv = s.globe.matrixWorld.clone().invert()
      const lo  = origin.clone().applyMatrix4(inv)
      const ld  = direction.clone().transformDirection(inv)
      const a = ld.dot(ld), b = 2 * lo.dot(ld), c = lo.dot(lo) - 1
      const disc = b * b - 4 * a * c
      if (disc < 0) return null
      const t = (-b - Math.sqrt(disc)) / (2 * a)
      if (t < 0) return null
      const hit = lo.clone().addScaledVector(ld, t).normalize()
      return {
        lat: Math.round(Math.asin(Math.max(-1, Math.min(1, hit.y))) * 1800 / Math.PI) / 10,
        lon: Math.round(Math.atan2(hit.x, hit.z) * 1800 / Math.PI) / 10,
      }
    },
  }))

  // ── Scene setup (runs once on mount) ───────────────────────────────────
  useEffect(() => {
    const mount = mountRef.current
    const s     = stateRef.current
    const w     = mount.clientWidth
    const h     = mount.clientHeight

    // Camera uses a view offset to shift the globe right on desktop, keeping
    // hero text on the left. On mobile (≤900px) no offset is applied so the
    // globe fills the full width.
    const isMobile = w <= 900
    const scene  = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(42, w / h, 0.1, 100)
    camera.position.z = ZOOM_DEFAULT
    if (!isMobile) camera.setViewOffset(w, h, -w * 0.22, 0, w, h)
    s.camera = camera

    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setPixelRatio(window.devicePixelRatio)
    renderer.setSize(w, h)
    renderer.setClearColor(0x000000, 1)
    mount.appendChild(renderer.domElement)

    // Selective bloom: bloomComposer renders only layer-1 objects to a RT;
    // finalComposer renders all objects and additively blends the bloom RT on top.
    // City buildings stay on layer 0 only → they never contribute to bloom.
    const bloomComposer = new EffectComposer(renderer)
    bloomComposer.renderToScreen = false
    bloomComposer.addPass(new RenderPass(scene, camera))
    bloomComposer.addPass(new UnrealBloomPass(new THREE.Vector2(w, h), 1.6, 0.6, 0.05))

    const finalPass = new ShaderPass(
      new THREE.ShaderMaterial({
        uniforms: {
          baseTexture:  { value: null },
          bloomTexture: { value: bloomComposer.renderTarget2.texture },
        },
        vertexShader: `
          varying vec2 vUv;
          void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }
        `,
        fragmentShader: `
          uniform sampler2D baseTexture;
          uniform sampler2D bloomTexture;
          varying vec2 vUv;
          void main() { gl_FragColor = texture2D(baseTexture,vUv) + texture2D(bloomTexture,vUv); }
        `,
      }), 'baseTexture',
    )
    finalPass.needsSwap = true
    const finalComposer = new EffectComposer(renderer)
    finalComposer.addPass(new RenderPass(scene, camera))
    finalComposer.addPass(finalPass)

    const { globe, starSphere, coastMats, dotsMat, dotsMesh, landTex, lanesMat, lanesGroup, updatePlanes, pingMat, pingPoints, bracketGroups, bracketMat, cityGroup, citySubGroups, buildingMats, updateISS, updateISSLabel, disposeISS, setISSVisible, issGroup, issRing, issBeam, issScan, issSpot } = buildGlobeScene(locations, w, h, labelsRef.current)
    scene.add(starSphere)
    scene.add(globe)
    Object.assign(s, { globe, starSphere, coastMats, dotsMat, dotsMesh, landTex, lanesMat, lanesGroup, updatePlanes, pingMat, pingPoints, bracketGroups, bracketMat, cityGroup, citySubGroups, buildingMats, updateISS, updateISSLabel, disposeISS, setISSVisible, issGroup, issRing, issBeam, issScan, issSpot })
    globe.rotation.order  = 'XZY'
    globe.rotation.y      = initialY
    cityGroup.visible     = showCities
    lanesGroup.visible    = showFlights
    dotsMesh.visible      = showDots

    // ── City label overlay ──────────────────────────────────────────────
    if (labelsRef.current) {
      s.cityLabelSystem = createCityLabelSystem(labelsRef.current, { anchorRadius: 0.93 })
      if (!showCities) s.cityLabelSystem.setVisible(false)
    }

    // ── Animation loop ──────────────────────────────────────────────────
    const startTime = Date.now()
    let rafId

    function animate() {
      rafId = requestAnimationFrame(animate)
      const st = stateRef.current

      // Globe rotation — three modes: auto-spinning, lerping to target, dragging.
      if (st.autoRotate) {
        st.autoY += 0.0025
        globe.rotation.y = st.autoY
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

      // Advance all time-driven shaders.
      const t = (Date.now() - startTime) / 1000
      if (st.dotsMat)   st.dotsMat.uniforms.uTime.value   = t
      if (st.lanesMat)    st.lanesMat.uniforms.uTime.value  = t
      if (st.updatePlanes) st.updatePlanes(t)
      if (st.updateISS)    st.updateISS(t)
      if (st.pingMat)   st.pingMat.uniforms.uTime.value   = t
      for (const m of st.buildingMats) m.uniforms.uTime.value = t

      // Bloom pass: hide buildings and ISS so they don't contribute to the bloom RT.
      const cityWasVisible = st.cityGroup?.visible ?? false
      const issWasVisible  = st.issGroup?.visible  ?? false
      const ringWasVisible = st.issRing?.visible   ?? false
      const beamWasVisible = st.issBeam?.visible   ?? false
      const scanWasVisible = st.issScan?.visible   ?? false
      const spotWasVisible = st.issSpot?.visible   ?? false
      if (st.cityGroup) st.cityGroup.visible = false
      if (st.issGroup)  st.issGroup.visible  = false
      if (st.issRing)   st.issRing.visible   = false
      if (st.issBeam)   st.issBeam.visible   = false
      if (st.issScan)   st.issScan.visible   = false
      if (st.issSpot)   st.issSpot.visible   = false
      bloomComposer.render()
      if (st.cityGroup) st.cityGroup.visible = cityWasVisible
      if (st.issGroup)  st.issGroup.visible  = issWasVisible
      if (st.issRing)   st.issRing.visible   = ringWasVisible
      if (st.issBeam)   st.issBeam.visible   = beamWasVisible
      if (st.issScan)   st.issScan.visible   = scanWasVisible
      if (st.issSpot)   st.issSpot.visible   = spotWasVisible
      finalComposer.render()

      // Update city label positions and typing animation (after render so matrixWorld is fresh).
      if (st.cityLabelSystem) st.cityLabelSystem.update(t, globe, camera, renderer.domElement)
      if (st.updateISSLabel)  st.updateISSLabel(globe, camera, renderer.domElement)
    }
    animate()
    s.cancelAnim = () => cancelAnimationFrame(rafId)

    // ── Drag-to-rotate ──────────────────────────────────────────────────
    // Mouse + touch logic lives in src/hooks/globeDrag.js — shared with HoloEarth.
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
      finalComposer.setSize(w2, h2)
      for (const mat of s.coastMats) mat.resolution.set(w2, h2)
      s.bracketMat?.resolution.set(w2, h2)
    }
    window.addEventListener('resize', onResize)

    // ── Cleanup ─────────────────────────────────────────────────────────
    return () => {
      s.cancelAnim?.()
      cleanupDrag()
      window.removeEventListener('resize', onResize)
      if (mount.contains(renderer.domElement)) mount.removeChild(renderer.domElement)
      s.landTex?.dispose()
      s.cityLabelSystem?.dispose()
      s.disposeISS?.()
      renderer.dispose()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── City visibility toggle ──────────────────────────────────────────────
  useEffect(() => {
    const s = stateRef.current
    if (s.cityGroup) s.cityGroup.visible = showCities
    s.cityLabelSystem?.setVisible(showCities)
  }, [showCities])

  // ── Flight visibility toggle ────────────────────────────────────────────
  useEffect(() => {
    if (stateRef.current.lanesGroup) stateRef.current.lanesGroup.visible = showFlights
  }, [showFlights])

  // ── Dots visibility toggle ──────────────────────────────────────────────
  useEffect(() => {
    if (stateRef.current.dotsMesh) stateRef.current.dotsMesh.visible = showDots
  }, [showDots])

  // ── ISS visibility toggle ───────────────────────────────────────────────
  useEffect(() => {
    stateRef.current.setISSVisible?.(showISS)
  }, [showISS])

  // ── Starfield rotation toggle ───────────────────────────────────────────
  useEffect(() => {
    stateRef.current.starsRotating = starsRotating
  }, [starsRotating])

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <div ref={mountRef} style={{ width: '100%', height: '100%' }} />
      <div
        ref={labelsRef}
        style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}
      />
    </div>
  )
})

export default WireframeEarth
