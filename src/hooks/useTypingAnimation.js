/**
 * Drives a typewriter animation for an array of words, typing one character
 * at a time with a configurable delay between characters and words.
 *
 * Used by App.jsx for the hero section's initial load animation. Words animate
 * in sequence (word 0 fully types before word 1 begins).
 *
 * Why setTimeout chains instead of requestAnimationFrame?
 * rAF fires every ~16 ms; timeouts fire at human-readable intervals (78 ms per
 * character = ~13 chars/sec). rAF would require tracking elapsed time and
 * character counters manually — more complexity for no visual benefit.
 *
 * ── Visual levers ─────────────────────────────────────────────────────────
 *   1800   Initial delay (ms) before typing starts. Lets the page settle and
 *          the globe finish loading before drawing the eye to the hero text.
 *          Lower for a snappier feel; raise for a more cinematic entrance.
 *   78     Milliseconds per character. 78 ms ≈ 13 chars/sec feels like a fast
 *          but readable terminal. 50 = very fast; 120 = slow deliberate typing.
 *   280    Extra pause between words (ms) so each word reads as a distinct unit
 *          before the next begins. 0 = run together; 500 = long dramatic beat.
 */
import { useState, useEffect } from 'react'

export function useTypingAnimation(words) {
  const [typedWords, setTypedWords] = useState(() => words.map(() => ''))

  useEffect(() => {
    const timers = []
    let delay = 1800 // initial pause before any typing begins
    words.forEach((word, wi) => {
      for (let ci = 1; ci <= word.length; ci++) {
        const chars = ci
        timers.push(setTimeout(() => {
          setTypedWords(prev => { const next = [...prev]; next[wi] = word.slice(0, chars); return next })
        }, delay))
        delay += 78 // per-character interval
      }
      delay += 280 // inter-word pause after each word completes
    })
    return () => timers.forEach(clearTimeout)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return typedWords
}
