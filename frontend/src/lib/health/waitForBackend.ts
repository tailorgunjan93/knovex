/**
 * Wait for the Knovex backend to become reachable.
 *
 * The packaged backend (PyInstaller) takes a few seconds to start after the app
 * launches. Without a gate, any page that fetches on mount fails with a raw
 * "Network Error". This polls a health check until it succeeds, so the UI can
 * show a "Starting…" splash instead.
 *
 * Time + sleep are injectable so the polling is unit-testable without real waits.
 */

export interface WaitOptions {
  /** Returns true when the backend is healthy. Must not throw. */
  check: () => Promise<boolean>
  intervalMs?: number
  timeoutMs?: number
  sleep?: (ms: number) => Promise<void>
  now?: () => number
}

const DEFAULT_INTERVAL = 500
const DEFAULT_TIMEOUT = 60_000 // generous: cold start + model load on slow machines
const realSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

/** Resolve true once `check()` returns true, or false if `timeoutMs` elapses. */
export async function waitForBackendReady(opts: WaitOptions): Promise<boolean> {
  const {
    check,
    intervalMs = DEFAULT_INTERVAL,
    timeoutMs = DEFAULT_TIMEOUT,
    sleep = realSleep,
    now = Date.now,
  } = opts

  const started = now()
  // Check immediately, then poll.
  if (await check()) return true
  while (now() - started < timeoutMs) {
    await sleep(intervalMs)
    if (await check()) return true
  }
  return false
}
