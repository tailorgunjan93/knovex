'use strict'

/**
 * Poll a health probe until it succeeds or a wall-clock deadline elapses.
 *
 * Pure + dependency-injected so it is unit-testable without Electron, sockets,
 * or real time. `main.js` wires `probe` to an http.get on the health URL and
 * `isProcessAlive` to the spawned backend child process.
 *
 * RCA 2026-06-08 (why this exists): the previous poll used a fixed
 * 60-attempt / ~30s budget. On the FIRST launch after an update, Windows
 * Defender scans the freshly-written ~188 MB exe + ~120 `_internal` DLLs, so the
 * PyInstaller cold start routinely takes longer than 30s. Health polling gave up
 * and showed "Backend did not start after 60 attempts" even though the backend
 * came up seconds later (the log showed a successful `Uvicorn running` line right
 * after the dialog). Fixes:
 *   1. a generous wall-clock deadline (default 120s), not a fixed attempt count;
 *   2. fail FAST if the backend PROCESS has exited — a real crash should surface
 *      immediately, not after the full deadline.
 *
 * @param {object}   opts
 * @param {() => Promise<boolean>} opts.probe          resolves true when healthy
 * @param {() => boolean}          [opts.isProcessAlive] false → reject immediately
 * @param {number}   [opts.timeoutMs=120000]
 * @param {number}   [opts.intervalMs=500]
 * @param {() => number} [opts.now=Date.now]
 * @param {(ms:number)=>Promise<void>} [opts.sleep]
 * @returns {Promise<void>} resolves when healthy; rejects on deadline / dead process
 */
async function waitForHealthy({
  probe,
  isProcessAlive = () => true,
  timeoutMs = 120_000,
  intervalMs = 500,
  now = Date.now,
  sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
} = {}) {
  if (typeof probe !== 'function') {
    throw new TypeError('waitForHealthy: `probe` must be a function')
  }

  const deadline = now() + timeoutMs

  for (;;) {
    if (!isProcessAlive()) {
      throw new Error('Backend process exited before it became healthy')
    }

    let ok = false
    try {
      ok = await probe()
    } catch {
      ok = false // a refused/aborted probe just means "not ready yet"
    }
    if (ok) return

    if (now() >= deadline) {
      throw new Error(
        `Backend did not become healthy within ${Math.round(timeoutMs / 1000)}s`,
      )
    }

    await sleep(intervalMs)
  }
}

module.exports = { waitForHealthy }
