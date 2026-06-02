/**
 * Stage B.2 lesson rails — pure derivation maths.
 *
 * The Outline rail and Connected-concepts rail are derived entirely from the
 * real generated content (no fabricated data), so the derivation is unit-tested
 * here in isolation across every structured format.
 */

import { describe, it, expect } from 'vitest'
import { lessonOutline, lessonText, lessonConcepts } from '../lessonStructure'
import type {
  FlashcardContent,
  GuidedContent,
  MindmapContent,
  QuizContent,
  TimelineContent,
} from '@/api/learn.api'

const guided: GuidedContent = {
  topic: 'Backpropagation',
  intro: 'We will learn how gradients flow backward through a neural network.',
  total_steps: 2,
  steps: [
    {
      step: 1,
      title: 'The forward pass',
      explanation: 'A neural network computes activations layer by layer.',
      example: 'For z = Wx + b the activation is a function of the weights.',
      analogy: 'Like water flowing downhill through a network of pipes.',
      key_insight: 'Every activation is cached for the backward pass.',
      check_in: 'Can you name the cached value?',
      quiz_check: null,
    },
    {
      step: 2,
      title: 'The backward pass',
      explanation: 'Gradients propagate backward using the chain rule.',
      example: 'The gradient of the weights is an outer product.',
      analogy: 'Like echoes returning down the same network of pipes.',
      key_insight: 'Each backward step reuses a cached activation.',
      check_in: 'Why is backprop cheap?',
      quiz_check: null,
    },
  ],
}

const quiz: QuizContent = {
  questions: [
    { q: 'What is the chain rule used for?', options: ['A', 'B'], correct: 0, explanation: 'Because gradients compose.' },
    { q: 'What does an activation cache enable?', options: ['A', 'B'], correct: 1, explanation: 'It enables cheap gradients.' },
  ],
}

const flashcard: FlashcardContent = {
  cards: [
    { front: 'Define gradient descent', back: 'An optimization method.', hint: 'downhill' },
    { front: 'Define the chain rule', back: 'A rule for composing derivatives.', hint: 'compose' },
  ],
}

const timeline: TimelineContent = {
  events: [
    { year: '1986', title: 'Backprop popularized', description: 'Rumelhart, Hinton and Williams.' },
    { year: '2012', title: 'Deep learning breakthrough', description: 'AlexNet wins ImageNet.' },
  ],
}

const mindmap: MindmapContent = {
  root: 'Neural Networks',
  branches: [
    { label: 'Training', children: [{ label: 'Backpropagation', children: [] }] },
    { label: 'Architecture', children: [] },
  ],
}

describe('lessonOutline', () => {
  it('maps guided steps to titles in order', () => {
    expect(lessonOutline('guided', guided)).toEqual([
      { index: 0, label: 'The forward pass' },
      { index: 1, label: 'The backward pass' },
    ])
  })

  it('treats animated like guided (same underlying content)', () => {
    expect(lessonOutline('animated', guided)).toEqual(lessonOutline('guided', guided))
  })

  it('maps quiz questions to their stems', () => {
    expect(lessonOutline('quiz', quiz).map(o => o.label)).toEqual([
      'What is the chain rule used for?',
      'What does an activation cache enable?',
    ])
  })

  it('maps flashcards to their fronts', () => {
    expect(lessonOutline('flashcard', flashcard).map(o => o.label)).toEqual([
      'Define gradient descent',
      'Define the chain rule',
    ])
  })

  it('maps timeline events with the year as a sub-label', () => {
    expect(lessonOutline('timeline', timeline)).toEqual([
      { index: 0, label: 'Backprop popularized', sub: '1986' },
      { index: 1, label: 'Deep learning breakthrough', sub: '2012' },
    ])
  })

  it('maps mindmap top-level branches', () => {
    expect(lessonOutline('mindmap', mindmap).map(o => o.label)).toEqual(['Training', 'Architecture'])
  })

  it('falls back to a numbered label when a title is blank', () => {
    const blank: GuidedContent = { ...guided, steps: [{ ...guided.steps[0], title: '  ' }] }
    expect(lessonOutline('guided', blank)[0].label).toBe('Step 1')
  })

  it('returns [] for text-only formats and nullish content', () => {
    expect(lessonOutline('story', { text: 'hello' })).toEqual([])
    expect(lessonOutline('guided', null)).toEqual([])
    expect(lessonOutline('guided', undefined)).toEqual([])
  })
})

describe('lessonText', () => {
  it('flattens guided intro + step prose', () => {
    const text = lessonText('guided', guided)
    expect(text).toContain('gradients flow backward')
    expect(text).toContain('chain rule')
    expect(text).toContain('outer product')
  })

  it('flattens quiz stems, options and explanations', () => {
    const text = lessonText('quiz', quiz)
    expect(text).toContain('chain rule')
    expect(text).toContain('cheap gradients')
  })

  it('is empty for nullish content', () => {
    expect(lessonText('guided', null)).toBe('')
  })
})

describe('lessonConcepts', () => {
  it('surfaces recurring terms, most-frequent first', () => {
    const concepts = lessonConcepts('guided', guided)
    // "network"/"networks", "pipes", "cached"/"activation", "gradient(s)" all recur.
    expect(concepts.length).toBeGreaterThan(0)
    const lower = concepts.map(c => c.toLowerCase())
    expect(lower.some(c => c.startsWith('network'))).toBe(true)
  })

  it('drops stop-words and short tokens', () => {
    const concepts = lessonConcepts('guided', guided).map(c => c.toLowerCase())
    expect(concepts).not.toContain('the')
    expect(concepts).not.toContain('for')
    expect(concepts.every(c => c.length >= 4)).toBe(true)
  })

  it('respects the max cap', () => {
    expect(lessonConcepts('guided', guided, 2).length).toBeLessThanOrEqual(2)
  })

  it('returns only terms that actually appear (never fabricated)', () => {
    const text = lessonText('guided', guided).toLowerCase()
    for (const c of lessonConcepts('guided', guided)) {
      expect(text).toContain(c.toLowerCase())
    }
  })

  it('returns [] for empty content', () => {
    expect(lessonConcepts('guided', null)).toEqual([])
  })
})
