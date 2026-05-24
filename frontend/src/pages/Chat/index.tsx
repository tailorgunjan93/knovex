/**
 * Chat Page — Sprint 4
 *
 * Layout:
 *   Left sidebar  — session list (new session, KB filter, session cards)
 *   Right main    — message thread + input bar
 *
 * Features:
 *   - Create / rename / delete chat sessions
 *   - Filter sessions by KB
 *   - SSE streaming responses with token-by-token display
 *   - KB source citations displayed under assistant messages
 *   - Web search toggle (optional augmentation)
 *   - Abort mid-stream
 *   - Export session as Markdown
 *   - Empty state with suggested prompts
 */

import { KeyboardEvent, useEffect, useRef, useState } from 'react'
import {
  Alert,
  Avatar,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  IconButton,
  InputAdornment,
  Link,
  List,
  ListItemButton,
  ListItemText,
  Paper,
  Stack,
  TextField,
  ToggleButton,
  Tooltip,
  Typography,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import SendIcon from '@mui/icons-material/Send'
import StopIcon from '@mui/icons-material/Stop'
import SearchIcon from '@mui/icons-material/Search'
import FileDownloadIcon from '@mui/icons-material/FileDownload'
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutline'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { chatApi, type ChatMessage, type ChatSession, type SSEEvent } from '../../api/chat.api'

// ─── Types ────────────────────────────────────────────────────────────────────

interface StreamingMessage {
  role: 'user' | 'assistant'
  content: string
  sources?: Array<{ file: string; section: string; page: number | null }>
  web_sources?: Array<{ title: string; url: string; snippet: string }>
  isStreaming?: boolean
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ChatPage() {
  const queryClient = useQueryClient()
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const [messages, setMessages] = useState<StreamingMessage[]>([])
  const [input, setInput] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [webSearch, setWebSearch] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // ── Queries ────────────────────────────────────────────────────────────────
  const { data: sessions = [] } = useQuery({
    queryKey: ['chat-sessions'],
    queryFn: () => chatApi.listSessions(),
  })

  const { data: serverMessages = [], isLoading: msgsLoading } = useQuery({
    queryKey: ['chat-messages', activeSessionId],
    queryFn: () => chatApi.getMessages(activeSessionId!),
    enabled: !!activeSessionId,
  })

  // Sync server messages → local state on session change
  useEffect(() => {
    if (!isStreaming) {
      setMessages(serverMessages.map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
        sources: m.sources,
        web_sources: m.web_sources,
      })))
    }
  }, [serverMessages, activeSessionId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-scroll to latest message
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // ── Mutations ──────────────────────────────────────────────────────────────
  const createSessionMutation = useMutation({
    mutationFn: () => chatApi.createSession(null, 'New Chat'),
    onSuccess: (session) => {
      queryClient.invalidateQueries({ queryKey: ['chat-sessions'] })
      setActiveSessionId(session.id)
      setMessages([])
    },
  })

  const deleteSessionMutation = useMutation({
    mutationFn: (id: string) => chatApi.deleteSession(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ['chat-sessions'] })
      if (activeSessionId === id) {
        setActiveSessionId(null)
        setMessages([])
      }
    },
  })

  // ── Streaming ──────────────────────────────────────────────────────────────
  const handleSend = async () => {
    const question = input.trim()
    if (!question || isStreaming) return
    if (!activeSessionId) return

    setInput('')
    setError(null)

    // Append user message immediately
    setMessages(prev => [...prev, { role: 'user', content: question }])
    // Placeholder assistant message
    setMessages(prev => [...prev, { role: 'assistant', content: '', isStreaming: true }])

    setIsStreaming(true)
    abortRef.current = new AbortController()

    let accumulated = ''
    let sources: StreamingMessage['sources'] = []
    let webSources: StreamingMessage['web_sources'] = []

    try {
      await chatApi.streamMessage(
        activeSessionId,
        question,
        (event: SSEEvent) => {
          if (event.type === 'token') {
            accumulated += event.content
            setMessages(prev => {
              const updated = [...prev]
              updated[updated.length - 1] = {
                role: 'assistant',
                content: accumulated,
                isStreaming: true,
              }
              return updated
            })
          } else if (event.type === 'sources') {
            sources = event.sources as StreamingMessage['sources']
          } else if (event.type === 'web_sources') {
            webSources = event.sources as StreamingMessage['web_sources']
          } else if (event.type === 'done') {
            setMessages(prev => {
              const updated = [...prev]
              updated[updated.length - 1] = {
                role: 'assistant',
                content: accumulated,
                sources,
                web_sources: webSources,
                isStreaming: false,
              }
              return updated
            })
          } else if (event.type === 'error') {
            setError(event.error)
          }
        },
        webSearch,
        abortRef.current?.signal,
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
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }

  const handleStop = () => abortRef.current?.abort()

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleExport = async () => {
    if (!activeSessionId) return
    const md = await chatApi.exportSession(activeSessionId)
    const blob = new Blob([md], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'chat-export.md'
    a.click()
    URL.revokeObjectURL(url)
  }

  const activeSession = sessions.find(s => s.id === activeSessionId)

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <Box sx={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
      {/* ── Sidebar ────────────────────────────────────────────────────── */}
      <Box
        sx={{
          width: 240,
          flexShrink: 0,
          display: 'flex',
          flexDirection: 'column',
          borderRight: '1px solid',
          borderColor: 'divider',
          bgcolor: 'background.paper',
        }}
      >
        {/* New chat button */}
        <Box sx={{ p: 1.5 }}>
          <Button
            fullWidth
            variant="outlined"
            startIcon={<AddIcon />}
            size="small"
            onClick={() => createSessionMutation.mutate()}
            disabled={createSessionMutation.isPending}
          >
            New Chat
          </Button>
        </Box>

        <Divider />

        {/* Session list */}
        <Box flex={1} overflow="auto">
          {sessions.length === 0 ? (
            <Box sx={{ p: 2, textAlign: 'center' }}>
              <Typography variant="caption" color="text.disabled">
                No conversations yet
              </Typography>
            </Box>
          ) : (
            <List dense disablePadding>
              {sessions.map(session => (
                <SessionItem
                  key={session.id}
                  session={session}
                  active={session.id === activeSessionId}
                  onClick={() => {
                    setActiveSessionId(session.id)
                    setMessages([])
                    setError(null)
                  }}
                  onDelete={() => deleteSessionMutation.mutate(session.id)}
                />
              ))}
            </List>
          )}
        </Box>
      </Box>

      {/* ── Chat main ──────────────────────────────────────────────────── */}
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {activeSessionId ? (
          <>
            {/* Header */}
            <Stack
              direction="row"
              alignItems="center"
              spacing={1}
              sx={{
                px: 2, py: 1,
                borderBottom: '1px solid',
                borderColor: 'divider',
                flexShrink: 0,
                minHeight: 48,
              }}
            >
              <Typography variant="subtitle2" fontWeight={700} flex={1} noWrap>
                {activeSession?.title ?? 'Chat'}
              </Typography>
              {activeSession?.kb_id && (
                <Chip label="KB" size="small" color="primary" variant="outlined" />
              )}
              <Tooltip title="Export as Markdown">
                <IconButton size="small" onClick={handleExport}>
                  <FileDownloadIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </Stack>

            {/* Messages */}
            <Box flex={1} overflow="auto" sx={{ px: 2, py: 2 }}>
              {msgsLoading ? (
                <Box display="flex" justifyContent="center" p={4}>
                  <CircularProgress size={28} />
                </Box>
              ) : messages.length === 0 ? (
                <EmptyChat onPrompt={p => { setInput(p) }} />
              ) : (
                messages.map((msg, i) => (
                  <MessageBubble key={i} message={msg} />
                ))
              )}
              {error && (
                <Alert severity="error" onClose={() => setError(null)} sx={{ mt: 1 }}>
                  {error}
                </Alert>
              )}
              <div ref={bottomRef} />
            </Box>

            <Divider />

            {/* Input bar */}
            <Box sx={{ px: 2, py: 1.5, flexShrink: 0 }}>
              <Stack direction="row" spacing={1} alignItems="flex-end">
                <Tooltip title={webSearch ? 'Web search ON' : 'Enable web search'}>
                  <ToggleButton
                    value="web"
                    selected={webSearch}
                    onChange={() => setWebSearch(v => !v)}
                    size="small"
                    sx={{ minWidth: 36, height: 36 }}
                  >
                    <SearchIcon fontSize="small" />
                  </ToggleButton>
                </Tooltip>

                <TextField
                  inputRef={inputRef}
                  fullWidth
                  size="small"
                  placeholder="Ask anything…"
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  disabled={isStreaming}
                  multiline
                  maxRows={5}
                  autoFocus
                  InputProps={{
                    endAdornment: (
                      <InputAdornment position="end">
                        {isStreaming ? (
                          <Tooltip title="Stop">
                            <IconButton size="small" color="error" onClick={handleStop}>
                              <StopIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        ) : (
                          <Tooltip title="Send (Enter)">
                            <span>
                              <IconButton
                                size="small"
                                color="primary"
                                onClick={handleSend}
                                disabled={!input.trim()}
                              >
                                <SendIcon fontSize="small" />
                              </IconButton>
                            </span>
                          </Tooltip>
                        )}
                      </InputAdornment>
                    ),
                  }}
                  sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
                />
              </Stack>
              <Typography variant="caption" color="text.disabled" sx={{ mt: 0.5, display: 'block' }}>
                {webSearch ? '🔍 Web search enabled — answers may include live results.' : 'Answers grounded in your KB.'}
              </Typography>
            </Box>
          </>
        ) : (
          <NoChatSelected onNew={() => createSessionMutation.mutate()} />
        )}
      </Box>
    </Box>
  )
}

// ─── Session sidebar item ──────────────────────────────────────────────────────

function SessionItem({
  session,
  active,
  onClick,
  onDelete,
}: {
  session: ChatSession
  active: boolean
  onClick: () => void
  onDelete: () => void
}) {
  return (
    <ListItemButton
      selected={active}
      onClick={onClick}
      sx={{
        px: 1.5, py: 0.75,
        '&.Mui-selected': { bgcolor: 'action.selected' },
      }}
    >
      <ListItemText
        primary={session.title}
        secondary={`${session.message_count} message${session.message_count !== 1 ? 's' : ''}`}
        primaryTypographyProps={{ variant: 'body2', fontWeight: active ? 700 : 400, noWrap: true }}
        secondaryTypographyProps={{ variant: 'caption' }}
      />
      <Tooltip title="Delete">
        <IconButton
          size="small"
          onClick={e => { e.stopPropagation(); onDelete() }}
          sx={{ opacity: 0, '.MuiListItemButton-root:hover &': { opacity: 1 } }}
        >
          <DeleteOutlineIcon sx={{ fontSize: 14 }} />
        </IconButton>
      </Tooltip>
    </ListItemButton>
  )
}

// ─── Message bubble ────────────────────────────────────────────────────────────

function MessageBubble({ message }: { message: StreamingMessage }) {
  const isUser = message.role === 'user'

  return (
    <Box sx={{ mb: 2, display: 'flex', gap: 1.5, alignItems: 'flex-start' }}>
      {!isUser && (
        <Avatar
          sx={{ width: 28, height: 28, bgcolor: 'primary.main', fontSize: '0.75rem', flexShrink: 0 }}
        >
          K
        </Avatar>
      )}

      <Box flex={1}>
        <Paper
          variant={isUser ? 'elevation' : 'outlined'}
          elevation={isUser ? 0 : 0}
          sx={{
            px: 2,
            py: 1.25,
            display: 'inline-block',
            maxWidth: '85%',
            ml: isUser ? 'auto' : 0,
            bgcolor: isUser ? 'primary.main' : 'background.paper',
            borderRadius: isUser ? '12px 12px 4px 12px' : '4px 12px 12px 12px',
            borderColor: 'divider',
          }}
        >
          <Typography
            variant="body2"
            sx={{
              color: isUser ? '#fff' : 'text.primary',
              lineHeight: 1.7,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}
          >
            {message.content}
            {message.isStreaming && message.content === '' && (
              <CircularProgress size={12} sx={{ ml: 1, verticalAlign: 'middle' }} />
            )}
            {message.isStreaming && message.content !== '' && (
              <Box
                component="span"
                sx={{
                  display: 'inline-block',
                  width: 7,
                  height: 13,
                  bgcolor: 'text.secondary',
                  ml: 0.25,
                  verticalAlign: 'middle',
                  animation: 'blink 1s step-end infinite',
                  '@keyframes blink': {
                    '0%, 100%': { opacity: 1 },
                    '50%': { opacity: 0 },
                  },
                }}
              />
            )}
          </Typography>
        </Paper>

        {/* KB source citations */}
        {!isUser && message.sources && message.sources.length > 0 && (
          <Stack direction="row" spacing={0.5} flexWrap="wrap" sx={{ mt: 0.75, ml: 0.5 }}>
            {message.sources.map((s, i) => (
              <Chip
                key={i}
                label={s.section ? `${s.file} › ${s.section}` : s.file}
                size="small"
                variant="outlined"
                sx={{ fontSize: '0.65rem', height: 20 }}
              />
            ))}
          </Stack>
        )}

        {/* Web sources */}
        {!isUser && message.web_sources && message.web_sources.length > 0 && (
          <Box sx={{ mt: 0.75, ml: 0.5 }}>
            {message.web_sources.map((ws, i) => (
              <Box key={i} sx={{ mb: 0.25 }}>
                <Link
                  href={ws.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  variant="caption"
                  sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}
                >
                  <SearchIcon sx={{ fontSize: 11 }} />
                  {ws.title || ws.url}
                </Link>
              </Box>
            ))}
          </Box>
        )}
      </Box>
    </Box>
  )
}

// ─── Empty states ─────────────────────────────────────────────────────────────

function EmptyChat({ onPrompt }: { onPrompt: (p: string) => void }) {
  const suggestions = [
    'What are the main topics in my knowledge base?',
    'Summarise the key findings from my documents.',
    'What are the most important concepts?',
    'Compare the information across my documents.',
  ]
  return (
    <Box sx={{ maxWidth: 480, mx: 'auto', py: 4 }}>
      <Box sx={{ textAlign: 'center', mb: 3 }}>
        <ChatBubbleOutlineIcon sx={{ fontSize: 48, opacity: 0.2, mb: 1 }} />
        <Typography variant="h6" fontWeight={700}>Start the conversation</Typography>
        <Typography variant="body2" color="text.secondary">
          Ask anything about your knowledge base or start with a suggestion below.
        </Typography>
      </Box>
      <Stack spacing={1}>
        {suggestions.map(s => (
          <Paper
            key={s}
            variant="outlined"
            sx={{
              px: 2, py: 1.25,
              cursor: 'pointer',
              borderRadius: 2,
              '&:hover': { bgcolor: 'action.hover' },
            }}
            onClick={() => onPrompt(s)}
          >
            <Typography variant="body2">{s}</Typography>
          </Paper>
        ))}
      </Stack>
    </Box>
  )
}

function NoChatSelected({ onNew }: { onNew: () => void }) {
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        gap: 2,
        color: 'text.secondary',
      }}
    >
      <ChatBubbleOutlineIcon sx={{ fontSize: 64, opacity: 0.15 }} />
      <Typography variant="h6" fontWeight={600} color="text.primary">
        No conversation selected
      </Typography>
      <Typography variant="body2" sx={{ maxWidth: 320, textAlign: 'center' }}>
        Start a new chat or select an existing conversation from the sidebar.
      </Typography>
      <Button variant="contained" startIcon={<AddIcon />} onClick={onNew}>
        New Chat
      </Button>
    </Box>
  )
}
