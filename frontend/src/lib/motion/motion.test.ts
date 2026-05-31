/**
 * Motion wrapper (anti-corruption layer) tests — Phase 1 foundations.
 *
 * Proves the wrapper contract that the rest of the app depends on, so that
 * framer-motion stays swappable behind src/lib/motion (engineering standard #7):
 *   • Named motion tokens exist with the locked physics values.
 *   • usePrefersReducedMotion reflects the OS matchMedia setting (opt-in hook).
 *   • The wrapper re-exports Motion + AnimatePresence so callers never import
 *     'framer-motion' directly.
 */

import { renderHook } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MOTION, Motion, AnimatePresence, usePrefersReducedMotion } from './index'

// ─── Helper: stub matchMedia for a given reduced-motion preference ──────────────
function stubReducedMotion(reduced: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: query.includes('prefers-reduced-motion') ? reduced : false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),     // deprecated, some libs still call it
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }))
}

describe('motion tokens (MOTION)', () => {
  it('exposes the locked spring physics', () => {
    expect(MOTION.spring.stiffness).toBe(300)
    expect(MOTION.spring.damping).toBe(30)
  })

  it('exposes the locked reveal easing + duration', () => {
    expect(MOTION.ease.out).toBe('cubic-bezier(0.22, 1, 0.36, 1)')
    expect(MOTION.duration.reveal).toBeGreaterThanOrEqual(0.28)
    expect(MOTION.duration.reveal).toBeLessThanOrEqual(0.36)
  })
})

describe('wrapper re-exports (so callers never import framer-motion directly)', () => {
  it('re-exports Motion and AnimatePresence', () => {
    expect(Motion).toBeDefined()
    expect(AnimatePresence).toBeDefined()
  })
})

describe('usePrefersReducedMotion', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('returns true when the OS requests reduced motion', () => {
    stubReducedMotion(true)
    const { result } = renderHook(() => usePrefersReducedMotion())
    expect(result.current).toBe(true)
  })

  it('returns false when the OS allows motion', () => {
    stubReducedMotion(false)
    const { result } = renderHook(() => usePrefersReducedMotion())
    expect(result.current).toBe(false)
  })
})
