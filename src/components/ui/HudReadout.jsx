/**
 * HUD overlay displaying current globe state in the bottom-right corner.
 *
 * The LOC field uses a priority stack:
 *   1. hoveredCoords  — real-time lat/lon from mouse position on the globe surface
 *   2. hoveredNavLink — coordinates of the desktop nav link currently under the cursor
 *   3. mobileZoomedLabel — coordinates of the most recently tapped mobile nav link
 *   4. '—'            — nothing to display
 *
 * This priority order ensures that precise mouse data always wins over the coarser
 * "which nav is active" data, giving the feel of a live sensor readout.
 */
import { NAV_LINKS } from '../../data/navConfig.js'
import { fmtCoords } from '../../utils/format.js'
import './HudReadout.css'

export default function HudReadout({ currentZoom, isHolo, hudRotation, hoveredCoords, hoveredNavLink, mobileZoomedLabel }) {
  const loc = (() => {
    if (hoveredCoords) return fmtCoords(hoveredCoords.lat, hoveredCoords.lon)
    const navLabel = hoveredNavLink ?? mobileZoomedLabel
    if (navLabel) {
      const l = NAV_LINKS.find(n => n.label === navLabel)
      return l ? fmtCoords(l.lat, l.lon) : '—'
    }
    return '—'
  })()

  return (
    <div className="hud" aria-hidden="true">
      <div className="hud-row"><span className="hud-key">ZOOM</span><span className="hud-val">{currentZoom}%</span></div>
      <div className="hud-row"><span className="hud-key">MODE</span><span className="hud-val">{isHolo ? 'HOLO' : 'STD'}</span></div>
      <div className="hud-row"><span className="hud-key">ROT</span><span className="hud-val">{hudRotation}°</span></div>
      <div className="hud-row"><span className="hud-key">LOC</span><span className="hud-val">{loc}</span></div>
    </div>
  )
}
