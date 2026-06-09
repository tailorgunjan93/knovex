/**
 * Chat API — typed wrappers for all /api/chat/* endpoints
 * SSE streaming is handled via native EventSource / fetch.
 */

import apiClient, { API_BASE } from './client'
import { streamSSE } from '@/lib/streaming/sseStream'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SourceCitation {
  file: string
  section: string
  page: number | null
  file_id?: string
  kb_id?: string
}

export interface AttachResult {
  filename: string
  text: string
  char_count: number
  truncated: boolean
}

export interface WebSource {
  title: string
  url: string
  snippet: string
}

export interface ChatSession {
  id: string
  kb_id: string | null
  title: string
  created_at: string
  updated_at: string
  message_count: number
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  created_at: string
  sources: SourceCitation[]
  web_sources: WebSource[]
}

// ─── SSE stream event types ───────────────────────────────────────────────────

export type SSEEvent =
  | { type: 'token'; content: string }
  | { type: 'sources'; sources: SourceCitation[] }
  | { type: 'web_sources'; sources: WebSource[] }
  | { type: 'done'; message_id: string }
  | { type: 'error'; error: string }

// ─── API calls ───────────────────────────────────────────────────────────────

export const chatApi = {
  /** Create a new chat session. */
  async createSession(kbId: string | null, title?: string): Promise<ChatSession> {
    const res = await apiClient.post<ChatSession>('/chat/sessions', {
      kb_id: kbId,
      title: title ?? 'New Chat',
    })
    return res.data
  },

  /** List all sessions, optionally filtered by KB. */
  async listSessions(kbId?: string): Promise<ChatSession[]> {
    const res = await apiClient.get<{ sessions: ChatSession[] }>('/chat/sessions', {
      params: kbId ? { kb_id: kbId } : {},
    })
    return res.data.sessions
  },

  /** Get all messages for a session. */
  async getMessages(sessionId: string): Promise<ChatMessage[]> {
    const res = await apiClient.get<{ session_id: string; messages: ChatMessage[] }>(
      `/chat/sessions/${sessionId}/messages`,
    )
    return res.data.messages
  },

  /** Delete a session and all its messages. */
  async deleteSession(sessionId: string): Promise<void> {
    await apiClient.delete(`/chat/sessions/${sessionId}`)
  },

  /**
   * Upload a file and extract its text for use as inline chat context.
   */
  async attachFile(file: File): Promise<AttachResult> {
    const form = new FormData()
    form.append('file', file)
    const res = await apiClient.post<AttachResult>('/chat/attach', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 30_000,
    })
    return res.data
  },

  /**
   * Stream a chat response via SSE.
   *
   * @param sessionId       The session to stream into.
   * @param message         The user message.
   * @param onEvent         Called for each SSE event as it arrives.
   * @param useWebSearch    Enable web search augmentation.
   * @param signal          Optional AbortSignal to cancel the stream.
   * @param kbIds           KB IDs to search for context.
   * @param attachedContext Extracted text from attached file(s).
   */
  async streamMessage(
    sessionId: string,
    message: string,
    onEvent: (event: SSEEvent) => void,
    useWebSearch = false,
    signal?: AbortSignal,
    kbIds?: string[],
    attachedContext?: string,
    forceNews = false,
    fetchUrl?: string,
  ): Promise<void> {
    await streamSSE({
      url: `${API_BASE}/api/chat/sessions/${sessionId}/stream`,
      init: {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message,
          use_web_search: useWebSearch,
          force_news: forceNews,
          fetch_url: fetchUrl ?? null,
          kb_ids: kbIds && kbIds.length > 0 ? kbIds : null,
          attached_context: attachedContext ?? null,
        }),
        signal,
      },
      onEvent: (data) => onEvent(data as SSEEvent),
    })
  },

  /** Export a session as markdown. */
  async exportSession(sessionId: string): Promise<string> {
    const res = await apiClient.get<string>(`/chat/sessions/${sessionId}/export`, {
      responseType: 'text',
    })
    return res.data
  },
}
