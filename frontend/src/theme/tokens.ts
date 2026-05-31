/**
 * Brand & semantic design tokens — single source of truth.
 *
 * The locked amber/copper identity (design lab, 2026-05-31). Pages and the MUI
 * theme import these instead of hardcoding hex values (engineering standard #6:
 * future-proof — a palette change is now a one-file edit).
 *
 * Surface palettes for the three themes still live in `theme/index.ts`; these
 * tokens cover the brand accent, the CTA gradient, and the cross-screen
 * semantic accents used by chips/highlights/status.
 */

export const BRAND = {
  copper:      '#DDA76A',
  copperDark:  '#B5803E',
  copperLight: '#EABC8A',
  /** Dark text placed on top of the copper accent / gradient. */
  onAccent:    '#1A140C',
  /** Primary CTA / brand gradient. */
  gradient:    'linear-gradient(135deg, #EABC8A, #B5803E)',
} as const

/** Cross-screen semantic accents (status chips, highlights, charts). */
export const SEMANTIC = {
  mastered: '#3A8D7A',  // teal — ready / mastered / correct
  review:   '#DDA76A',  // copper — review / indexing / due
  question: '#B86D76',  // rose — question / error / wrong
  info:     '#7E8FB0',  // slate — new / informational
  error:    '#EF4444',
  warning:  '#F59E0B',
  success:  '#10B981',
} as const

/** Shared shape tokens. */
export const RADII = { sm: 8, md: 12, lg: 16, pill: 999 } as const
