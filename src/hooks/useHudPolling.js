import { useState, useEffect } from 'react'

export function useHudPolling(isHoloRef, globeRef, holoRef, mouseOnGlobeRef, mousePosRef) {
  const [hudRotation, setHudRotation] = useState(0)
  const [hoveredCoords, setHoveredCoords] = useState(null)

  useEffect(() => {
    const id = setInterval(() => {
      const ref = isHoloRef.current ? holoRef : globeRef
      const y = ref.current?.getRotationY() ?? 0
      setHudRotation(Math.round(((y * 180 / Math.PI) % 360 + 360) % 360))
      if (mouseOnGlobeRef.current && mousePosRef.current) {
        const { x, y: my } = mousePosRef.current
        setHoveredCoords(ref.current?.getLatLonFromScreen(x, my) ?? null)
      }
    }, 150)
    return () => clearInterval(id)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return { hudRotation, hoveredCoords, setHoveredCoords }
}
