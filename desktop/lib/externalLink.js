'use strict'

/**
 * Decide whether a navigation target should open in the SYSTEM BROWSER instead of
 * replacing the app window.
 *
 * Why: the app shell has no browser chrome, so if a plain <a href="https://…">
 * (e.g. a link inside a chat answer or a source citation) navigates the window,
 * the React app is gone and there is no Back button — the window is stuck. Such
 * links must be opened externally. (window.open/target=_blank is already handled
 * by setWindowOpenHandler; this covers ordinary in-page link clicks via
 * webContents 'will-navigate'.)
 *
 * Pure + unit-testable. main.js wires this to will-navigate, passing the target
 * URL and the app's current URL (file://… in prod, http://localhost:5173 in dev).
 *
 * @param {string} target  the URL the renderer is trying to navigate to
 * @param {string} appUrl  the window's current URL (the app's own origin)
 * @returns {boolean} true → open externally (and cancel the in-window navigation)
 */
function isExternalUrl(target, appUrl) {
  let t
  try {
    t = new URL(target)
  } catch {
    return false // unparseable → let Electron handle it (don't hijack)
  }

  // Communication links always belong to the OS handler.
  if (t.protocol === 'mailto:' || t.protocol === 'tel:') return true

  // Only http(s) can "navigate away" to a website; file:/about:/devtools:/
  // blob: etc. are internal/app concerns — never hijack them.
  if (t.protocol !== 'http:' && t.protocol !== 'https:') return false

  let a
  try {
    a = new URL(appUrl)
  } catch {
    return true // no known app origin → an http(s) target is external
  }

  // Dev: the app is served over http(s); same host:port is in-app navigation.
  if (a.protocol === 'http:' || a.protocol === 'https:') {
    return t.host !== a.host
  }

  // Prod: the app runs from file://… so any http(s) URL is external.
  return true
}

module.exports = { isExternalUrl }
