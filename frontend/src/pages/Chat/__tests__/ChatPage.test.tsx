/**
 * Chat Page — component tests
 *
 * Coverage:
 *   Render stability (regression)
 *     • Empty chat renders without an infinite render loop
 *       (guards the "Maximum update depth exceeded" bug caused by a fresh
 *        `[]` default on a useQuery result being used as a useEffect dep)
 *
 *   Lab header
 *     • "Ask Knovex" title + "New thread" + "History" controls render
 *     • "grounded · N KBs" scope pill reflects auto-selected KBs
 *
 *   Thread switcher (chat history lives in the header, not a left column)
 *     • History dropdown is closed by default
 *     • Clicking History reveals the conversation list
 *     • Selecting a conversation does not throw
 */

// jsdom does not implement scrollIntoView — stub it globally
window.HTMLElement.prototype.scrollIntoView = vi.fn()

import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ThemeProvider, createTheme } from '@mui/material'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest'
import type { ReactNode } from 'react'
import ChatPage from '../index'
import { chatApi } from '@/api/chat.api'
import { kbApi } from '@/api/kb.api'
import type { ChatSession } from '@/api/chat.api'
import type { KB } from '@/api/kb.api'
import { useSettingsStore } from '@/store/settings.store'
import type { AppSettings } from '@/api/settings.api'

// ─── Mocks ───────────────────────────────────────────────────────────────────

vi.mock('@/api/chat.api', () => ({
  chatApi: {
    listSessions:  vi.fn(),
    getMessages:   vi.fn(),
    createSession: vi.fn(),
    deleteSession: vi.fn(),
    streamMessage: vi.fn(),
    attachFile:    vi.fn(),
  },
}))

vi.mock('@/api/kb.api', () => ({
  kbApi: { list: vi.fn() },
}))

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const SESSIONS: ChatSession[] = [
  { id: 's1', kb_id: null, title: 'Backprop questions', created_at: '2026-05-28T09:00:00', updated_at: '2026-05-28T09:05:00', message_count: 4 },
  { id: 's2', kb_id: null, title: 'Softmax gradient',   created_at: '2026-05-28T08:00:00', updated_at: '2026-05-28T08:02:00', message_count: 2 },
]

const KBS: KB[] = [
  { id: 'kb1', name: 'ML Foundations', color: '#DDA76A', stats: { file_count: 3 } } as KB,
  { id: 'kb2', name: 'Neural Networks', color: '#3A8D7A', stats: { file_count: 5 } } as KB,
]

// ─── Render helper ────────────────────────────────────────────────────────────

function renderChat() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const theme = createTheme()
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>
      <ThemeProvider theme={theme}>
        <MemoryRouter>{children}</MemoryRouter>
      </ThemeProvider>
    </QueryClientProvider>
  )
  return render(<ChatPage />, { wrapper: Wrapper })
}

beforeEach(() => {
  vi.clearAllMocks()
  ;(chatApi.listSessions as Mock).mockResolvedValue([])
  ;(chatApi.getMessages as Mock).mockResolvedValue([])
  ;(kbApi.list as Mock).mockResolvedValue([])
  // A configured LLM so Chat shows its normal UI (without a key, the app now
  // correctly shows a "Connect your AI" card instead of the chat composer).
  useSettingsStore.setState({
    settings: { llm: { provider: 'openai', api_key: 'test-key', model: 'gpt-4o-mini' } } as unknown as AppSettings,
  })
})

// ───────────────────────────────────────────────────────────────────────────────

describe('ChatPage — render stability (regression)', () => {
  it('renders the empty chat without an infinite render loop', async () => {
    // The bug: a `useQuery({...}).data = []` default minted a new array each
    // render; as a useEffect dependency it retriggered setState forever and
    // React logged "Maximum update depth exceeded". Spy on console.error and
    // assert that message never appears.
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      renderChat()
      await screen.findByText(/Start a conversation/i)

      const loopErrors = errSpy.mock.calls.filter(
        (c) => typeof c[0] === 'string' && c[0].includes('Maximum update depth'),
      )
      expect(loopErrors).toHaveLength(0)
    } finally {
      errSpy.mockRestore()
    }
  })
})

describe('ChatPage — lab header', () => {
  it('renders the "Ask Knovex" title and header controls', async () => {
    renderChat()
    expect(await screen.findByText('Ask Knovex')).toBeInTheDocument()
    expect(screen.getByText('New thread')).toBeInTheDocument()
    expect(screen.getByText('History')).toBeInTheDocument()
  })

  it('shows the "grounded · N KBs" scope pill for auto-selected KBs', async () => {
    ;(kbApi.list as Mock).mockResolvedValue(KBS)
    renderChat()
    // KBs auto-select on load → pill reflects the count
    expect(await screen.findByText(/grounded · 2 KBs/)).toBeInTheDocument()
  })
})

describe('ChatPage — thread switcher (chat history)', () => {
  it('keeps the conversation list closed until History is clicked', async () => {
    ;(chatApi.listSessions as Mock).mockResolvedValue(SESSIONS)
    renderChat()
    await screen.findByText('Ask Knovex')
    // Dropdown collapsed by default → titles not yet shown
    expect(screen.queryByText('Backprop questions')).not.toBeInTheDocument()
  })

  it('reveals conversations when History is clicked', async () => {
    ;(chatApi.listSessions as Mock).mockResolvedValue(SESSIONS)
    renderChat()
    fireEvent.click(await screen.findByText('History'))
    expect(await screen.findByText('Backprop questions')).toBeInTheDocument()
    expect(screen.getByText('Softmax gradient')).toBeInTheDocument()
  })

  it('selecting a conversation triggers a message fetch', async () => {
    ;(chatApi.listSessions as Mock).mockResolvedValue(SESSIONS)
    renderChat()
    fireEvent.click(await screen.findByText('History'))
    fireEvent.click(await screen.findByText('Backprop questions'))
    await waitFor(() => expect(chatApi.getMessages).toHaveBeenCalledWith('s1'))
  })
})
