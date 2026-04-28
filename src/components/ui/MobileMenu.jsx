/**
 * Slide-down overlay containing all controls and nav links for mobile (≤900 px).
 *
 * This is the mobile mirror of AppHeader's desktop controls section. The same
 * props flow from App.jsx to both AppHeader and MobileMenu, keeping the two in
 * sync without duplicating state. Only the layout differs.
 *
 * Nav taps here call `onNavTap(i, label, coords)` which maps to `handleMobileNavTap`
 * in App.jsx: that handler rotates the globe, shows the bracket/ping, hides the city
 * bar, and schedules auto-rotation to resume after IDLE_RETURN_MS.
 *
 * The hex-dot grid toggle is hidden in holo mode because HoloEarth uses elevation
 * dots instead of the flat hex grid (showDots only applies to WireframeEarth).
 */
import ZoomControl  from './ZoomControl'
import DetailControl from './DetailControl'
import cityIcon      from '../../assets/icons/city_icon.png'
import airplaneIcon  from '../../assets/icons/airplane-icon2.png'
import gridIcon      from '../../assets/icons/grid_icon.png'
import rotationIcon  from '../../assets/icons/rotation_icon.png'
import satelliteIcon from '../../assets/icons/satellite.png'
import './MobileMenu.css'

export default function MobileMenu({
  isHolo, holoMode, holoReady,
  showDots, showCities, showFlights, showISS, starsRotating,
  appliedDetail, currentZoom,
  active, navLinks, locations, holoLocations,
  onHoloMode, onShowDots, onShowCities, onShowFlights, onShowISS, onStarsRotating,
  onApplyDetail, onApplyZoom, onResetZoom,
  onNavTap,
}) {
  return (
    <div className="mobile-menu">
      <div className="mobile-menu-controls">
        {/* Color-mode dropdown only shown in holo view */}
        {isHolo && (
          <select className="holo-mode-select" value={holoMode} onChange={e => onHoloMode(e.target.value)}>
            <option value="blue">Blue</option>
            <option value="white">White</option>
            <option value="day">Day</option>
            <option value="night">Night</option>
            <option value="nightalt2">Night Alt</option>
          </select>
        )}
        <div className="mobile-menu-toggles">
          {/* Hex-dot grid only exists in WireframeEarth, so hide this toggle in holo mode */}
          {!isHolo && (
            <button
              className={`icon-toggle${showDots ? ' icon-toggle-active' : ''}`}
              onClick={() => onShowDots(d => !d)}
              aria-label="Toggle hex dot grid"
            >
              <img src={gridIcon} alt="Dots" className="toggle-img" />
            </button>
          )}
          <DetailControl isHolo={isHolo} holoReady={holoReady} appliedDetail={appliedDetail} onApply={onApplyDetail} />
          <button
            className={`icon-toggle${starsRotating ? ' icon-toggle-active' : ''}`}
            onClick={() => onStarsRotating(r => !r)}
            aria-label="Toggle starfield rotation"
          >
            <img src={rotationIcon} alt="Rotation" className="toggle-img" />
          </button>
          <button
            className={`icon-toggle${showCities ? ' icon-toggle-active' : ''}`}
            onClick={() => onShowCities(c => !c)}
            aria-label="Toggle city markers"
          >
            <img src={cityIcon} alt="Cities" className="toggle-img" />
          </button>
          <button
            className={`icon-toggle${showFlights ? ' icon-toggle-active' : ''}`}
            onClick={() => onShowFlights(f => !f)}
            aria-label="Toggle flight lanes"
          >
            <img src={airplaneIcon} alt="Flights" className="toggle-img" />
          </button>
          <button
            className={`icon-toggle${showISS ? ' icon-toggle-active' : ''}`}
            onClick={() => onShowISS(v => !v)}
            aria-label="Toggle ISS tracker"
          >
            <img src={satelliteIcon} alt="ISS" className="toggle-img" />
          </button>
          <ZoomControl zoom={currentZoom} onApply={onApplyZoom} onReset={onResetZoom} />
        </div>
      </div>

      <nav className="mobile-nav">
        {navLinks.map((link, i) => {
          // Use HoloEarth-adjusted coordinates so rotateTo lands in the right place
          // regardless of which globe is active.
          const coords = isHolo ? holoLocations[i] : locations[i]
          return (
            <button
              key={link.label}
              className={`nav-link${active === link.label ? ' active' : ''}`}
              onClick={() => onNavTap(i, link.label, coords)}
            >
              {link.label}
            </button>
          )
        })}
      </nav>
    </div>
  )
}
