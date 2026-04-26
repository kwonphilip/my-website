import { useRef, useState, useCallback, useEffect } from 'react'
import WireframeEarth from './components/WireframeEarth'
import HoloEarth from './components/HoloEarth'
import AppHeader from './components/ui/AppHeader'
import MobileMenu from './components/ui/MobileMenu'
import HeroSection from './components/ui/HeroSection'
import HudReadout from './components/ui/HudReadout'
import {
  NAV_LINKS, LOCATIONS, LOCATIONS_HOLO, NAV_CITY_INDICES, detailToParams,
} from './data/navConfig.js'
import { IDLE_RETURN_MS } from './constants.js'
import { HERO_WORDS } from './data/siteContent.js'
import { useTypingAnimation } from './hooks/useTypingAnimation.js'
import { useHudPolling } from './hooks/useHudPolling.js'
import { useMobileZoom } from './hooks/useMobileZoom.js'
import './App.css'

export default function App() {
  // ── Refs ──────────────────────────────────────────────────────────────────
  const globeRef = useRef(null)
  const holoRef = useRef(null)
  const mobileNavIdx = useRef(null)
  const mobileAutoRotateTimer = useRef(null)
  const lastAppliedZoomRef = useRef(100)
  const mousePosRef = useRef(null)
  const mouseOnGlobeRef = useRef(false)
  const isHoloRef = useRef(true)

  // ── State ─────────────────────────────────────────────────────────────────
  const [active, setActive] = useState(null)
  const [hoveredNavLink, setHoveredNavLink] = useState(null)
  const [mobileZoomedLabel, setMobileZoomedLabel] = useState(null)
  const [isHolo, setIsHolo] = useState(true)
  const [holoMode, setHoloMode] = useState('blue')
  const [holoReady, setHoloReady] = useState(false)
  const [showCities, setShowCities] = useState(true)
  const [showFlights, setShowFlights] = useState(true)
  const [showDots, setShowDots] = useState(true)
  const [showISS, setShowISS] = useState(true)
  const [starsRotating, setStarsRotating] = useState(true)
  const [menuOpen, setMenuOpen] = useState(false)
  const [appliedDetail, setAppliedDetail] = useState(100)
  const [currentZoom, setCurrentZoom] = useState(100)

  const activeRef = isHolo ? holoRef : globeRef

  // ── Hooks ─────────────────────────────────────────────────────────────────
  const typedWords = useTypingAnimation(HERO_WORDS)
  const { hudRotation, hoveredCoords, setHoveredCoords } = useHudPolling(
    isHoloRef, globeRef, holoRef, mouseOnGlobeRef, mousePosRef
  )

  // ── Zoom helpers ──────────────────────────────────────────────────────────
  const applyZoom = useCallback((percent) => {
    lastAppliedZoomRef.current = percent
    setCurrentZoom(percent)
    globeRef.current?.setZoom(percent)
    holoRef.current?.setZoom(percent)
  }, [])

  const resetZoom = useCallback(() => applyZoom(100), [applyZoom])

  useMobileZoom(applyZoom, lastAppliedZoomRef)

  // ── Effects ───────────────────────────────────────────────────────────────

  // After each view toggle the newly visible renderer needs a resize event.
  useEffect(() => {
    window.dispatchEvent(new Event('resize'))
  }, [isHolo])

  // When the mobile menu closes the globe container grows back; force a resize.
  useEffect(() => {
    if (!menuOpen) requestAnimationFrame(() => window.dispatchEvent(new Event('resize')))
  }, [menuOpen])

  // Close the mobile menu and clear markers when the window grows past mobile breakpoint.
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

  // Keep isHoloRef current so the HUD polling interval doesn't capture a stale value.
  useEffect(() => { isHoloRef.current = isHolo }, [isHolo])

  // ── Handlers ──────────────────────────────────────────────────────────────

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
    setMobileZoomedLabel(null)
  }, [activeRef])

  // Sync rotation between globes on toggle so the view doesn't jump.
  const handleToggle = useCallback(() => {
    if (!isHolo) {
      const y = globeRef.current?.getRotationY() ?? 0
      holoRef.current?.setRotationY(y)
      if (mobileNavIdx.current !== null) holoRef.current?.hideCityBar(mobileNavIdx.current)
    } else {
      const y = holoRef.current?.getRotationY() ?? 0
      globeRef.current?.setRotationY(y)
      if (mobileNavIdx.current !== null) globeRef.current?.hideCityBar(mobileNavIdx.current)
    }
    setIsHolo(h => !h)
  }, [isHolo])

  const { step: dotStep, dotRadius } = detailToParams(appliedDetail)

  const handleGlobeMouseMove = useCallback((e) => {
    mousePosRef.current = { x: e.clientX, y: e.clientY }
    mouseOnGlobeRef.current = true
    const ref = isHoloRef.current ? holoRef : globeRef
    setHoveredCoords(ref.current?.getLatLonFromScreen(e.clientX, e.clientY) ?? null)
  }, [setHoveredCoords]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleGlobeMouseLeave = useCallback(() => {
    mouseOnGlobeRef.current = false
    setHoveredCoords(null)
  }, [setHoveredCoords])

  const handleMobileNavTap = useCallback((i, label, coords) => {
    if (active === label) {
      clearMobileMarkers()
      setActive(null)
      setMenuOpen(false)
      return
    }
    const prev = mobileNavIdx.current
    if (prev !== null && prev !== i) activeRef.current?.showCityBar(prev)
    activeRef.current?.hideBracket()
    activeRef.current?.hideAllPings()
    activeRef.current?.rotateTo(coords.lat, coords.lon)
    activeRef.current?.showBracket(i)
    activeRef.current?.showPing(i)
    activeRef.current?.hideCityBar(i)
    mobileNavIdx.current = i
    setActive(label)
    setMobileZoomedLabel(label)
    setMenuOpen(false)
    clearTimeout(mobileAutoRotateTimer.current)
    mobileAutoRotateTimer.current = setTimeout(() => {
      activeRef.current?.resumeAutoRotate()
      setMobileZoomedLabel(null)
    }, IDLE_RETURN_MS)
  }, [active, activeRef, clearMobileMarkers])

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="app">
      <AppHeader
        isHolo={isHolo} holoMode={holoMode} holoReady={holoReady}
        showDots={showDots} showCities={showCities} showFlights={showFlights}
        showISS={showISS} starsRotating={starsRotating} appliedDetail={appliedDetail}
        currentZoom={currentZoom} menuOpen={menuOpen} active={active}
        navLinks={NAV_LINKS} locations={LOCATIONS} holoLocations={LOCATIONS_HOLO}
        activeRef={activeRef}
        onToggle={handleToggle}
        onLogoClick={() => { setActive(null); clearMobileMarkers() }}
        onHoloMode={setHoloMode}
        onShowDots={setShowDots} onShowCities={setShowCities}
        onShowFlights={setShowFlights} onShowISS={setShowISS} onStarsRotating={setStarsRotating}
        onApplyDetail={setAppliedDetail} onApplyZoom={applyZoom} onResetZoom={resetZoom}
        onMenuToggle={() => { if (menuOpen) clearMobileMarkers(); setMenuOpen(o => !o) }}
        onNavHover={setHoveredNavLink} onNavClick={setActive}
      />

      {menuOpen && (
        <MobileMenu
          isHolo={isHolo} holoMode={holoMode} holoReady={holoReady}
          showDots={showDots} showCities={showCities} showFlights={showFlights}
          showISS={showISS} starsRotating={starsRotating} appliedDetail={appliedDetail}
          currentZoom={currentZoom} active={active}
          navLinks={NAV_LINKS} locations={LOCATIONS} holoLocations={LOCATIONS_HOLO}
          onHoloMode={setHoloMode}
          onShowDots={setShowDots} onShowCities={setShowCities}
          onShowFlights={setShowFlights} onShowISS={setShowISS} onStarsRotating={setStarsRotating}
          onApplyDetail={setAppliedDetail} onApplyZoom={applyZoom} onResetZoom={resetZoom}
          onNavTap={handleMobileNavTap}
        />
      )}

      <main className="main">
        {/* Both globes always mounted to preserve Three.js scene state across toggles. */}
        <div className="globe-wrap" onMouseMove={handleGlobeMouseMove} onMouseLeave={handleGlobeMouseLeave}>
          <div style={{ display: isHolo ? 'none' : 'block', width: '100%', height: '100%' }}>
            <WireframeEarth
              key="globe"
              ref={globeRef}
              locations={LOCATIONS}
              showCities={showCities}
              showFlights={showFlights}
              showDots={showDots}
              showISS={showISS}
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
              showISS={showISS}
              starsRotating={starsRotating}
              navCityIndices={NAV_CITY_INDICES}
              dotStep={dotStep}
              dotRadius={dotRadius}
            />
          </div>
        </div>

        <HeroSection
          typedWords={typedWords}
          active={active}
          onSnowmanClick={() => activeRef.current?.setPoleView()}
        />

        <HudReadout
          currentZoom={currentZoom} isHolo={isHolo}
          hudRotation={hudRotation} hoveredCoords={hoveredCoords}
          hoveredNavLink={hoveredNavLink} mobileZoomedLabel={mobileZoomedLabel}
        />
      </main>
    </div>
  )
}
