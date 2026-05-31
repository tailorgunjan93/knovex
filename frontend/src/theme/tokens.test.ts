/**
 * Brand token tests — Phase 1 foundations.
 *
 * Pages must stop hardcoding '#DDA76A' and import named tokens instead
 * (single source of truth, future-proof per engineering standard #6).
 * This locks the amber identity values so an accidental change fails CI.
 */

import { describe, it, expect } from 'vitest'
import { BRAND, SEMANTIC } from './tokens'

describe('BRAND tokens (locked amber identity)', () => {
  it('exposes the copper family', () => {
    expect(BRAND.copper).toBe('#DDA76A')
    expect(BRAND.copperDark).toBe('#B5803E')
    expect(BRAND.copperLight).toBe('#EABC8A')
  })

  it('exposes the copper CTA gradient + on-accent text color', () => {
    expect(BRAND.gradient).toContain(BRAND.copperLight)
    expect(BRAND.gradient).toContain(BRAND.copperDark)
    expect(BRAND.onAccent).toBe('#1A140C')
  })
})

describe('SEMANTIC tokens', () => {
  it('exposes mastered/review/question/new accents used across screens', () => {
    expect(SEMANTIC.mastered).toBe('#3A8D7A')
    expect(SEMANTIC.question).toBe('#B86D76')
    expect(SEMANTIC.info).toBe('#7E8FB0')
  })
})
