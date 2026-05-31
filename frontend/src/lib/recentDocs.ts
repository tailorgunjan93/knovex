/**
 * Recent documents — small persistence wrapper for the Reader's "Documents"
 * strip (reader history).
 *
 * Why a wrapper (engineering standard #7 — anti-corruption layer): the rest of
 * the app never touches `localStorage` directly. All access is funnelled
 * through these pure functions, which validate shape and swallow quota/SSR/
 * privacy-mode errors. Swapping the backing store later (IndexedDB, a backend
 * table) is a one-file change. No backend migration needed today.
 */

export interface RecentDoc {
  kbId:     string
  fileId:   string
  fileName: string
  format:   string
  openedAt: number   // epoch ms — newest first
}

const STORAGE_KEY = 'knovex.recentDocs'
const MAX_ENTRIES = 8

function isRecentDoc(v: unknown): v is RecentDoc {
  if (!v || typeof v !== 'object') return false
  const d = v as Record<string, unknown>
  return typeof d.kbId === 'string'
      && typeof d.fileId === 'string'
      && typeof d.fileName === 'string'
      && typeof d.format === 'string'
      && typeof d.openedAt === 'number'
}

function read(): RecentDoc[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isRecentDoc)
  } catch {
    // malformed JSON, storage disabled (private mode), or no DOM — fail soft
    return []
  }
}

function write(docs: RecentDoc[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(docs))
  } catch {
    // over quota or storage unavailable — recent list is best-effort, ignore
  }
}

/** Most-recently-opened documents, newest first (validated, capped). */
export function getRecentDocs(): RecentDoc[] {
  return read()
}

/**
 * Record an opened document at the top of the list. De-duplicates by `fileId`
 * (re-opening an existing doc moves it to the top rather than duplicating) and
 * caps the list at MAX_ENTRIES. Returns the new list so callers can update
 * state without a second read.
 */
export function recordRecentDoc(doc: Omit<RecentDoc, 'openedAt'>): RecentDoc[] {
  const entry: RecentDoc = { ...doc, openedAt: Date.now() }
  const next = [entry, ...read().filter(d => d.fileId !== entry.fileId)].slice(0, MAX_ENTRIES)
  write(next)
  return next
}

/** Clear the recent list (e.g. for a "clear history" affordance). */
export function clearRecentDocs(): RecentDoc[] {
  write([])
  return []
}
