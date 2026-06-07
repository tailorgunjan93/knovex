/**
 * Resilient Server-Sent-Events client for the chat / learn streaming endpoints.
 *
 * Both endpoints stream `data: {json}\n\n` lines over a POST body. The naive
 * `fetch` + reader loop surfaces every transient blip as a bare
 * `TypeError: network error` (or `Failed to fetch`) — the exact toast users hit
 * right after a cold-start / auto-update relaunch.
 *
 * This helper:
 *   • retries the *connection* (and 502/503/504) a few times with linear backoff
 *     — but ONLY before the 200 response body starts, so a successful request is
 *     never re-submitted (no duplicate LLM generation / duplicate chat messages);
 *   • turns failures into clear, actionable messages instead of "network error";
 *   • preserves AbortError so caller cancel logic keeps working;
 *   • parses SSE `data:` lines and invokes `onEvent` with the decoded JSON.
 *
 * `fetchImpl` and `sleep` are injectable for deterministic tests.
 */

export interface StreamSSEOptions {
  url: string
  init?: RequestInit
  onEvent: (data: unknown) => void
  /** Connection-phase retries (not applied once the body is streaming). Default 2. */
  retries?: number
  /** Base linear backoff between retries, in ms. Default 400. */
  backoffMs?: number
  fetchImpl?: typeof fetch
  sleep?: (ms: number) => Promise<void>
}

/** HTTP statuses worth retrying — the backend is up but momentarily not ready. */
const RETRYABLE_STATUS = new Set([502, 503, 504])

/** User-facing message when the backend can't be reached at all. */
export const CONNECT_FAILED_MESSAGE =
  "Can't reach Knovex — the backend may still be starting up. Please try again in a moment."

/** User-facing message when a 200 stream drops partway through. */
export const STREAM_INTERRUPTED_MESSAGE =
  'The connection was interrupted while generating a response. Please try again.'

function isAbort(err: unknown): boolean {
  // AbortError arrives as a DOMException, which is NOT `instanceof Error` in all
  // runtimes (node/jsdom) — match on the name alone.
  return (
    typeof err === 'object' &&
    err !== null &&
    (err as { name?: string }).name === 'AbortError'
  )
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

export async function streamSSE({
  url,
  init,
  onEvent,
  retries = 2,
  backoffMs = 400,
  fetchImpl = fetch,
  sleep = defaultSleep,
}: StreamSSEOptions): Promise<void> {
  let attempt = 0

  for (;;) {
    let response: Response
    try {
      response = await fetchImpl(url, init)
    } catch (err) {
      if (isAbort(err)) throw err
      // Connection never established → the request had no server-side effect,
      // so it's safe to retry.
      if (attempt < retries) {
        attempt += 1
        await sleep(backoffMs * attempt)
        continue
      }
      throw new Error(CONNECT_FAILED_MESSAGE)
    }

    if (!response.ok) {
      if (RETRYABLE_STATUS.has(response.status) && attempt < retries) {
        attempt += 1
        await sleep(backoffMs * attempt)
        continue
      }
      const detail = await response.text().catch(() => '')
      throw new Error(
        `Request failed (HTTP ${response.status})${detail ? ` — ${detail.slice(0, 200)}` : ''}`,
      )
    }

    // 200 OK — read the body. Past this point we never retry: the server is
    // already generating, so a retry would duplicate work / messages.
    try {
      await readEventStream(response, onEvent)
      return
    } catch (err) {
      if (isAbort(err)) throw err
      throw new Error(STREAM_INTERRUPTED_MESSAGE)
    }
  }
}

async function readEventStream(
  response: Response,
  onEvent: (data: unknown) => void,
): Promise<void> {
  const reader = response.body!.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  for (;;) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        try {
          onEvent(JSON.parse(line.slice(6)))
        } catch {
          // Ignore malformed SSE lines (partial/keep-alive frames).
        }
      }
    }
  }
}
