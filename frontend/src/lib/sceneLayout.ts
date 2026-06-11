/**
 * sceneLayout — deterministic layout engine for semantic animated lessons.
 *
 * The Mermaid/Graphviz model applied to Knovex's principle ("logic in the app,
 * the LLM is just the narrator"): the LLM declares STRUCTURE — a diagram type,
 * items, edges, and per-step narration/reveal/focus — and this pure engine
 * computes every coordinate. That makes overlap mathematically impossible and
 * bakes in the two tutorial-pedagogy rules from the research:
 *   - progressive disclosure: `reveal` accumulates — the same diagram grows one
 *     piece at a time across steps (never resets, never crowds);
 *   - signaling: the step's `focus` item renders accent (glowing), everything
 *     previously revealed is muted, so the eye lands where the narration is.
 *
 * Output is the existing positioned-scene format (AnimatedScene[]), so the
 * ScenePlayer renderer needs no new drawing code.
 *
 * Coordinates are stage percentages (x 0..100, y 0..100, 16:9 stage).
 */

import type {
  AnimatedScene,
  SceneElement,
  SemanticAnimatedContent,
  SemanticItem,
} from '@/api/learn.api'

/** True when *content* is the semantic animated format (vs legacy scenes). */
export function isSemanticAnimated(content: unknown): content is SemanticAnimatedContent {
  if (!content || typeof content !== 'object') return false
  const c = content as Record<string, unknown>
  return typeof c.diagram === 'string'
    && Array.isArray(c.items)
    && Array.isArray(c.steps)
    && (c.steps as unknown[]).length > 0
}

interface Pos { x: number; y: number }

const TITLE_Y = 11

// ── Per-diagram position computation (pure; full item set → stable positions) ──

function flowPositions(items: SemanticItem[]): Map<string, Pos> {
  const pos = new Map<string, Pos>()
  const n = items.length
  if (n <= 5) {
    // one row, spread across the full width
    items.forEach((it, i) => {
      const x = n === 1 ? 50 : 14 + (72 * i) / (n - 1)
      pos.set(it.id, { x, y: 52 })
    })
  } else {
    // two rows, serpentine
    const perRow = Math.ceil(n / 2)
    items.forEach((it, i) => {
      const row = Math.floor(i / perRow)
      const col = i % perRow
      const x = perRow === 1 ? 50 : 14 + (72 * col) / (perRow - 1)
      pos.set(it.id, { x, y: row === 0 ? 38 : 68 })
    })
  }
  return pos
}

function cyclePositions(items: SemanticItem[]): Map<string, Pos> {
  const pos = new Map<string, Pos>()
  const n = Math.max(items.length, 1)
  const cx = 50, cy = 55, rx = 30, ry = 28
  items.forEach((it, i) => {
    const a = -Math.PI / 2 + (2 * Math.PI * i) / n
    pos.set(it.id, { x: cx + rx * Math.cos(a), y: cy + ry * Math.sin(a) })
  })
  return pos
}

function treePositions(items: SemanticItem[]): Map<string, Pos> {
  const pos = new Map<string, Pos>()
  const roots = items.filter(it => !it.parent || !items.some(p => p.id === it.parent))
  const children = items.filter(it => !roots.includes(it))
  roots.forEach((r, i) => {
    const x = roots.length === 1 ? 50 : 20 + (60 * i) / (roots.length - 1)
    pos.set(r.id, { x, y: 26 })
  })
  const n = children.length
  children.forEach((c, i) => {
    const x = n === 1 ? 50 : 12 + (76 * i) / (n - 1)
    pos.set(c.id, { x, y: 64 })
  })
  return pos
}

function comparePositions(items: SemanticItem[]): Map<string, Pos> {
  const pos = new Map<string, Pos>()
  const left = items.filter(it => (it.group ?? 'left') !== 'right')
  const right = items.filter(it => (it.group ?? 'left') === 'right')
  const place = (col: SemanticItem[], x: number) => {
    col.forEach((it, i) => {
      const y = col.length === 1 ? 54 : 34 + (44 * i) / (col.length - 1)
      pos.set(it.id, { x, y })
    })
  }
  place(left, 27)
  place(right, 73)
  return pos
}

function timelinePositions(items: SemanticItem[]): Map<string, Pos> {
  const pos = new Map<string, Pos>()
  const n = items.length
  items.forEach((it, i) => {
    const x = n === 1 ? 50 : 12 + (76 * i) / (n - 1)
    // alternate above/below the axis so adjacent labels can't collide
    pos.set(it.id, { x, y: i % 2 === 0 ? 44 : 68 })
  })
  return pos
}

/** Partition reaction items into inputs / process / outputs (unroled → input). */
function reactionRoles(items: SemanticItem[]) {
  const process = items.filter(i => i.role === 'process')
  const outputs = items.filter(i => i.role === 'output')
  const inputs = items.filter(i => i.role !== 'process' && i.role !== 'output')
  // If the LLM forgot to mark a process, treat the lone unroled middle item as one.
  if (process.length === 0 && inputs.length > 0 && outputs.length > 0) {
    process.push(inputs.pop()!)
  }
  return { inputs, process, outputs }
}

function reactionPositions(items: SemanticItem[]): Map<string, Pos> {
  const pos = new Map<string, Pos>()
  const { inputs, process, outputs } = reactionRoles(items)
  const column = (col: SemanticItem[], x: number) => {
    col.forEach((it, i) => {
      const y = col.length === 1 ? 52 : 28 + (48 * i) / (col.length - 1)
      pos.set(it.id, { x, y })
    })
  }
  column(inputs, 17)
  column(process, 50)
  column(outputs, 83)
  return pos
}

function hubPositions(items: SemanticItem[]): Map<string, Pos> {
  const pos = new Map<string, Pos>()
  if (items.length === 0) return pos
  const [hub, ...sats] = items
  pos.set(hub.id, { x: 50, y: 54 })
  const n = Math.max(sats.length, 1)
  sats.forEach((s, i) => {
    const a = -Math.PI / 2 + (2 * Math.PI * i) / n
    pos.set(s.id, { x: 50 + 32 * Math.cos(a), y: 54 + 30 * Math.sin(a) })
  })
  return pos
}

function positionsFor(content: SemanticAnimatedContent): Map<string, Pos> {
  switch (content.diagram) {
    case 'cycle':    return cyclePositions(content.items)
    case 'tree':     return treePositions(content.items)
    case 'compare':  return comparePositions(content.items)
    case 'timeline': return timelinePositions(content.items)
    case 'hub':      return hubPositions(content.items)
    case 'reaction': return reactionPositions(content.items)
    case 'flow':
    case 'code':
    default:         return flowPositions(content.items)
  }
}

// ── Edges to draw (explicit, or implied by the diagram type) ──────────────────

function impliedEdges(content: SemanticAnimatedContent): { from: string; to: string }[] {
  if (content.edges && content.edges.length > 0) return content.edges
  const ids = content.items.map(i => i.id)
  switch (content.diagram) {
    case 'flow': {
      const out = []
      for (let i = 0; i < ids.length - 1; i++) out.push({ from: ids[i], to: ids[i + 1] })
      return out
    }
    case 'cycle': {
      const out = []
      for (let i = 0; i < ids.length; i++) out.push({ from: ids[i], to: ids[(i + 1) % ids.length] })
      return out
    }
    case 'tree':
      return content.items.filter(i => i.parent).map(i => ({ from: i.parent!, to: i.id }))
    case 'hub':
      return ids.slice(1).map(id => ({ from: ids[0], to: id }))
    case 'reaction': {
      // Inputs flow INTO the process; the process flows OUT to outputs.
      const { inputs, process, outputs } = reactionRoles(content.items)
      const proc = process[0]?.id
      if (!proc) return []
      return [
        ...inputs.map(i => ({ from: i.id, to: proc })),
        ...outputs.map(o => ({ from: proc, to: o.id })),
      ]
    }
    default:
      return []
  }
}

/** Shorten an edge so the arrow starts/ends at item boundaries, not centres. */
function trimEdge(a: Pos, b: Pos): { x1: number; y1: number; x2: number; y2: number } {
  const dx = b.x - a.x, dy = b.y - a.y
  const len = Math.hypot(dx, dy) || 1
  // item "radius" in stage units — boxes are ~18 wide / circles r~9
  const trim = Math.min(10, len * 0.32)
  const ux = dx / len, uy = dy / len
  return { x1: a.x + ux * trim, y1: a.y + uy * trim, x2: b.x - ux * trim, y2: b.y - uy * trim }
}

// ── Compile: semantic content → positioned AnimatedScene[] ────────────────────

const SHAPE: Record<string, 'node' | 'circle'> = {
  flow: 'node', tree: 'node', compare: 'node', code: 'node', reaction: 'node',
  cycle: 'circle', hub: 'circle', timeline: 'circle',
}

export function compileSemanticScenes(content: SemanticAnimatedContent): AnimatedScene[] {
  const pos = positionsFor(content)
  const edges = impliedEdges(content)
  const byId = new Map(content.items.map(i => [i.id, i]))
  const shape = SHAPE[content.diagram] ?? 'node'

  const revealed = new Set<string>()
  const scenes: AnimatedScene[] = []

  for (const step of content.steps) {
    const newlyRevealed = new Set<string>()
    for (const id of step.reveal ?? []) {
      if (byId.has(id) && !revealed.has(id)) { revealed.add(id); newlyRevealed.add(id) }
    }

    const elements: SceneElement[] = []
    const caption = step.caption ?? (scenes.length === 0 ? content.title : undefined)
    if (caption) {
      elements.push({ type: 'text', text: caption, x: 50, y: TITLE_Y, size: scenes.length === 0 ? 'title' : 'heading', color: 'accent', enter: 'rise' })
    }

    // Code beat: a step with `highlight` + content.code cuts to the code panel.
    if (step.highlight != null && content.code) {
      elements.push({
        type: 'code', code: content.code.code, lang: content.code.lang,
        x: 50, y: 56, w: 62, highlight: step.highlight, enter: 'fade',
      })
      scenes.push({ narration: step.narration, duration: step.duration ?? 6, elements })
      continue
    }

    // Timeline axis appears as soon as anything is revealed.
    if (content.diagram === 'timeline' && revealed.size > 0) {
      elements.push({ type: 'line', x1: 8, y1: 56, x2: 92, y2: 56, color: 'muted', enter: 'draw' })
    }
    // Compare divider.
    if (content.diagram === 'compare' && revealed.size > 0) {
      elements.push({ type: 'line', x1: 50, y1: 26, x2: 50, y2: 88, color: 'muted', enter: 'draw' })
    }

    // Items revealed so far — focus is accent (signaling), the rest muted.
    for (const item of content.items) {
      if (!revealed.has(item.id)) continue
      const p = pos.get(item.id)
      if (!p) continue
      const isFocus = step.focus === item.id || (step.focus == null && newlyRevealed.has(item.id))
      const base = {
        x: p.x, y: p.y,
        color: isFocus ? 'accent' : 'muted',
        enter: (newlyRevealed.has(item.id) ? 'pop' : 'fade') as SceneElement['enter'],
      }
      if (shape === 'circle') {
        elements.push({ type: 'circle', label: item.label, r: 9, ...base })
      } else {
        elements.push({ type: 'node', label: item.label, w: 19, h: 13, ...base })
      }
      if (content.diagram === 'timeline') {
        // tick connecting the marker to the axis
        elements.push({ type: 'line', x1: p.x, y1: p.y < 56 ? p.y + 6 : p.y - 6, x2: p.x, y2: 56, color: 'muted', enter: 'fade' })
      }
    }

    // Edges where both endpoints are revealed.
    for (const e of edges) {
      if (!revealed.has(e.from) || !revealed.has(e.to)) continue
      const a = pos.get(e.from), b = pos.get(e.to)
      if (!a || !b) continue
      const t = trimEdge(a, b)
      elements.push({ type: 'arrow', ...t, enter: 'draw' })
    }

    scenes.push({ narration: step.narration, duration: step.duration ?? 5, elements })
  }

  return scenes
}
