/**
 * Command palette — command model + fuzzy filter (pure, testable, UI-free).
 *
 * SOLID: the palette UI depends on this module for *what* commands exist and
 * *how* they filter — not the other way round. New command sources (KBs, files,
 * recent lessons) plug in by building more `Command[]` and concatenating, with
 * no change to the filter or the component (OCP, plug-and-play — standard #6).
 */

export type CommandKind = 'navigate' | 'theme' | 'action'

export interface Command {
  id: string
  title: string
  /** Extra words to match against (synonyms, section). */
  keywords?: string
  kind: CommandKind
  /** Short right-aligned hint, e.g. "Go" or "Theme". */
  hint?: string
  /** Executed on select; injected by the component (navigate, setTheme, …). */
  run: () => void
}

/**
 * Rank commands against a query. Subsequence (fuzzy) match on title+keywords;
 * empty query returns all in original order. Ranking favors:
 *   prefix match > word-boundary match > contiguous substring > scattered.
 * O(n · m) over n commands × query length — trivial for the small command set.
 */
export function filterCommands(commands: Command[], rawQuery: string): Command[] {
  const query = rawQuery.trim().toLowerCase()
  if (!query) return commands

  const scored: { cmd: Command; score: number }[] = []
  for (const cmd of commands) {
    const haystack = `${cmd.title} ${cmd.keywords ?? ''}`.toLowerCase()
    const score = scoreMatch(haystack, cmd.title.toLowerCase(), query)
    if (score > 0) scored.push({ cmd, score })
  }
  // Stable sort by descending score (preserve original order on ties).
  return scored
    .map((s, i) => ({ ...s, i }))
    .sort((a, b) => (b.score - a.score) || (a.i - b.i))
    .map((s) => s.cmd)
}

function scoreMatch(haystack: string, title: string, query: string): number {
  if (title.startsWith(query)) return 1000
  if (haystack.includes(query)) {
    // Word-boundary substring scores higher than a mid-word one.
    return new RegExp(`\\b${escapeRe(query)}`).test(haystack) ? 800 : 600
  }
  // Fuzzy subsequence fallback.
  return isSubsequence(haystack, query) ? 300 : 0
}

function isSubsequence(haystack: string, query: string): boolean {
  let qi = 0
  for (let hi = 0; hi < haystack.length && qi < query.length; hi++) {
    if (haystack[hi] === query[qi]) qi++
  }
  return qi === query.length
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
