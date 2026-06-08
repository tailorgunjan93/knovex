'use strict'

/**
 * Throttle automatic update checks so showing/restoring the window (or other
 * triggers) can't hammer the update server, while still allowing an explicit
 * "Check for updates" to run immediately.
 *
 * Pure + dependency-injected (no Electron, no real time) so it is unit-testable.
 * main.js wires the returned trigger to: the 4h interval, window 'show' (restore
 * from tray), and the tray "Check for updates" menu item (force).
 *
 * @param {object} opts
 * @param {(meta:{manual:boolean}) => void} opts.check  performs the actual check
 * @param {number} [opts.minIntervalMs=300000]          throttle window (default 5 min)
 * @param {() => number} [opts.now=Date.now]
 * @returns {(o?:{force?:boolean}) => boolean}  trigger; returns true if it ran
 */
function createThrottledCheck({ check, minIntervalMs = 5 * 60 * 1000, now = Date.now }) {
  if (typeof check !== 'function') {
    throw new TypeError('createThrottledCheck: `check` must be a function')
  }
  let last = -Infinity
  return function trigger({ force = false } = {}) {
    const t = now()
    if (!force && t - last < minIntervalMs) {
      return false // too soon since the last check — skip
    }
    last = t
    check({ manual: force })
    return true
  }
}

module.exports = { createThrottledCheck }
