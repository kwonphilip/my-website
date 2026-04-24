import { useRef, useState, useCallback, useEffect } from 'react'
import EarthGlobe from './components/EarthGlobe'
import HoloEarth from './components/HoloEarth'
import ZoomControl from './components/ui/ZoomControl'
import DetailControl from './components/ui/DetailControl'
import ControlsGuide from './components/ui/ControlsGuide'
import {
  NAV_LINKS, LOCATIONS, LOCATIONS_HOLO, NAV_CITY_INDICES, detailToParams,
} from './data/navConfig.js'
import { IDLE_RETURN_MS } from './constants.js'
import worldwideIcon from './assets/icons/worldwide_icon.png'
import hologramIcon from './assets/icons/hologram_earth_icon_v2.png'
import cityIcon from './assets/icons/city_icon.png'
import airplaneIcon from './assets/icons/airplane-icon2.png'
import gridIcon from './assets/icons/grid_icon.png'
import rotationIcon from './assets/icons/rotation_icon.png'
import './App.css'

const HERO_WORDS = ['Explore', 'Interact', 'Discover']

function fmtCoords(lat, lon) {
  const la = Math.abs(lat).toFixed(1)
  const lo = Math.abs(lon).toFixed(1)
  return `${la}°${lat >= 0 ? 'N' : 'S'} ${lo}°${lon >= 0 ? 'E' : 'W'}`
}

export default function App() {
  // ── Refs ──────────────────────────────────────────────────────────────────
  const globeRef = useRef(null)
  const holoRef = useRef(null)
  // tracks which nav index is active on mobile (null = none)
  const mobileNavIdx = useRef(null)
  const mobileAutoRotateTimer = useRef(null)
  // remembers the pre-mobile zoom so it can be restored on desktop return
  const prevZoomRef = useRef(null)
  const lastAppliedZoomRef = useRef(100)
  const mousePosRef = useRef(null)
  const mouseOnGlobeRef = useRef(false)

  // ── State ─────────────────────────────────────────────────────────────────
  const [active, setActive] = useState(null)
  const [hoveredNavLink, setHoveredNavLink] = useState(null)
  const [isHolo, setIsHolo] = useState(false)
  const [holoMode, setHoloMode] = useState('hologram')
  const [holoReady, setHoloReady] = useState(false)
  const [showCities, setShowCities] = useState(false)
  const [showFlights, setShowFlights] = useState(false)
  const [showDots, setShowDots] = useState(false)
  const [starsRotating, setStarsRotating] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [appliedDetail, setAppliedDetail] = useState(100)  // committed HoloEarth detail level
  const [currentZoom, setCurrentZoom] = useState(100)
  const [typedWords, setTypedWords] = useState(['', '', ''])
  const [hudRotation, setHudRotation] = useState(0)
  const [hoveredCoords, setHoveredCoords] = useState(null)

  // Current active ref — whichever globe is visible responds to nav interactions.
  const activeRef = isHolo ? holoRef : globeRef

  // Ref so the HUD polling interval can read isHolo without stale closure.
  const isHoloRef = useRef(isHolo)

  // ── Zoom helpers ──────────────────────────────────────────────────────────

  // applyZoom is called both by ZoomControl (user action) and by the mobile-zoom
  // effect (automatic 70% on narrow screens). It records the last applied value so
  // the mobile effect can restore it when the window widens again.
  const applyZoom = useCallback((percent) => {
    lastAppliedZoomRef.current = percent
    setCurrentZoom(percent)
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

  // Keep isHoloRef current so the HUD interval doesn't capture a stale value.
  useEffect(() => { isHoloRef.current = isHolo }, [isHolo])

  // Typing animation: schedule one setTimeout per character across all three words.
  useEffect(() => {
    const timers = []
    let delay = 400
    HERO_WORDS.forEach((word, wi) => {
      for (let ci = 1; ci <= word.length; ci++) {
        const chars = ci
        timers.push(setTimeout(() => {
          setTypedWords(prev => { const next = [...prev]; next[wi] = word.slice(0, chars); return next })
        }, delay))
        delay += 78
      }
      delay += 280
    })
    return () => timers.forEach(clearTimeout)
  }, [])

  // HUD polling — reads globe rotation every 150ms and re-queries mouse coords
  // so that LOC updates even when the globe rotates under a stationary cursor.
  useEffect(() => {
    const id = setInterval(() => {
      const ref = isHoloRef.current ? holoRef : globeRef
      const y = ref.current?.getRotationY() ?? 0
      setHudRotation(Math.round(((y * 180 / Math.PI) % 360 + 360) % 360))
      if (mouseOnGlobeRef.current && mousePosRef.current) {
        const { x, y: my } = mousePosRef.current
        setHoveredCoords(ref.current?.getLatLonFromScreen(x, my) ?? null)
      }
    }, 150)
    return () => clearInterval(id)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Handlers ──────────────────────────────────────────────────────────────

  // Reset all mobile nav markers (city bar, bracket, ping) and resume auto-rotation.
  // Called when the mobile menu closes or the viewport exits mobile width.
  const clearMobileMarkers = useCallback(() => {
    clearTimeout(mobileAutoRotateTimer.current)
    mobileAutoRotateTimer.current = null
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

  const handleGlobeMouseMove = useCallback((e) => {
    mousePosRef.current = { x: e.clientX, y: e.clientY }
    mouseOnGlobeRef.current = true
    const ref = isHoloRef.current ? holoRef : globeRef
    setHoveredCoords(ref.current?.getLatLonFromScreen(e.clientX, e.clientY) ?? null)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleGlobeMouseLeave = useCallback(() => {
    mouseOnGlobeRef.current = false
    setHoveredCoords(null)
  }, [])

  // ── Nav link interaction handlers (shared between desktop and mobile nav) ─
  // Defined here so they close over the correct activeRef and don't re-create on
  // every render (they capture i and coords via the map below, not the closure).

  const buildNavHandlers = (i, coords, label) => ({
    onEnter: () => {
      setHoveredNavLink(label)
      activeRef.current?.rotateTo(coords.lat, coords.lon)
      activeRef.current?.showBracket(i)
      activeRef.current?.showPing(i)
      activeRef.current?.hideCityBar(i)
    },
    onLeave: () => {
      setHoveredNavLink(null)
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
              const { onEnter, onLeave } = buildNavHandlers(i, coords, link.label)
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

        {/* Mobile hamburger + view toggle — hidden on desktop via CSS */}
        <div className="mobile-only">
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
              <ZoomControl zoom={currentZoom} onApply={applyZoom} onReset={resetZoom} />
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
                    clearTimeout(mobileAutoRotateTimer.current)
                    mobileAutoRotateTimer.current = setTimeout(() => {
                      activeRef.current?.resumeAutoRotate()
                    }, IDLE_RETURN_MS)
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
        <div className="globe-wrap" onMouseMove={handleGlobeMouseMove} onMouseLeave={handleGlobeMouseLeave}>
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
            {HERO_WORDS.map((word, i) => {
              const prevDone = HERO_WORDS.slice(0, i).every((w, j) => typedWords[j].length === w.length)
              const showCursor = prevDone && typedWords[i].length < word.length
              return (
                <span key={word} className="hero-title-line">
                  {typedWords[i]}
                  {showCursor && <span className="typing-cursor" aria-hidden="true">|</span>}
                </span>
              )
            })}
          </h1>
          <p className="hero-eyebrow-mobile">Explore · Interact · Discover</p>
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

        {/* HUD readout — desktop only, bottom-right corner */}
        <div className="hud" aria-hidden="true">
          <div className="hud-row"><span className="hud-key">ZOOM</span><span className="hud-val">{currentZoom}%</span></div>
          <div className="hud-row"><span className="hud-key">MODE</span><span className="hud-val">{isHolo ? 'HOLO' : 'STD'}</span></div>
          <div className="hud-row"><span className="hud-key">ROT</span><span className="hud-val">{hudRotation}°</span></div>
          <div className="hud-row"><span className="hud-key">LOC</span><span className="hud-val">{
            (() => {
              if (hoveredCoords) return fmtCoords(hoveredCoords.lat, hoveredCoords.lon)
              if (hoveredNavLink) { const l = NAV_LINKS.find(n => n.label === hoveredNavLink); return l ? fmtCoords(l.lat, l.lon) : '—' }
              return '—'
            })()
          }</span></div>
        </div>
      </main>

    </div>
  )
}
