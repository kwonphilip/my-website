import { useRef, useState, useCallback, useEffect } from 'react'
import EarthGlobe from './components/EarthGlobe'
import HoloEarth from './components/HoloEarth'
import ZoomControl from './components/ui/ZoomControl'
import DetailControl from './components/ui/DetailControl'
import {
  NAV_LINKS, LOCATIONS, LOCATIONS_HOLO, NAV_CITY_INDICES, detailToParams,
} from './data/navConfig.js'
import worldwideIcon from './assets/icons/worldwide_icon.png'
import hologramIcon from './assets/icons/hologram_earth_icon_v2.png'
import cityIcon from './assets/icons/city_icon.png'
import airplaneIcon from './assets/icons/airplane-icon2.png'
import gridIcon from './assets/icons/grid_icon.png'
import rotationIcon from './assets/icons/rotation_icon.png'
import landscapeIcon from './assets/icons/landscape_icon.png'
import './App.css'

function ControlsGuide() {
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
        <span className={`ctrl-chevron${open ? ' open' : ''}`}>›</span>
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

export default function App() {
  // ── Refs ──────────────────────────────────────────────────────────────────
  const globeRef = useRef(null)
  const holoRef = useRef(null)
  // tracks which nav index is active on mobile (null = none)
  const mobileNavIdx = useRef(null)
  // remembers the pre-mobile zoom so it can be restored on desktop return
  const prevZoomRef = useRef(null)
  const lastAppliedZoomRef = useRef(100)

  // ── State ─────────────────────────────────────────────────────────────────
  const [active, setActive] = useState(null)
  const [isHolo, setIsHolo] = useState(false)
  const [holoMode, setHoloMode] = useState('hologram')
  const [holoReady, setHoloReady] = useState(false)
  const [showCities, setShowCities] = useState(false)
  const [showFlights, setShowFlights] = useState(false)
  const [showDots, setShowDots] = useState(false)
  const [starsRotating, setStarsRotating] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [appliedDetail, setAppliedDetail] = useState(100)  // committed HoloEarth detail level

  // Current active ref — whichever globe is visible responds to nav interactions.
  const activeRef = isHolo ? holoRef : globeRef

  // ── Zoom helpers ──────────────────────────────────────────────────────────

  // applyZoom is called both by ZoomControl (user action) and by the mobile-zoom
  // effect (automatic 70% on narrow screens). It records the last applied value so
  // the mobile effect can restore it when the window widens again.
  const applyZoom = useCallback((percent) => {
    lastAppliedZoomRef.current = percent
    globeRef.current?.setZoom(percent)
    holoRef.current?.setZoom(percent)
  }, [])

  const resetZoom = useCallback(() => applyZoom(100), [applyZoom])

  // ── Effects ───────────────────────────────────────────────────────────────

  // After each view toggle the newly visible renderer needs a resize event to
  // recalculate its canvas dimensions (the previous one was hidden with display:none).
  useEffect(() => {
    window.dispatchEvent(new Event('resize'))
  }, [isHolo])

  // When the mobile menu closes the globe container grows back to full height.
  // No resize event fires on DOM changes alone, so we dispatch one manually
  // after the next frame (letting the DOM repaint first).
  useEffect(() => {
    if (!menuOpen) requestAnimationFrame(() => window.dispatchEvent(new Event('resize')))
  }, [menuOpen])

  // Close the mobile menu and clear markers when the window grows past the
  // mobile breakpoint (e.g., rotating a tablet to landscape).
  useEffect(() => {
    const onResize = () => {
      if (window.innerWidth > 900) {
        setMenuOpen(false)
        clearMobileMarkers()
      }
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Apply 70% zoom automatically on mobile (≤900px) and restore on return to desktop.
  // This prevents the globe from overfilling the narrow screen.
  useEffect(() => {
    const handleMobileZoom = () => {
      const mobile = window.innerWidth <= 900
      if (mobile && prevZoomRef.current === null) {
        // Save the current zoom before overriding.
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
  }, [applyZoom])

  // ── Handlers ──────────────────────────────────────────────────────────────

  // Reset all mobile nav markers (city bar, bracket, ping) and resume auto-rotation.
  // Called when the mobile menu closes or the viewport exits mobile width.
  const clearMobileMarkers = useCallback(() => {
    const prev = mobileNavIdx.current
    if (prev !== null) {
      activeRef.current?.showCityBar(prev)
      mobileNavIdx.current = null
    }
    activeRef.current?.hideBracket()
    activeRef.current?.hideAllPings()
    activeRef.current?.resumeAutoRotate()
  }, [activeRef])

  // Sync rotation between globes on toggle so the view doesn't jump.
  const handleToggle = useCallback(() => {
    if (!isHolo) {
      const y = globeRef.current?.getRotationY() ?? 0
      holoRef.current?.setRotationY(y)
      // Carry over hidden city bar so the target globe matches the source.
      if (mobileNavIdx.current !== null) holoRef.current?.hideCityBar(mobileNavIdx.current)
    } else {
      const y = holoRef.current?.getRotationY() ?? 0
      globeRef.current?.setRotationY(y)
      if (mobileNavIdx.current !== null) globeRef.current?.hideCityBar(mobileNavIdx.current)
    }
    setIsHolo(h => !h)
  }, [isHolo])

  // dotStep and dotRadius are derived from appliedDetail and passed directly to
  // HoloEarth, which triggers an async dot-mesh rebuild when they change.
  const { step: dotStep, dotRadius } = detailToParams(appliedDetail)

  // ── Nav link interaction handlers (shared between desktop and mobile nav) ─
  // Defined here so they close over the correct activeRef and don't re-create on
  // every render (they capture i and coords via the map below, not the closure).

  const buildNavHandlers = (i, coords) => ({
    onEnter: () => {
      activeRef.current?.rotateTo(coords.lat, coords.lon)
      activeRef.current?.showBracket(i)
      activeRef.current?.showPing(i)
      activeRef.current?.hideCityBar(i)
    },
    onLeave: () => {
      activeRef.current?.resumeAutoRotate()
      activeRef.current?.hideBracket()
      activeRef.current?.hideAllPings()
      activeRef.current?.showCityBar(i)
    },
  })

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="app">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <header className="header">
        <div className="logo" onClick={() => { setActive(null); clearMobileMarkers() }} role="button" tabIndex={0} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { setActive(null); clearMobileMarkers() } }}>Philip Kwon</div>

        {/* Desktop controls — hidden on mobile via CSS */}
        <div className="header-right desktop-only">
          <div className="toggle-wrap">
            {/* Holo-mode selector + loading indicator (only when holo is active) */}
            {isHolo && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                {!holoReady && (
                  <span style={{ color: 'rgba(0,180,255,0.7)', fontSize: '0.7rem', letterSpacing: '0.12em', fontFamily: 'monospace' }}>
                    Loading…
                  </span>
                )}
                <select className="holo-mode-select" value={holoMode} onChange={e => setHoloMode(e.target.value)}>
                  <option value="hologram">Hologram</option>
                  <option value="white">White</option>
                  <option value="day">Day</option>
                  <option value="night">Night</option>
                  <option value="nightalt2">Night Alt</option>
                </select>
              </div>
            )}

            {/* Hex-dot grid toggle — only on standard globe (HoloEarth has its own dots) */}
            {!isHolo && (
              <button
                className={`icon-toggle${showDots ? ' icon-toggle-active' : ''}`}
                onClick={() => setShowDots(d => !d)}
                aria-label="Toggle hex dot grid"
              >
                <img src={gridIcon} alt="Dots" className="toggle-img" />
              </button>
            )}

            {/* Terrain detail — HoloEarth only; owns its own popup state */}
            <DetailControl
              isHolo={isHolo}
              holoReady={holoReady}
              appliedDetail={appliedDetail}
              onApply={setAppliedDetail}
            />

            <button
              className={`icon-toggle${starsRotating ? ' icon-toggle-active' : ''}`}
              onClick={() => setStarsRotating(r => !r)}
              aria-label="Toggle starfield rotation"
            >
              <img src={rotationIcon} alt="Rotation" className="toggle-img" />
            </button>
            <button
              className={`icon-toggle${showCities ? ' icon-toggle-active' : ''}`}
              onClick={() => setShowCities(c => !c)}
              aria-label="Toggle city markers"
            >
              <img src={cityIcon} alt="Cities" className="toggle-img" />
            </button>
            <button
              className={`icon-toggle${showFlights ? ' icon-toggle-active' : ''}`}
              onClick={() => setShowFlights(f => !f)}
              aria-label="Toggle flight lanes"
            >
              <img src={airplaneIcon} alt="Flights" className="toggle-img" />
            </button>
            <ZoomControl onApply={applyZoom} onReset={resetZoom} />
          </div>

          {/* Globe view toggle (standard ↔ hologram) */}
          <div className="toggle-wrap">
            <button
              className={`view-toggle${isHolo ? ' holo-active' : ''}`}
              onClick={handleToggle}
              aria-label="Toggle view"
            >
              <span className="toggle-side toggle-side-left">
                <img src={worldwideIcon} alt="Standard" className="toggle-img" />
              </span>
              <span className="toggle-thumb" />
              <span className="toggle-side toggle-side-right">
                <img src={hologramIcon} alt="Hologram" className="toggle-img" />
              </span>
            </button>
          </div>

          {/* Desktop navigation */}
          <nav className="nav">
            {NAV_LINKS.map((link, i) => {
              const coords = isHolo ? LOCATIONS_HOLO[i] : LOCATIONS[i]
              const { onEnter, onLeave } = buildNavHandlers(i, coords)
              return (
                <button
                  key={link.label}
                  className={`nav-link${active === link.label ? ' active' : ''}`}
                  onMouseEnter={onEnter}
                  onMouseLeave={onLeave}
                  onClick={() => setActive(a => a === link.label ? null : link.label)}
                >
                  {link.label}
                </button>
              )
            })}
          </nav>
        </div>

        {/* Mobile hamburger — hidden on desktop via CSS */}
        <div className="mobile-only">
          <button
            className={`hamburger${menuOpen ? ' open' : ''}`}
            onClick={() => {
              if (menuOpen) clearMobileMarkers()
              setMenuOpen(o => !o)
            }}
            aria-label="Toggle menu"
          >
            <span /><span /><span />
          </button>
        </div>
      </header>

      {/* ── Mobile menu ─────────────────────────────────────────────────── */}
      {menuOpen && (
        <div className="mobile-menu">
          <div className="mobile-menu-controls">
            {isHolo && (
              <select className="holo-mode-select" value={holoMode} onChange={e => setHoloMode(e.target.value)}>
                <option value="hologram">Hologram</option>
                <option value="white">White</option>
                <option value="day">Day</option>
                <option value="night">Night</option>
                <option value="nightalt2">Night Alt</option>
              </select>
            )}
            <div className="mobile-menu-toggles">
              {!isHolo && (
                <button
                  className={`icon-toggle${showDots ? ' icon-toggle-active' : ''}`}
                  onClick={() => setShowDots(d => !d)}
                  aria-label="Toggle hex dot grid"
                >
                  <img src={gridIcon} alt="Dots" className="toggle-img" />
                </button>
              )}
              <DetailControl
                isHolo={isHolo}
                holoReady={holoReady}
                appliedDetail={appliedDetail}
                onApply={setAppliedDetail}
              />
              <button
                className={`icon-toggle${starsRotating ? ' icon-toggle-active' : ''}`}
                onClick={() => setStarsRotating(r => !r)}
                aria-label="Toggle starfield rotation"
              >
                <img src={rotationIcon} alt="Rotation" className="toggle-img" />
              </button>
              <button
                className={`icon-toggle${showCities ? ' icon-toggle-active' : ''}`}
                onClick={() => setShowCities(c => !c)}
                aria-label="Toggle city markers"
              >
                <img src={cityIcon} alt="Cities" className="toggle-img" />
              </button>
              <button
                className={`icon-toggle${showFlights ? ' icon-toggle-active' : ''}`}
                onClick={() => setShowFlights(f => !f)}
                aria-label="Toggle flight lanes"
              >
                <img src={airplaneIcon} alt="Flights" className="toggle-img" />
              </button>
              <ZoomControl onApply={applyZoom} onReset={resetZoom} />
              <button
                className={`view-toggle${isHolo ? ' holo-active' : ''}`}
                onClick={handleToggle}
                aria-label="Toggle view"
              >
                <span className="toggle-side toggle-side-left">
                  <img src={worldwideIcon} alt="Standard" className="toggle-img" />
                </span>
                <span className="toggle-thumb" />
                <span className="toggle-side toggle-side-right">
                  <img src={hologramIcon} alt="Hologram" className="toggle-img" />
                </span>
              </button>
            </div>
          </div>

          {/* Mobile navigation — tap a link to rotate + zoom to that location */}
          <nav className="mobile-nav">
            {NAV_LINKS.map((link, i) => {
              const coords = isHolo ? LOCATIONS_HOLO[i] : LOCATIONS[i]
              return (
                <button
                  key={link.label}
                  className={`nav-link${active === link.label ? ' active' : ''}`}
                  onClick={() => {
                    if (active === link.label) {
                      // Tapping the active link again — deselect and clean up markers.
                      clearMobileMarkers()
                      setActive(null)
                      setMenuOpen(false)
                      return
                    }
                    // Restore city bar on the previously active marker before switching.
                    const prev = mobileNavIdx.current
                    if (prev !== null && prev !== i) activeRef.current?.showCityBar(prev)
                    activeRef.current?.hideBracket()
                    activeRef.current?.hideAllPings()
                    activeRef.current?.rotateTo(coords.lat, coords.lon)
                    activeRef.current?.showBracket(i)
                    activeRef.current?.showPing(i)
                    activeRef.current?.hideCityBar(i)
                    mobileNavIdx.current = i
                    setActive(link.label)
                    setMenuOpen(false)
                  }}
                >
                  {link.label}
                </button>
              )
            })}
          </nav>
        </div>
      )}

      {/* ── Main content ─────────────────────────────────────────────────── */}
      <main className="main">
        {/* Both globes are always mounted; only the active one is visible (display:block/none).
            Keeping both mounted preserves their Three.js scene state across toggles
            so switching views doesn't require an expensive rebuild. */}
        <div className="globe-wrap">
          <div style={{ display: isHolo ? 'none' : 'block', width: '100%', height: '100%' }}>
            <EarthGlobe
              key="globe"
              ref={globeRef}
              locations={LOCATIONS}
              showCities={showCities}
              showFlights={showFlights}
              showDots={showDots}
              starsRotating={starsRotating}
              navCityIndices={NAV_CITY_INDICES}
            />
          </div>
          <div style={{ display: isHolo ? 'block' : 'none', width: '100%', height: '100%' }}>
            <HoloEarth
              key="holo"
              ref={holoRef}
              locations={LOCATIONS_HOLO}
              colorMode={holoMode}
              onReady={() => setHoloReady(true)}
              showCities={showCities}
              showFlights={showFlights}
              starsRotating={starsRotating}
              navCityIndices={NAV_CITY_INDICES}
              dotStep={dotStep}
              dotRadius={dotRadius}
            />
          </div>
        </div>

        {/* Hero text — left-aligned on desktop, below globe on mobile */}
        <div className="hero">
          <h1 className="hero-title">
            Explore<br />Interact<br />Discover
          </h1>
          {/* Nav-link description fades in when a link is clicked. */}
          <div className="hero-detail" key={active ?? 'default'}>
            {active ? (
              <>
                <span className="hero-detail-label">{active}</span>
                <span className="hero-detail-desc">
                  {NAV_LINKS.find(l => l.label === active)?.desc}
                </span>
              </>
            ) : (
              <ControlsGuide />
            )}
          </div>
        </div>
      </main>

    </div>
  )
}
