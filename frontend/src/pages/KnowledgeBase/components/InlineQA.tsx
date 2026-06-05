/**
 * InlineQA — SSE-based Q&A sidebar for a single file
 *
 * Architecture:
 *   - Uses fetch() + ReadableStream (not EventSource) because the SSE
 *     endpoint is POST-based (carries a JSON body).
 *   - Streaming tokens are appended to `currentAnswer` in real time.
 *   - AbortController lets the user cancel mid-stream.
 *   - Conversation history is kept in local state (session-only; not persisted).
 *   - Optional web search toggle (showWebSearch prop) — augments answers with
 *     live web context when enabled.
 *
 * Props:
 *   kbId, fileId, fileName — target file
 *   onClose                — called when the user closes the sidebar
 *   showWebSearch          — show the web search toggle (default: false)
 */

import { KeyboardEvent, useEffect, useRef, useState } from 'react'
import {
  Alert,
  Box,
  Chip,
  CircularProgress,
  Divider,
  FormControlLabel,
  IconButton,
  InputAdornment,
  Paper,
  Stack,
  Switch,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'
import SendIcon from '@mui/icons-material/Send'
import StopIcon from '@mui/icons-material/Stop'
import LanguageIcon from '@mui/icons-material/Language'
import { readerApi } from '../../../api/reader.api'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Message {
  role: 'user' | 'assistant'
  content: string
  isStreaming?: boolean
  usedWebSearch?: boolean
}

interface Props {
  kbId: string
  fileId: string
  fileName: string
  onClose: () => void
  /** When true, a web search toggle is shown in the composer */
  showWebSearch?: boolean
  /** Pre-fills the question input (e.g. from text selection toolbar) */
  initialQuestion?: string
  /** The page the reader is currently on — grounds answers in that page. */
  currentPage?: number
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function InlineQA({ kbId, fileId, fileName, onClose, showWebSearch = false, initialQuestion, currentPage }: Props) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [useWebSearch, setUseWebSearch] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Auto-scroll to bottom on new content
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // Pre-fill input when initialQuestion changes (from selection toolbar)
  useEffect(() => {
    if (initialQuestion) {
      setInput(initialQuestion)
      setTimeout(() => {
        const el = inputRef.current
        if (el) {
          el.focus()
          el.setSelectionRange(el.value.length, el.value.length)
        }
      }, 60)
    }
  }, [initialQuestion])

  // ── Streaming logic ────────────────────────────────────────────────────────

  // Quick-prompt chips (lab "Ask about this page"): one-tap framed questions.
  const QUICK_PROMPTS = [
    { label: 'Go deeper',  q: 'Go deeper on this — explain it in more detail with an example.' },
    { label: 'Simplify',   q: 'Explain this in simpler, plain language.' },
    { label: 'Example',    q: 'Give a concrete, real-world example of this.' },
  ]

  const handleSubmit = async (preset?: string) => {
    const question = (preset ?? input).trim()
    if (!question || isStreaming) return

    setInput('')
    setError(null)

    const withWeb = showWebSearch && useWebSearch

    // Add user message
    setMessages(prev => [...prev, { role: 'user', content: question }])

    // Placeholder for streaming assistant message
    setMessages(prev => [
      ...prev,
      { role: 'assistant', content: '', isStreaming: true, usedWebSearch: withWeb },
    ])

    setIsStreaming(true)
    abortRef.current = new AbortController()

    try {
      let accumulated = ''
      for await (const token of readerApi.askStream(kbId, fileId, question, withWeb, currentPage)) {
        accumulated += token
        setMessages(prev => {
          const updated = [...prev]
          updated[updated.length - 1] = {
            role: 'assistant',
            content: accumulated,
            isStreaming: true,
            usedWebSearch: withWeb,
          }
          return updated
        })
      }
      // Mark streaming complete
      setMessages(prev => {
        const updated = [...prev]
        updated[updated.length - 1] = {
          role: 'assistant',
          content: accumulated,
          isStreaming: false,
          usedWebSearch: withWeb,
        }
        return updated
      })
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Stream failed'
      setMessages(prev => prev.filter(m => !m.isStreaming))
      setError(message)
    } finally {
      setIsStreaming(false)
      abortRef.current = null
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }

  const handleStop = () => {
    abortRef.current?.abort()
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <Box
      sx={{
        width: 360,
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        borderLeft: '1px solid',
        borderColor: 'divider',
        bgcolor: 'background.paper',
        height: '100%',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <Stack
        direction="row"
        alignItems="center"
        spacing={1}
        sx={{
          px: 2,
          py: 1.5,
          borderBottom: '1px solid',
          borderColor: 'divider',
          flexShrink: 0,
        }}
      >
        <Box flex={1}>
          <Typography variant="subtitle2" fontWeight={700}>
            Ask about this page
          </Typography>
          <Typography variant="caption" color="text.disabled" noWrap>
            {fileName}
          </Typography>
        </Box>
        <Tooltip title="Close">
          <IconButton size="small" onClick={onClose}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Stack>

      {/* Messages */}
      <Box sx={{ flex: 1, overflow: 'auto', px: 2, py: 1.5 }}>
        {messages.length === 0 ? (
          <EmptyQA />
        ) : (
          messages.map((msg, i) => <MessageBubble key={i} message={msg} />)
        )}
        {error && (
          <Alert
            severity="error"
            sx={{ mt: 1 }}
            onClose={() => setError(null)}
          >
            {error}
          </Alert>
        )}
        <div ref={bottomRef} />
      </Box>

      <Divider />

      {/* Web search toggle */}
      {showWebSearch && (
        <Box
          sx={{
            px: 2,
            pt: 1,
            pb: 0,
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            gap: 0.5,
          }}
        >
          <LanguageIcon
            sx={{
              fontSize: 13,
              color: useWebSearch ? 'primary.main' : 'text.disabled',
              transition: 'color 0.15s',
            }}
          />
          <FormControlLabel
            control={
              <Switch
                size="small"
                checked={useWebSearch}
                onChange={e => setUseWebSearch(e.target.checked)}
                sx={{ ml: 0.25 }}
              />
            }
            label={
              <Typography
                variant="caption"
                sx={{
                  color: useWebSearch ? 'primary.main' : 'text.disabled',
                  fontWeight: useWebSearch ? 600 : 400,
                  transition: 'color 0.15s',
                }}
              >
                Web search
              </Typography>
            }
            sx={{ m: 0 }}
          />
        </Box>
      )}

      {/* Quick prompts — one-tap framed questions (lab "Ask about this page") */}
      <Box sx={{ px: 2, pt: 1, display: 'flex', gap: 0.75, flexWrap: 'wrap', flexShrink: 0 }}>
        {QUICK_PROMPTS.map(p => (
          <Chip
            key={p.label}
            label={p.label}
            size="small"
            variant="outlined"
            disabled={isStreaming}
            onClick={() => handleSubmit(p.q)}
            sx={{ fontSize: 11.5, height: 26, borderRadius: 99, cursor: 'pointer' }}
          />
        ))}
      </Box>

      {/* Input */}
      <Box sx={{ px: 2, py: 1.5, flexShrink: 0 }}>
        <TextField
          inputRef={inputRef}
          fullWidth
          size="small"
          placeholder="Ask a question…"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isStreaming}
          multiline
          maxRows={4}
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
                        onClick={() => handleSubmit()}
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
        <Typography variant="caption" color="text.disabled" sx={{ mt: 0.5, display: 'block' }}>
          {showWebSearch && useWebSearch
            ? 'Answers are grounded in the file + live web search.'
            : 'Answers are grounded in the indexed file content only.'}
        </Typography>
      </Box>
    </Box>
  )
}

// ─── Message bubble ────────────────────────────────────────────────────────────

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === 'user'
  return (
    <Box
      sx={{
        display: 'flex',
        justifyContent: isUser ? 'flex-end' : 'flex-start',
        mb: 1.5,
      }}
    >
      <Paper
        variant="outlined"
        sx={{
          maxWidth: '88%',
          px: 1.5,
          py: 1,
          borderRadius: isUser ? '12px 12px 4px 12px' : '12px 12px 12px 4px',
          bgcolor: isUser ? 'primary.main' : 'background.default',
          borderColor: isUser ? 'primary.main' : 'divider',
        }}
      >
        {/* Web search indicator */}
        {!isUser && message.usedWebSearch && !message.isStreaming && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
            <LanguageIcon sx={{ fontSize: 11, color: 'primary.main' }} />
            <Typography variant="caption" sx={{ fontSize: 10, color: 'primary.main', fontWeight: 600 }}>
              Web search used
            </Typography>
          </Box>
        )}
        <Typography
          variant="body2"
          sx={{
            color: isUser ? '#fff' : 'text.primary',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            lineHeight: 1.6,
          }}
        >
          {message.content}
          {message.isStreaming && (
            <Box
              component="span"
              sx={{
                display: 'inline-block',
                width: 8,
                height: 14,
                bgcolor: 'text.secondary',
                ml: 0.5,
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
        {message.isStreaming && message.content === '' && (
          <CircularProgress size={14} sx={{ mt: 0.5 }} />
        )}
      </Paper>
    </Box>
  )
}

// ─── Empty state ───────────────────────────────────────────────────────────────

function EmptyQA() {
  const suggestions = [
    'What is the main topic of this document?',
    'Summarize the key points.',
    'What conclusions does this document reach?',
  ]
  return (
    <Box sx={{ color: 'text.secondary', py: 2 }}>
      <Typography variant="body2" fontWeight={600} color="text.primary" sx={{ mb: 1 }}>
        Try asking:
      </Typography>
      {suggestions.map(s => (
        <Typography
          key={s}
          variant="body2"
          sx={{
            py: 0.5,
            px: 1,
            mb: 0.5,
            borderRadius: 1,
            bgcolor: 'action.hover',
            cursor: 'default',
            fontStyle: 'italic',
          }}
        >
          "{s}"
        </Typography>
      ))}
    </Box>
  )
}
