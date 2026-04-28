/**
 * Drag-to-rotate utility shared by WireframeEarth and HoloEarth.
 *
 * Before this module, ~100 lines of identical mouse + touch drag logic lived
 * inside each globe component's useEffect. Any bug fix or behaviour tweak had
 * to be applied twice. `setupGlobeDrag` centralises that logic.
 *
 * Usage (inside a scene-setup useEffect, after the animation loop starts):
 *
 *   const cleanupDrag = setupGlobeDrag(renderer.domElement, stateRef, camera, {
 *     zoomDefault:  ZOOM_DEFAULT,
 *     idleReturnMs: IDLE_RETURN_MS,
 *   })
 *   // Include in the useEffect cleanup return:
 *   return () => { cleanupDrag(); ... }
 *
 * Contract with stateRef.current — the function reads and writes these fields:
 *   Read:   globe, zoomScale
 *   Write:  isDragging, dragLastX, dragLastY, autoRotate, autoY,
 *           targetY, targetX, targetZoom, globe.rotation.y, globe.rotation.x
 *
 * Why the hit-test radius scales with camera.position.z:
 *   When the user zooms in, the globe fills more of the screen. A fixed pixel
 *   radius would make the globe clickable only near its unzoomed appearance.
 *   Multiplying by (zoomDefault / camera.position.z) makes the region grow
 *   proportionally with the apparent globe size.
 *
 * Why the globe centre is at 75% width on desktop, 50% on mobile:
 *   Both globe components apply a camera view offset on wide screens to shift
 *   the globe rightward, leaving room for the hero text on the left. On mobile
 *   (≤900 px) the offset is cleared and the globe is centred normally.
 */

const { PI, max, min, hypot } = Math

/**
 * Attaches mouse and touch drag handlers to `canvas` and returns a cleanup fn.
 *
 * @param {HTMLCanvasElement} canvas       The renderer's DOM element.
 * @param {{ current: object }} stateRef   React ref holding all mutable scene state.
 * @param {THREE.Camera}       camera      Shared camera (stable reference).
 * @param {object}             opts
 * @param {number}             opts.zoomDefault    Camera z-distance at 100% zoom.
 * @param {number}             opts.idleReturnMs   Ms of no drag before auto-rotate resumes.
 * @returns {() => void}  Cleanup function — removes all listeners and clears the timer.
 */
export function setupGlobeDrag(canvas, stateRef, camera, { zoomDefault, idleReturnMs }) {
  const s = stateRef.current
  canvas.style.cursor = 'default'
  let idleTimer = null

  // Returns true if the pointer is within the globe's visible circle.
  // On desktop the globe is offset to 75% of canvas width; on mobile it's centred.
  const isOverGlobe = (clientX, clientY) => {
    const rect = canvas.getBoundingClientRect()
    const cw   = rect.width
    const ch   = rect.height
    const gx   = cw <= 900 ? cw * 0.5 : cw * 0.75
    const gy   = ch * 0.5
    const maxR = min(cw, ch) * 0.46 * (zoomDefault / camera.position.z)
    return hypot(clientX - rect.left - gx, clientY - rect.top - gy) <= maxR
  }

  // After the user releases, wait idleReturnMs then resume auto-rotation.
  // Cancelled immediately if a new drag starts, so rapid drags don't trigger it.
  const scheduleReturn = () => {
    clearTimeout(idleTimer)
    idleTimer = setTimeout(() => {
      if (!s.globe) return
      s.autoY         = s.globe.rotation.y
      s.autoRotate    = true
      s.targetZoom    = zoomDefault / s.zoomScale
      s.targetCameraY = 0
    }, idleReturnMs)
  }

  // ── Mouse events ──────────────────────────────────────────────────────────

  const onMouseDown = (e) => {
    if (!isOverGlobe(e.clientX, e.clientY)) return
    clearTimeout(idleTimer)
    s.isDragging = true
    s.dragLastX  = e.clientX
    s.dragLastY  = e.clientY
    s.autoRotate = false
    canvas.style.cursor = 'grabbing'
  }

  const onMouseMove = (e) => {
    if (s.isDragging) {
      if (!s.globe) return
      const dx    = e.clientX - s.dragLastX
      const dy    = e.clientY - s.dragLastY
      s.dragLastX = e.clientX
      s.dragLastY = e.clientY
      s.globe.rotation.y += dx * 0.005
      // Clamp X to ±90° so the globe can't flip upside-down.
      s.globe.rotation.x  = max(-PI / 2, min(PI / 2, s.globe.rotation.x + dy * 0.005))
      // Keep lerp targets in sync — without this the animation loop snaps the
      // globe back to the pre-drag target as soon as isDragging becomes false.
      s.targetY = s.globe.rotation.y
      s.targetX = s.globe.rotation.x
      s.autoY   = s.globe.rotation.y
    } else {
      canvas.style.cursor = isOverGlobe(e.clientX, e.clientY) ? 'grab' : 'default'
    }
  }

  const onMouseUp = (e) => {
    if (!s.isDragging) return
    s.isDragging = false
    canvas.style.cursor = isOverGlobe(e.clientX, e.clientY) ? 'grab' : 'default'
    scheduleReturn()
  }

  // ── Touch events (mobile) ─────────────────────────────────────────────────
  // Identical logic to mouse, but reading from e.touches[0].
  // touchmove is non-passive so we can call e.preventDefault() and suppress
  // the browser's default scroll behaviour while dragging the globe.

  const onTouchStart = (e) => {
    if (e.touches.length !== 1) return  // ignore pinch/multi-touch
    clearTimeout(idleTimer)
    s.isDragging = true
    s.dragLastX  = e.touches[0].clientX
    s.dragLastY  = e.touches[0].clientY
    s.autoRotate = false
  }

  const onTouchMove = (e) => {
    if (!s.isDragging || !s.globe || e.touches.length !== 1) return
    e.preventDefault()  // prevents page scroll while rotating the globe
    const dx    = e.touches[0].clientX - s.dragLastX
    const dy    = e.touches[0].clientY - s.dragLastY
    s.dragLastX = e.touches[0].clientX
    s.dragLastY = e.touches[0].clientY
    s.globe.rotation.y += dx * 0.005
    s.globe.rotation.x  = max(-PI / 2, min(PI / 2, s.globe.rotation.x + dy * 0.005))
    s.targetY = s.globe.rotation.y
    s.targetX = s.globe.rotation.x
    s.autoY   = s.globe.rotation.y
  }

  const onTouchEnd = () => {
    if (!s.isDragging) return
    s.isDragging = false
    scheduleReturn()
  }

  canvas.addEventListener('mousedown',  onMouseDown)
  window.addEventListener('mousemove',  onMouseMove)
  window.addEventListener('mouseup',    onMouseUp)
  canvas.addEventListener('touchstart', onTouchStart, { passive: true })
  canvas.addEventListener('touchmove',  onTouchMove,  { passive: false })
  canvas.addEventListener('touchend',   onTouchEnd)

  return () => {
    clearTimeout(idleTimer)
    canvas.removeEventListener('mousedown',  onMouseDown)
    window.removeEventListener('mousemove',  onMouseMove)
    window.removeEventListener('mouseup',    onMouseUp)
    canvas.removeEventListener('touchstart', onTouchStart)
    canvas.removeEventListener('touchmove',  onTouchMove)
    canvas.removeEventListener('touchend',   onTouchEnd)
  }
}
