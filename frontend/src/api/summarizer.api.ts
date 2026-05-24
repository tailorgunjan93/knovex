/**
 * Summariser API — typed wrappers for /api/summarize/*
 *
 * Both endpoints return SSE streams with the same event protocol as Chat:
 *   {"type": "token",  "content": "..."}
 *   {"type": "done",   "subject": "..."}
 *   {"type": "error",  "error":   "..."}
 */

import { API_BASE } from './client'

export type SummariseLengthMode = 'brief' | 'detailed'

export type SummariseEvent =
  | { type: 'token';  content: string }
  | { type: 'done';   subject: string }
  | { type: 'error';  error: string }

export const summariserApi = {
  /**
   * Stream a summary of a single file.
   * @param onEvent   Called for each SSE event as it arrives.
   * @param signal    Optional AbortSignal.
   */
  async streamFileSummary(
    kbId: string,
    fileId: string,
    length: SummariseLengthMode,
    onEvent: (event: SummariseEvent) => void,
    signal?: AbortSignal,
  ): Promise<void> {
    await _streamSummary(
      `${API_BASE}/api/summarize/file`,
      { kb_id: kbId, file_id: fileId, length },
      onEvent,
      signal,
    )
  },

  /**
   * Stream a summary of an entire KB.
   */
  async streamKBSummary(
    kbId: string,
    length: SummariseLengthMode,
    onEvent: (event: SummariseEvent) => void,
    signal?: AbortSignal,
  ): Promise<void> {
    await _streamSummary(
      `${API_BASE}/api/summarize/kb`,
      { kb_id: kbId, length },
      onEvent,
      signal,
    )
  },
}

async function _streamSummary(
  url: string,
  body: Record<string, string>,
  onEvent: (event: SummariseEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  })
  if (!res.ok) throw new Error(`Summarise failed: HTTP ${res.status}`)

  const reader = res.body!.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        try {
          onEvent(JSON.parse(line.slice(6)) as SummariseEvent)
        } catch { /* ignore malformed */ }
      }
    }
  }
}
