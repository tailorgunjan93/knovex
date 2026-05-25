/**
 * Learn Mode Page — Sprint 6
 *
 * Layout:
 *   Left sidebar  — session history + user stats bar (XP, level, streak, badges)
 *   Right main    — topic input + format/difficulty controls → streamed content display
 *
 * Supported formats:
 *   quiz        — interactive multiple-choice Q&A with per-question XP
 *   flashcard   — front/back cards with spaced-repetition rating buttons
 *   mindmap     — hierarchical branch diagram rendered as collapsible list
 *   timeline    — chronological events rendered as a vertical timeline
 *   story       — long-form narrative streamed as markdown
 *   eli5        — simple explanation streamed as markdown
 *   speedlearn  — rapid bullet-point summary streamed as markdown
 *   brainstorm  — creative connections streamed as markdown
 */

import { useEffect, useRef, useState } from 'react'
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Collapse,
  Divider,
  FormControl,
  IconButton,
  InputLabel,
  LinearProgress,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  MenuItem,
  Paper,
  Select,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material'
import AutoStoriesIcon from '@mui/icons-material/AutoStories'
import QuizIcon from '@mui/icons-material/Quiz'
import StyleIcon from '@mui/icons-material/Style'
import AccountTreeIcon from '@mui/icons-material/AccountTree'
import TimelineIcon from '@mui/icons-material/Timeline'
import MenuBookIcon from '@mui/icons-material/MenuBook'
import ChildCareIcon from '@mui/icons-material/ChildCare'
import BoltIcon from '@mui/icons-material/Bolt'
import EmojiObjectsIcon from '@mui/icons-material/EmojiObjects'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import StopIcon from '@mui/icons-material/Stop'
import StarIcon from '@mui/icons-material/Star'
import LocalFireDepartmentIcon from '@mui/icons-material/LocalFireDepartment'
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import CancelIcon from '@mui/icons-material/Cancel'
import ReactMarkdown from 'react-markdown'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  learnApi,
  type FlashCard,
  type FlashcardContent,
  type LearnFormat,
  type LearnSession,
  type MindmapContent,
  type MindmapNode,
  type QuizContent,
  type TextContent,
  type TimelineContent,
  type UserStats,
  type Difficulty,
} from '../../api/learn.api'

// ─── Constants ────────────────────────────────────────────────────────────────

const FORMATS: Array<{ id: LearnFormat; label: string; icon: React.ReactNode; desc: string }> = [
  { id: 'quiz',       label: 'Quiz',        icon: <QuizIcon />,         desc: 'MCQ with XP' },
  { id: 'flashcard',  label: 'Flashcards',  icon: <StyleIcon />,        desc: 'Spaced repetition' },
  { id: 'mindmap',    label: 'Mind Map',    icon: <AccountTreeIcon />,  desc: 'Hierarchical tree' },
  { id: 'timeline',   label: 'Timeline',    icon: <TimelineIcon />,     desc: 'Chronological events' },
  { id: 'story',      label: 'Story',       icon: <MenuBookIcon />,     desc: 'Narrative explainer' },
  { id: 'eli5',       label: 'ELI5',        icon: <ChildCareIcon />,    desc: 'Explain Like I\'m 5' },
  { id: 'speedlearn', label: 'Speed Learn', icon: <BoltIcon />,         desc: 'Rapid bullet points' },
  { id: 'brainstorm', label: 'Brainstorm',  icon: <EmojiObjectsIcon />, desc: 'Creative connections' },
]

const DIFFICULTIES: Array<{ id: Difficulty; label: string; color: string }> = [
  { id: 'beginner',     label: 'Beginner',     color: '#4CAF50' },
  { id: 'intermediate', label: 'Intermediate', color: '#FF9800' },
  { id: 'expert',       label: 'Expert',       color: '#F44336' },
]

const FORMAT_ICON_MAP: Record<LearnFormat, React.ReactNode> = {
  quiz:       <QuizIcon fontSize="small" />,
  flashcard:  <StyleIcon fontSize="small" />,
  mindmap:    <AccountTreeIcon fontSize="small" />,
  timeline:   <TimelineIcon fontSize="small" />,
  story:      <MenuBookIcon fontSize="small" />,
  eli5:       <ChildCareIcon fontSize="small" />,
  speedlearn: <BoltIcon fontSize="small" />,
  brainstorm: <EmojiObjectsIcon fontSize="small" />,
}

const BADGE_LABELS: Record<string, string> = {
  first_step:    '🏁 First Step',
  quiz_master:   '🎓 Quiz Master',
  perfect_quiz:  '💯 Perfect Quiz',
  flashcard_ninja: '🥷 Flashcard Ninja',
  mind_mapper:   '🗺️ Mind Mapper',
  storyteller:   '📖 Storyteller',
  speed_learner: '⚡ Speed Learner',
  '7_day_streak': '🔥 7-Day Streak',
  level_5:       '⭐ Level 5',
  explorer:      '🧭 Explorer',
}

// ─── Sub-components ───────────────────────────────────────────────────────────

/** XP progress bar header strip */
function StatsBar({ stats }: { stats: UserStats }) {
  const xpThresholds = [0, 100, 250, 500, 1000, 2000, 4000, 7500, 12500, 20000]
  const levelIdx = Math.min(stats.level - 1, xpThresholds.length - 2)
  const xpStart = xpThresholds[levelIdx] ?? 0
  const xpEnd   = xpThresholds[levelIdx + 1] ?? xpThresholds[xpThresholds.length - 1]
  const progress = xpEnd > xpStart
    ? ((stats.xp - xpStart) / (xpEnd - xpStart)) * 100
    : 100

  return (
    <Box sx={{ px: 2, py: 1.5, borderBottom: 1, borderColor: 'divider' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
        <StarIcon sx={{ fontSize: 16, color: 'warning.main' }} />
        <Typography variant="caption" fontWeight={700}>
          Level {stats.level}
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ ml: 'auto' }}>
          {stats.xp} XP
        </Typography>
        {stats.streak > 0 && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <LocalFireDepartmentIcon sx={{ fontSize: 14, color: 'error.main' }} />
            <Typography variant="caption" color="error.main" fontWeight={600}>
              {stats.streak}
            </Typography>
          </Box>
        )}
      </Box>
      <LinearProgress
        variant="determinate"
        value={Math.min(progress, 100)}
        sx={{ height: 4, borderRadius: 2 }}
      />
    </Box>
  )
}

/** Render a mind-map node recursively */
function MindmapNodeView({ node, depth = 0 }: { node: MindmapNode; depth?: number }) {
  const [open, setOpen] = useState(true)
  return (
    <Box sx={{ ml: depth * 2 }}>
      <Box
        onClick={() => node.children.length > 0 && setOpen(!open)}
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 0.5,
          py: 0.5,
          cursor: node.children.length > 0 ? 'pointer' : 'default',
          '&:hover': { color: 'primary.main' },
        }}
      >
        <Box
          sx={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            bgcolor: depth === 0 ? 'primary.main' : depth === 1 ? 'secondary.main' : 'text.secondary',
            flexShrink: 0,
          }}
        />
        <Typography variant="body2" fontWeight={depth === 0 ? 700 : 400}>
          {node.label}
        </Typography>
      </Box>
      {node.children.length > 0 && (
        <Collapse in={open}>
          {node.children.map((child, i) => (
            <MindmapNodeView key={i} node={child} depth={depth + 1} />
          ))}
        </Collapse>
      )}
    </Box>
  )
}

/** Render quiz content with interactive answer checking */
function QuizView({
  content,
  sessionId,
  onXPEarned,
}: {
  content: QuizContent
  sessionId: string
  onXPEarned: (xp: number) => void
}) {
  const [answers, setAnswers] = useState<Record<number, { selected: string; result: { correct: boolean; explanation: string; xp_earned: number } | null }>>({})
  const [loading, setLoading] = useState<number | null>(null)

  const handleAnswer = async (qi: number, option: string) => {
    if (answers[qi] || loading !== null) return
    setLoading(qi)
    try {
      const result = await learnApi.submitQuizAnswer(sessionId, qi, option)
      setAnswers(prev => ({ ...prev, [qi]: { selected: option, result } }))
      if (result.xp_earned > 0) onXPEarned(result.xp_earned)
    } catch {
      // ignore
    } finally {
      setLoading(null)
    }
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {content.questions.map((q, qi) => {
        const ans = answers[qi]
        return (
          <Paper key={qi} variant="outlined" sx={{ p: 2.5, borderRadius: 2 }}>
            <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 2 }}>
              {qi + 1}. {q.q}
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {q.options.map((opt, oi) => {
                const isSelected = ans?.selected === opt
                const isCorrect  = oi === q.correct
                let bgcolor = 'transparent'
                let borderColor = 'divider'
                if (ans) {
                  if (isCorrect)       { bgcolor = 'success.main'; borderColor = 'success.main' }
                  else if (isSelected) { bgcolor = 'error.main';   borderColor = 'error.main' }
                }
                return (
                  <Box
                    key={oi}
                    onClick={() => handleAnswer(qi, opt)}
                    sx={{
                      px: 2, py: 1.2,
                      border: 1, borderColor,
                      borderRadius: 1.5,
                      cursor: ans ? 'default' : 'pointer',
                      bgcolor: ans ? `${bgcolor}14` : 'transparent',
                      display: 'flex', alignItems: 'center', gap: 1,
                      '&:hover': ans ? {} : { bgcolor: 'action.hover' },
                      transition: 'all 0.15s',
                    }}
                  >
                    {loading === qi && isSelected ? (
                      <CircularProgress size={14} />
                    ) : ans && isCorrect ? (
                      <CheckCircleIcon sx={{ fontSize: 16, color: 'success.main' }} />
                    ) : ans && isSelected && !isCorrect ? (
                      <CancelIcon sx={{ fontSize: 16, color: 'error.main' }} />
                    ) : null}
                    <Typography variant="body2">{opt}</Typography>
                  </Box>
                )
              })}
            </Box>
            {ans?.result && (
              <Alert
                severity={ans.result.correct ? 'success' : 'error'}
                sx={{ mt: 1.5, py: 0.5 }}
              >
                <Typography variant="caption">
                  {ans.result.correct ? `+${ans.result.xp_earned} XP — ` : ''}
                  {ans.result.explanation}
                </Typography>
              </Alert>
            )}
          </Paper>
        )
      })}
    </Box>
  )
}

/** Render flashcard deck with spaced repetition rating */
function FlashcardView({
  content,
  sessionId,
}: {
  content: FlashcardContent
  sessionId: string
}) {
  const [cardIndex, setCardIndex] = useState(0)
  const [flipped, setFlipped] = useState(false)
  const [rated, setRated] = useState<Record<number, string>>({})

  const card = content.cards[cardIndex]
  const isRated = rated[cardIndex] !== undefined
  const total = content.cards.length
  const progress = Object.keys(rated).length

  const handleRate = async (ease: 'again' | 'hard' | 'good' | 'easy') => {
    try {
      await learnApi.reviewFlashcard(sessionId, cardIndex, ease)
      setRated(prev => ({ ...prev, [cardIndex]: ease }))
      setFlipped(false)
      if (cardIndex < total - 1) {
        setTimeout(() => setCardIndex(i => i + 1), 300)
      }
    } catch {
      // ignore
    }
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'center' }}>
      {/* Progress */}
      <Box sx={{ width: '100%' }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
          <Typography variant="caption" color="text.secondary">
            Card {cardIndex + 1} of {total}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {progress} reviewed
          </Typography>
        </Box>
        <LinearProgress variant="determinate" value={(progress / total) * 100} sx={{ borderRadius: 2 }} />
      </Box>

      {/* Card */}
      <Paper
        elevation={3}
        onClick={() => setFlipped(!flipped)}
        sx={{
          width: '100%',
          minHeight: 180,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          p: 3,
          cursor: 'pointer',
          borderRadius: 3,
          textAlign: 'center',
          transition: 'transform 0.15s',
          '&:hover': { transform: 'scale(1.01)' },
        }}
      >
        <Typography variant="caption" color="text.secondary" sx={{ mb: 1, textTransform: 'uppercase', letterSpacing: 1 }}>
          {flipped ? 'Answer' : 'Question'}
        </Typography>
        <Typography variant="h6" fontWeight={flipped ? 400 : 600}>
          {flipped ? card.back : card.front}
        </Typography>
        {!flipped && card.hint && (
          <Typography variant="caption" color="text.secondary" sx={{ mt: 1 }}>
            Hint: {card.hint}
          </Typography>
        )}
        {!flipped && (
          <Typography variant="caption" color="primary.main" sx={{ mt: 1.5 }}>
            Click to reveal answer
          </Typography>
        )}
      </Paper>

      {/* Rating buttons (only after flip) */}
      {flipped && !isRated && (
        <Box sx={{ display: 'flex', gap: 1 }}>
          {(['again', 'hard', 'good', 'easy'] as const).map((ease) => (
            <Button
              key={ease}
              variant="outlined"
              size="small"
              onClick={() => handleRate(ease)}
              sx={{
                textTransform: 'capitalize',
                borderColor: ease === 'easy' ? 'success.main' : ease === 'good' ? 'primary.main' : ease === 'hard' ? 'warning.main' : 'error.main',
                color: ease === 'easy' ? 'success.main' : ease === 'good' ? 'primary.main' : ease === 'hard' ? 'warning.main' : 'error.main',
              }}
            >
              {ease}
            </Button>
          ))}
        </Box>
      )}

      {/* Navigation dots */}
      <Box sx={{ display: 'flex', gap: 0.5, mt: 1 }}>
        {content.cards.map((_, i) => (
          <Box
            key={i}
            onClick={() => { setCardIndex(i); setFlipped(false) }}
            sx={{
              width: 8, height: 8, borderRadius: '50%', cursor: 'pointer',
              bgcolor: i === cardIndex ? 'primary.main' : rated[i] ? 'success.main' : 'action.disabled',
              transition: 'background-color 0.2s',
            }}
          />
        ))}
      </Box>
    </Box>
  )
}

/** Render a vertical timeline */
function TimelineView({ content }: { content: TimelineContent }) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {content.events.map((ev, i) => (
        <Box key={i} sx={{ display: 'flex', gap: 2, pb: 2.5 }}>
          {/* Spine */}
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
            <Box sx={{
              width: 36, height: 36, borderRadius: '50%',
              bgcolor: 'primary.main', display: 'flex',
              alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              <Typography variant="caption" fontWeight={700} color="white" sx={{ fontSize: 10 }}>
                {ev.year.slice(0, 4)}
              </Typography>
            </Box>
            {i < content.events.length - 1 && (
              <Box sx={{ width: 2, flex: 1, bgcolor: 'divider', mt: 0.5 }} />
            )}
          </Box>
          {/* Content */}
          <Box sx={{ pt: 0.5, pb: 1 }}>
            <Typography variant="subtitle2" fontWeight={700}>{ev.title}</Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
              {ev.year}
            </Typography>
            <Typography variant="body2" color="text.secondary">{ev.description}</Typography>
          </Box>
        </Box>
      ))}
    </Box>
  )
}

/** Render markdown text formats (story / eli5 / speedlearn / brainstorm) */
function TextContentView({ text }: { text: string }) {
  return (
    <Box sx={{
      '& h1,& h2,& h3': { fontWeight: 700, mt: 2, mb: 1 },
      '& p': { mb: 1.5, lineHeight: 1.8 },
      '& ul,& ol': { pl: 2.5, mb: 1.5 },
      '& li': { mb: 0.5 },
      '& strong': { color: 'primary.main' },
      '& code': { bgcolor: 'action.hover', px: 0.5, borderRadius: 1, fontSize: '0.85em', fontFamily: 'monospace' },
    }}>
      <ReactMarkdown>{text}</ReactMarkdown>
    </Box>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function LearnPage() {
  const qc = useQueryClient()

  // ── Form state ─────────────────────────────────────────────────────────────
  const [topic, setTopic] = useState('')
  const [format, setFormat] = useState<LearnFormat>('quiz')
  const [difficulty, setDifficulty] = useState<Difficulty>('intermediate')

  // ── Session state ──────────────────────────────────────────────────────────
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const [streamingText, setStreamingText] = useState('')
  const [streamingContent, setStreamingContent] = useState<unknown>(null)
  const [isStreaming, setIsStreaming] = useState(false)
  const [streamError, setStreamError] = useState<string | null>(null)
  const [lastXP, setLastXP] = useState<number | null>(null)
  const [newBadges, setNewBadges] = useState<string[]>([])
  const [activeFormat, setActiveFormat] = useState<LearnFormat>('quiz')

  const abortRef = useRef<AbortController | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  // ── Queries ─────────────────────────────────────────────────────────────────
  const { data: sessions = [] } = useQuery({
    queryKey: ['learn-sessions'],
    queryFn: () => learnApi.listSessions(),
  })

  const { data: userStats, refetch: refetchStats } = useQuery({
    queryKey: ['learn-stats'],
    queryFn: () => learnApi.getUserStats(),
  })

  const { data: activeSession } = useQuery({
    queryKey: ['learn-session', activeSessionId],
    queryFn: () => learnApi.getSession(activeSessionId!),
    enabled: !!activeSessionId && !isStreaming,
  })

  // ── Delete mutation ─────────────────────────────────────────────────────────
  const deleteMutation = useMutation({
    mutationFn: (id: string) => learnApi.deleteSession(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['learn-sessions'] })
      setActiveSessionId(null)
      setStreamingText('')
      setStreamingContent(null)
    },
  })

  // Auto-scroll during streaming
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [streamingText])

  // ── Stream handler ──────────────────────────────────────────────────────────
  const handleGenerate = async () => {
    if (!topic.trim() || isStreaming) return

    setIsStreaming(true)
    setStreamError(null)
    setStreamingText('')
    setStreamingContent(null)
    setLastXP(null)
    setNewBadges([])
    setActiveSessionId(null)
    setActiveFormat(format)

    const controller = new AbortController()
    abortRef.current = controller
    let accumulatedText = ''
    let accumulatedJson = ''
    const isJsonFormat = ['quiz', 'flashcard', 'mindmap', 'timeline'].includes(format)

    try {
      await learnApi.streamSession(
        topic.trim(),
        format,
        difficulty,
        (event) => {
          if (event.type === 'token') {
            if (isJsonFormat) {
              accumulatedJson += event.content
            } else {
              accumulatedText += event.content
              setStreamingText(accumulatedText)
            }
          } else if (event.type === 'done') {
            setActiveSessionId(event.session_id)
            setLastXP(event.xp_earned)
            setNewBadges(event.new_badges)
            if (isJsonFormat && accumulatedJson) {
              try {
                setStreamingContent(JSON.parse(accumulatedJson))
              } catch {
                setStreamError('Failed to parse generated content.')
              }
            } else if (!isJsonFormat) {
              setStreamingContent({ text: accumulatedText })
            }
            qc.invalidateQueries({ queryKey: ['learn-sessions'] })
            refetchStats()
          } else if (event.type === 'error') {
            setStreamError(event.error)
          }
        },
        controller.signal,
      )
    } catch (err: unknown) {
      if (err instanceof Error && err.name !== 'AbortError') {
        setStreamError(err.message)
      }
    } finally {
      setIsStreaming(false)
      abortRef.current = null
    }
  }

  // Load a past session
  const handleLoadSession = (session: LearnSession) => {
    setActiveSessionId(session.id)
    setActiveFormat(session.format)
    setTopic(session.topic)
    setFormat(session.format)
    setDifficulty(session.difficulty)
    setStreamingText('')
    setStreamingContent(session.content)
    setStreamError(null)
    setLastXP(null)
    setNewBadges([])
    setIsStreaming(false)
  }

  // Determine what content to display
  const displayContent = streamingContent ?? activeSession?.content
  const displayFormat  = activeSessionId ? activeFormat : format
  const displayText    = streamingText || (displayContent as TextContent)?.text || ''
  const isJsonFormat   = ['quiz', 'flashcard', 'mindmap', 'timeline'].includes(displayFormat)
  const selectedFormatInfo = FORMATS.find(f => f.id === format)

  const handleXPEarned = (xp: number) => {
    refetchStats()
    setLastXP(prev => (prev ?? 0) + xp)
  }

  return (
    <Box sx={{ display: 'flex', height: '100%', overflow: 'hidden' }}>

      {/* ── Left sidebar ─────────────────────────────────────────────────────── */}
      <Box sx={{
        width: 240, flexShrink: 0, borderRight: 1, borderColor: 'divider',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        {/* Stats */}
        {userStats && <StatsBar stats={userStats} />}

        {/* Badges */}
        {userStats && userStats.badges.length > 0 && (
          <Box sx={{ px: 1.5, py: 1, borderBottom: 1, borderColor: 'divider' }}>
            <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>
              Badges
            </Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
              {userStats.badges.map(b => (
                <Tooltip key={b} title={BADGE_LABELS[b] ?? b}>
                  <Chip label={BADGE_LABELS[b]?.split(' ')[0] ?? '🏅'} size="small" sx={{ fontSize: 12 }} />
                </Tooltip>
              ))}
            </Box>
          </Box>
        )}

        {/* Session history */}
        <Box sx={{ flex: 1, overflow: 'auto' }}>
          <Typography variant="caption" color="text.secondary" sx={{ px: 2, py: 1, display: 'block' }}>
            History
          </Typography>
          {sessions.length === 0 ? (
            <Typography variant="caption" color="text.disabled" sx={{ px: 2 }}>
              No sessions yet
            </Typography>
          ) : (
            <List dense disablePadding>
              {sessions.map(s => (
                <ListItemButton
                  key={s.id}
                  selected={s.id === activeSessionId}
                  onClick={() => handleLoadSession(s)}
                  sx={{ py: 0.75, px: 1.5 }}
                >
                  <ListItemIcon sx={{ minWidth: 28 }}>
                    {FORMAT_ICON_MAP[s.format]}
                  </ListItemIcon>
                  <ListItemText
                    primary={s.topic}
                    secondary={s.format}
                    primaryTypographyProps={{ variant: 'caption', noWrap: true, fontWeight: 600 }}
                    secondaryTypographyProps={{ variant: 'caption', noWrap: true }}
                  />
                  <IconButton
                    size="small"
                    onClick={(e) => { e.stopPropagation(); deleteMutation.mutate(s.id) }}
                    sx={{ opacity: 0, '.MuiListItemButton-root:hover &': { opacity: 1 } }}
                  >
                    <DeleteOutlineIcon sx={{ fontSize: 14 }} />
                  </IconButton>
                </ListItemButton>
              ))}
            </List>
          )}
        </Box>
      </Box>

      {/* ── Main area ────────────────────────────────────────────────────────── */}
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* Controls header */}
        <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider', flexShrink: 0 }}>
          {/* Topic input */}
          <Box sx={{ display: 'flex', gap: 1, mb: 1.5, alignItems: 'flex-end' }}>
            <TextField
              label="Topic"
              placeholder="e.g. Quantum entanglement, The French Revolution…"
              value={topic}
              onChange={e => setTopic(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleGenerate()}
              fullWidth
              size="small"
              disabled={isStreaming}
            />
            {isStreaming ? (
              <Button
                variant="outlined"
                color="error"
                size="small"
                startIcon={<StopIcon />}
                onClick={() => abortRef.current?.abort()}
                sx={{ flexShrink: 0 }}
              >
                Stop
              </Button>
            ) : (
              <Button
                variant="contained"
                size="small"
                disabled={!topic.trim()}
                onClick={handleGenerate}
                startIcon={selectedFormatInfo?.icon}
                sx={{ flexShrink: 0, minWidth: 100 }}
              >
                Generate
              </Button>
            )}
          </Box>

          {/* Format selector */}
          <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
            {FORMATS.map(f => (
              <Tooltip key={f.id} title={f.desc}>
                <Chip
                  icon={f.icon as React.ReactElement}
                  label={f.label}
                  size="small"
                  variant={format === f.id ? 'filled' : 'outlined'}
                  color={format === f.id ? 'primary' : 'default'}
                  onClick={() => !isStreaming && setFormat(f.id)}
                  clickable={!isStreaming}
                  sx={{ fontWeight: format === f.id ? 700 : 400 }}
                />
              </Tooltip>
            ))}
            <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />
            {DIFFICULTIES.map(d => (
              <Chip
                key={d.id}
                label={d.label}
                size="small"
                variant={difficulty === d.id ? 'filled' : 'outlined'}
                onClick={() => !isStreaming && setDifficulty(d.id)}
                clickable={!isStreaming}
                sx={{
                  fontWeight: difficulty === d.id ? 700 : 400,
                  ...(difficulty === d.id ? { bgcolor: d.color, color: 'white', '&:hover': { bgcolor: d.color } } : {}),
                }}
              />
            ))}
          </Box>
        </Box>

        {/* Content area */}
        <Box sx={{ flex: 1, overflow: 'auto', p: 3 }}>

          {/* Streaming progress */}
          {isStreaming && (
            <Box sx={{ mb: 2 }}>
              <LinearProgress sx={{ mb: 1, borderRadius: 2 }} />
              <Typography variant="caption" color="text.secondary">
                Generating {format} on "{topic}"…
              </Typography>
            </Box>
          )}

          {/* Error */}
          {streamError && (
            <Alert severity="error" sx={{ mb: 2 }}>{streamError}</Alert>
          )}

          {/* XP / badge notification */}
          {lastXP !== null && lastXP > 0 && (
            <Alert
              severity="success"
              icon={<EmojiEventsIcon />}
              sx={{ mb: 2 }}
              onClose={() => { setLastXP(null); setNewBadges([]) }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                <Typography variant="body2" fontWeight={600}>+{lastXP} XP earned!</Typography>
                {newBadges.map(b => (
                  <Chip key={b} label={BADGE_LABELS[b] ?? b} size="small" color="warning" />
                ))}
              </Box>
            </Alert>
          )}

          {/* Empty state */}
          {!isStreaming && !displayContent && !streamingText && !streamError && (
            <Box sx={{
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              justifyContent: 'center', height: '60%', gap: 2, color: 'text.secondary',
            }}>
              <AutoStoriesIcon sx={{ fontSize: 64, opacity: 0.2 }} />
              <Typography variant="h6" fontWeight={600} color="text.primary">
                Ready to learn?
              </Typography>
              <Typography variant="body2" sx={{ maxWidth: 420, textAlign: 'center' }}>
                Enter a topic, pick a format and difficulty, then hit Generate.
                Earn XP, unlock badges, and track streaks as you learn.
              </Typography>
              {/* Format overview grid */}
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 1, justifyContent: 'center', maxWidth: 420 }}>
                {FORMATS.map(f => (
                  <Chip
                    key={f.id}
                    icon={f.icon as React.ReactElement}
                    label={f.label}
                    size="small"
                    variant="outlined"
                    onClick={() => setFormat(f.id)}
                    clickable
                  />
                ))}
              </Box>
            </Box>
          )}

          {/* Text formats (streaming or loaded) */}
          {!isJsonFormat && (displayText || isStreaming) && (
            <Paper variant="outlined" sx={{ p: 3, borderRadius: 2, maxWidth: 760 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                {FORMAT_ICON_MAP[displayFormat]}
                <Typography variant="subtitle2" fontWeight={700} sx={{ textTransform: 'capitalize' }}>
                  {displayFormat} · {difficulty}
                </Typography>
                {isStreaming && <CircularProgress size={14} sx={{ ml: 'auto' }} />}
              </Box>
              <TextContentView text={displayText} />
              {isStreaming && (
                <Box sx={{ display: 'inline-block', width: 8, height: 16, bgcolor: 'primary.main', ml: 0.5, animation: 'blink 1s step-end infinite', '@keyframes blink': { '50%': { opacity: 0 } } }} />
              )}
            </Paper>
          )}

          {/* JSON formats (shown after streaming completes) */}
          {isJsonFormat && displayContent && (
            <Box sx={{ maxWidth: 760 }}>
              {displayFormat === 'quiz' && activeSessionId && (
                <QuizView
                  content={displayContent as QuizContent}
                  sessionId={activeSessionId}
                  onXPEarned={handleXPEarned}
                />
              )}
              {displayFormat === 'flashcard' && activeSessionId && (
                <FlashcardView
                  content={displayContent as FlashcardContent}
                  sessionId={activeSessionId}
                />
              )}
              {displayFormat === 'mindmap' && (
                <Paper variant="outlined" sx={{ p: 3, borderRadius: 2 }}>
                  <Typography variant="h6" fontWeight={700} sx={{ mb: 2 }}>
                    {(displayContent as MindmapContent).root}
                  </Typography>
                  {(displayContent as MindmapContent).branches.map((branch, i) => (
                    <MindmapNodeView key={i} node={branch} depth={1} />
                  ))}
                </Paper>
              )}
              {displayFormat === 'timeline' && (
                <TimelineView content={displayContent as TimelineContent} />
              )}
            </Box>
          )}

          {/* JSON formats still streaming — show raw progress */}
          {isJsonFormat && isStreaming && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, color: 'text.secondary' }}>
              <CircularProgress size={20} />
              <Typography variant="body2">
                Building {displayFormat}…
              </Typography>
            </Box>
          )}

          <Box ref={bottomRef} />
        </Box>
      </Box>
    </Box>
  )
}
