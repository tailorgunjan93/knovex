/**
 * Slash command engine — pure registry + parsing for the chat composer.
 *
 * Design: the logic lives here as deterministic, unit-tested functions. The
 * composer only renders the autocomplete menu and dispatches the parsed result
 * to an action — it never re-implements parsing. Each command maps to an
 * existing backend capability (the value is discoverability, not new behaviour).
 *
 * `action` tells the composer how to route:
 *   - 'chat-web'  → send as a chat turn with web search forced on
 *   - 'chat-news' → send as a chat turn with web search + news intent
 *   - 'help'      → render the command list locally (no network)
 */

export type SlashAction = 'chat-web' | 'chat-news' | 'summarize' | 'help'

export interface SlashCommand {
  name: string          // canonical command word, lowercase (no slash)
  usage: string         // e.g. '/web <query>'
  description: string
  action: SlashAction
  requiresArg: boolean
}

export const SLASH_COMMANDS: SlashCommand[] = [
  {
    name: 'web',
    usage: '/web <query>',
    description: 'Answer this message grounded in a live web search.',
    action: 'chat-web',
    requiresArg: true,
  },
  {
    name: 'news',
    usage: '/news <topic>',
    description: 'Search the latest news and summarise the headlines.',
    action: 'chat-news',
    requiresArg: true,
  },
  {
    name: 'summarize',
    usage: '/summarize [url]',
    description: 'Summarise a URL, an attached file, or the selected knowledge base.',
    action: 'summarize',
    requiresArg: false,
  },
  {
    name: 'help',
    usage: '/help',
    description: 'List the available slash commands.',
    action: 'help',
    requiresArg: false,
  },
]

export interface ParsedSlash {
  name: string                    // typed command word (lowercased)
  args: string                    // everything after the command word, trimmed
  command: SlashCommand | null    // null if the word isn't a known command
}

const _COMMAND_RE = /^\/(\w+)\s*([\s\S]*)$/
const _PREFIX_RE = /^\/(\w*)$/

/**
 * Parse composer input. Returns null when it isn't a slash command (no leading
 * '/', or a lone '/' with no command word). For an unknown word, `command` is
 * null so the caller can decide (we send it as a normal message).
 */
export function parseSlashInput(input: string): ParsedSlash | null {
  const trimmed = input.trim()
  const m = _COMMAND_RE.exec(trimmed)
  if (!m) return null
  const name = m[1].toLowerCase()
  const args = m[2].trim()
  return { name, args, command: SLASH_COMMANDS.find(c => c.name === name) ?? null }
}

/**
 * True while the user is still typing the command WORD (a '/' followed by word
 * chars, no space yet) — i.e. when the autocomplete menu should be open.
 */
export function isSlashQuery(input: string): boolean {
  return _PREFIX_RE.test(input.trimStart())
}

/** Commands whose name starts with the typed prefix (for the menu). */
export function matchSlashCommands(input: string): SlashCommand[] {
  const trimmed = input.trimStart()
  const m = _PREFIX_RE.exec(trimmed)
  if (!m) return []
  const prefix = m[1].toLowerCase()
  return SLASH_COMMANDS.filter(c => c.name.startsWith(prefix))
}

/** True if *text* is an http(s) URL (used to route /summarize to URL mode). */
export function looksLikeUrl(text: string): boolean {
  return /^https?:\/\/\S+$/i.test(text.trim())
}

/** A plain-text help block listing every command (rendered by /help). */
export function helpText(): string {
  const lines = SLASH_COMMANDS.map(c => `**${c.usage}** — ${c.description}`)
  return ['Available commands:', '', ...lines].join('\n')
}
