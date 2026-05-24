/**
 * Reader API — file content rendering + inline Q&A
 *
 * Wraps:
 *   GET  /api/kb/:kbId/files/:fileId/content?page=N
 *   POST /api/kb/:kbId/files/:fileId/ask        (SSE stream)
 */

import apiClient, { API_BASE } from './client'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ContentBlock {
  type: 'paragraph' | 'heading' | 'table_row' | 'code' | 'page' | string
  content: string | string[]
  level?: number
  metadata?: Record<string, unknown>
}

export interface FileContentResponse {
  id: string
  name: string
  format: string
  total_pages: number
  current_page: number
  content: {
    blocks: ContentBlock[]
    page: number
    total_pages: number
  }
}

// ─── API module ───────────────────────────────────────────────────────────────

export const readerApi = {
  /**
   * Fetch a page of ContentBlocks for a file.
   */
  getContent(kbId: string, fileId: string, page = 1): Promise<FileContentResponse> {
    return apiClient
      .get<FileContentResponse>(`/kb/${kbId}/files/${fileId}/content`, { params: { page } })
      .then(r => r.data)
  },

  /**
   * Open an SSE connection for inline Q&A.
   *
   * Returns the raw EventSource URL — callers create the EventSource themselves
   * so they retain full control over lifecycle (open / close / error).
   *
   * NOTE: POST-based SSE requires fetch() + ReadableStream, not EventSource.
   * This helper initiates the fetch and returns an async generator of tokens.
   */
  async *askStream(
    kbId: string,
    fileId: string,
    question: string,
  ): AsyncGenerator<string, void, unknown> {
    const url = `${API_BASE}/api/kb/${kbId}/files/${fileId}/ask`
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question, use_web_search: false }),
    })

    if (!res.ok) {
      throw new Error(`Ask request failed: ${res.status}`)
    }

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
        if (!line.startsWith('data: ')) continue
        const payload = line.slice(6).trim()
        if (payload === '[DONE]') return
        try {
          const parsed = JSON.parse(payload) as { token?: string; error?: string }
          if (parsed.error) throw new Error(parsed.error)
          if (parsed.token) yield parsed.token
        } catch {
          // Ignore malformed lines
        }
      }
    }
  },
}
