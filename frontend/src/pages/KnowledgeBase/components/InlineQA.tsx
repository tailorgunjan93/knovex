/**
 * InlineQA — SSE-based Q&A sidebar for a single file
 *
 * Architecture:
 *   - Uses fetch() + ReadableStream (not EventSource) because the SSE
 *     endpoint is POST-based (carries a JSON body).
 *   - Streaming tokens are appended to `currentAnswer` in real time.
 *   - AbortController lets the user cancel mid-stream.
 *   - Conversation history is kept in local state (session-only; not persisted).
 *
 * Props:
 *   kbId, fileId, fileName — target file
 *   onClose                — called when the user closes the sidebar
 */

import { KeyboardEvent, useEffect, useRef, useState } from 'react'
import {
  Alert,
  Box,
  CircularProgress,
  Divider,
  IconButton,
  InputAdornment,
  Paper,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'
import SendIcon from '@mui/icons-material/Send'
import StopIcon from '@mui/icons-material/Stop'
import { readerApi } from '../../../api/reader.api'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Message {
  role: 'user' | 'assistant'
  content: string
  isStreaming?: boolean
}

interface Props {
  kbId: string
  fileId: string
  fileName: string
  onClose: () => void
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function InlineQA({ kbId, fileId, fileName, onClose }: Props) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
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

  // ── Streaming logic ────────────────────────────────────────────────────────

  const handleSubmit = async () => {
    const question = input.trim()
    if (!question || isStreaming) return

    setInput('')
    setError(null)

    // Add user message
    setMessages(prev => [...prev, { role: 'user', content: question }])

    // Placeholder for streaming assistant message
    setMessages(prev => [...prev, { role: 'assistant', content: '', isStreaming: true }])

    setIsStreaming(true)
    abortRef.current = new AbortController()

    try {
      let accumulated = ''
      for await (const token of readerApi.askStream(kbId, fileId, question)) {
        accumulated += token
        setMessages(prev => {
          const updated = [...prev]
          updated[updated.length - 1] = {
            role: 'assistant',
            content: accumulated,
            isStreaming: true,
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
        }
        return updated
      })
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Stream failed'
      // Remove streaming placeholder and show error
      setMessages(prev => prev.filter(m => !m.isStreaming))
      setError(message)
    } finally {
      setIsStreaming(false)
      abortRef.current = null
      // Re-focus input
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
            Ask about this file
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
                        onClick={handleSubmit}
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
          Answers are grounded in the indexed file content only.
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
