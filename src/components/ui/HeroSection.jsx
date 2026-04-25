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
        // Returning to default: re-animate HERO_WORDS from scratch
        setLocalWords(HERO_WORDS.map(() => ''))
        let delay = 500
        HERO_WORDS.forEach((word, wi) => {
          for (let ci = 1; ci <= word.length; ci++) {
            const chars = ci
            timers.push(setTimeout(() => {
              setLocalWords(prev => { const next = [...prev]; next[wi] = word.slice(0, chars); return next })
            }, delay))
            delay += 78
          }
          delay += 280
        })
      }
      return () => timers.forEach(clearTimeout)
    }

    // Nav link active: type the label after a short delay
    setTypedLabel('')
    setLocalWords(null)
    let delay = 300
    for (let i = 1; i <= active.length; i++) {
      const chars = i
      timers.push(setTimeout(() => setTypedLabel(active.slice(0, chars)), delay))
      delay += 78
    }
    return () => timers.forEach(clearTimeout)
  }, [active])

  const displayWords = localWords ?? typedWords

  return (
    <div className="hero">
      <h1 className="hero-title">
        {active ? (
          <span className="hero-title-line">
            {typedLabel}
            {typedLabel.length < active.length && (
              <span className="typing-cursor" aria-hidden="true">|</span>
            )}
          </span>
        ) : (
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
