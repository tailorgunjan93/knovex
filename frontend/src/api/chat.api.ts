/**
 * Chat API — typed wrappers for all /api/chat/* endpoints
 * SSE streaming is handled via native EventSource / fetch.
 */

import apiClient, { API_BASE } from './client'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SourceCitation {
  file: string
  section: string
  page: number | null
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
   * Stream a chat response via SSE.
   *
   * @param sessionId  The session to stream into.
   * @param message    The user message.
   * @param onEvent    Called for each SSE event as it arrives.
   * @param signal     Optional AbortSignal to cancel the stream.
   */
  async streamMessage(
    sessionId: string,
    message: string,
    onEvent: (event: SSEEvent) => void,
    useWebSearch = false,
    signal?: AbortSignal,
  ): Promise<void> {
    const response = await fetch(
      `${API_BASE}/api/chat/sessions/${sessionId}/stream`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, use_web_search: useWebSearch }),
        signal,
      },
    )

    if (!response.ok) {
      throw new Error(`Stream failed: HTTP ${response.status}`)
    }

    const reader = response.body!.getReader()
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
            const event = JSON.parse(line.slice(6)) as SSEEvent
            onEvent(event)
          } catch {
            // Ignore malformed SSE lines
          }
        }
      }
    }
  },

  /** Export a session as markdown. */
  async exportSession(sessionId: string): Promise<string> {
    const res = await apiClient.get<string>(`/chat/sessions/${sessionId}/export`, {
      responseType: 'text',
    })
    return res.data
  },
}
