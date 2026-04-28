/**
 * Top navigation bar for desktop (≥900 px) and mobile header row.
 *
 * Desktop layout:  logo | controls | ViewToggle | nav links
 * Mobile layout:   logo | ViewToggle + hamburger  (controls live in MobileMenu)
 *
 * Logo typewriter: on mouse-enter the name erases and re-types itself character by
 * character; on mouse-leave it snaps back to the full name instantly. The animation
 * uses recursive setTimeout so each character fires independently and can be cancelled
 * at any point without leaving partial state.
 *
 * buildNavHandlers creates the hover/leave callbacks for each desktop nav link.
 * On hover: rotate the globe to that city, show the bracket and ping, hide the city bar.
 * On leave: resume auto-rotation, hide bracket/pings, restore the city bar.
 * Centralising this in one factory keeps the JSX clean and the logic DRY.
 *
 * ── Visual levers ─────────────────────────────────────────────────────────
 *   logoStep delay: 40 ms  Per-character typing speed for the logo animation.
 *                          Lower = faster typing; higher = more deliberate.
 *   logoStep pause: 3000 ms  How long the fully typed logo pauses before restarting.
 *                            Raise for a calmer effect; lower for a more restless one.
 */
import { useEffect, useRef } from 'react'
import ViewToggle from './ViewToggle'
import ZoomControl from './ZoomControl'
import DetailControl from './DetailControl'
import cityIcon      from '../../assets/icons/city_icon.png'
import airplaneIcon  from '../../assets/icons/airplane-icon2.png'
import gridIcon      from '../../assets/icons/grid_icon.png'
import rotationIcon  from '../../assets/icons/rotation_icon.png'
import satelliteIcon from '../../assets/icons/satellite.png'
import './AppHeader.css'

const LOGO_TEXT = 'Philip Kwon'

/**
 * Returns `{ onEnter, onLeave }` event handlers for one desktop nav link.
 * Extracted from the component to avoid re-creating inline functions on every render.
 */
function buildNavHandlers(i, coords, label, activeRef, onNavHover) {
  return {
    onEnter: () => {
      onNavHover(label)
      activeRef.current?.rotateTo(coords.lat, coords.lon)
      activeRef.current?.showBracket(i)
      activeRef.current?.showPing(i)
      activeRef.current?.hideCityBar(i)  // city bar hides while the bracket is shown
    },
    onLeave: () => {
      onNavHover(null)
      activeRef.current?.resumeAutoRotate()
      activeRef.current?.hideBracket()
      activeRef.current?.hideAllPings()
      activeRef.current?.showCityBar(i)  // restore city bar after leaving
    },
  }
}

export default function AppHeader({
  isHolo, holoMode, holoReady,
  showDots, showCities, showFlights, showISS, starsRotating,
  appliedDetail, currentZoom,
  menuOpen, active,
  navLinks, locations, holoLocations, activeRef,
  onToggle, onLogoClick, onHoloMode,
  onShowDots, onShowCities, onShowFlights, onShowISS, onStarsRotating,
  onApplyDetail, onApplyZoom, onResetZoom,
  onMenuToggle, onNavHover, onNavClick,
}) {
  const logoTextRef   = useRef(null)  // <span> holding the visible logo text
  const logoCursorRef = useRef(null)  // <span> for the blinking cursor character
  const logoTimerRef  = useRef(null)  // setTimeout ID for the typewriter chain
  const logoActiveRef = useRef(false) // prevents a queued step from running after mouse-leave

  // Recursive typewriter: types one character per call, then schedules the next.
  // When fully typed, adds the blink class and schedules a restart from i=0.
  function logoStep(i) {
    if (!logoActiveRef.current) return
    logoTextRef.current.textContent = LOGO_TEXT.slice(0, i)
    if (i < LOGO_TEXT.length) {
      logoCursorRef.current.classList.remove('logo-cursor--blink')
      logoTimerRef.current = setTimeout(() => logoStep(i + 1), 40) // 40 ms per character
    } else {
      logoCursorRef.current.classList.add('logo-cursor--blink')
      logoTimerRef.current = setTimeout(() => logoStep(0), 3000) // 3 s pause then restart
    }
  }

  function handleLogoEnter() {
    logoActiveRef.current = true
    logoCursorRef.current.style.visibility = 'visible'
    clearTimeout(logoTimerRef.current)
    logoStep(0) // start erasing from full name immediately
  }

  function handleLogoLeave() {
    logoActiveRef.current = false
    clearTimeout(logoTimerRef.current)
    logoCursorRef.current.style.visibility = 'hidden'
    logoCursorRef.current.classList.remove('logo-cursor--blink')
    logoTextRef.current.textContent = LOGO_TEXT // snap back to full name instantly
  }

  // Clean up any pending timer when the header unmounts (e.g. during dev HMR).
  useEffect(() => () => clearTimeout(logoTimerRef.current), [])

  return (
    <header className="header">
      <div
        className="logo"
        onClick={onLogoClick}
        role="button"
        tabIndex={0}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') onLogoClick() }}
        onMouseEnter={handleLogoEnter}
        onMouseLeave={handleLogoLeave}
      >
        <span ref={logoTextRef}>{LOGO_TEXT}</span><span ref={logoCursorRef} className="logo-cursor" style={{ visibility: 'hidden' }}>_</span>
      </div>

      {/* Desktop controls */}
      <div className="header-right desktop-only">
        <div className="toggle-wrap">
          {isHolo && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              {/* Show a loading indicator until HoloEarth's async dot build completes */}
              {!holoReady && (
                <span style={{ color: 'rgba(0,180,255,0.7)', fontSize: '0.7rem', letterSpacing: '0.12em', fontFamily: 'monospace' }}>
                  Loading…
                </span>
              )}
              <select className="holo-mode-select" value={holoMode} onChange={e => onHoloMode(e.target.value)}>
                <option value="blue">Blue</option>
                <option value="white">White</option>
                <option value="day">Day</option>
                <option value="night">Night</option>
                <option value="nightalt2">Night Alt</option>
              </select>
            </div>
          )}
          {/* Hex-dot grid toggle only makes sense in WireframeEarth mode */}
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

        <div className="toggle-wrap">
          <ViewToggle isHolo={isHolo} onClick={onToggle} />
        </div>

        <nav className="nav">
          {navLinks.map((link, i) => {
            // Use the HoloEarth-adjusted coordinates when in holo mode so the globe
            // rotates to the correct position despite the +π y-rotation offset.
            const coords = isHolo ? holoLocations[i] : locations[i]
            const { onEnter, onLeave } = buildNavHandlers(i, coords, link.label, activeRef, onNavHover)
            return (
              <button
                key={link.label}
                className={`nav-link${active === link.label ? ' active' : ''}`}
                onMouseEnter={onEnter}
                onMouseLeave={onLeave}
                onClick={() => onNavClick(active === link.label ? null : link.label)}
              >
                {link.label}
              </button>
            )
          })}
        </nav>
      </div>

      {/* Mobile: view toggle + hamburger (all other controls are in MobileMenu) */}
      <div className="mobile-only">
        <ViewToggle isHolo={isHolo} onClick={onToggle} />
        <button
          className={`hamburger${menuOpen ? ' open' : ''}`}
          onClick={onMenuToggle}
          aria-label="Toggle menu"
        >
          <span /><span /><span />
        </button>
      </div>
    </header>
  )
}
