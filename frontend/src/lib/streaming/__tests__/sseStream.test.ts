import { describe, it, expect, vi } from 'vitest'
import {
  streamSSE,
  CONNECT_FAILED_MESSAGE,
  STREAM_INTERRUPTED_MESSAGE,
} from '@/lib/streaming/sseStream'

// ─── Helpers to build fake SSE responses ────────────────────────────────────────

function sseResponse(events: object[], { status = 200 } = {}): Response {
  const body = events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join('')
  return new Response(body, { status })
}

/**
 * A 200 response whose body delivers some events then errors mid-stream.
 * Uses `pull` so each enqueued chunk is actually read by the consumer before the
 * error fires (models a real connection drop after partial delivery).
 */
function droppingResponse(eventsBeforeDrop: object[]): Response {
  const enc = new TextEncoder()
  let i = 0
  const stream = new ReadableStream({
    pull(controller) {
      if (i < eventsBeforeDrop.length) {
        controller.enqueue(enc.encode(`data: ${JSON.stringify(eventsBeforeDrop[i++])}\n\n`))
      } else {
        controller.error(new Error('network error'))
      }
    },
  })
  return new Response(stream, { status: 200 })
}

const noSleep = vi.fn().mockResolvedValue(undefined)

describe('streamSSE', () => {
  it('parses data: lines and invokes onEvent for each event', async () => {
    const events: unknown[] = []
    const fetchImpl = vi.fn().mockResolvedValue(
      sseResponse([{ type: 'token', content: 'hi' }, { type: 'done', message_id: '1' }]),
    )
    await streamSSE({ url: '/x', onEvent: (e) => events.push(e), fetchImpl, sleep: noSleep })
    expect(events).toEqual([
      { type: 'token', content: 'hi' },
      { type: 'done', message_id: '1' },
    ])
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('retries a transient connection failure, then succeeds', async () => {
    const events: unknown[] = []
    const fetchImpl = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(sseResponse([{ type: 'done' }]))
    await streamSSE({ url: '/x', onEvent: (e) => events.push(e), fetchImpl, sleep: noSleep })
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    expect(events).toEqual([{ type: 'done' }])
  })

  it('gives up after exhausting connection retries with a clear message', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))
    await expect(
      streamSSE({ url: '/x', onEvent: () => {}, fetchImpl, sleep: noSleep, retries: 2 }),
    ).rejects.toThrow(CONNECT_FAILED_MESSAGE)
    expect(fetchImpl).toHaveBeenCalledTimes(3) // initial + 2 retries
  })

  it('retries a 503 then succeeds', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(sseResponse([], { status: 503 }))
      .mockResolvedValueOnce(sseResponse([{ type: 'done' }]))
    const events: unknown[] = []
    await streamSSE({ url: '/x', onEvent: (e) => events.push(e), fetchImpl, sleep: noSleep })
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    expect(events).toEqual([{ type: 'done' }])
  })

  it('does NOT retry a non-retryable HTTP error (e.g. 422)', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(sseResponse([], { status: 422 }))
    await expect(
      streamSSE({ url: '/x', onEvent: () => {}, fetchImpl, sleep: noSleep }),
    ).rejects.toThrow(/HTTP 422/)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('does NOT retry once the 200 body has started; surfaces a clear interrupted message', async () => {
    const events: unknown[] = []
    const fetchImpl = vi.fn().mockResolvedValue(droppingResponse([{ type: 'token', content: 'partial' }]))
    await expect(
      streamSSE({ url: '/x', onEvent: (e) => events.push(e), fetchImpl, sleep: noSleep }),
    ).rejects.toThrow(STREAM_INTERRUPTED_MESSAGE)
    // The events received before the drop are still delivered.
    expect(events).toEqual([{ type: 'token', content: 'partial' }])
    // No re-submission after a 200 (would duplicate generation).
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('re-throws AbortError without retrying', async () => {
    const abort = new DOMException('aborted', 'AbortError')
    const fetchImpl = vi.fn().mockRejectedValue(abort)
    await expect(
      streamSSE({ url: '/x', onEvent: () => {}, fetchImpl, sleep: noSleep }),
    ).rejects.toMatchObject({ name: 'AbortError' })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })
})
