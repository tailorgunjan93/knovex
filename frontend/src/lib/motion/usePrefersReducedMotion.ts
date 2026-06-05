/**
 * usePrefersReducedMotion — single-responsibility hook wrapping the
 * `(prefers-reduced-motion: reduce)` media query behind our own interface.
 *
 * Components depend on this hook, not on `window.matchMedia` directly (DIP),
 * and decide per-animation what to disable (opt-in, per the locked decision).
 *
 * One listener, registered on mount and cleaned up on unmount — no polling.
 */

import { useEffect, useState } from 'react'

const QUERY = '(prefers-reduced-motion: reduce)'

export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState<boolean>(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false
    return window.matchMedia(QUERY).matches
  })

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const mql = window.matchMedia(QUERY)
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches)
    // Sync once in case the value changed between initial render and effect.
    setReduced(mql.matches)
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [])

  return reduced
}
