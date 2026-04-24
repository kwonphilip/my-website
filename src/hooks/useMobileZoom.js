import { useRef, useEffect } from 'react'

export function useMobileZoom(applyZoom, lastAppliedZoomRef) {
  const prevZoomRef = useRef(null)

  useEffect(() => {
    const handleMobileZoom = () => {
      const mobile = window.innerWidth <= 900
      if (mobile && prevZoomRef.current === null) {
        prevZoomRef.current = lastAppliedZoomRef.current
        applyZoom(70)
      } else if (!mobile && prevZoomRef.current !== null) {
        applyZoom(prevZoomRef.current)
        prevZoomRef.current = null
      }
    }
    handleMobileZoom()
    window.addEventListener('resize', handleMobileZoom)
    return () => window.removeEventListener('resize', handleMobileZoom)
  }, [applyZoom]) // eslint-disable-line react-hooks/exhaustive-deps
}
