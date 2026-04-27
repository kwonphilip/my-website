/**
 * Polls the active globe for rotation angle and hovered coordinates at 150 ms intervals.
 *
 * Why polling instead of a callback/event?
 * The Three.js animation loop runs on requestAnimationFrame (~60 fps). Emitting a React
 * state update every frame would force 60 re-renders/second — far more than the HUD needs.
 * Polling at 150 ms (≈7 fps) is imperceptible for a readout that shows rounded numbers.
 *
 * Why refs instead of state for isHoloRef / mousePosRef / mouseOnGlobeRef?
 * The setInterval callback captures values by reference — if these were state, the closure
 * would see the initial value forever. Refs are mutable containers the interval reads live.
 *
 * ── Visual lever ──────────────────────────────────────────────────────────
 *   150  Polling interval in ms. Lower = more responsive HUD but slightly more CPU.
 *        80 ms is perceptually instant; above 250 ms starts to feel laggy.
 */
import { useState, useEffect } from 'react'

export function useHudPolling(isHoloRef, globeRef, holoRef, mouseOnGlobeRef, mousePosRef) {
  const [hudRotation, setHudRotation] = useState(0)
  const [hoveredCoords, setHoveredCoords] = useState(null)

  useEffect(() => {
    const id = setInterval(() => {
      // Read from whichever globe is currently visible.
      const ref = isHoloRef.current ? holoRef : globeRef
      // Convert radians to a 0–359° display value.
      const y = ref.current?.getRotationY() ?? 0
      setHudRotation(Math.round(((y * 180 / Math.PI) % 360 + 360) % 360))
      // Only compute lat/lon when the mouse is on the globe — avoids unnecessary raycasting.
      if (mouseOnGlobeRef.current && mousePosRef.current) {
        const { x, y: my } = mousePosRef.current
        setHoveredCoords(ref.current?.getLatLonFromScreen(x, my) ?? null)
      }
    }, 150)
    return () => clearInterval(id)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return { hudRotation, hoveredCoords, setHoveredCoords }
}
