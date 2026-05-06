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

  const globeRef = useRef(null)    // imperative handle for WireframeEarth
  const holoRef  = useRef(null)    // imperative handle for HoloEarth

  // mobileNavIdx tracks which nav entry is currently highlighted on mobile so
  // we can show its city bar again when the user taps elsewhere (toggle-off).
  const mobileNavIdx = useRef(null)

  // Timer ID for resuming auto-rotation after a mobile nav tap. Stored in a ref
  // so it can be cancelled if the user taps again before it fires.
  const mobileAutoRotateTimer = useRef(null)

  // lastAppliedZoomRef is read by useMobileZoom to save the desktop zoom before
  // switching to the mobile default. State can't be used here because the hook
  // captures a closure at mount time; a ref is always current.
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

  // Point to whichever globe is currently in view so handlers don't need to branch.
  const activeGlobeRef = isHolo ? holoRef : globeRef

  // ── Hooks ─────────────────────────────────────────────────────────────────
  const typedWords = useTypingAnimation(HERO_WORDS)
  const { hudRotation, hoveredCoords, setHoveredCoords } = useHudPolling(
    isHoloRef, globeRef, holoRef, mouseOnGlobeRef, mousePosRef
  )

  // ── Zoom helpers ──────────────────────────────────────────────────────────
  // applyZoom updates both globes simultaneously so switching views keeps the zoom consistent.
  const applyZoom = useCallback((percent) => {
    lastAppliedZoomRef.current = percent
    setCurrentZoom(percent)
    globeRef.current?.setZoom(percent)
    holoRef.current?.setZoom(percent)
  }, [])

  const resetZoom = useCallback(() => applyZoom(100), [applyZoom])

  useMobileZoom(applyZoom, lastAppliedZoomRef)

  // ── Effects ───────────────────────────────────────────────────────────────

  // After each view toggle the newly visible renderer needs a resize event so it
  // recomputes its canvas dimensions (the previously hidden div was 0×0).
  useEffect(() => {
    window.dispatchEvent(new Event('resize'))
  }, [isHolo])

  // When the mobile menu closes the globe container grows back; force a resize so
  // Three.js fills the newly available space (one rAF delay avoids seeing the old size).
  useEffect(() => {
    if (!menuOpen) requestAnimationFrame(() => window.dispatchEvent(new Event('resize')))
  }, [menuOpen])

  // Close the mobile menu and clear markers when the window grows past mobile breakpoint.
  useEffect(() => {
    const onResize = () => {
      if (window.innerWidth > 1100) {
        setMenuOpen(false)
        clearMobileMarkers()
      }
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Keep isHoloRef in sync with isHolo so the HUD polling interval always reads
  // the correct value without closing over a stale isHolo.
  useEffect(() => { isHoloRef.current = isHolo }, [isHolo])

  // ── Handlers ──────────────────────────────────────────────────────────────

  // Resets all mobile-nav visual state: cancels the auto-rotate timer, restores the
  // city bar for the previously active nav, and hides brackets/pings.
  const clearMobileMarkers = useCallback(() => {
    clearTimeout(mobileAutoRotateTimer.current)
    mobileAutoRotateTimer.current = null
    const prev = mobileNavIdx.current
    if (prev !== null) {
      activeGlobeRef.current?.showCityBar(prev)
      mobileNavIdx.current = null
    }
    activeGlobeRef.current?.hideBracket()
    activeGlobeRef.current?.hideAllPings()
    activeGlobeRef.current?.resumeAutoRotate()
    setMobileZoomedLabel(null)
  }, [activeGlobeRef])

  // Sync the globe rotation on toggle so the view doesn't jump to a different
  // longitude when switching between WireframeEarth and HoloEarth.
  const handleToggle = useCallback(() => {
    if (!isHolo) {
      const y = globeRef.current?.getRotationY() ?? 0
      holoRef.current?.setRotationY(y)
      // If a city bar was hidden for a mobile nav, ensure HoloEarth also hides it.
      if (mobileNavIdx.current !== null) holoRef.current?.hideCityBar(mobileNavIdx.current)
    } else {
      const y = holoRef.current?.getRotationY() ?? 0
      globeRef.current?.setRotationY(y)
      if (mobileNavIdx.current !== null) globeRef.current?.hideCityBar(mobileNavIdx.current)
    }
    setIsHolo(h => !h)
  }, [isHolo])

  const { step: dotStep, dotRadius } = detailToParams(appliedDetail)

  // Update mouse position refs on every mouse move so the HUD polling interval
  // can read them without the move handler needing to call setHoveredCoords at 60 fps.
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

  // Mobile nav tap: tapping the same link a second time deactivates it (toggle off).
  // Otherwise, show the location's bracket/ping, hide its city bar, rotate to it,
  // and schedule auto-rotate to resume after IDLE_RETURN_MS.
  const handleMobileNavTap = useCallback((i, label, coords) => {
    if (active === label) {
      clearMobileMarkers()
      setActive(null)
      setMenuOpen(false)
      return
    }
    const prev = mobileNavIdx.current
    // Restore the previous nav's city bar before switching to the new one.
    if (prev !== null && prev !== i) activeGlobeRef.current?.showCityBar(prev)
    activeGlobeRef.current?.hideBracket()
    activeGlobeRef.current?.hideAllPings()
    activeGlobeRef.current?.rotateTo(coords.lat, coords.lon)
    activeGlobeRef.current?.showBracket(i)
    activeGlobeRef.current?.showPing(i)
    activeGlobeRef.current?.hideCityBar(i)
    mobileNavIdx.current = i
    setActive(label)
    setMobileZoomedLabel(label)
    setMenuOpen(false)
    clearTimeout(mobileAutoRotateTimer.current)
    // Resume auto-rotation after the same idle timeout used by drag interactions.
    mobileAutoRotateTimer.current = setTimeout(() => {
      const idx = mobileNavIdx.current
      if (idx !== null) {
        activeGlobeRef.current?.showCityBar(idx)
        mobileNavIdx.current = null
      }
      activeGlobeRef.current?.hideBracket()
      activeGlobeRef.current?.hideAllPings()
      activeGlobeRef.current?.resumeAutoRotate()
      setMobileZoomedLabel(null)
    }, IDLE_RETURN_MS)
  }, [active, activeGlobeRef, clearMobileMarkers])

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="app">
      <AppHeader
        isHolo={isHolo} holoMode={holoMode} holoReady={holoReady}
        showDots={showDots} showCities={showCities} showFlights={showFlights}
        showISS={showISS} starsRotating={starsRotating} appliedDetail={appliedDetail}
        currentZoom={currentZoom} menuOpen={menuOpen} active={active}
        navLinks={NAV_LINKS} locations={LOCATIONS} holoLocations={LOCATIONS_HOLO}
        activeRef={activeGlobeRef}
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
        {/*
          Both globes are always mounted (never conditionally rendered) to preserve
          their Three.js scenes across view toggles. Unmounting would destroy the
          WebGL context, requiring a full rebuild on every switch — expensive and
          visually jarring. Instead the inactive globe is hidden with display:none.
        */}
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
          onSnowmanClick={() => { clearMobileMarkers(); activeGlobeRef.current?.setPoleView() }}
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
