import { HERO_WORDS } from '../../data/siteContent.js'
import { NAV_LINKS } from '../../data/navConfig.js'
import ControlsGuide from './ControlsGuide'
import './HeroSection.css'

export default function HeroSection({ typedWords, active }) {
  return (
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
