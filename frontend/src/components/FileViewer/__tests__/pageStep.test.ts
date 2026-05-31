/**
 * pageStep — keyboard page-navigation logic for the Reader.
 *
 * Guards the "arrow keys don't turn pages" bug: the viewer had no keyboard
 * handler at all. This covers the pure step calculation (direction + clamping);
 * the effect that listens for keydown and ignores typing is wired in FileViewer.
 */

import { describe, it, expect } from 'vitest'
import { pageStep } from '@/components/FileViewer'

describe('pageStep', () => {
  it('ArrowRight advances one page', () => {
    expect(pageStep('ArrowRight', 1, 10)).toBe(2)
    expect(pageStep('ArrowRight', 5, 10)).toBe(6)
  })

  it('ArrowLeft goes back one page', () => {
    expect(pageStep('ArrowLeft', 5, 10)).toBe(4)
    expect(pageStep('ArrowLeft', 2, 10)).toBe(1)
  })

  it('clamps at the last page (no-op → null)', () => {
    expect(pageStep('ArrowRight', 10, 10)).toBeNull()
  })

  it('clamps at the first page (no-op → null)', () => {
    expect(pageStep('ArrowLeft', 1, 10)).toBeNull()
  })

  it('returns null for non-arrow keys', () => {
    expect(pageStep('Enter', 5, 10)).toBeNull()
    expect(pageStep('a', 5, 10)).toBeNull()
    expect(pageStep(' ', 5, 10)).toBeNull()
  })

  it('returns null for a single-page document', () => {
    expect(pageStep('ArrowRight', 1, 1)).toBeNull()
    expect(pageStep('ArrowLeft', 1, 1)).toBeNull()
  })
})
