/**
 * Animated format wiring + AnimatedView step maths.
 *
 * 'animated' is a UI-only format: it must generate GUIDED content on the
 * backend (there is no 'animated' backend format) but render the distinct
 * animated step-through. These guard that mapping and the step clamping.
 */

import { describe, it, expect } from 'vitest'
import { backendFormatFor, isObjectFormat } from '../index'
import { clampStep } from '../AnimatedView'

describe('backendFormatFor', () => {
  it('maps animated → guided (no backend "animated" format exists)', () => {
    expect(backendFormatFor('animated')).toBe('guided')
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
