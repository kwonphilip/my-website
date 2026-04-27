/**
 * Automatically zooms to 70% when the window shrinks to mobile width (≤900 px),
 * then restores the previous zoom when the window grows back to desktop.
 *
 * Why save and restore instead of always resetting to 100%?
 * The user may have set a custom zoom (e.g. 150%) on desktop before resizing.
 * Discarding that preference and snapping to 100% on return would be surprising.
 * Saving in prevZoomRef and restoring it gives a natural feel.
 *
 * Why lastAppliedZoomRef rather than reading currentZoom state directly?
 * applyZoom is wrapped in useCallback with an empty dep array so it can be passed
 * as a stable prop. If we captured currentZoom from a closure it would be stale
 * (always the value from mount). The ref is always up to date regardless of closure age.
 *
 * ── Visual lever ──────────────────────────────────────────────────────────
 *   applyZoom(70)   Mobile zoom level. 70% shrinks the globe so it doesn't
 *                   dominate the small screen. Try 60–80 for a different feel.
 *   window.innerWidth <= 900   Mobile breakpoint (matches App.jsx + globeDrag.js).
 */
import { useRef, useEffect } from 'react'

export function useMobileZoom(applyZoom, lastAppliedZoomRef) {
  const prevZoomRef = useRef(null) // null = currently on desktop (no saved zoom)

  useEffect(() => {
    const handleMobileZoom = () => {
      const mobile = window.innerWidth <= 900
      if (mobile && prevZoomRef.current === null) {
        // Entering mobile: save current zoom and apply the mobile default.
        prevZoomRef.current = lastAppliedZoomRef.current
        applyZoom(70)
      } else if (!mobile && prevZoomRef.current !== null) {
        // Returning to desktop: restore the previously saved zoom.
        applyZoom(prevZoomRef.current)
        prevZoomRef.current = null
      }
    }
    handleMobileZoom() // run once on mount to handle the initial window size
    window.addEventListener('resize', handleMobileZoom)
    return () => window.removeEventListener('resize', handleMobileZoom)
  }, [applyZoom]) // eslint-disable-line react-hooks/exhaustive-deps
}
