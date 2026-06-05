/**
 * Display-name helper tests — Phase 2 shell.
 * Regression guard for the "fresh install is called Gunjan" bug: with no name
 * configured, the UI must say "You" / "Y", never a hardcoded personal name.
 */

import { describe, it, expect } from 'vitest'
import { resolveDisplayName, initialsOf } from './displayName'

describe('resolveDisplayName', () => {
  it('falls back to "You" for empty/undefined/whitespace', () => {
    expect(resolveDisplayName(undefined)).toBe('You')
    expect(resolveDisplayName(null)).toBe('You')
    expect(resolveDisplayName('')).toBe('You')
    expect(resolveDisplayName('   ')).toBe('You')
  })

  it('returns the trimmed configured name', () => {
    expect(resolveDisplayName('Ada')).toBe('Ada')
    expect(resolveDisplayName('  Ada Lovelace  ')).toBe('Ada Lovelace')
  })

  it('never invents a hardcoded personal name on a fresh install', () => {
    expect(resolveDisplayName('').toLowerCase()).not.toContain('gunjan')
  })
})

describe('initialsOf', () => {
  it('returns "Y" when there is no name', () => {
    expect(initialsOf('')).toBe('Y')
    expect(initialsOf(undefined)).toBe('Y')
  })

  it('uses first+last initial for multi-word names', () => {
    expect(initialsOf('Ada Lovelace')).toBe('AL')
    expect(initialsOf('grace brewster hopper')).toBe('GH')
  })

  it('uses first two letters for a single name', () => {
    expect(initialsOf('Ada')).toBe('AD')
  })
})
