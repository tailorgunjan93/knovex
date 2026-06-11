/**
 * sceneLayout — the deterministic layout engine for semantic animated lessons.
 *
 * The Mermaid/Graphviz model: the LLM declares STRUCTURE (diagram type, items,
 * edges, per-step reveal/focus); this pure engine computes every coordinate.
 * Tests assert the pedagogy the research demands: progressive disclosure
 * (reveal accumulates), signaling (focus=accent, rest muted), and layouts that
 * cannot overlap (minimum centre-distance between any two items).
 */

import { describe, it, expect } from 'vitest'
import { compileSemanticScenes, isSemanticAnimated } from '@/lib/sceneLayout'
import type { SemanticAnimatedContent } from '@/api/learn.api'

function base(over: Partial<SemanticAnimatedContent> = {}): SemanticAnimatedContent {
  return {
    topic: 'Photosynthesis',
    title: 'How photosynthesis works',
    diagram: 'flow',
    items: [
      { id: 'sun', label: 'Sunlight' },
      { id: 'leaf', label: 'Chloroplast' },
      { id: 'sugar', label: 'Glucose' },
    ],
    steps: [
      { narration: 'It starts with light.', reveal: ['sun'], focus: 'sun' },
      { narration: 'The chloroplast captures it.', reveal: ['leaf'], focus: 'leaf' },
      { narration: 'And builds sugar.', reveal: ['sugar'], focus: 'sugar' },
    ],
    ...over,
  }
}

/** Centre distance between two positioned elements, x-weighted for 16:9. */
function dist(a: { x?: number; y?: number }, b: { x?: number; y?: number }) {
  const dx = (a.x ?? 0) - (b.x ?? 0)
  const dy = ((a.y ?? 0) - (b.y ?? 0)) * (9 / 16)
  return Math.hypot(dx, dy)
}

const SHAPES = ['node', 'circle'] as const

function shapesOf(scene: { elements: { type: string }[] }) {
  return scene.elements.filter(e => (SHAPES as readonly string[]).includes(e.type)) as
    { type: string; x?: number; y?: number; label?: string; color?: string }[]
}

describe('isSemanticAnimated', () => {
  it('detects the semantic format and rejects legacy/empty', () => {
    expect(isSemanticAnimated(base())).toBe(true)
    expect(isSemanticAnimated({ scenes: [] })).toBe(false)
    expect(isSemanticAnimated(null)).toBe(false)
    expect(isSemanticAnimated({ diagram: 'flow' })).toBe(false)   // no steps/items
  })
})

describe('progressive disclosure + signaling', () => {
  it('reveal accumulates across steps (one new thing at a time)', () => {
    const scenes = compileSemanticScenes(base())
    expect(shapesOf(scenes[0]).length).toBe(1)
    expect(shapesOf(scenes[1]).length).toBe(2)
    expect(shapesOf(scenes[2]).length).toBe(3)
  })

  it('the focused item is accent, previously revealed items are muted', () => {
    const scenes = compileSemanticScenes(base())
    const s2 = shapesOf(scenes[1])
    const focused = s2.find(e => e.label === 'Chloroplast')!
    const old = s2.find(e => e.label === 'Sunlight')!
    expect(focused.color).toBe('accent')
    expect(old.color).toBe('muted')
  })

  it('narration is carried through per scene', () => {
    const scenes = compileSemanticScenes(base())
    expect(scenes[0].narration).toBe('It starts with light.')
  })
})

describe('layouts never overlap', () => {
  const MANY = Array.from({ length: 6 }, (_, i) => ({ id: `n${i}`, label: `Item ${i}` }))
  const ALL_STEPS = [{ narration: 'all', reveal: MANY.map(m => m.id) }]

  for (const diagram of ['flow', 'cycle', 'tree', 'compare', 'timeline', 'hub'] as const) {
    it(`${diagram}: every pair of items keeps a minimum centre distance`, () => {
      const items = diagram === 'compare'
        ? MANY.map((m, i) => ({ ...m, group: i % 2 ? 'right' : 'left' }))
        : diagram === 'tree'
          ? MANY.map((m, i) => (i === 0 ? m : { ...m, parent: 'n0' }))
          : MANY
      const scenes = compileSemanticScenes(base({ diagram, items, steps: ALL_STEPS }))
      const shapes = shapesOf(scenes[0])
      expect(shapes.length).toBe(6)
      for (let i = 0; i < shapes.length; i++) {
        for (let j = i + 1; j < shapes.length; j++) {
          expect(dist(shapes[i], shapes[j])).toBeGreaterThanOrEqual(8)
        }
      }
      // and everything stays inside the visible frame
      for (const s of shapes) {
        expect(s.x).toBeGreaterThanOrEqual(4); expect(s.x).toBeLessThanOrEqual(96)
        expect(s.y).toBeGreaterThanOrEqual(4); expect(s.y).toBeLessThanOrEqual(96)
      }
    })
  }
})

describe('diagram specifics', () => {
  it('flow draws arrows between consecutive revealed items', () => {
    const scenes = compileSemanticScenes(base())
    const arrows = scenes[2].elements.filter(e => e.type === 'arrow')
    expect(arrows.length).toBe(2)   // sun→leaf, leaf→sugar
  })

  it('cycle closes the loop (n arrows for n items)', () => {
    const scenes = compileSemanticScenes(base({ diagram: 'cycle', steps: [
      { narration: 'all', reveal: ['sun', 'leaf', 'sugar'] },
    ] }))
    expect(scenes[0].elements.filter(e => e.type === 'arrow').length).toBe(3)
  })

  it('tree puts the root above its children', () => {
    const scenes = compileSemanticScenes(base({
      diagram: 'tree',
      items: [
        { id: 'root', label: 'Energy' },
        { id: 'a', label: 'Light', parent: 'root' },
        { id: 'b', label: 'Heat', parent: 'root' },
      ],
      steps: [{ narration: 'all', reveal: ['root', 'a', 'b'] }],
    }))
    const shapes = shapesOf(scenes[0])
    const root = shapes.find(s => s.label === 'Energy')!
    const child = shapes.find(s => s.label === 'Light')!
    expect(root.y!).toBeLessThan(child.y!)
  })

  it('compare separates left and right groups across the divider', () => {
    const scenes = compileSemanticScenes(base({
      diagram: 'compare',
      items: [
        { id: 'a', label: 'TCP', group: 'left' },
        { id: 'b', label: 'UDP', group: 'right' },
      ],
      steps: [{ narration: 'all', reveal: ['a', 'b'] }],
    }))
    const shapes = shapesOf(scenes[0])
    expect(shapes.find(s => s.label === 'TCP')!.x!).toBeLessThan(45)
    expect(shapes.find(s => s.label === 'UDP')!.x!).toBeGreaterThan(55)
  })

  it('reaction: inputs sit left of the process, outputs right (directional)', () => {
    const content = base({
      diagram: 'reaction',
      items: [
        { id: 'sun', label: 'Sunlight', role: 'input' },
        { id: 'h2o', label: 'Water', role: 'input' },
        { id: 'co2', label: 'CO2', role: 'input' },
        { id: 'chl', label: 'Chloroplast', role: 'process' },
        { id: 'glu', label: 'Glucose', role: 'output' },
        { id: 'o2', label: 'Oxygen', role: 'output' },
      ],
      steps: [{ narration: 'all', reveal: ['sun', 'h2o', 'co2', 'chl', 'glu', 'o2'] }],
    })
    const scenes = compileSemanticScenes(content)
    const shapes = shapesOf(scenes[0])
    const proc = shapes.find(s => s.label === 'Chloroplast')!
    for (const lab of ['Sunlight', 'Water', 'CO2']) {
      expect(shapes.find(s => s.label === lab)!.x!).toBeLessThan(proc.x!)
    }
    for (const lab of ['Glucose', 'Oxygen']) {
      expect(shapes.find(s => s.label === lab)!.x!).toBeGreaterThan(proc.x!)
    }
    // overlap-free
    for (let i = 0; i < shapes.length; i++)
      for (let j = i + 1; j < shapes.length; j++)
        expect(dist(shapes[i], shapes[j])).toBeGreaterThanOrEqual(8)
  })

  it('reaction: arrows go inputs→process and process→outputs (not backwards)', () => {
    const content = base({
      diagram: 'reaction',
      items: [
        { id: 'a', label: 'A', role: 'input' },
        { id: 'p', label: 'P', role: 'process' },
        { id: 'z', label: 'Z', role: 'output' },
      ],
      steps: [{ narration: 'all', reveal: ['a', 'p', 'z'] }],
    })
    const scenes = compileSemanticScenes(content)
    const arrows = scenes[0].elements.filter(e => e.type === 'arrow')
    // input A is left of process P → its arrow points rightward (x2 > x1)
    const intoProc = arrows.find(e => (e.x1 ?? 0) < 35)!
    expect(intoProc.x2!).toBeGreaterThan(intoProc.x1!)
    // process → output Z also points rightward
    const toOut = arrows.find(e => (e.x2 ?? 0) > 70)!
    expect(toOut.x2!).toBeGreaterThan(toOut.x1!)
    expect(arrows.length).toBe(2)
  })

  it('a step with highlight + content.code becomes a code scene', () => {
    const scenes = compileSemanticScenes(base({
      code: { lang: 'python', code: 'def f():\n    return 1' },
      steps: [
        { narration: 'the idea', reveal: ['sun'], focus: 'sun' },
        { narration: 'in code', reveal: [], highlight: 2 },
      ],
    }))
    const code = scenes[1].elements.find(e => e.type === 'code')
    expect(code).toBeDefined()
    expect(code!.highlight).toBe(2)
    expect(code!.code).toContain('def f()')
  })

  it('unknown item ids in reveal/focus are ignored, never crash', () => {
    const scenes = compileSemanticScenes(base({
      steps: [{ narration: 'x', reveal: ['ghost', 'sun'], focus: 'ghost' }],
    }))
    expect(shapesOf(scenes[0]).length).toBe(1)
  })
})
