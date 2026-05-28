/**
 * Chat Page — KnovexUI reference redesign
 *
 * Layout: [History panel] | [Main: header + messages + composer] | [Sources panel]
 * Both side panels are collapsible with pill toggles.
 */

import { KeyboardEvent, useCallback, useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  Box,
  Chip,
  CircularProgress,
  Divider,
  IconButton,
  List,
  Snackbar,
  Tooltip,
  Typography,
  useTheme,
  alpha,
} from '@mui/material'
import AddIcon           from '@mui/icons-material/Add'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import SendIcon          from '@mui/icons-material/Send'
import StopIcon          from '@mui/icons-material/Stop'
import SearchIcon        from '@mui/icons-material/Search'
import AttachFileIcon    from '@mui/icons-material/AttachFile'
import InsertDriveFileOutlinedIcon from '@mui/icons-material/InsertDriveFileOutlined'
import WarningAmberIcon from '@mui/icons-material/WarningAmber'
import CloseIcon         from '@mui/icons-material/Close'
import BookmarkBorderIcon from '@mui/icons-material/BookmarkBorder'
import LayersIcon        from '@mui/icons-material/Layers'
import MoreHorizIcon     from '@mui/icons-material/MoreHoriz'
import ContentCopyIcon   from '@mui/icons-material/ContentCopy'
import FormatQuoteIcon   from '@mui/icons-material/FormatQuote'
import AutoStoriesIcon   from '@mui/icons-material/AutoStories'
import ThumbUpOutlinedIcon   from '@mui/icons-material/ThumbUpOutlined'
import ThumbDownOutlinedIcon from '@mui/icons-material/ThumbDownOutlined'
import RefreshIcon       from '@mui/icons-material/Refresh'
import FolderOutlinedIcon from '@mui/icons-material/FolderOutlined'
import ArticleOutlinedIcon from '@mui/icons-material/ArticleOutlined'
import ChevronLeftIcon   from '@mui/icons-material/ChevronLeft'
import ChevronRightIcon  from '@mui/icons-material/ChevronRight'
import AccountTreeOutlinedIcon from '@mui/icons-material/AccountTreeOutlined'
import AutoAwesomeIcon   from '@mui/icons-material/AutoAwesome'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { chatApi, type AttachResult, type ChatMessage, type ChatSession, type SSEEvent, type SourceCitation } from '../../api/chat.api'
import { kbApi, type KB } from '../../api/kb.api'

const MONO  = '"IBM Plex Mono", "Geist Mono", monospace'
const SERIF = '"Instrument Serif", Georgia, serif'

// ─── Types ────────────────────────────────────────────────────────────────────

interface AttachedFile {
  id: string
  name: string
  text: string
  charCount: number
  truncated: boolean
  uploading?: boolean
}

interface StreamingMessage {
  role: 'user' | 'assistant'
  content: string
  sources?: SourceCitation[]
  web_sources?: Array<{ title: string; url: string; snippet: string }>
  isStreaming?: boolean
  attachments?: Array<{ name: string; charCount: number; truncated: boolean }>
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function ChatPage() {
  const queryClient = useQueryClient()
  const theme       = useTheme()
  const location    = useLocation()
  const navigate    = useNavigate()
  const isDark      = theme.palette.mode === 'dark'
  const accent      = theme.palette.primary.main

  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const [messages,        setMessages]         = useState<StreamingMessage[]>([])
  const [input,           setInput]            = useState('')
  const [isStreaming,     setIsStreaming]       = useState(false)
  const [webSearch,       setWebSearch]        = useState(false)
  const [error,           setError]            = useState<string | null>(null)
  const [historyOpen,     setHistoryOpen]      = useState(true)
  const [sourcesOpen,     setSourcesOpen]      = useState(true)
  const [selectedKbIds,   setSelectedKbIds]    = useState<string[]>([])
  const [kbDropOpen,      setKbDropOpen]       = useState(false)
  const [copySnack,       setCopySnack]        = useState(false)
  const [attachedFiles,   setAttachedFiles]    = useState<AttachedFile[]>([])
  const [isAttaching,     setIsAttaching]      = useState(false)

  const abortRef      = useRef<AbortController | null>(null)
  const bottomRef     = useRef<HTMLDivElement>(null)
  const inputRef      = useRef<HTMLTextAreaElement>(null)
  const kbDropRef     = useRef<HTMLDivElement>(null)
  const fileInputRef  = useRef<HTMLInputElement>(null)

  // ── Reset on "New Chat" from sidebar ──────────────────────────────────────
  useEffect(() => {
    if (location.state?.newChat) {
      setActiveSessionId(null)
      setMessages([])
      setError(null)
    }
  }, [location.state?.newChat])

  // ── Close KB dropdown on outside click ────────────────────────────────────
  useEffect(() => {
    if (!kbDropOpen) return
    const handler = (e: MouseEvent) => {
      if (kbDropRef.current && !kbDropRef.current.contains(e.target as Node)) {
        setKbDropOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [kbDropOpen])

  // ── Queries ────────────────────────────────────────────────────────────────
  const { data: sessions = [] } = useQuery({
    queryKey: ['chat-sessions'],
    queryFn:  () => chatApi.listSessions(),
  })

  const { data: kbs = [] } = useQuery({
    queryKey: ['kbs'],
    queryFn:  () => kbApi.list(),
  })

  // Auto-select all KBs on first load
  useEffect(() => {
    if (kbs.length > 0 && selectedKbIds.length === 0) {
      setSelectedKbIds(kbs.map(k => k.id))
    }
  }, [kbs]) // eslint-disable-line react-hooks/exhaustive-deps

  const { data: serverMessages = [], isLoading: msgsLoading } = useQuery({
    queryKey: ['chat-messages', activeSessionId],
    queryFn:  () => chatApi.getMessages(activeSessionId!),
    enabled:  !!activeSessionId,
  })

  useEffect(() => {
    if (!isStreaming) {
      setMessages(serverMessages.map(m => ({
        role:        m.role as 'user' | 'assistant',
        content:     m.content,
        sources:     m.sources,
        web_sources: m.web_sources,
      })))
    }
  }, [serverMessages, activeSessionId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // ── Mutations ──────────────────────────────────────────────────────────────
  const createSessionMutation = useMutation({
    mutationFn: () => chatApi.createSession(null, 'New Chat'),
    onSuccess:  (session) => {
      queryClient.invalidateQueries({ queryKey: ['chat-sessions'] })
      setActiveSessionId(session.id)
      setMessages([])
    },
  })

  const deleteSessionMutation = useMutation({
    mutationFn: (id: string) => chatApi.deleteSession(id),
    onSuccess:  (_, id) => {
      queryClient.invalidateQueries({ queryKey: ['chat-sessions'] })
      if (activeSessionId === id) { setActiveSessionId(null); setMessages([]) }
    },
  })

  // ── File attachment ────────────────────────────────────────────────────────
  const handleAttach = () => fileInputRef.current?.click()

  const removeAttachment = (id: string) =>
    setAttachedFiles(prev => prev.filter(f => f.id !== id))

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []).slice(0, 3) // max 3 files at once
    if (!files.length) return
    e.target.value = '' // allow re-selecting the same file

    setIsAttaching(true)
    for (const file of files) {
      const id = crypto.randomUUID()
      setAttachedFiles(prev => [
        ...prev,
        { id, name: file.name, text: '', charCount: 0, truncated: false, uploading: true },
      ])
      try {
        const result: AttachResult = await chatApi.attachFile(file)
        setAttachedFiles(prev =>
          prev.map(f =>
            f.id === id
              ? { ...f, text: result.text, charCount: result.char_count, truncated: result.truncated, uploading: false }
              : f,
          ),
        )
      } catch (err) {
        setAttachedFiles(prev => prev.filter(f => f.id !== id))
        setError(`Failed to attach "${file.name}": ${err instanceof Error ? err.message : 'Upload error'}`)
      }
    }
    setIsAttaching(false)
  }

  // ── Streaming ──────────────────────────────────────────────────────────────
  // Core stream function — accepts the question directly so suggestions can auto-send
  const streamQuestion = useCallback(async (question: string) => {
    if (!question || isStreaming) return

    let sessionId = activeSessionId
    if (!sessionId) {
      try {
        // Pass first selected KB so backend retrieves context from it
        const kbId = selectedKbIds.length === 1 ? selectedKbIds[0] : null
        const sess = await chatApi.createSession(kbId, question.slice(0, 60) || 'New Chat')
        sessionId = sess.id
        setActiveSessionId(sessionId)
        queryClient.invalidateQueries({ queryKey: ['chat-sessions'] })
      } catch { setError('Failed to create chat session'); return }
    }

    // Snapshot attachments before clearing
    const pendingAttachments = attachedFiles
      .filter(f => !f.uploading)
      .map(f => ({ name: f.name, charCount: f.charCount, truncated: f.truncated }))
    const attachedContext = attachedFiles.length > 0
      ? attachedFiles
          .filter(f => !f.uploading && f.text)
          .map(f => `=== ${f.name} ===\n\n${f.text}`)
          .join('\n\n---\n\n')
      : undefined

    setInput('')
    setError(null)
    if (attachedFiles.length > 0) setAttachedFiles([])  // only update if non-empty
    setMessages(prev => [
      ...prev,
      {
        role: 'user',
        content: question,
        attachments: pendingAttachments.length > 0 ? pendingAttachments : undefined,
      },
    ])
    setMessages(prev => [...prev, { role: 'assistant', content: '', isStreaming: true }])
    setIsStreaming(true)
    abortRef.current = new AbortController()

    let accumulated = ''
    let sources: StreamingMessage['sources'] = []
    let webSources: StreamingMessage['web_sources'] = []

    try {
      await chatApi.streamMessage(
        sessionId,
        question,
        (event: SSEEvent) => {
          if (event.type === 'token') {
            accumulated += event.content
            setMessages(prev => {
              const u = [...prev]
              u[u.length - 1] = { role: 'assistant', content: accumulated, isStreaming: true }
              return u
            })
          } else if (event.type === 'sources') {
            sources = event.sources as StreamingMessage['sources']
          } else if (event.type === 'web_sources') {
            webSources = event.sources as StreamingMessage['web_sources']
          } else if (event.type === 'done') {
            setMessages(prev => {
              const u = [...prev]
              u[u.length - 1] = { role: 'assistant', content: accumulated, sources, web_sources: webSources, isStreaming: false }
              return u
            })
            if (sources && sources.length > 0) setSourcesOpen(true)
          } else if (event.type === 'error') {
            setError(event.error)
          }
        },
        webSearch,
        abortRef.current?.signal,
        selectedKbIds.length > 0 ? selectedKbIds : undefined,
        attachedContext,
      )
    } catch (err: unknown) {
      if ((err as Error).name !== 'AbortError') {
        setError(err instanceof Error ? err.message : 'Stream failed')
        setMessages(prev => prev.filter(m => !m.isStreaming))
      }
    } finally {
      setIsStreaming(false)
      abortRef.current = null
      queryClient.invalidateQueries({ queryKey: ['chat-sessions'] })
      // Invalidate the messages query so serverMessages syncs to the just-saved
      // backend state. Without this, a fast stream (e.g. Cerebras < 1s) may cause
      // the useEffect[serverMessages,activeSessionId] to fire with stale empty data
      // and wipe the streaming messages from the UI.
      if (sessionId) {
        queryClient.invalidateQueries({ queryKey: ['chat-messages', sessionId] })
      }
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [activeSessionId, isStreaming, webSearch, selectedKbIds, attachedFiles]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleSend    = () => streamQuestion(input.trim())
  const handleStop    = () => abortRef.current?.abort()
  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
  }

  // ── Derived ────────────────────────────────────────────────────────────────
  const selectedKbs  = kbs.filter(k => selectedKbIds.includes(k.id))
  const groundedLabel = selectedKbs.length === 0   ? 'all KBs'
                      : selectedKbs.length === 1   ? selectedKbs[0].name
                      : `${selectedKbs.length} KBs`

  // Which message's sources to show in the Sources panel (default = last AI msg)
  const [pinnedSources, setPinnedSources] = useState<StreamingMessage['sources'] | null>(null)
  const lastAiMsg     = [...messages].reverse().find(m => m.role === 'assistant' && !m.isStreaming)
  const latestSources = pinnedSources ?? lastAiMsg?.sources ?? []

  // Reset pinned sources when messages change
  useEffect(() => { setPinnedSources(null) }, [activeSessionId])

  const divider = `1px solid ${theme.palette.divider}`

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <Box sx={{ display: 'flex', height: '100%', overflow: 'hidden' }}>

      {/* ══════════════════════════════════════════════════════════════════
          LEFT: collapsible history panel
          ══════════════════════════════════════════════════════════════════ */}
      <Box sx={{ width: historyOpen ? 240 : 28, flexShrink: 0, position: 'relative',
                 transition: 'width 0.22s cubic-bezier(0.4,0,0.2,1)', zIndex: 10 }}>
        {/* Inner clip */}
        <Box sx={{ position: 'absolute', inset: 0, overflow: 'hidden',
                   borderRight: divider,
                   bgcolor: alpha(theme.palette.background.paper, 0.6), display: 'flex' }}>

          {/* Panel content */}
          <Box sx={{ width: 240, flexShrink: 0, height: '100%', display: 'flex',
                     flexDirection: 'column', opacity: historyOpen ? 1 : 0,
                     transition: 'opacity 0.15s ease', pointerEvents: historyOpen ? 'auto' : 'none' }}>
            <Box sx={{ px: 1.75, pt: 1.5, pb: 1 }}>
              <Typography sx={{ fontFamily: MONO, fontSize: 9.5, textTransform: 'uppercase',
                                letterSpacing: '0.13em', color: 'text.disabled', mb: 1 }}>
                Conversations
              </Typography>
              <Box
                onClick={() => createSessionMutation.mutate()}
                sx={{ display: 'flex', alignItems: 'center', gap: 0.75,
                      height: 30, px: 1.25, borderRadius: 1, cursor: 'pointer',
                      border: `1px solid ${alpha(accent, 0.35)}`, color: accent,
                      fontSize: 12, fontWeight: 500,
                      '&:hover': { bgcolor: alpha(accent, 0.06), borderColor: accent } }}
              >
                <AddIcon sx={{ fontSize: 13 }} />
                <Typography sx={{ fontSize: 12, fontWeight: 500 }}>New Chat</Typography>
              </Box>
            </Box>

            <Divider sx={{ borderColor: alpha(theme.palette.divider, 0.6) }} />

            <Box flex={1} overflow="auto">
              {sessions.length === 0 ? (
                <Box sx={{ p: 2, textAlign: 'center' }}>
                  <Typography sx={{ fontSize: 11, color: 'text.disabled' }}>No conversations yet</Typography>
                </Box>
              ) : (
                <List dense disablePadding>
                  {sessions.map(session => (
                    <SessionItem
                      key={session.id}
                      session={session}
                      active={session.id === activeSessionId}
                      onClick={() => { setActiveSessionId(session.id); setMessages([]); setError(null) }}
                      onDelete={() => deleteSessionMutation.mutate(session.id)}
                    />
                  ))}
                </List>
              )}
            </Box>
          </Box>

          {/* Collapsed strip */}
          {!historyOpen && (
            <Box onClick={() => setHistoryOpen(true)} sx={{ position: 'absolute', inset: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                  '&:hover': { bgcolor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)' } }}>
              <Typography sx={{ transform: 'rotate(-90deg)', fontFamily: MONO, fontSize: 9,
                                textTransform: 'uppercase', letterSpacing: '0.14em',
                                color: 'text.disabled', whiteSpace: 'nowrap', userSelect: 'none' }}>
                History
              </Typography>
            </Box>
          )}
        </Box>

        {/* Toggle pill */}
        <Box onClick={() => setHistoryOpen(v => !v)}
          sx={{ position: 'absolute', right: -12, top: '50%', transform: 'translateY(-50%)',
                width: 22, height: 44, bgcolor: 'background.paper', border: divider,
                borderLeft: 'none', borderRadius: '0 8px 8px 0', display: 'flex',
                alignItems: 'center', justifyContent: 'center', cursor: 'pointer', zIndex: 30,
                '&:hover': { bgcolor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
                             '& svg': { color: accent } } }}>
          {historyOpen
            ? <ChevronLeftIcon  sx={{ fontSize: 13, color: 'text.disabled' }} />
            : <ChevronRightIcon sx={{ fontSize: 13, color: 'text.disabled' }} />}
        </Box>
      </Box>

      {/* ══════════════════════════════════════════════════════════════════
          CENTER: chat main
          ══════════════════════════════════════════════════════════════════ */}
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>

        {/* Screen header — always shown */}
        <Box sx={{ flexShrink: 0, px: 4, pt: 2.5, pb: 1.75, borderBottom: divider,
                   display: 'flex', alignItems: 'flex-start', gap: 2 }}>
          <Box flex={1} minWidth={0}>
            {/* Eyebrow */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
              <Typography sx={{ fontFamily: MONO, fontSize: 10, color: 'text.disabled',
                                textTransform: 'uppercase', letterSpacing: '0.14em', userSelect: 'none' }}>
                — Ask Knovex
              </Typography>
              <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5,
                         px: 1, py: 0.25, borderRadius: 20,
                         bgcolor: alpha(accent, isDark ? 0.15 : 0.1),
                         border: `1px solid ${alpha(accent, 0.25)}` }}>
                <Box sx={{ width: 5, height: 5, borderRadius: '50%', bgcolor: accent, flexShrink: 0 }} />
                <Typography sx={{ fontFamily: MONO, fontSize: 9.5, color: accent, letterSpacing: '0.04em' }}>
                  grounded · <strong>{groundedLabel}</strong>
                </Typography>
              </Box>
            </Box>
            {/* Title */}
            <Typography component="h1" sx={{ fontFamily: SERIF, fontSize: 26, fontWeight: 400,
                                              letterSpacing: '-0.015em', lineHeight: 1.15,
                                              color: 'text.primary', userSelect: 'none' }}>
              Conversations that{' '}
              <Box component="em" sx={{ fontStyle: 'italic', color: accent }}>remember</Box>
              {' '}what you've read
            </Typography>
          </Box>

          {/* Header action buttons */}
          <Box sx={{ display: 'flex', gap: 0.75, pt: 0.5, flexShrink: 0 }}>
            <HeaderBtn
              icon={<LayersIcon sx={{ fontSize: 12 }} />}
              label="New thread"
              onClick={() => createSessionMutation.mutate()}
            />
          </Box>
        </Box>

        {/* Messages area */}
        <Box flex={1} overflow="auto" sx={{ px: 4, py: 3 }}>
          {activeSessionId ? (
            msgsLoading ? (
              <Box display="flex" justifyContent="center" pt={6}>
                <CircularProgress size={24} />
              </Box>
            ) : messages.length === 0 ? (
              <EmptyChat onPrompt={p => streamQuestion(p)} />
            ) : (
              messages.map((msg, i) => (
                <MsgRow
                  key={i}
                  msg={msg}
                  i={i}
                  messages={messages}
                  onCopy={() => setCopySnack(true)}
                  onPinSources={(s) => { setPinnedSources(s); setSourcesOpen(true) }}
                  onRefresh={(q) => { setMessages(prev => prev.slice(0, -1)); streamQuestion(q) }}
                />
              )))
          ) : (
            <EmptyChat onPrompt={p => streamQuestion(p)} />
          )}

          {error && (
            <Box sx={{ mt: 2, px: 2, py: 1.25, borderRadius: 1.5,
                       bgcolor: alpha('#ef4444', 0.1), border: `1px solid ${alpha('#ef4444', 0.3)}`,
                       display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography sx={{ fontSize: 13, color: '#ef4444', flex: 1 }}>{error}</Typography>
              <IconButton size="small" onClick={() => setError(null)} sx={{ color: '#ef4444' }}>
                <CloseIcon sx={{ fontSize: 13 }} />
              </IconButton>
            </Box>
          )}
          <div ref={bottomRef} />
        </Box>

        {/* Composer */}
        <Box sx={{ flexShrink: 0, borderTop: divider, px: 3, pt: 1.5, pb: 2 }}>

          {/* KB scope selector */}
          <KBScopeSelector
            kbs={kbs}
            selectedIds={selectedKbIds}
            setSelectedIds={setSelectedKbIds}
            dropOpen={kbDropOpen}
            setDropOpen={setKbDropOpen}
            dropRef={kbDropRef}
            isDark={isDark}
            accent={accent}
          />

          {/* ── Attached file chips ─────────────────────────────────────── */}
          {attachedFiles.length > 0 && (
            <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', mt: 1, mb: 0.5 }}>
              {attachedFiles.map(f => (
                <Box key={f.id} sx={{
                  display: 'inline-flex', alignItems: 'center', gap: 0.5,
                  px: 1.25, py: 0.5, borderRadius: 1.5,
                  bgcolor: f.uploading
                    ? alpha(theme.palette.divider, 0.5)
                    : alpha(accent, isDark ? 0.14 : 0.09),
                  border: `1px solid ${f.uploading ? theme.palette.divider : alpha(accent, 0.35)}`,
                  maxWidth: 220, transition: 'all 0.15s ease',
                }}>
                  {f.uploading
                    ? <CircularProgress size={11} sx={{ color: accent, flexShrink: 0 }} />
                    : <InsertDriveFileOutlinedIcon sx={{ fontSize: 13, color: accent, flexShrink: 0 }} />
                  }
                  <Typography sx={{
                    fontSize: 11.5, color: f.uploading ? 'text.disabled' : accent,
                    fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {f.name}
                  </Typography>
                  {f.truncated && (
                    <Tooltip title="File was trimmed to 30,000 characters" placement="top">
                      <WarningAmberIcon sx={{ fontSize: 11, color: '#f59e0b', flexShrink: 0 }} />
                    </Tooltip>
                  )}
                  {!f.uploading && (
                    <Box
                      onClick={() => removeAttachment(f.id)}
                      sx={{
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        width: 14, height: 14, borderRadius: '50%', cursor: 'pointer',
                        flexShrink: 0, ml: 0.25, color: alpha(accent, 0.6),
                        '&:hover': { color: '#ef4444', bgcolor: alpha('#ef4444', 0.1) },
                      }}
                    >
                      <CloseIcon sx={{ fontSize: 10 }} />
                    </Box>
                  )}
                </Box>
              ))}
            </Box>
          )}

          {/* Textarea box */}
          <Box sx={{ mt: 1, borderRadius: 2, border: `1.5px solid ${theme.palette.divider}`,
                     bgcolor: alpha(theme.palette.background.paper, 0.8),
                     transition: 'border-color 0.15s',
                     '&:focus-within': { borderColor: alpha(accent, 0.5) } }}>
            <Box
              component="textarea"
              ref={inputRef}
              value={input}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isStreaming}
              placeholder="Ask anything about your knowledge base…"
              rows={3}
              sx={{
                width: '100%', display: 'block',
                resize: 'none', border: 'none', outline: 'none',
                background: 'transparent',
                fontFamily: 'inherit', fontSize: 13, lineHeight: 1.6,
                color: 'text.primary',
                px: 1.75, pt: 1.5, pb: 0.5,
                '&::placeholder': { color: isDark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.3)' },
                '&:disabled': { opacity: 0.5 },
                boxSizing: 'border-box',
              }}
            />
            {/* Toolbar */}
            <Box sx={{ display: 'flex', alignItems: 'center', px: 1.25, pb: 1, gap: 0.5 }}>
              <Tooltip title="Attach file (PDF, DOCX, TXT, MD, CSV)" placement="top">
                <span>
                  <ComposerTool
                    icon={isAttaching
                      ? <CircularProgress size={10} sx={{ color: 'inherit' }} />
                      : <AttachFileIcon sx={{ fontSize: 12 }} />}
                    label="Attach"
                    active={attachedFiles.length > 0}
                    onClick={handleAttach}
                  />
                </span>
              </Tooltip>
              <Tooltip title={webSearch ? 'Web search ON — click to disable' : 'Enable web search'} placement="top">
                <span>
                  <ComposerTool
                    icon={<SearchIcon sx={{ fontSize: 12 }} />}
                    label="Web"
                    active={webSearch}
                    onClick={() => setWebSearch(v => !v)}
                  />
                </span>
              </Tooltip>
              {webSearch && (
                <Typography sx={{ fontFamily: MONO, fontSize: 9.5, color: accent,
                                  bgcolor: alpha(accent, 0.1), px: 0.75, py: 0.2,
                                  borderRadius: 10, border: `1px solid ${alpha(accent, 0.3)}` }}>
                  web on
                </Typography>
              )}
              <Box flex={1} />
              <Typography sx={{ fontFamily: MONO, fontSize: 10.5, color: 'text.disabled', mr: 1 }}>
                {input.length} / 8000
              </Typography>
              {isStreaming ? (
                <Tooltip title="Stop generation">
                  <Box onClick={handleStop}
                    sx={{ display: 'flex', alignItems: 'center', gap: 0.5,
                          height: 28, px: 1.5, borderRadius: 1.25, cursor: 'pointer',
                          bgcolor: alpha('#ef4444', 0.12), color: '#ef4444',
                          border: `1px solid ${alpha('#ef4444', 0.3)}`,
                          '&:hover': { bgcolor: alpha('#ef4444', 0.2) } }}>
                    <StopIcon sx={{ fontSize: 12 }} />
                    <Typography sx={{ fontSize: 12, fontWeight: 500 }}>Stop</Typography>
                  </Box>
                </Tooltip>
              ) : (
                <Box onClick={handleSend}
                  sx={{ display: 'flex', alignItems: 'center', gap: 0.5,
                        height: 28, px: 1.5, borderRadius: 1.25, cursor: 'pointer',
                        bgcolor: input.trim() ? accent : alpha(accent, 0.25),
                        color: input.trim() ? '#fff' : alpha('#fff', 0.5),
                        transition: 'all 0.12s ease',
                        '&:hover': input.trim() ? { filter: 'brightness(1.1)' } : {} }}>
                  <Typography sx={{ fontSize: 12, fontWeight: 600 }}>Send</Typography>
                  <SendIcon sx={{ fontSize: 11 }} />
                </Box>
              )}
            </Box>
          </Box>
        </Box>
      </Box>

      {/* ══════════════════════════════════════════════════════════════════
          RIGHT: collapsible sources panel
          ══════════════════════════════════════════════════════════════════ */}
      <Box sx={{ width: sourcesOpen ? 340 : 28, flexShrink: 0, position: 'relative',
                 transition: 'width 0.22s cubic-bezier(0.4,0,0.2,1)', zIndex: 10 }}>
        {/* Inner clip */}
        <Box sx={{ position: 'absolute', inset: 0, overflow: 'hidden',
                   borderLeft: divider,
                   bgcolor: alpha(theme.palette.background.paper, 0.5) }}>

          {/* Panel content */}
          <Box sx={{ width: 340, height: '100%', display: 'flex', flexDirection: 'column',
                     opacity: sourcesOpen ? 1 : 0, transition: 'opacity 0.15s ease',
                     pointerEvents: sourcesOpen ? 'auto' : 'none' }}>
            {/* Sources header */}
            <Box sx={{ px: 2.5, pt: 2, pb: 1.5, borderBottom: divider, flexShrink: 0 }}>
              <Typography sx={{ fontFamily: MONO, fontSize: 9.5, textTransform: 'uppercase',
                                letterSpacing: '0.13em', color: 'text.disabled', mb: 0.5 }}>
                Sources used · {latestSources.length}
              </Typography>
              <Typography sx={{ fontFamily: SERIF, fontSize: 20, fontWeight: 400,
                                letterSpacing: '-0.01em', color: 'text.primary' }}>
                Where this came from
              </Typography>
            </Box>

            {/* Sources list */}
            <Box flex={1} overflow="auto" sx={{ px: 2, py: 1.5 }}>
              {latestSources.length === 0 ? (
                <Box sx={{ textAlign: 'center', pt: 4 }}>
                  <Typography sx={{ fontSize: 12, color: 'text.disabled' }}>
                    Sources will appear here after a response
                  </Typography>
                </Box>
              ) : (
                latestSources.map((s, i) => (
                  <SourceCard key={i} num={i + 1} source={s} isDark={isDark} />
                ))
              )}
            </Box>

            {/* Footer */}
            <Box sx={{ px: 2, py: 1.5, borderTop: divider, flexShrink: 0 }}>
              <Tooltip title="Source graph visualisation — coming soon" placement="top">
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5,
                           height: 30, px: 1.5, borderRadius: 1.25, cursor: 'not-allowed',
                           border: `1px solid ${theme.palette.divider}`, justifyContent: 'center',
                           color: 'text.disabled', opacity: 0.5 }}>
                <AccountTreeOutlinedIcon sx={{ fontSize: 12 }} />
                <Typography sx={{ fontSize: 12 }}>Visualize source graph</Typography>
              </Box>
            </Tooltip>
            </Box>
          </Box>

          {/* Collapsed strip */}
          {!sourcesOpen && (
            <Box onClick={() => setSourcesOpen(true)} sx={{ position: 'absolute', inset: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                  '&:hover': { bgcolor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)' } }}>
              <Typography sx={{ transform: 'rotate(90deg)', fontFamily: MONO, fontSize: 9,
                                textTransform: 'uppercase', letterSpacing: '0.14em',
                                color: 'text.disabled', whiteSpace: 'nowrap', userSelect: 'none' }}>
                Sources
              </Typography>
            </Box>
          )}
        </Box>

        {/* Toggle pill — on the LEFT edge of the right panel */}
        <Box onClick={() => setSourcesOpen(v => !v)}
          sx={{ position: 'absolute', left: -12, top: '50%', transform: 'translateY(-50%)',
                width: 22, height: 44, bgcolor: 'background.paper', border: divider,
                borderRight: 'none', borderRadius: '8px 0 0 8px', display: 'flex',
                alignItems: 'center', justifyContent: 'center', cursor: 'pointer', zIndex: 30,
                '&:hover': { bgcolor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
                             '& svg': { color: accent } } }}>
          {sourcesOpen
            ? <ChevronRightIcon sx={{ fontSize: 13, color: 'text.disabled' }} />
            : <ChevronLeftIcon  sx={{ fontSize: 13, color: 'text.disabled' }} />}
        </Box>
      </Box>

      {/* Hidden file input for attach */}
      <Box
        component="input"
        ref={fileInputRef as React.RefObject<HTMLInputElement>}
        type="file"
        accept=".pdf,.docx,.txt,.md,.csv"
        multiple
        onChange={handleFileChange}
        sx={{ display: 'none' }}
      />

      {/* Copy snackbar */}
      <Snackbar
        open={copySnack}
        autoHideDuration={1800}
        onClose={() => setCopySnack(false)}
        message="Copied to clipboard"
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      />
    </Box>
  )
}

// ─── Small helpers ─────────────────────────────────────────────────────────────

function HeaderBtn({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick?: () => void }) {
  const theme = useTheme()
  return (
    <Box onClick={onClick}
      sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5,
            height: 26, px: 1.25, borderRadius: 1.25, cursor: 'pointer',
            border: `1px solid ${theme.palette.divider}`, color: 'text.secondary',
            fontSize: 11, userSelect: 'none',
            '&:hover': { color: 'text.primary', bgcolor: alpha(theme.palette.divider, 0.5) } }}>
      {icon}
      <Typography sx={{ fontSize: 11 }}>{label}</Typography>
    </Box>
  )
}

function ComposerTool({ icon, label, active, onClick }: {
  icon: React.ReactNode; label: string; active?: boolean; onClick?: () => void
}) {
  const theme  = useTheme()
  const accent = theme.palette.primary.main
  return (
    <Box onClick={onClick}
      sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.4,
            height: 24, px: 0.875, borderRadius: 1, cursor: 'pointer',
            color:   active ? accent : 'text.disabled',
            bgcolor: active ? alpha(accent, 0.1) : 'transparent',
            border:  active ? `1px solid ${alpha(accent, 0.35)}` : '1px solid transparent',
            '&:hover': { color: active ? accent : 'text.secondary',
                         bgcolor: active ? alpha(accent, 0.15) : alpha(theme.palette.divider, 0.5) } }}>
      {icon}
      <Typography sx={{ fontSize: 11 }}>{label}</Typography>
    </Box>
  )
}

// ─── KB Scope selector ────────────────────────────────────────────────────────

function KBScopeSelector({
  kbs, selectedIds, setSelectedIds, dropOpen, setDropOpen, dropRef, isDark, accent,
}: {
  kbs: KB[]; selectedIds: string[]; setSelectedIds: (ids: string[]) => void
  dropOpen: boolean; setDropOpen: (v: boolean) => void
  dropRef: React.RefObject<HTMLDivElement>; isDark: boolean; accent: string
}) {
  const theme    = useTheme()
  const allSelected = selectedIds.length === kbs.length

  const toggle = (id: string) =>
    setSelectedIds(selectedIds.includes(id) ? selectedIds.filter(x => x !== id) : [...selectedIds, id])

  const toggleAll = () =>
    setSelectedIds(allSelected ? (kbs.length > 0 ? [kbs[0].id] : []) : kbs.map(k => k.id))

  const totalDocs    = kbs.filter(k => selectedIds.includes(k.id)).reduce((s, k) => s + k.stats.file_count, 0)
  const MAX_CHIPS    = 3
  const visibleKbs   = kbs.filter(k => selectedIds.includes(k.id)).slice(0, MAX_CHIPS)
  const hiddenCount  = Math.max(0, selectedIds.length - MAX_CHIPS)
  // If ALL are selected, just show "All KBs" chip instead
  const showAllChip  = selectedIds.length === kbs.length && kbs.length > 0

  return (
    <Box sx={{ position: 'relative' }} ref={dropRef}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, minHeight: 28, flexWrap: 'nowrap', overflow: 'hidden' }}>
        <Typography sx={{ fontFamily: MONO, fontSize: 9.5, textTransform: 'uppercase',
                          letterSpacing: '0.12em', color: 'text.disabled', userSelect: 'none',
                          flexShrink: 0 }}>
          Scope
        </Typography>

        {showAllChip ? (
          /* "All KBs" single chip */
          <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.4,
                     height: 22, px: 0.875, borderRadius: 20,
                     bgcolor: alpha(accent, isDark ? 0.15 : 0.1),
                     border: `1px solid ${alpha(accent, 0.35)}`,
                     cursor: 'pointer', flexShrink: 0,
                     '&:hover': { bgcolor: alpha(accent, 0.22) } }}
               onClick={() => setDropOpen(!dropOpen)}>
            <Box sx={{ width: 5, height: 5, borderRadius: '50%', bgcolor: accent, flexShrink: 0 }} />
            <Typography sx={{ fontSize: 11, color: accent, fontWeight: 500 }}>All KBs</Typography>
          </Box>
        ) : (
          <>
            {visibleKbs.map(k => (
              <Box key={k.id} sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.4,
                                    height: 22, px: 0.875, borderRadius: 20,
                                    bgcolor: alpha(k.color, isDark ? 0.15 : 0.1),
                                    border: `1px solid ${alpha(k.color, 0.35)}`,
                                    cursor: 'pointer', flexShrink: 0,
                                    '&:hover': { bgcolor: alpha(k.color, 0.22) } }}
                   onClick={() => toggle(k.id)}>
                <Box sx={{ width: 5, height: 5, borderRadius: '50%', bgcolor: k.color, flexShrink: 0 }} />
                <Typography sx={{ fontSize: 11, color: isDark ? alpha(k.color, 0.9) : k.color, fontWeight: 500 }}>
                  {k.name}
                </Typography>
                <CloseIcon sx={{ fontSize: 9, color: isDark ? alpha(k.color, 0.7) : k.color, ml: 0.2 }} />
              </Box>
            ))}
            {hiddenCount > 0 && (
              <Box onClick={() => setDropOpen(!dropOpen)}
                sx={{ display: 'inline-flex', alignItems: 'center', height: 22, px: 0.875,
                      borderRadius: 20, cursor: 'pointer', flexShrink: 0,
                      bgcolor: alpha(isDark ? '#fff' : '#000', 0.07),
                      border: `1px solid ${theme.palette.divider}`,
                      '&:hover': { bgcolor: alpha(isDark ? '#fff' : '#000', 0.12) } }}>
                <Typography sx={{ fontSize: 11, color: 'text.secondary', fontWeight: 500 }}>
                  +{hiddenCount} more
                </Typography>
              </Box>
            )}
          </>
        )}

        {/* + Add KB button */}
        <Box onClick={() => setDropOpen(!dropOpen)}
          sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.4,
                height: 22, px: 0.875, borderRadius: 20, flexShrink: 0,
                border: `1px solid ${alpha(accent, 0.35)}`, color: accent, cursor: 'pointer',
                '&:hover': { bgcolor: alpha(accent, 0.08) } }}>
          <AddIcon sx={{ fontSize: 10 }} />
          <Typography sx={{ fontSize: 11, fontWeight: 500 }}>Add KB</Typography>
          <Typography sx={{ fontSize: 10, ml: 0.2 }}>▾</Typography>
        </Box>
      </Box>

      {/* Dropdown */}
      {dropOpen && (
        <Box sx={{ position: 'absolute', bottom: 'calc(100% + 6px)', left: 0,
                   width: 300, borderRadius: 2,
                   bgcolor: 'background.paper',
                   border: `1px solid ${theme.palette.divider}`,
                   boxShadow: isDark ? '0 8px 32px rgba(0,0,0,0.5)' : '0 8px 32px rgba(0,0,0,0.14)',
                   zIndex: 100, overflow: 'hidden' }}>
          {/* Head */}
          <Box sx={{ display: 'flex', alignItems: 'center', px: 2, py: 1.25, borderBottom: `1px solid ${theme.palette.divider}` }}>
            <Typography sx={{ fontSize: 12, fontWeight: 600, color: 'text.primary', flex: 1 }}>
              Knowledge bases
            </Typography>
            <Box onClick={toggleAll} sx={{ fontSize: 11, color: accent, cursor: 'pointer',
                                           '&:hover': { textDecoration: 'underline' } }}>
              <Typography sx={{ fontSize: 11, color: accent }}>{allSelected ? 'Clear all' : 'Select all'}</Typography>
            </Box>
          </Box>

          {/* KB rows */}
          <Box sx={{ maxHeight: 260, overflow: 'auto' }}>
            {/* All row */}
            <KBDropRow
              on={allSelected}
              color={accent}
              name="All knowledge bases"
              count={`${kbs.length} KBs · ${kbs.reduce((s, k) => s + k.stats.file_count, 0)} docs`}
              glyph="ALL"
              onClick={toggleAll}
              isDark={isDark}
              accent={accent}
            />
            {kbs.map(k => (
              <KBDropRow
                key={k.id}
                on={selectedIds.includes(k.id)}
                color={k.color}
                name={k.name}
                count={`${k.stats.file_count} docs`}
                onClick={() => toggle(k.id)}
                isDark={isDark}
                accent={accent}
              />
            ))}
          </Box>

          {/* Footer */}
          <Box sx={{ px: 2, py: 1.25, borderTop: `1px solid ${theme.palette.divider}`,
                     display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography sx={{ fontSize: 11, color: 'text.disabled', flex: 1 }}>
              Searching across <strong style={{ color: isDark ? '#fff' : '#000' }}>{selectedIds.length}</strong> KB{selectedIds.length !== 1 ? 's' : ''} · <strong style={{ color: isDark ? '#fff' : '#000' }}>{totalDocs}</strong> docs
            </Typography>
            <Box onClick={() => setDropOpen(false)}
              sx={{ height: 24, px: 1.25, borderRadius: 1, cursor: 'pointer',
                    bgcolor: accent, color: '#fff', display: 'flex', alignItems: 'center',
                    '&:hover': { filter: 'brightness(1.1)' } }}>
              <Typography sx={{ fontSize: 11, fontWeight: 600 }}>Done</Typography>
            </Box>
          </Box>
        </Box>
      )}
    </Box>
  )
}

function KBDropRow({ on, color, name, count, glyph, onClick, isDark, accent }: {
  on: boolean; color: string; name: string; count: string
  glyph?: string; onClick: () => void; isDark: boolean; accent: string
}) {
  const theme = useTheme()
  return (
    <Box onClick={onClick}
      sx={{ display: 'flex', alignItems: 'center', gap: 1.25, px: 2, py: 1, cursor: 'pointer',
            bgcolor: on ? alpha(color, isDark ? 0.1 : 0.06) : 'transparent',
            '&:hover': { bgcolor: on ? alpha(color, isDark ? 0.14 : 0.09) : alpha(theme.palette.divider, 0.4) } }}>
      {/* Checkbox */}
      <Box sx={{ width: 14, height: 14, borderRadius: 0.5, flexShrink: 0, display: 'flex',
                 alignItems: 'center', justifyContent: 'center',
                 bgcolor: on ? color : 'transparent',
                 border: `1.5px solid ${on ? color : alpha(isDark ? '#fff' : '#000', 0.25)}` }}>
        {on && <Box sx={{ width: 6, height: 4, border: '2px solid #fff',
                          borderTop: 'none', borderRight: 'none', transform: 'rotate(-45deg)', mt: -0.3 }} />}
      </Box>

      {/* Color dot or glyph */}
      {glyph ? (
        <Box sx={{ width: 20, height: 20, borderRadius: 0.5, bgcolor: alpha(accent, 0.2),
                   display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Typography sx={{ fontFamily: MONO, fontSize: 7.5, color: accent, fontWeight: 700 }}>{glyph}</Typography>
        </Box>
      ) : (
        <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: color, flexShrink: 0 }} />
      )}

      <Typography sx={{ fontSize: 12, color: 'text.primary', flex: 1 }}>{name}</Typography>
      <Typography sx={{ fontFamily: MONO, fontSize: 10, color: 'text.disabled', flexShrink: 0 }}>{count}</Typography>
    </Box>
  )
}

// ─── Session item ─────────────────────────────────────────────────────────────

function SessionItem({ session, active, onClick, onDelete }: {
  session: ChatSession; active: boolean; onClick: () => void; onDelete: () => void
}) {
  const theme  = useTheme()
  const accent = theme.palette.primary.main
  const isDark = theme.palette.mode === 'dark'
  return (
    <Box onClick={onClick}
      sx={{ display: 'flex', alignItems: 'center', gap: 0.5,
            px: 1.5, py: 0.75, cursor: 'pointer', mx: 0.5, my: 0.125, borderRadius: 1,
            bgcolor: active ? alpha(accent, 0.12) : 'transparent',
            '&:hover': { bgcolor: active ? alpha(accent, 0.14) : (isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)') },
            '&:hover .del-btn': { opacity: 1 } }}>
      <Box flex={1} minWidth={0}>
        <Typography sx={{ fontSize: 12, fontWeight: active ? 600 : 400, color: active ? 'text.primary' : 'text.secondary',
                          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {session.title}
        </Typography>
        <Typography sx={{ fontFamily: MONO, fontSize: 9.5, color: 'text.disabled' }}>
          {session.message_count} msg{session.message_count !== 1 ? 's' : ''}
        </Typography>
      </Box>
      <IconButton size="small" className="del-btn"
        onClick={e => { e.stopPropagation(); onDelete() }}
        sx={{ opacity: 0, transition: 'opacity 0.12s', color: 'text.disabled',
              width: 20, height: 20, '&:hover': { color: '#ef4444' } }}>
        <DeleteOutlineIcon sx={{ fontSize: 12 }} />
      </IconButton>
    </Box>
  )
}

// ─── Message bubble ────────────────────────────────────────────────────────────

// ─── Per-row wrapper — extracts logic from JSX to avoid TSX parser issues ────

function MsgRow({ msg, i, messages, onCopy, onPinSources, onRefresh }: {
  msg: StreamingMessage; i: number; messages: StreamingMessage[]
  onCopy: () => void
  onPinSources: (s: SourceCitation[]) => void
  onRefresh: (q: string) => void
}) {
  const prevUserMsg = msg.role === 'assistant'
    ? [...messages].slice(0, i).reverse().find(m => m.role === 'user')
    : undefined

  // isLastAi: this is the last non-streaming assistant message in the list
  const isLastAi = msg.role === 'assistant' && !msg.isStreaming &&
    messages.slice(i + 1).every(m => m.role !== 'assistant' || !!m.isStreaming)

  return (
    <MessageBubble
      message={msg}
      onCopy={onCopy}
      onCitations={msg.sources && msg.sources.length > 0
        ? () => onPinSources(msg.sources!)
        : undefined}
      onRefresh={isLastAi && prevUserMsg
        ? () => onRefresh(prevUserMsg.content)
        : undefined}
    />
  )
}

// ─── Message bubble ────────────────────────────────────────────────────────────

function MessageBubble({ message, onCopy, onCitations, onRefresh }: {
  message: StreamingMessage
  onCopy: () => void
  onCitations?: () => void
  onRefresh?: () => void
}) {
  const theme    = useTheme()
  const accent   = theme.palette.primary.main
  const isDark   = theme.palette.mode === 'dark'
  const isUser   = message.role === 'user'
  const navigate = useNavigate()
  const [thumbed, setThumbed] = useState<'up' | 'down' | null>(null)

  const handleCopy = () => {
    navigator.clipboard.writeText(message.content).then(onCopy).catch(() => {})
  }

  const handleTurnIntoLesson = () => {
    // Take first ~120 chars of the AI reply as the topic seed
    const snippet = message.content.replace(/[#*`>]/g, '').trim().slice(0, 120)
    navigate(`/learn?topic=${encodeURIComponent(snippet)}`)
  }

  return (
    <Box sx={{ mb: 3, display: 'flex', gap: 1.5, alignItems: 'flex-start',
               justifyContent: isUser ? 'flex-end' : 'flex-start' }}>

      {/* Avatar — AI only on left: round circle with sparkle */}
      {!isUser && (
        <Box sx={{ width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                   background: `linear-gradient(135deg, ${theme.palette.primary.light}, ${accent})`,
                   display: 'flex', alignItems: 'center', justifyContent: 'center',
                   boxShadow: `inset 0 1px 0 rgba(255,255,255,0.18), 0 1px 4px rgba(0,0,0,0.35)`,
                   mt: 0.25 }}>
          <AutoAwesomeIcon sx={{ fontSize: 13, color: '#fff' }} />
        </Box>
      )}

      <Box sx={{ maxWidth: '78%', minWidth: 0 }}>
        {/* Role row */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5,
                   justifyContent: isUser ? 'flex-end' : 'flex-start' }}>
          <Typography sx={{ fontSize: 12, fontWeight: 600, color: 'text.primary' }}>
            {isUser ? 'You' : 'Knovex'}
          </Typography>
          {!isUser && message.sources && message.sources.length > 0 && (
            <Typography sx={{ fontFamily: MONO, fontSize: 10, color: 'text.disabled' }}>
              · {message.sources.length} source{message.sources.length !== 1 ? 's' : ''}
            </Typography>
          )}
          {!isUser && !message.isStreaming && (
            <Box sx={{ ml: 'auto', display: 'inline-flex', alignItems: 'center', gap: 0.4,
                       px: 0.875, py: 0.15, borderRadius: 10,
                       bgcolor: alpha(isDark ? '#fff' : '#000', 0.05),
                       border: `1px solid ${theme.palette.divider}` }}>
              <Typography sx={{ fontFamily: MONO, fontSize: 9, color: 'text.disabled' }}>
                grounded
              </Typography>
            </Box>
          )}
        </Box>

        {/* Attachment chips — shown above user bubbles */}
        {isUser && message.attachments && message.attachments.length > 0 && (
          <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mb: 0.75,
                     justifyContent: 'flex-end' }}>
            {message.attachments.map((a, ai) => (
              <Box key={ai} sx={{
                display: 'inline-flex', alignItems: 'center', gap: 0.4,
                px: 1, py: 0.35, borderRadius: 1,
                bgcolor: alpha(accent, isDark ? 0.14 : 0.09),
                border: `1px solid ${alpha(accent, 0.3)}`,
              }}>
                <InsertDriveFileOutlinedIcon sx={{ fontSize: 11, color: accent }} />
                <Typography sx={{ fontSize: 11, color: accent, fontWeight: 500,
                                  maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap' }}>
                  {a.name}
                </Typography>
                {a.truncated && (
                  <Tooltip title="File was trimmed to 30,000 chars">
                    <WarningAmberIcon sx={{ fontSize: 10, color: '#f59e0b' }} />
                  </Tooltip>
                )}
              </Box>
            ))}
          </Box>
        )}

        {/* Bubble */}
        <Box sx={{
          px: 1.75, py: 1.25, borderRadius: isUser ? '12px 12px 4px 12px' : '4px 12px 12px 12px',
          bgcolor: isUser
            ? alpha(accent, isDark ? 0.2 : 0.12)
            : alpha(theme.palette.background.paper, isDark ? 1 : 0.8),
          border: `1px solid ${isUser ? alpha(accent, 0.3) : theme.palette.divider}`,
          display: 'inline-block', maxWidth: '100%',

          // ── Paragraphs ──────────────────────────────────────────────────
          '& p': {
            m: 0, mb: 1.25, fontSize: 13.5, lineHeight: 1.8, color: 'text.primary',
            '&:last-child': { mb: 0 },
          },

          // ── Headings ────────────────────────────────────────────────────
          '& h1': {
            mt: 2, mb: 1, fontSize: 20, fontWeight: 700, color: 'text.primary',
            borderBottom: `2px solid ${alpha(accent, 0.3)}`, pb: 0.5, lineHeight: 1.3,
          },
          '& h2': {
            mt: 1.75, mb: 0.875, fontSize: 17, fontWeight: 700, color: 'text.primary',
            borderBottom: `1px solid ${alpha(theme.palette.divider, 0.8)}`, pb: 0.4, lineHeight: 1.3,
          },
          '& h3': {
            mt: 1.5, mb: 0.75, fontSize: 15, fontWeight: 600, color: accent, lineHeight: 1.3,
          },
          '& h4': {
            mt: 1.25, mb: 0.5, fontSize: 13.5, fontWeight: 600,
            color: isDark ? alpha('#fff', 0.8) : alpha('#000', 0.7), lineHeight: 1.3,
          },

          // ── Lists ────────────────────────────────────────────────────────
          '& ul': {
            pl: 0, mb: 1, mt: 0.5, listStyle: 'none',
            '& li': {
              mb: 0.5, fontSize: 13.5, lineHeight: 1.75, color: 'text.primary',
              pl: 2, position: 'relative',
              '&::before': {
                content: '"▸"', position: 'absolute', left: 0,
                color: accent, fontWeight: 700, fontSize: 11,
              },
            },
          },
          '& ol': {
            pl: 2.5, mb: 1, mt: 0.5,
            '& li': {
              mb: 0.5, fontSize: 13.5, lineHeight: 1.75, color: 'text.primary',
              pl: 0.5,
              '&::marker': { color: accent, fontWeight: 700 },
            },
          },

          // ── Inline code ──────────────────────────────────────────────────
          '& code': {
            fontFamily: MONO, fontSize: 12,
            bgcolor: isDark ? alpha(accent, 0.12) : alpha(accent, 0.08),
            color: isDark ? alpha(accent, 0.95) : accent,
            px: 0.625, py: 0.15, borderRadius: 0.75,
            border: `1px solid ${alpha(accent, 0.2)}`,
          },

          // ── Code blocks ──────────────────────────────────────────────────
          '& pre': {
            bgcolor: isDark ? 'rgba(0,0,0,0.55)' : 'rgba(0,0,0,0.05)',
            border: `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.1)'}`,
            p: 1.75, borderRadius: 1.5, overflow: 'auto', mb: 1.25,
            '& code': {
              bgcolor: 'transparent', color: isDark ? '#e2e8f0' : '#1a202c',
              px: 0, border: 'none', fontSize: 12.5, lineHeight: 1.7,
            },
          },

          // ── Blockquote ───────────────────────────────────────────────────
          '& blockquote': {
            borderLeft: `4px solid ${accent}`,
            bgcolor: isDark ? alpha(accent, 0.07) : alpha(accent, 0.05),
            pl: 2, pr: 1.5, py: 1, ml: 0, my: 1.5, borderRadius: '0 8px 8px 0',
            '& p': {
              color: isDark ? alpha('#fff', 0.85) : alpha('#000', 0.75),
              fontStyle: 'italic', fontSize: 13.5, mb: 0, lineHeight: 1.7,
            },
          },

          // ── Tables ───────────────────────────────────────────────────────
          '& table': {
            borderCollapse: 'separate', borderSpacing: 0,
            width: '100%', mb: 1.5, mt: 0.5, fontSize: 13,
            border: `1px solid ${theme.palette.divider}`,
            borderRadius: 1.5, overflow: 'hidden',
          },
          '& thead': {
            background: isDark
              ? `linear-gradient(135deg, ${alpha(accent, 0.2)}, ${alpha(accent, 0.1)})`
              : `linear-gradient(135deg, ${alpha(accent, 0.12)}, ${alpha(accent, 0.06)})`,
          },
          '& th': {
            px: 1.5, py: 1, fontWeight: 700, textAlign: 'left',
            color: isDark ? alpha(accent, 0.95) : accent,
            fontSize: 12, fontFamily: MONO, letterSpacing: '0.03em',
            borderBottom: `2px solid ${alpha(accent, 0.3)}`,
            borderRight: `1px solid ${alpha(theme.palette.divider, 0.6)}`,
            '&:last-child': { borderRight: 'none' },
          },
          '& tbody tr': {
            transition: 'background 0.12s ease',
            '&:nth-of-type(even)': {
              bgcolor: isDark ? 'rgba(255,255,255,0.025)' : 'rgba(0,0,0,0.018)',
            },
            '&:hover': {
              bgcolor: isDark ? alpha(accent, 0.07) : alpha(accent, 0.04),
            },
            '&:last-child td': { borderBottom: 'none' },
          },
          '& td': {
            px: 1.5, py: 0.875, color: 'text.primary', verticalAlign: 'top',
            fontSize: 13, lineHeight: 1.6,
            borderBottom: `1px solid ${alpha(theme.palette.divider, 0.5)}`,
            borderRight: `1px solid ${alpha(theme.palette.divider, 0.4)}`,
            '&:last-child': { borderRight: 'none' },
          },

          // ── Inline elements ──────────────────────────────────────────────
          '& a': { color: accent, textDecoration: 'underline', '&:hover': { opacity: 0.8 } },
          '& strong': { fontWeight: 700, color: 'text.primary' },
          '& em': { fontStyle: 'italic', color: isDark ? alpha('#fff', 0.85) : 'inherit' },
          '& hr': {
            border: 'none',
            background: `linear-gradient(90deg, transparent, ${alpha(accent, 0.4)}, transparent)`,
            height: '1px', my: 2,
          },
        }}>
          {isUser ? (
            <Typography sx={{ fontSize: 13.5, lineHeight: 1.7, color: 'text.primary',
                              whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
              {message.content}
            </Typography>
          ) : (
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {message.content}
            </ReactMarkdown>
          )}
          {message.isStreaming && message.content === '' && (
            <CircularProgress size={11} sx={{ ml: 1, verticalAlign: 'middle', color: accent }} />
          )}
          {message.isStreaming && message.content !== '' && (
            <Box component="span" sx={{ display: 'inline-block', width: 7, height: 13,
                                        bgcolor: accent, ml: 0.25, verticalAlign: 'middle',
                                        animation: 'blink 1s step-end infinite',
                                        '@keyframes blink': { '0%,100%': { opacity: 1 }, '50%': { opacity: 0 } } }} />
          )}
        </Box>

        {/* AI actions row */}
        {!isUser && !message.isStreaming && message.content && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25, mt: 0.75, flexWrap: 'wrap' }}>
            <MsgAction icon={<ContentCopyIcon sx={{ fontSize: 11 }} />} label="Copy" onClick={handleCopy} />
            {onCitations && (
              <MsgAction
                icon={<FormatQuoteIcon sx={{ fontSize: 11 }} />}
                label={`Citations (${message.sources?.length ?? 0})`}
                onClick={onCitations}
                active
              />
            )}
            <MsgAction icon={<AutoStoriesIcon sx={{ fontSize: 11 }} />} label="Turn into lesson" onClick={handleTurnIntoLesson} />
            <Box flex={1} />
            <MsgAction
              icon={<ThumbUpOutlinedIcon sx={{ fontSize: 11 }} />}
              active={thumbed === 'up'}
              onClick={() => setThumbed(t => t === 'up' ? null : 'up')}
            />
            <MsgAction
              icon={<ThumbDownOutlinedIcon sx={{ fontSize: 11 }} />}
              active={thumbed === 'down'}
              onClick={() => setThumbed(t => t === 'down' ? null : 'down')}
            />
            {onRefresh && (
              <MsgAction icon={<RefreshIcon sx={{ fontSize: 11 }} />} onClick={onRefresh} />
            )}
          </Box>
        )}

        {/* Web sources */}
        {!isUser && message.web_sources && message.web_sources.length > 0 && (
          <Box sx={{ mt: 1, display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
            {message.web_sources.map((ws, i) => (
              <Box key={i} component="a" href={ws.url} target="_blank" rel="noopener noreferrer"
                sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.4,
                      height: 22, px: 0.875, borderRadius: 10,
                      bgcolor: alpha(theme.palette.background.paper, 0.8),
                      border: `1px solid ${theme.palette.divider}`,
                      textDecoration: 'none', color: 'text.secondary',
                      '&:hover': { color: 'text.primary', borderColor: alpha(accent, 0.5) } }}>
                <SearchIcon sx={{ fontSize: 10 }} />
                <Typography sx={{ fontSize: 11 }}>{ws.title || ws.url}</Typography>
              </Box>
            ))}
          </Box>
        )}
      </Box>

      {/* Avatar — user on right */}
      {isUser && (
        <Box sx={{ width: 30, height: 30, borderRadius: 1.5, flexShrink: 0,
                   bgcolor: alpha(isDark ? '#fff' : '#000', 0.1),
                   border: `1px solid ${theme.palette.divider}`,
                   display: 'flex', alignItems: 'center', justifyContent: 'center', mt: 0.25 }}>
          <Typography sx={{ fontFamily: MONO, fontSize: 10, fontWeight: 700, color: 'text.secondary',
                            userSelect: 'none' }}>You</Typography>
        </Box>
      )}
    </Box>
  )
}

function MsgAction({ icon, label, onClick, active }: {
  icon: React.ReactNode; label?: string; onClick?: () => void; active?: boolean
}) {
  const theme  = useTheme()
  const accent = theme.palette.primary.main
  return (
    <Box onClick={onClick}
      sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.35,
            height: 22, px: label ? 0.875 : 0.6, borderRadius: 1,
            cursor: onClick ? 'pointer' : 'default',
            color: active ? accent : 'text.disabled',
            bgcolor: active ? alpha(accent, 0.1) : 'transparent',
            '&:hover': onClick ? { color: active ? accent : 'text.primary',
                                   bgcolor: active ? alpha(accent, 0.15) : alpha(theme.palette.divider, 0.5) } : {} }}>
      {icon}
      {label && <Typography sx={{ fontSize: 11 }}>{label}</Typography>}
    </Box>
  )
}

// ─── Source card ───────────────────────────────────────────────────────────────

function SourceCard({ num, source, isDark }: {
  num: number; source: SourceCitation; isDark: boolean
}) {
  const theme    = useTheme()
  const accent   = theme.palette.primary.main
  const navigate = useNavigate()

  const handleClick = () => {
    if (source.kb_id && source.file_id) {
      navigate(`/kb?kb_id=${source.kb_id}&file_id=${source.file_id}`)
    } else if (source.kb_id) {
      navigate(`/kb?kb_id=${source.kb_id}`)
    }
  }

  return (
    <Box
      onClick={handleClick}
      sx={{ mb: 1.5, p: 1.5, borderRadius: 1.5,
               bgcolor: alpha(theme.palette.background.default, isDark ? 0.5 : 0.7),
               border: `1px solid ${theme.palette.divider}`,
               cursor: source.kb_id ? 'pointer' : 'default',
               '&:hover': source.kb_id ? { borderColor: alpha(accent, 0.3),
                            bgcolor: alpha(theme.palette.background.paper, 0.8) } : {} }}>
      {/* Head row: number + file type icon + page */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.75 }}>
        <Box sx={{ width: 18, height: 18, borderRadius: 0.5, bgcolor: alpha(accent, 0.15),
                   display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Typography sx={{ fontFamily: MONO, fontSize: 9, color: accent, fontWeight: 700 }}>{num}</Typography>
        </Box>
        <ArticleOutlinedIcon sx={{ fontSize: 12, color: 'text.disabled' }} />
        <Box flex={1} />
        {source.page !== null && (
          <Typography sx={{ fontFamily: MONO, fontSize: 9.5, color: 'text.disabled' }}>
            p. {source.page}
          </Typography>
        )}
      </Box>

      {/* File name */}
      <Typography sx={{ fontSize: 12, fontWeight: 600, color: 'text.primary', mb: 0.5,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {source.file}
      </Typography>

      {/* Section as excerpt */}
      {source.section && (
        <Typography sx={{ fontSize: 11, color: 'text.secondary', lineHeight: 1.5,
                          fontStyle: 'italic', mb: 0.75,
                          display: '-webkit-box', WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
          "{source.section}"
        </Typography>
      )}

      {/* Footer */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.5 }}>
        <FolderOutlinedIcon sx={{ fontSize: 11, color: 'text.disabled' }} />
        <Typography sx={{ fontSize: 10.5, color: 'text.disabled', flex: 1,
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {source.file}
        </Typography>
        <ChevronRightIcon sx={{ fontSize: 12, color: 'text.disabled', flexShrink: 0 }} />
      </Box>
    </Box>
  )
}

// ─── Empty state ──────────────────────────────────────────────────────────────

const SUGGESTIONS = [
  'What are the main topics in my knowledge base?',
  'Summarise the key findings from my documents.',
  'What connections exist between my notes?',
  'Compare the concepts across my documents.',
]

function EmptyChat({ onPrompt }: { onPrompt: (p: string) => void }) {
  const theme  = useTheme()
  const accent = theme.palette.primary.main
  const isDark = theme.palette.mode === 'dark'

  return (
    <Box sx={{ maxWidth: 520, mx: 'auto', py: 6, px: 2 }}>
      <Box sx={{ textAlign: 'center', mb: 4 }}>
        <Box sx={{ width: 48, height: 48, borderRadius: 2, bgcolor: alpha(accent, 0.15),
                   border: `1px solid ${alpha(accent, 0.25)}`, mx: 'auto', mb: 2,
                   display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Typography sx={{ fontFamily: MONO, fontSize: 18, fontWeight: 700, color: accent }}>K</Typography>
        </Box>
        <Typography sx={{ fontFamily: SERIF, fontSize: 20, fontWeight: 400, color: 'text.primary', mb: 0.5 }}>
          Start a conversation
        </Typography>
        <Typography sx={{ fontSize: 13, color: 'text.secondary' }}>
          Ask anything. Answers are grounded in your knowledge base.
        </Typography>
      </Box>

      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
        {SUGGESTIONS.map(s => (
          <Box key={s} onClick={() => onPrompt(s)}
            sx={{ p: 1.5, borderRadius: 1.5, cursor: 'pointer',
                  border: `1px solid ${theme.palette.divider}`,
                  bgcolor: alpha(theme.palette.background.paper, 0.6),
                  transition: 'all 0.12s ease',
                  '&:hover': { borderColor: alpha(accent, 0.4),
                               bgcolor: alpha(accent, isDark ? 0.07 : 0.04) } }}>
            <Typography sx={{ fontSize: 12, color: 'text.secondary', lineHeight: 1.5 }}>
              {s}
            </Typography>
          </Box>
        ))}
      </Box>
    </Box>
  )
}
