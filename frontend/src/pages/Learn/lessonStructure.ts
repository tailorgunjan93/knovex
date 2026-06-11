/**
 * lessonStructure — pure derivations of the two Stage-B.2 lesson rails from the
 * generated lesson content.
 *
 * The backend returns format-specific content shapes (GuidedContent, QuizContent,
 * …) with no dedicated "outline" or "related concepts" fields. Rather than
 * fabricate data, both rails are *derived* from the real content here:
 *
 *  - `lessonOutline`  → the ordered structural map (steps / questions / cards / …).
 *  - `lessonConcepts` → recurring salient terms actually present in the lesson
 *                       (frequency-ranked, stop-words removed) — honest "what this
 *                       lesson keeps coming back to", not invented links.
 *
 * Kept pure + framework-free so the maths is unit-testable in isolation.
 */

import type {
  FlashcardContent,
  GuidedContent,
  MindmapContent,
  MindmapNode,
  QuizContent,
  TimelineContent,
} from '@/api/learn.api'

export interface OutlineItem {
  /** 0-based position within its list. */
  index: number
  /** Human-readable label (step title, question stem, card front, …). */
  label: string
  /** Optional secondary line (e.g. a timeline year). */
  sub?: string
}

/** Trim a candidate label, falling back to a numbered placeholder. */
function labelOr(raw: string | undefined | null, fallback: string): string {
  const t = (raw ?? '').trim()
  return t || fallback
}

function asRecord(content: unknown): Record<string, unknown> | null {
  return content && typeof content === 'object' ? (content as Record<string, unknown>) : null
}

/**
 * Ordered structural map of a lesson, derived from its content.
 * Unknown / text-only formats (story, eli5, …) have no discrete structure → [].
 */
export function lessonOutline(format: string, content: unknown): OutlineItem[] {
  const c = asRecord(content)
  if (!c) return []

  switch (format) {
    case 'guided':
    case 'animated': {
      // Guided steps have `title`; semantic animated steps have `caption`.
      const steps = (c.steps as Array<{ title?: string; caption?: string }>) ?? []
      return steps.map((s, i) => ({ index: i, label: labelOr(s?.title ?? s?.caption, `Step ${i + 1}`) }))
    }
    case 'quiz': {
      const qs = (c.questions as QuizContent['questions']) ?? []
      return qs.map((q, i) => ({ index: i, label: labelOr(q?.q, `Question ${i + 1}`) }))
    }
    case 'flashcard': {
      const cards = (c.cards as FlashcardContent['cards']) ?? []
      return cards.map((card, i) => ({ index: i, label: labelOr(card?.front, `Card ${i + 1}`) }))
    }
    case 'timeline': {
      const events = (c.events as TimelineContent['events']) ?? []
      return events.map((e, i) => ({
        index: i,
        label: labelOr(e?.title, `Event ${i + 1}`),
        sub: (e?.year ?? '').trim() || undefined,
      }))
    }
    case 'mindmap': {
      const branches = (c.branches as MindmapContent['branches']) ?? []
      return branches.map((b, i) => ({ index: i, label: labelOr(b?.label, `Branch ${i + 1}`) }))
    }
    default:
      return []
  }
}

/**
 * Flatten a lesson's human-readable text into a single string (for concept
 * extraction). JSON keys and structural scaffolding are excluded.
 */
export function lessonText(format: string, content: unknown): string {
  const c = asRecord(content)
  if (!c) return ''
  const parts: Array<string | null | undefined> = []

  switch (format) {
    case 'guided':
    case 'animated': {
      const g = c as unknown as GuidedContent
      parts.push(g.intro)
      for (const s of (g.steps ?? []) as unknown as Array<Record<string, unknown>>) {
        for (const k of ['title', 'explanation', 'example', 'analogy', 'key_insight', 'caption', 'narration']) {
          if (typeof s?.[k] === 'string') parts.push(s[k] as string)
        }
      }
      // semantic animated: item labels are concepts too
      for (const it of (c.items as Array<{ label?: string }>) ?? []) parts.push(it?.label)
      break
    }
    case 'quiz': {
      for (const q of (c.questions as QuizContent['questions']) ?? []) {
        parts.push(q?.q, ...(q?.options ?? []), q?.explanation)
      }
      break
    }
    case 'flashcard': {
      for (const card of (c.cards as FlashcardContent['cards']) ?? []) {
        parts.push(card?.front, card?.back, card?.hint)
      }
      break
    }
    case 'timeline': {
      for (const e of (c.events as TimelineContent['events']) ?? []) {
        parts.push(e?.title, e?.description)
      }
      break
    }
    case 'mindmap': {
      const m = c as unknown as MindmapContent
      parts.push(m.root)
      const collect = (n: MindmapNode) => {
        parts.push(n?.label)
        ;(n?.children ?? []).forEach(collect)
      }
      ;(m.branches ?? []).forEach(collect)
      break
    }
    default: {
      if (typeof c.text === 'string') parts.push(c.text)
    }
  }

  return parts.filter((p): p is string => !!p && typeof p === 'string').join(' ')
}

// Common English words + generic tutoring filler that should never count as a
// "concept". Kept deliberately small and lowercase.
const STOP_WORDS = new Set([
  'the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'any', 'can', 'her', 'was', 'one', 'our',
  'out', 'has', 'have', 'his', 'how', 'its', 'may', 'new', 'now', 'old', 'see', 'two', 'who', 'did',
  'this', 'that', 'with', 'from', 'they', 'them', 'then', 'than', 'will', 'what', 'when', 'were',
  'your', 'each', 'into', 'just', 'like', 'more', 'most', 'some', 'such', 'only', 'over', 'also',
  'because', 'about', 'which', 'their', 'there', 'these', 'those', 'would', 'could', 'should',
  'every', 'between', 'through', 'using', 'used', 'use', 'down', 'same', 'function', 'value',
  'values', 'name', 'able', 'where', 'while', 'here', 'does', 'doing', 'done', 'much', 'many',
  'very', 'both', 'whole', 'cheap', 'name', 'names', 'thing', 'things', 'something',
])

/**
 * Salient recurring terms in the lesson, most-frequent first. Stop-words and
 * short tokens are dropped; only terms appearing at least twice qualify, so the
 * list reflects what the lesson genuinely dwells on (never fabricated).
 *
 * Terms are grouped by a lightweight singular stem so "network"/"networks" or
 * "gradient"/"gradients" count together; the first-seen surface form is shown.
 */
export function lessonConcepts(format: string, content: unknown, max = 6): string[] {
  const text = lessonText(format, content)
  if (!text) return []

  // tokens of length >= 4, letters only (apostrophes/hyphens allowed inside)
  const tokens = text.match(/[A-Za-z][A-Za-z'-]{3,}/g) ?? []

  interface Entry { term: string; n: number; first: number }
  const byStem = new Map<string, Entry>()

  tokens.forEach((tok, i) => {
    const lower = tok.toLowerCase().replace(/['-]+$/, '')
    if (lower.length < 4 || STOP_WORDS.has(lower)) return
    // crude singular stem so plurals merge (network/networks, gradient/gradients)
    const stem = lower.replace(/(ies|es|s)$/, m => (m === 'ies' ? 'y' : ''))
    const key = stem.length >= 3 ? stem : lower
    const existing = byStem.get(key)
    if (existing) existing.n += 1
    else byStem.set(key, { term: tok, n: 1, first: i })
  })

  return [...byStem.values()]
    .filter(e => e.n >= 2)
    .sort((a, b) => b.n - a.n || a.first - b.first)
    .slice(0, Math.max(0, max))
    .map(e => e.term)
}
