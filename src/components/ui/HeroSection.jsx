/**
 * Hero text block rendered in the left panel alongside the globe.
 *
 * Two display modes:
 *   Default (active = null):  The HERO_WORDS array types out across multiple lines.
 *   Nav active:               The active nav label types out on a single line.
 *
 * Why `localWords` can be null:
 *   On initial load, useTypingAnimation drives the hero text via the `typedWords`
 *   prop — we don't want to duplicate that logic here. `localWords = null` signals
 *   "use the prop". When a nav link is cleared (active goes null → null → null after
 *   having been non-null), we need to re-run the typing animation *locally* so the
 *   words re-appear even though `typedWords` from the prop is already fully typed.
 *   Setting `localWords` to a fresh empty array and running our own timeouts gives us
 *   a clean re-animation without touching the hook.
 *
 * Why prevActiveRef:
 *   The useEffect runs when `active` changes. We need to distinguish two cases:
 *   (a) active changed from something → null: re-animate HERO_WORDS.
 *   (b) active was null on mount (initial load): don't override the prop animation.
 *   prevActiveRef stores the previous value so we can tell these cases apart.
 *
 * ── Visual levers ─────────────────────────────────────────────────────────
 *   delay = 500 (re-animation)   Initial pause before re-typing HERO_WORDS after
 *                                 a nav link is cleared. Lower for instant replay.
 *   78 ms per character           Typing speed (matches useTypingAnimation).
 *   200 ms inter-word pause       Gap between words on re-animation
 *                                 (shorter than the 280 ms initial load pause).
 *   300 ms (nav label delay)      Pause before typing the active nav label.
 */
import { useState, useEffect, useRef } from 'react'
import { HERO_WORDS } from '../../data/siteContent.js'
import { NAV_LINKS } from '../../data/navConfig.js'
import ControlsGuide from './ControlsGuide'
import './HeroSection.css'

export default function HeroSection({ typedWords, active }) {
  const [typedLabel, setTypedLabel] = useState('')
  const [localWords, setLocalWords] = useState(null) // null = use prop typedWords
  const prevActiveRef = useRef(null)

  useEffect(() => {
    const prevActive = prevActiveRef.current
    prevActiveRef.current = active
    const timers = []

    if (!active) {
      setTypedLabel('')
      if (prevActive !== null) {
        // Returning to default view after a nav link was active: re-animate HERO_WORDS
        // from scratch so the text doesn't just snap back fully formed.
        setLocalWords(HERO_WORDS.map(() => ''))
        let delay = 500 // short pause before re-typing starts
        HERO_WORDS.forEach((word, wi) => {
          for (let ci = 1; ci <= word.length; ci++) {
            const chars = ci
            timers.push(setTimeout(() => {
              setLocalWords(prev => { const next = [...prev]; next[wi] = word.slice(0, chars); return next })
            }, delay))
            delay += 78
          }
          delay += 200
        })
      }
      return () => timers.forEach(clearTimeout)
    }

    // Nav link became active: clear the hero words and type the label instead.
    setTypedLabel('')
    setLocalWords(null) // stop overriding the prop while a label is being typed
    let delay = 300
    for (let i = 1; i <= active.length; i++) {
      const chars = i
      timers.push(setTimeout(() => setTypedLabel(active.slice(0, chars)), delay))
      delay += 78
    }
    return () => timers.forEach(clearTimeout)
  }, [active])

  // Use locally driven words if available (re-animation), otherwise fall back to the
  // fully-typed prop coming from useTypingAnimation in App.jsx.
  const displayWords = localWords ?? typedWords

  return (
    <div className="hero">
      <h1 className="hero-title">
        {active ? (
          // Active nav: show the typing label with a cursor until it finishes.
          <span className="hero-title-line">
            {typedLabel}
            {typedLabel.length < active.length && (
              <span className="typing-cursor" aria-hidden="true">|</span>
            )}
          </span>
        ) : (
          // Default: render each HERO_WORD on its own line with a per-word cursor.
          // The cursor advances to the next word only after the previous one finishes —
          // `prevDone` checks that all earlier words are fully typed.
          HERO_WORDS.map((word, i) => {
            const prevDone = HERO_WORDS.slice(0, i).every((w, j) => displayWords[j].length === w.length)
            const showCursor = prevDone && displayWords[i].length < word.length
            return (
              <span key={word} className="hero-title-line">
                {displayWords[i]}
                {showCursor && <span className="typing-cursor" aria-hidden="true">|</span>}
              </span>
            )
          })
        )}
      </h1>
      <p className="hero-eyebrow-mobile">Explore · Interact · Discover</p>
      {/* key forces ControlsGuide to remount (and reset its open state) when switching nav */}
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
  )
}
