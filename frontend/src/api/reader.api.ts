/**
 * Reader API — file content rendering + inline Q&A + direct upload
 *
 * Wraps:
 *   GET  /api/kb/:kbId/files/:fileId/content?page=N
 *   POST /api/kb/:kbId/files/:fileId/ask        (SSE stream, optional web search)
 *   POST /api/reader/upload                      (multipart upload → Reader Inbox KB)
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

export interface ReaderUploadResponse {
  kb_id: string
  file_id: string
  name: string
  format: string
  status: string   // pending | ingesting | ready | error
}

// User-created highlights (persisted, reload with the document)
export type HighlightColor = 'yellow' | 'green' | 'blue' | 'pink' | 'purple'

export interface Highlight {
  id: string
  kb_id: string
  file_id: string
  page: number
  text: string
  color: HighlightColor
  note: string
  created_at: string
}

export interface HighlightCreate {
  page: number
  text: string
  color: HighlightColor
  note?: string
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

  /** List all saved highlights for a file (ordered page → created). */
  listHighlights(kbId: string, fileId: string): Promise<Highlight[]> {
    return apiClient
      .get<{ highlights: Highlight[] }>(`/kb/${kbId}/files/${fileId}/highlights`)
      .then(r => r.data.highlights)
  },

  /** Create (persist) a highlight on a page of a file. */
  createHighlight(kbId: string, fileId: string, body: HighlightCreate): Promise<Highlight> {
    return apiClient
      .post<Highlight>(`/kb/${kbId}/files/${fileId}/highlights`, body)
      .then(r => r.data)
  },

  /** Delete a highlight by id. */
  deleteHighlight(kbId: string, fileId: string, highlightId: string): Promise<void> {
    return apiClient
      .delete(`/kb/${kbId}/files/${fileId}/highlights/${highlightId}`)
      .then(() => undefined)
  },

  /**
   * Upload a file directly to the "Reader Inbox" KB.
   *
   * Returns upload metadata including kb_id + file_id.
   * Poll /api/kb/{kbId}/files/{fileId}/status until status === "ready".
   */
  async upload(file: File): Promise<ReaderUploadResponse> {
    const form = new FormData()
    form.append('file', file)
    const res = await apiClient.post<ReaderUploadResponse>('/reader/upload', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    return res.data
  },

  /**
   * Open an SSE connection for inline Q&A about a specific file.
   *
   * NOTE: POST-based SSE requires fetch() + ReadableStream, not EventSource.
   * This helper initiates the fetch and returns an async generator of tokens.
   *
   * @param useWebSearch  When true, the backend also queries the web for context.
   */
  async *askStream(
    kbId: string,
    fileId: string,
    question: string,
    useWebSearch = false,
    page?: number,
  ): AsyncGenerator<string, void, unknown> {
    const url = `${API_BASE}/api/kb/${kbId}/files/${fileId}/ask`
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question, use_web_search: useWebSearch, ...(page ? { page } : {}) }),
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
