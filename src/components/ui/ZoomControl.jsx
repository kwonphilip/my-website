/**
 * ZoomControl — zoom button + popup panel.
 *
 * Extracted from App.jsx to own its popup-open state and the raw text-field value,
 * so App only hears about committed zoom values via callbacks. This keeps
 * zoom-specific event wiring (Escape key, outside click) out of App's effect list.
 *
 * Props:
 *   onApply(percent) — called with a clamped (10–300) zoom level when committed
 *   onReset()        — called when the Reset button is clicked
 */

import { useState, useRef, useEffect } from 'react'

export default function ZoomControl({ onApply, onReset }) {
  const [showZoomPopup, setShowZoomPopup] = useState(false)
  const [zoomInput,     setZoomInput]     = useState('100')
  const wrapRef = useRef(null)

  // Close the popup on Escape key or a click anywhere outside the wrapper div.
  // The effect is only registered when the popup is open — no listeners idle in the
  // background when nothing is shown.
  useEffect(() => {
    if (!showZoomPopup) return
    const onKey     = (e) => { if (e.key === 'Escape') setShowZoomPopup(false) }
    const onOutside = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setShowZoomPopup(false)
    }
    window.addEventListener('keydown',   onKey)
    window.addEventListener('mousedown', onOutside)
    return () => {
      window.removeEventListener('keydown',   onKey)
      window.removeEventListener('mousedown', onOutside)
    }
  }, [showZoomPopup])

  const handleApply = () => {
    const percent = Math.max(10, Math.min(300, Number(zoomInput)))
    if (isNaN(percent)) return
    // Normalise the displayed value so "50.5" becomes "51", etc.
    setZoomInput(String(percent))
    onApply(percent)
  }

  const handleReset = () => {
    setZoomInput('100')
    onReset()
  }

  return (
    <div className="zoom-wrap" ref={wrapRef}>
      <button
        className={`icon-toggle${showZoomPopup ? ' icon-toggle-active' : ''}`}
        onClick={() => setShowZoomPopup(v => !v)}
        aria-label="Toggle zoom controls"
        title="Zoom"
      >
        <svg className="toggle-img" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="6.5" cy="6.5" r="4.5" stroke="currentColor" strokeWidth="1.5"/>
          <line x1="10" y1="10" x2="14.5" y2="14.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      </button>

      {showZoomPopup && (
        <div className="zoom-popup">
          <div className="zoom-popup-header">
            <span className="zoom-popup-title">Zoom</span>
            <button
              className="zoom-popup-close"
              onClick={() => setShowZoomPopup(false)}
              aria-label="Close zoom popup"
            >
              ✕
            </button>
          </div>
          <div className="zoom-popup-row">
            <label className="zoom-popup-label" htmlFor="zoom-input">Size %</label>
            <input
              id="zoom-input"
              className="zoom-popup-input"
              type="number"
              min="10"
              max="300"
              value={zoomInput}
              onChange={e => setZoomInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleApply() }}
              autoFocus
            />
            <button className="zoom-popup-apply" onClick={handleApply}>Apply</button>
          </div>
          <button className="zoom-popup-reset" onClick={handleReset}>Reset</button>
        </div>
      )}
    </div>
  )
}
