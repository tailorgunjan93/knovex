'use strict'

/**
 * Validate a persisted window-state object (read from window-state.json).
 *
 * Pure + dependency-injected so the persistence logic — the part that decides
 * whether a saved size/position is usable or should fall back to defaults — is
 * unit-testable without Electron or the filesystem. main.js wires the file I/O
 * around this. Guards QA case LC/AU "window state persists across restarts".
 *
 * A saved state is accepted only if width/height are numbers at or above the
 * minimums (a corrupt or too-small file would otherwise spawn an unusable
 * window). x/y are carried through only when they are finite numbers.
 *
 * @param {unknown} raw  Parsed JSON (object), or anything (garbage tolerated).
 * @param {{minWidth:number,minHeight:number,defaults:{width:number,height:number,x?:number,y?:number}}} opts
 * @returns {{width:number,height:number,x?:number,y?:number}}
 */
function sanitizeWindowState(raw, { minWidth, minHeight, defaults }) {
  if (
    raw &&
    typeof raw === 'object' &&
    typeof raw.width === 'number' &&
    Number.isFinite(raw.width) &&
    raw.width >= minWidth &&
    typeof raw.height === 'number' &&
    Number.isFinite(raw.height) &&
    raw.height >= minHeight
  ) {
    const out = { width: raw.width, height: raw.height }
    if (typeof raw.x === 'number' && Number.isFinite(raw.x)) out.x = raw.x
    if (typeof raw.y === 'number' && Number.isFinite(raw.y)) out.y = raw.y
    return out
  }
  return { ...defaults }
}

/**
 * Parse + sanitize raw file contents (string) into a usable window state.
 * Never throws — malformed JSON / absent file → defaults.
 */
function parseWindowState(text, opts) {
  try {
    return sanitizeWindowState(JSON.parse(text), opts)
  } catch {
    return { ...opts.defaults }
  }
}

module.exports = { sanitizeWindowState, parseWindowState }
