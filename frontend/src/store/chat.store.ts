/**
 * Chat Zustand Store
 *
 * Manages: sessions list, active session, messages, streaming state.
 */

import { create } from 'zustand'
import type { ChatSession, ChatMessage } from '@/api/chat.api'

interface ChatState {
  // Sessions
  sessions: ChatSession[]
  activeSessionId: string | null

  // Messages
  messages: ChatMessage[]
  messagesLoading: boolean

  // Streaming
  isStreaming: boolean
  streamingContent: string
  useWebSearch: boolean

  // Actions
  setSessions: (sessions: ChatSession[]) => void
  setActiveSession: (id: string | null) => void
  setMessages: (messages: ChatMessage[]) => void
  setMessagesLoading: (v: boolean) => void
  addMessage: (msg: ChatMessage) => void

  // Streaming
  startStreaming: () => void
  appendStreamToken: (token: string) => void
  finalizeStream: (finalMessage: ChatMessage) => void
  cancelStream: () => void

  // Web search toggle
  setUseWebSearch: (v: boolean) => void

  // Session mutations
  addSession: (s: ChatSession) => void
  removeSession: (id: string) => void
}

export const useChatStore = create<ChatState>((set) => ({
  sessions: [],
  activeSessionId: null,
  messages: [],
  messagesLoading: false,
  isStreaming: false,
  streamingContent: '',
  useWebSearch: false,

  setSessions: (sessions) => set({ sessions }),
  setActiveSession: (id) => set({ activeSessionId: id, messages: [], streamingContent: '' }),
  setMessages: (messages) => set({ messages }),
  setMessagesLoading: (v) => set({ messagesLoading: v }),
  addMessage: (msg) => set((s) => ({ messages: [...s.messages, msg] })),

  startStreaming: () => set({ isStreaming: true, streamingContent: '' }),
  appendStreamToken: (token) =>
    set((s) => ({ streamingContent: s.streamingContent + token })),
  finalizeStream: (finalMessage) =>
    set((s) => ({
      isStreaming: false,
      streamingContent: '',
      messages: [...s.messages, finalMessage],
    })),
  cancelStream: () => set({ isStreaming: false, streamingContent: '' }),

  setUseWebSearch: (v) => set({ useWebSearch: v }),

  addSession: (s) => set((state) => ({ sessions: [s, ...state.sessions] })),
  removeSession: (id) =>
    set((state) => ({
      sessions: state.sessions.filter((s) => s.id !== id),
      activeSessionId: state.activeSessionId === id ? null : state.activeSessionId,
    })),
}))
