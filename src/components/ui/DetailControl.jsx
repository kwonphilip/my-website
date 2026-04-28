/**
 * DetailControl — terrain-detail button + popup slider (HoloEarth only).
 *
 * Extracted from App.jsx to own the pending slider state and outside-click wiring,
 * so App only tracks the committed `appliedDetail` value it needs to pass to HoloEarth.
 *
 * Only rendered when `isHolo` is true — EarthGlobe doesn't have elevation dots so
 * the control has no effect there and is hidden.
 *
 * The popup shows two values side by side:
 *   Applied (last committed) ⟶ Pending (current slider position)
 * The Pending value highlights when it differs from Applied, giving the user clear
 * feedback about what will change before they click Apply.
 *
 * Props:
 *   isHolo        — hides the control entirely when false
 *   holoReady     — Apply is disabled until the async elevation-dot build finishes
 *   appliedDetail — currently committed detail level (shown as the reference value)
 *   onApply(v)    — called with the new detail level when Apply or Reset is committed
 */

import { useState, useRef, useEffect } from 'react'
import landscapeIcon from '../../assets/icons/landscape_icon.png'
import './ZoomControl.css'
import './DetailControl.css'

export default function DetailControl({ isHolo, holoReady, appliedDetail, onApply }) {
  const [showDetailPopup, setShowDetailPopup] = useState(false)
  const [pendingDetail,   setPendingDetail]   = useState(appliedDetail)

  // Keep pendingDetail in sync when appliedDetail changes externally (e.g. applied
  // via the other DetailControl instance when resizing between mobile and desktop).
  useEffect(() => { setPendingDetail(appliedDetail) }, [appliedDetail])
  const wrapRef = useRef(null)

  // Close when the user clicks anywhere outside the wrapper div.
  // Only registered while the popup is open to avoid idle global listeners.
  useEffect(() => {
    if (!showDetailPopup) return
    const onOutside = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setShowDetailPopup(false)
    }
    window.addEventListener('mousedown', onOutside)
    return () => window.removeEventListener('mousedown', onOutside)
  }, [showDetailPopup])

  // Nothing to show when the standard globe is active.
  if (!isHolo) return null

  return (
    <div className="detail-wrap" ref={wrapRef}>
      <button
        className={`icon-toggle${showDetailPopup ? ' icon-toggle-active' : ''}`}
        onClick={() => setShowDetailPopup(v => !v)}
        aria-label="Toggle terrain detail controls"
        title="Terrain detail level"
      >
        <img src={landscapeIcon} alt="Terrain detail" className="toggle-img" />
      </button>

      {showDetailPopup && (
        <div className="detail-popup">
          <div className="zoom-popup-header">
            <span className="zoom-popup-title">Terrain Detail</span>
            <button
              className="zoom-popup-close"
              onClick={() => setShowDetailPopup(false)}
              aria-label="Close detail popup"
            >
              ✕
            </button>
          </div>

          {/* Applied vs pending: highlights when the slider has moved but not committed. */}
          <div className="detail-popup-values-row">
            <span className="detail-popup-value-label">Applied</span>
            <span className="detail-popup-value-num">{appliedDetail}%</span>
            <span className="detail-popup-value-arrow">⟶</span>
            <span className={`detail-popup-value-num${pendingDetail !== appliedDetail ? ' detail-popup-value-pending' : ''}`}>
              {pendingDetail}%
            </span>
          </div>

          <div className="detail-popup-slider-row">
            <span className="detail-popup-end-label">Less</span>
            <input
              type="range"
              className="detail-slider"
              min="50"
              max="150"
              value={pendingDetail}
              onChange={e => setPendingDetail(Number(e.target.value))}
            />
            <span className="detail-popup-end-label">More</span>
          </div>

          <div style={{ display: 'flex', gap: '0.4rem' }}>
            {/* Apply is gated on holoReady: the async dot mesh build must finish first
                or the new params would be ignored by HoloEarth. */}
            <button
              className="zoom-popup-apply"
              style={{ flex: 1 }}
              disabled={!holoReady}
              onClick={() => { onApply(pendingDetail); setShowDetailPopup(false) }}
            >
              Apply
            </button>
            <button
              className="zoom-popup-reset"
              style={{ width: 'auto', flex: 1 }}
              onClick={() => { setPendingDetail(100); onApply(100) }}
            >
              Reset
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
