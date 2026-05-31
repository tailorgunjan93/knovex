/**
 * Motion — anti-corruption layer over `framer-motion`.
 *
 * This is the ONLY module in the app allowed to import `framer-motion`
 * (engineering standard #7: wrap every external module). Everything else
 * imports from `@/lib/motion`, depending on our interface — never the library.
 * If we ever swap motion libraries, only this file changes.
 *
 * Exports:
 *   • Motion           — re-export of framer-motion's `motion` factory
 *   • AnimatePresence  — enter/exit orchestration
 *   • usePrefersReducedMotion — opt-in hook reflecting the OS setting
 *   • MOTION           — named physics/easing/duration tokens (single source
 *                        of truth, mirrors the locked design-lab values)
 *
 * Reduced motion is intentionally OPT-IN (per locked decision): callers read
 * `usePrefersReducedMotion()` and choose what to disable. The tokens make that
 * choice cheap and consistent.
 */

// eslint-disable-next-line no-restricted-imports -- this wrapper is the single allowed importer
import { motion as fmMotion, AnimatePresence as FmAnimatePresence } from 'framer-motion'

export const Motion = fmMotion
export const AnimatePresence = FmAnimatePresence

// ─── Motion tokens — locked physics from the design lab ─────────────────────────
export const MOTION = {
  /** UI springs (layout, hovers, pops). */
  spring: { type: 'spring' as const, stiffness: 300, damping: 30 },
  /** Easing curves. */
  ease: {
    out: 'cubic-bezier(0.22, 1, 0.36, 1)',
  },
  /** Durations in seconds. */
  duration: {
    reveal: 0.32,   // card/beat reveal
    page: 0.34,     // reader page-turn slide
    quick: 0.18,    // hover/state changes
  },
  /** Child stagger between sequential reveals (seconds). */
  stagger: 0.05,
} as const

// ─── usePrefersReducedMotion — opt-in accessibility gate ────────────────────────
export { usePrefersReducedMotion } from './usePrefersReducedMotion'
