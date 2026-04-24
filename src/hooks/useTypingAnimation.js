import { useState, useEffect } from 'react'

export function useTypingAnimation(words) {
  const [typedWords, setTypedWords] = useState(() => words.map(() => ''))

  useEffect(() => {
    const timers = []
    let delay = 400
    words.forEach((word, wi) => {
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
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return typedWords
}
