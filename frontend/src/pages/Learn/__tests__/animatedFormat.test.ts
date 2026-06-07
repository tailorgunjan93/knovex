/**
 * Animated format wiring + step maths.
 *
 * 'animated' is now its own backend format (a motion-graphics scene script
 * rendered by ScenePlayer) — not a re-presentation of guided content. These
 * guard the (now identity) mapping and the step clamping.
 */

import { describe, it, expect } from 'vitest'
import { backendFormatFor, isObjectFormat } from '../index'
import { clampStep } from '../AnimatedView'

describe('backendFormatFor', () => {
  it('animated is its own backend format', () => {
    expect(backendFormatFor('animated')).toBe('animated')
  })

  it('passes through real backend formats unchanged', () => {
    expect(backendFormatFor('guided')).toBe('guided')
    expect(backendFormatFor('quiz')).toBe('quiz')
    expect(backendFormatFor('flashcard')).toBe('flashcard')
  })
})

describe('isObjectFormat', () => {
  it('treats animated as an object (JSON) format like guided', () => {
    expect(isObjectFormat('animated')).toBe(true)
    expect(isObjectFormat('guided')).toBe(true)
    expect(isObjectFormat('quiz')).toBe(true)
  })
})

describe('clampStep', () => {
  it('clamps into [0, total-1]', () => {
    expect(clampStep(-3, 5)).toBe(0)
    expect(clampStep(2, 5)).toBe(2)
    expect(clampStep(9, 5)).toBe(4)
  })
  it('handles an empty step list', () => {
    expect(clampStep(0, 0)).toBe(0)
    expect(clampStep(3, 0)).toBe(0)
  })
})
