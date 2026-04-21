import { useState, useEffect } from 'react'
import worldwideIcon from '../../assets/icons/worldwide_icon.png'
import cityIcon from '../../assets/icons/city_icon.png'
import airplaneIcon from '../../assets/icons/airplane-icon2.png'
import gridIcon from '../../assets/icons/grid_icon.png'
import rotationIcon from '../../assets/icons/rotation_icon.png'
import landscapeIcon from '../../assets/icons/landscape_icon.png'

export default function ControlsGuide() {
  const [open, setOpen] = useState(() => window.innerWidth > 900)

  useEffect(() => {
    const onResize = () => { if (window.innerWidth <= 900) setOpen(false) }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  return (
    <>
      <button className="ctrl-toggle-btn" onClick={() => setOpen(o => !o)} aria-expanded={open}>
        <span className="hero-detail-label">Controls</span>
        <span className={`ctrl-chevron${open ? ' open' : ''}`}>▸</span>
      </button>
      {open && (
        <div className="ctrl-grid">
          <span /><span>Drag</span>                <span>Rotate the globe</span>
          <span /><span>Scroll / Pinch</span>      <span>Zoom in &amp; out</span>
          <span /><span>Nav Links</span>           <span>Jump to location</span>

          <span className="ctrl-hdr">Icons</span>
          <img src={rotationIcon}  className="ctrl-icon" alt="" /><span>Rotation</span>            <span>Toggle background rotation</span>
          <img src={cityIcon}      className="ctrl-icon" alt="" /><span>Cities</span>              <span>Toggle city markers</span>
          <img src={airplaneIcon}  className="ctrl-icon" alt="" /><span>Flights</span>             <span>Toggle flight lanes</span>
          <svg className="ctrl-icon" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="6.5" cy="6.5" r="4.5" stroke="currentColor" strokeWidth="1.5"/><line x1="10" y1="10" x2="14.5" y2="14.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg><span>Zoom</span>               <span>Adjust globe size</span>
          <img src={worldwideIcon} className="ctrl-icon" alt="" /><span>Globe &#x2194; Holo</span> <span>Switch globe mode</span>

          <span className="ctrl-hdr">Default view only</span>
          <img src={gridIcon}      className="ctrl-icon" alt="" /><span>Dots</span>                <span>Toggle hex grid</span>

          <span className="ctrl-hdr">Holo view only</span>
          <span />                                                 <span>Dropdown</span>               <span>Change color scheme</span>
          <img src={landscapeIcon} className="ctrl-icon" alt="" /><span>Terrain</span>             <span>Adjust terrain density</span>
        </div>
      )}
    </>
  )
}
