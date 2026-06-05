/**
 * Command palette filter tests — Phase 2 shell.
 */

import { describe, it, expect } from 'vitest'
import { filterCommands, type Command } from './commands'

const noop = () => {}
const cmds: Command[] = [
  { id: 'lib', title: 'Go to Library', keywords: 'kb knowledge base', kind: 'navigate', run: noop },
  { id: 'chat', title: 'Ask Knovex', keywords: 'chat question', kind: 'navigate', run: noop },
  { id: 'reader', title: 'Open Reader', keywords: 'pdf document read', kind: 'navigate', run: noop },
  { id: 'learn', title: 'Start Learning', keywords: 'lesson quiz flashcard', kind: 'navigate', run: noop },
  { id: 'theme', title: 'Toggle theme', keywords: 'dark light appearance', kind: 'theme', run: noop },
]

describe('filterCommands', () => {
  it('returns all commands in order for an empty query', () => {
    expect(filterCommands(cmds, '')).toHaveLength(cmds.length)
    expect(filterCommands(cmds, '   ').map(c => c.id)).toEqual(cmds.map(c => c.id))
  })

  it('matches by title substring', () => {
    const r = filterCommands(cmds, 'reader')
    expect(r[0].id).toBe('reader')
  })

  it('matches by keyword (not just title)', () => {
    const r = filterCommands(cmds, 'pdf')
    expect(r.map(c => c.id)).toContain('reader')
  })

  it('matches by keyword "flashcard" → Start Learning', () => {
    const r = filterCommands(cmds, 'flashcard')
    expect(r[0].id).toBe('learn')
  })

  it('ranks a title-prefix match above a keyword match', () => {
    // "ask" prefixes the Ask Knovex title; should rank first.
    const r = filterCommands(cmds, 'ask')
    expect(r[0].id).toBe('chat')
  })

  it('returns nothing for a query that matches no command', () => {
    expect(filterCommands(cmds, 'zzzzz')).toHaveLength(0)
  })

  it('supports fuzzy subsequence matching', () => {
    // "tglthm" is a subsequence of "toggle theme"
    const r = filterCommands(cmds, 'tglthm')
    expect(r.map(c => c.id)).toContain('theme')
  })
})
