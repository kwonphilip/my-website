import { useEffect, useRef } from 'react'
import ViewToggle from './ViewToggle'
import ZoomControl from './ZoomControl'
import DetailControl from './DetailControl'
import cityIcon     from '../../assets/icons/city_icon.png'
import airplaneIcon from '../../assets/icons/airplane-icon2.png'
import gridIcon     from '../../assets/icons/grid_icon.png'
import rotationIcon from '../../assets/icons/rotation_icon.png'
import './AppHeader.css'

const LOGO_TEXT = 'Philip Kwon'

function buildNavHandlers(i, coords, label, activeRef, onNavHover) {
  return {
    onEnter: () => {
      onNavHover(label)
      activeRef.current?.rotateTo(coords.lat, coords.lon)
      activeRef.current?.showBracket(i)
      activeRef.current?.showPing(i)
      activeRef.current?.hideCityBar(i)
    },
    onLeave: () => {
      onNavHover(null)
      activeRef.current?.resumeAutoRotate()
      activeRef.current?.hideBracket()
      activeRef.current?.hideAllPings()
      activeRef.current?.showCityBar(i)
    },
  }
}

export default function AppHeader({
  isHolo, holoMode, holoReady,
  showDots, showCities, showFlights, starsRotating,
  appliedDetail, currentZoom,
  menuOpen, active,
  navLinks, locations, holoLocations, activeRef,
  onToggle, onLogoClick, onHoloMode,
  onShowDots, onShowCities, onShowFlights, onStarsRotating,
  onApplyDetail, onApplyZoom, onResetZoom,
  onMenuToggle, onNavHover, onNavClick,
}) {
  const logoTextRef   = useRef(null)
  const logoCursorRef = useRef(null)
  const logoTimerRef  = useRef(null)
  const logoActiveRef = useRef(false)

  function logoStep(i) {
    if (!logoActiveRef.current) return
    logoTextRef.current.textContent = LOGO_TEXT.slice(0, i)
    if (i < LOGO_TEXT.length) {
      logoCursorRef.current.classList.remove('logo-cursor--blink')
      logoTimerRef.current = setTimeout(() => logoStep(i + 1), 40)
    } else {
      logoCursorRef.current.classList.add('logo-cursor--blink')
      logoTimerRef.current = setTimeout(() => logoStep(0), 3000)
    }
  }

  function handleLogoEnter() {
    logoActiveRef.current = true
    logoCursorRef.current.style.visibility = 'visible'
    clearTimeout(logoTimerRef.current)
    logoStep(0)
  }

  function handleLogoLeave() {
    logoActiveRef.current = false
    clearTimeout(logoTimerRef.current)
    logoCursorRef.current.style.visibility = 'hidden'
    logoCursorRef.current.classList.remove('logo-cursor--blink')
    logoTextRef.current.textContent = LOGO_TEXT
  }

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
              {!holoReady && (
                <span style={{ color: 'rgba(0,180,255,0.7)', fontSize: '0.7rem', letterSpacing: '0.12em', fontFamily: 'monospace' }}>
                  Loading…
                </span>
              )}
              <select className="holo-mode-select" value={holoMode} onChange={e => onHoloMode(e.target.value)}>
                <option value="hologram">Hologram</option>
                <option value="white">White</option>
                <option value="day">Day</option>
                <option value="night">Night</option>
                <option value="nightalt2">Night Alt</option>
              </select>
            </div>
          )}
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
          <ZoomControl zoom={currentZoom} onApply={onApplyZoom} onReset={onResetZoom} />
        </div>

        <div className="toggle-wrap">
          <ViewToggle isHolo={isHolo} onClick={onToggle} />
        </div>

        <nav className="nav">
          {navLinks.map((link, i) => {
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

      {/* Mobile: view toggle + hamburger */}
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
