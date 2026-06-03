/**
 * Ingestion status polling.
 *
 * Ingestion runs server-side in a background thread; the client polls
 * /status until it reaches a terminal state. OCR-backed ingestion (scanned /
 * image PDFs via docnest) is legitimately slow — the first run downloads OCR
 * models and a multi-page scan takes minutes — so we keep waiting as long as
 * the backend keeps reporting progress, rather than giving up on a fixed count.
 *
 * Terminates on:
 *   - status 'ready'                         → { outcome: 'ready' }
 *   - status 'error'                         → { outcome: 'error', message }
 *   - repeated request failures (backend gone) → { outcome: 'disconnected' }
 *   - a generous absolute deadline           → { outcome: 'timeout' }
 *
 * Time + sleep are injectable so the behaviour is unit-testable without real waits.
 */

export interface IngestionStatus {
  status: string
  error?: string | null
}

export type IngestionPollResult =
  | { outcome: 'ready' }
  | { outcome: 'error'; message: string }
  | { outcome: 'timeout' }
  | { outcome: 'disconnected' }

export interface PollOptions {
  getStatus: () => Promise<IngestionStatus>
  /** Delay between polls (ms). */
  intervalMs?: number
  /** Absolute ceiling before giving up (ms). OCR first-run can be slow. */
  deadlineMs?: number
  /** Consecutive request failures tolerated before declaring the backend gone. */
  maxConsecutiveErrors?: number
  sleep?: (ms: number) => Promise<void>
  now?: () => number
}

const DEFAULT_INTERVAL = 2000
const DEFAULT_DEADLINE = 15 * 60 * 1000 // 15 min — covers first-run OCR model download
const DEFAULT_MAX_ERRORS = 15 // ~30s of consecutive failures at the default interval

const realSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

export async function pollIngestionStatus(opts: PollOptions): Promise<IngestionPollResult> {
  const {
    getStatus,
    intervalMs = DEFAULT_INTERVAL,
    deadlineMs = DEFAULT_DEADLINE,
    maxConsecutiveErrors = DEFAULT_MAX_ERRORS,
    sleep = realSleep,
    now = Date.now,
  } = opts

  const started = now()
  let consecutiveErrors = 0

  while (now() - started < deadlineMs) {
    await sleep(intervalMs)
    try {
      const { status, error } = await getStatus()
      consecutiveErrors = 0
      if (status === 'ready') return { outcome: 'ready' }
      if (status === 'error') return { outcome: 'error', message: error ?? 'Ingestion failed' }
      // 'pending' | 'ingesting' → backend is alive and working; keep waiting.
    } catch {
      consecutiveErrors++
      if (consecutiveErrors >= maxConsecutiveErrors) return { outcome: 'disconnected' }
    }
  }
  return { outcome: 'timeout' }
}
