/**
 * Slash command engine — pure parsing + matching (the "logic in app" core).
 *
 * The command registry and parsing are deterministic app logic, unit-tested in
 * isolation from React. The composer just renders the menu and dispatches what
 * these functions return.
 */

import { describe, it, expect } from 'vitest'
import {
  SLASH_COMMANDS,
  parseSlashInput,
  matchSlashCommands,
  isSlashQuery,
} from '@/lib/slashCommands'

describe('parseSlashInput', () => {
  it('returns null for plain text (not a command)', () => {
    expect(parseSlashInput('hello world')).toBeNull()
    expect(parseSlashInput('')).toBeNull()
  })

  it('returns null for a lone slash with no command word', () => {
    expect(parseSlashInput('/')).toBeNull()
    expect(parseSlashInput('   /  ')).toBeNull()
  })

  it('parses a known command with args', () => {
    const r = parseSlashInput('/web what is RAG')
    expect(r).not.toBeNull()
    expect(r!.name).toBe('web')
    expect(r!.args).toBe('what is RAG')
    expect(r!.command?.name).toBe('web')
  })

  it('parses a no-arg command', () => {
    const r = parseSlashInput('/help')
    expect(r!.name).toBe('help')
    expect(r!.args).toBe('')
    expect(r!.command?.name).toBe('help')
  })

  it('is case-insensitive on the command name', () => {
    expect(parseSlashInput('/NEWS bitcoin')!.name).toBe('news')
  })

  it('flags an unknown command (command=null) without throwing', () => {
    const r = parseSlashInput('/bogus stuff')
    expect(r!.name).toBe('bogus')
    expect(r!.args).toBe('stuff')
    expect(r!.command).toBeNull()
  })

  it('tolerates leading whitespace before the slash', () => {
    expect(parseSlashInput('  /news AI')!.name).toBe('news')
  })
})

describe('matchSlashCommands (autocomplete menu)', () => {
  it('shows every command for a lone slash', () => {
    expect(matchSlashCommands('/').map(c => c.name)).toEqual(SLASH_COMMANDS.map(c => c.name))
  })

  it('filters by prefix', () => {
    expect(matchSlashCommands('/w').map(c => c.name)).toEqual(['web'])
    expect(matchSlashCommands('/ne').map(c => c.name)).toEqual(['news'])
  })

  it('hides the menu once a space (args) is typed', () => {
    expect(matchSlashCommands('/web foo')).toEqual([])
  })

  it('returns nothing for non-slash input', () => {
    expect(matchSlashCommands('hello')).toEqual([])
    expect(matchSlashCommands('')).toEqual([])
  })

  it('returns nothing for an unmatched prefix', () => {
    expect(matchSlashCommands('/zzz')).toEqual([])
  })
})

describe('isSlashQuery', () => {
  it('is true while typing a command word, false after a space or for plain text', () => {
    expect(isSlashQuery('/')).toBe(true)
    expect(isSlashQuery('/ne')).toBe(true)
    expect(isSlashQuery('/news AI')).toBe(false)   // menu closes once args start
    expect(isSlashQuery('plain')).toBe(false)
  })
})

describe('registry contract', () => {
  it('every command has a unique lowercase name, usage, and description', () => {
    const names = SLASH_COMMANDS.map(c => c.name)
    expect(new Set(names).size).toBe(names.length)
    for (const c of SLASH_COMMANDS) {
      expect(c.name).toBe(c.name.toLowerCase())
      expect(c.usage.startsWith('/')).toBe(true)
      expect(c.description.length).toBeGreaterThan(0)
    }
  })

  it('includes the Phase-1 commands', () => {
    const names = SLASH_COMMANDS.map(c => c.name)
    expect(names).toEqual(expect.arrayContaining(['web', 'news', 'help']))
  })
})
