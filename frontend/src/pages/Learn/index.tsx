/**
 * Learn Mode Page — Sprint 6 (Redesigned)
 *
 * Claude-inspired design: clean typography, generous whitespace,
 * subtle borders, smooth animations.
 *
 * Formats: guided · quiz · flashcard · mindmap · timeline · story · eli5 · speedlearn · brainstorm
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
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
  InputAdornment,
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
  useTheme,
  alpha,
} from '@mui/material'
import AutoStoriesIcon from '@mui/icons-material/AutoStories'
import QuizIcon from '@mui/icons-material/Quiz'
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome'
import StyleIcon from '@mui/icons-material/Style'
import AccountTreeIcon from '@mui/icons-material/AccountTree'
import TimelineIcon from '@mui/icons-material/Timeline'
import MenuBookIcon from '@mui/icons-material/MenuBook'
import ChildCareIcon from '@mui/icons-material/ChildCare'
import BoltIcon from '@mui/icons-material/Bolt'
import EmojiObjectsIcon from '@mui/icons-material/EmojiObjects'
import SchoolIcon from '@mui/icons-material/School'
import TranslateIcon from '@mui/icons-material/Translate'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import StopIcon from '@mui/icons-material/Stop'
import StarIcon from '@mui/icons-material/Star'
import LocalFireDepartmentIcon from '@mui/icons-material/LocalFireDepartment'
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import CancelIcon from '@mui/icons-material/Cancel'
import ArrowForwardIcon from '@mui/icons-material/ArrowForward'
import FlipIcon from '@mui/icons-material/Flip'
import LanguageIcon from '@mui/icons-material/Language'
import UploadFileIcon from '@mui/icons-material/UploadFile'
import LibraryBooksIcon from '@mui/icons-material/LibraryBooks'
import SubjectIcon from '@mui/icons-material/Subject'
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft'
import ChevronRightIcon from '@mui/icons-material/ChevronRight'
import ReactMarkdown from 'react-markdown'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  learnApi,
  type FlashCard,
  type FlashcardContent,
  type GuidedContent,
  type LearnFormat,
  type LearnSession,
  type MindmapContent,
  type MindmapNode,
  type QuizContent,
  type SourceType,
  type TextContent,
  type TimelineContent,
  type UserStats,
  type Difficulty,
} from '../../api/learn.api'
import { kbApi } from '../../api/kb.api'
import { readerApi } from '../../api/reader.api'
import GuidedViewer from './GuidedViewer'
import AnimatedView from './AnimatedView'
import { lessonOutline, lessonConcepts, type OutlineItem } from './lessonStructure'
import { BRAND } from '@/theme/tokens'

const MONO = '"IBM Plex Mono", "Geist Mono", monospace'
// Generic active/hover accent fill — brand copper (paired with primary.main borders).
const ACCENT = BRAND.copper
const SERIF = '"Instrument Serif", Georgia, serif'

// ─── Constants ────────────────────────────────────────────────────────────────

// UI-level format id. 'animated' is a presentation of guided content (the
// animated step-through), not a separate backend format — see backendFormatFor.
export type UIFormat = LearnFormat | 'animated'

/** Map a UI format to the backend LearnFormat used for generation. */
export function backendFormatFor(f: UIFormat): LearnFormat {
  return f === 'animated' ? 'guided' : f
}

/** Formats whose generated content is a JSON object (vs streamed text). */
export function isObjectFormat(f: UIFormat): boolean {
  return ['quiz', 'flashcard', 'mindmap', 'timeline', 'guided', 'animated'].includes(f)
}

// Offered formats (UI), matching the lab lesson tabs: the four functional modes.
const FORMATS: Array<{ id: UIFormat; label: string; icon: React.ReactNode; desc: string; color: string }> = [
  { id: 'guided',    label: 'Guided',     icon: <SchoolIcon />,         desc: 'A conversational tutor walks you through, one beat at a time.', color: '#DDA76A' },
  { id: 'animated',  label: 'Animated',   icon: <AutoAwesomeIcon />,    desc: 'Watch the concept build itself — visually, step by step.',     color: '#DDA76A' },
  { id: 'flashcard', label: 'Flashcards', icon: <StyleIcon />,          desc: 'Spaced-repetition cards that adapt to your recall.',           color: '#0EA5E9' },
  { id: 'quiz',      label: 'Quiz',       icon: <QuizIcon />,           desc: 'Check understanding with adaptive questions.',                  color: '#7C3AED' },
]

const DIFFICULTIES: Array<{ id: Difficulty; label: string; color: string; bg: string }> = [
  { id: 'beginner',     label: 'Beginner',     color: '#16A34A', bg: '#DCFCE7' },
  { id: 'intermediate', label: 'Intermediate', color: '#D97706', bg: '#FEF3C7' },
  { id: 'expert',       label: 'Expert',       color: '#DC2626', bg: '#FEE2E2' },
]

// Multilingual (generate-in-language). 'English' is the default = no behavior change.
const LANGUAGES = ['English', 'हिन्दी', 'Español', 'Français', 'Deutsch', 'Português', 'Italiano', '日本語', '中文', '한국어', 'العربية', 'Русский']

const FORMAT_ICON_MAP: Record<UIFormat, React.ReactNode> = {
  guided:     <SchoolIcon fontSize="small" />,
  animated:   <AutoAwesomeIcon fontSize="small" />,
  quiz:       <QuizIcon fontSize="small" />,
  flashcard:  <StyleIcon fontSize="small" />,
  mindmap:    <AccountTreeIcon fontSize="small" />,
  timeline:   <TimelineIcon fontSize="small" />,
  story:      <MenuBookIcon fontSize="small" />,
  eli5:       <ChildCareIcon fontSize="small" />,
  speedlearn: <BoltIcon fontSize="small" />,
  brainstorm: <EmojiObjectsIcon fontSize="small" />,
}

const QUIZ_LETTERS = ['A', 'B', 'C', 'D']

const BADGE_LABELS: Record<string, string> = {
  first_step:      '🏁 First Step',
  quiz_master:     '🎓 Quiz Master',
  perfect_quiz:    '💯 Perfect Quiz',
  flashcard_ninja: '🥷 Flashcard Ninja',
  mind_mapper:     '🗺️ Mind Mapper',
  storyteller:     '📖 Storyteller',
  speed_learner:   '⚡ Speed Learner',
  '7_day_streak':  '🔥 7-Day Streak',
  level_5:         '⭐ Level 5',
  explorer:        '🧭 Explorer',
}

// ─── Source mode ──────────────────────────────────────────────────────────────

type SourceMode = 'topic' | 'kb' | 'web' | 'wikipedia' | 'upload'

const SOURCE_MODES: Array<{ id: SourceMode; label: string; icon: React.ReactNode; tip: string }> = [
  { id: 'topic',     label: 'Topic',     icon: <SubjectIcon fontSize="inherit" />,       tip: 'Learn about any topic using AI knowledge' },
  { id: 'kb',        label: 'Library',   icon: <LibraryBooksIcon fontSize="inherit" />,  tip: 'Learn from a file in your Knowledge Base' },
  { id: 'web',       label: 'Web',       icon: <LanguageIcon fontSize="inherit" />,      tip: 'Learn from any web page by URL' },
  { id: 'wikipedia', label: 'Wikipedia', icon: <MenuBookIcon fontSize="inherit" />,      tip: 'Learn from the Wikipedia article on a topic' },
  { id: 'upload',    label: 'Upload',    icon: <UploadFileIcon fontSize="inherit" />,    tip: 'Upload a text file (.txt, .md, .json, .csv)' },
]

/** Build the Wikipedia article URL for a topic (used by the 'wikipedia' source). */
export function wikipediaUrlFor(topic: string): string {
  const slug = encodeURIComponent(topic.trim().replace(/\s+/g, '_'))
  return `https://en.wikipedia.org/wiki/${slug}`
}

// ─── Sub-components ───────────────────────────────────────────────────────────

/** XP / level strip shown at the top of the sidebar */
function StatsBar({ stats }: { stats: UserStats }) {
  const xpThresholds = [0, 100, 250, 500, 1000, 2000, 4000, 7500, 12500, 20000]
  const levelIdx = Math.min(stats.level - 1, xpThresholds.length - 2)
  const xpStart = xpThresholds[levelIdx] ?? 0
  const xpEnd   = xpThresholds[levelIdx + 1] ?? xpThresholds[xpThresholds.length - 1]
  const progress = xpEnd > xpStart ? ((stats.xp - xpStart) / (xpEnd - xpStart)) * 100 : 100

  return (
    <Box sx={{ px: 2, py: 1.5, borderBottom: 1, borderColor: 'divider' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 0.75 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <StarIcon sx={{ fontSize: 14, color: '#F59E0B' }} />
          <Typography sx={{ fontSize: 12, fontWeight: 700, lineHeight: 1 }}>
            Lv {stats.level}
          </Typography>
        </Box>
        <Typography sx={{ fontSize: 11, color: 'text.secondary', ml: 0.75 }}>
          {stats.xp} XP
        </Typography>
        {stats.streak > 0 && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25, ml: 'auto' }}>
            <LocalFireDepartmentIcon sx={{ fontSize: 13, color: '#EF4444' }} />
            <Typography sx={{ fontSize: 11, fontWeight: 700, color: '#EF4444' }}>
              {stats.streak}d
            </Typography>
          </Box>
        )}
      </Box>
      <LinearProgress
        variant="determinate"
        value={Math.min(progress, 100)}
        sx={{
          height: 3,
          borderRadius: 4,
          bgcolor: 'action.hover',
          '& .MuiLinearProgress-bar': { borderRadius: 4 },
        }}
      />
      <Typography sx={{ fontSize: 10, color: 'text.disabled', mt: 0.5 }}>
        {Math.round(Math.min(progress, 100))}% to level {stats.level + 1}
      </Typography>
    </Box>
  )
}

/** Render a mind-map node recursively with connecting lines */
function MindmapNodeView({ node, depth = 0 }: { node: MindmapNode; depth?: number }) {
  const [open, setOpen] = useState(true)
  const theme = useTheme()
  const dotColors = ['#7C3AED', '#0EA5E9', '#10B981', '#F59E0B', '#EC4899']
  const dotColor = dotColors[depth % dotColors.length]

  return (
    <Box sx={{ position: 'relative' }}>
      {/* Vertical connector line from parent */}
      {depth > 0 && (
        <Box sx={{
          position: 'absolute',
          left: depth * 20 - 12,
          top: 0,
          bottom: 0,
          width: 1,
          bgcolor: 'divider',
        }} />
      )}
      <Box
        onClick={() => node.children.length > 0 && setOpen(!open)}
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          py: 0.6,
          pl: depth > 0 ? `${depth * 20}px` : 0,
          cursor: node.children.length > 0 ? 'pointer' : 'default',
          borderRadius: 1,
          '&:hover': { bgcolor: 'action.hover' },
          transition: 'background 0.15s',
          position: 'relative',
        }}
      >
        {/* Horizontal connector */}
        {depth > 0 && (
          <Box sx={{
            position: 'absolute',
            left: depth * 20 - 12,
            top: '50%',
            width: 10,
            height: 1,
            bgcolor: 'divider',
          }} />
        )}
        <Box sx={{
          width: depth === 0 ? 10 : 7,
          height: depth === 0 ? 10 : 7,
          borderRadius: '50%',
          bgcolor: dotColor,
          flexShrink: 0,
          boxShadow: depth === 0 ? `0 0 0 3px ${alpha(dotColor, 0.2)}` : 'none',
        }} />
        <Typography
          sx={{
            fontSize: depth === 0 ? 14 : 13,
            fontWeight: depth === 0 ? 700 : depth === 1 ? 600 : 400,
            color: depth === 0 ? 'text.primary' : 'text.secondary',
          }}
        >
          {node.label}
        </Typography>
        {node.children.length > 0 && (
          <Typography sx={{ fontSize: 10, color: 'text.disabled', ml: 'auto', mr: 1 }}>
            {open ? '▲' : '▼'}
          </Typography>
        )}
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

/** Quiz with A/B/C/D letter badges and clean feedback */
function QuizView({
  content,
  sessionId,
  onXPEarned,
}: {
  content: QuizContent
  sessionId: string
  onXPEarned: (xp: number) => void
}) {
  const [answers, setAnswers] = useState<Record<number, {
    selected: string
    result: { correct: boolean; explanation: string; xp_earned: number } | null
  }>>({})
  const [loading, setLoading] = useState<number | null>(null)
  const theme = useTheme()

  const answered = Object.keys(answers).length
  const total = content?.questions?.length ?? 0

  if (!content?.questions) return null

  const handleAnswer = async (qi: number, option: string) => {
    if (answers[qi] || loading !== null) return
    setLoading(qi)
    try {
      const result = await learnApi.submitQuizAnswer(sessionId, qi, option)
      setAnswers(prev => ({ ...prev, [qi]: { selected: option, result } }))
      if (result.xp_earned > 0) onXPEarned(result.xp_earned)
    } catch { /* ignore */ }
    finally { setLoading(null) }
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
      {/* Progress header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>
          {answered} / {total} answered
        </Typography>
        <LinearProgress
          variant="determinate"
          value={(answered / total) * 100}
          sx={{ flex: 1, height: 3, borderRadius: 4, bgcolor: 'action.hover', '& .MuiLinearProgress-bar': { borderRadius: 4 } }}
        />
      </Box>

      {content.questions.map((q, qi) => {
        const ans = answers[qi]
        return (
          <Paper
            key={qi}
            variant="outlined"
            sx={{
              borderRadius: 2,
              overflow: 'hidden',
              borderColor: ans ? (ans.result?.correct ? '#16A34A' : '#DC2626') : 'divider',
              transition: 'border-color 0.2s',
            }}
          >
            {/* Question header */}
            <Box sx={{
              px: 2.5, py: 1.5,
              bgcolor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
              borderBottom: 1,
              borderColor: 'divider',
              display: 'flex',
              alignItems: 'flex-start',
              gap: 1.5,
            }}>
              <Box sx={{
                width: 22, height: 22, borderRadius: '50%',
                bgcolor: 'action.selected',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0, mt: 0.1,
              }}>
                <Typography sx={{ fontSize: 11, fontWeight: 700 }}>{qi + 1}</Typography>
              </Box>
              <Typography sx={{ fontSize: 14, fontWeight: 600, lineHeight: 1.5 }}>{q.q}</Typography>
            </Box>

            {/* Options */}
            <Box sx={{ p: 1.5, display: 'flex', flexDirection: 'column', gap: 0.75 }}>
              {q.options.map((opt, oi) => {
                const letter = QUIZ_LETTERS[oi] ?? String(oi)
                const isSelected = ans?.selected === opt
                const isCorrect  = oi === q.correct
                const showResult = !!ans

                let borderColor = 'divider'
                let bgcolor     = 'transparent'
                let letterBg    = 'action.selected'
                let letterColor = 'text.secondary'

                if (showResult) {
                  if (isCorrect) {
                    borderColor = '#16A34A'
                    bgcolor     = alpha('#16A34A', 0.08)
                    letterBg    = '#16A34A'
                    letterColor = '#fff'
                  } else if (isSelected && !isCorrect) {
                    borderColor = '#DC2626'
                    bgcolor     = alpha('#DC2626', 0.08)
                    letterBg    = '#DC2626'
                    letterColor = '#fff'
                  }
                }

                return (
                  <Box
                    key={oi}
                    onClick={() => handleAnswer(qi, opt)}
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 1.25,
                      px: 1.5, py: 1,
                      border: `1px solid`,
                      borderColor,
                      borderRadius: 1.5,
                      cursor: ans ? 'default' : 'pointer',
                      bgcolor,
                      transition: 'all 0.15s',
                      '&:hover': showResult ? {} : {
                        borderColor: 'primary.main',
                        bgcolor: alpha(ACCENT, 0.06),
                      },
                    }}
                  >
                    <Box sx={{
                      width: 24, height: 24,
                      borderRadius: '50%',
                      bgcolor: letterBg,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      flexShrink: 0,
                      transition: 'all 0.15s',
                    }}>
                      {loading === qi && isSelected ? (
                        <CircularProgress size={12} />
                      ) : (
                        <Typography sx={{ fontSize: 11, fontWeight: 700, color: letterColor, lineHeight: 1 }}>
                          {letter}
                        </Typography>
                      )}
                    </Box>
                    <Typography sx={{ fontSize: 13.5, flex: 1 }}>{opt}</Typography>
                    {showResult && isCorrect && <CheckCircleIcon sx={{ fontSize: 15, color: '#16A34A' }} />}
                    {showResult && isSelected && !isCorrect && <CancelIcon sx={{ fontSize: 15, color: '#DC2626' }} />}
                  </Box>
                )
              })}
            </Box>

            {/* Explanation */}
            {ans?.result && (
              <Box sx={{
                mx: 1.5, mb: 1.5, px: 2, py: 1,
                borderRadius: 1.5,
                bgcolor: ans.result.correct ? alpha('#16A34A', 0.06) : alpha('#DC2626', 0.06),
                border: `1px solid ${ans.result.correct ? alpha('#16A34A', 0.2) : alpha('#DC2626', 0.2)}`,
              }}>
                <Typography sx={{ fontSize: 12.5, lineHeight: 1.6 }}>
                  {ans.result.correct && (
                    <Box component="span" sx={{ fontWeight: 700, color: '#16A34A', mr: 0.5 }}>
                      +{ans.result.xp_earned} XP ·
                    </Box>
                  )}
                  {ans.result.explanation}
                </Typography>
              </Box>
            )}
          </Paper>
        )
      })}
    </Box>
  )
}

/** Flashcard with CSS 3D perspective flip animation */
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
  const theme = useTheme()

  const card = content.cards[cardIndex]
  const isRated = rated[cardIndex] !== undefined
  const total = content.cards.length
  const progress = Object.keys(rated).length

  const easeConfig = [
    { id: 'again', label: 'Again', color: '#DC2626', bg: alpha('#DC2626', 0.08) },
    { id: 'hard',  label: 'Hard',  color: '#D97706', bg: alpha('#D97706', 0.08) },
    { id: 'good',  label: 'Good',  color: '#2563EB', bg: alpha('#2563EB', 0.08) },
    { id: 'easy',  label: 'Easy',  color: '#16A34A', bg: alpha('#16A34A', 0.08) },
  ] as const

  const handleRate = async (ease: 'again' | 'hard' | 'good' | 'easy') => {
    try {
      await learnApi.reviewFlashcard(sessionId, cardIndex, ease)
      setRated(prev => ({ ...prev, [cardIndex]: ease }))
      setFlipped(false)
      if (cardIndex < total - 1) {
        setTimeout(() => setCardIndex(i => i + 1), 350)
      }
    } catch { /* ignore */ }
  }

  const allDone = progress === total

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, maxWidth: 600, mx: 'auto', width: '100%' }}>
      {/* Progress bar */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
        <Typography sx={{ fontSize: 12, color: 'text.secondary', whiteSpace: 'nowrap' }}>
          {cardIndex + 1} / {total}
        </Typography>
        <LinearProgress
          variant="determinate"
          value={(progress / total) * 100}
          sx={{
            flex: 1, height: 4, borderRadius: 4,
            bgcolor: 'action.hover',
            '& .MuiLinearProgress-bar': { borderRadius: 4, bgcolor: '#10B981' },
          }}
        />
        <Typography sx={{ fontSize: 12, color: '#10B981', fontWeight: 600, whiteSpace: 'nowrap' }}>
          {progress} done
        </Typography>
      </Box>

      {/* 3D flip card */}
      <Box
        sx={{
          perspective: '1000px',
          height: 220,
          cursor: allDone ? 'default' : 'pointer',
        }}
        onClick={() => !allDone && setFlipped(f => !f)}
      >
        <Box
          sx={{
            position: 'relative',
            width: '100%',
            height: '100%',
            transformStyle: 'preserve-3d',
            transition: 'transform 0.5s cubic-bezier(0.4,0,0.2,1)',
            transform: flipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
          }}
        >
          {/* Front face */}
          <Box sx={{
            position: 'absolute',
            inset: 0,
            backfaceVisibility: 'hidden',
            WebkitBackfaceVisibility: 'hidden',
            border: `1px solid ${theme.palette.divider}`,
            borderRadius: 3,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            p: 4,
            bgcolor: 'background.paper',
            boxShadow: theme.palette.mode === 'dark'
              ? '0 4px 24px rgba(0,0,0,0.4)'
              : '0 4px 24px rgba(0,0,0,0.08)',
            textAlign: 'center',
          }}>
            <Typography sx={{
              fontSize: 10,
              textTransform: 'uppercase',
              letterSpacing: '0.12em',
              color: 'text.disabled',
              mb: 1.5,
              fontFamily: MONO,
            }}>
              Question
            </Typography>
            <Typography sx={{ fontSize: 18, fontWeight: 600, lineHeight: 1.5 }}>
              {card.front}
            </Typography>
            {card.hint && (
              <Typography sx={{ fontSize: 12, color: 'text.disabled', mt: 1.5 }}>
                💡 {card.hint}
              </Typography>
            )}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 2, color: 'text.disabled' }}>
              <FlipIcon sx={{ fontSize: 14 }} />
              <Typography sx={{ fontSize: 11 }}>Tap to flip</Typography>
            </Box>
          </Box>

          {/* Back face */}
          <Box sx={{
            position: 'absolute',
            inset: 0,
            backfaceVisibility: 'hidden',
            WebkitBackfaceVisibility: 'hidden',
            transform: 'rotateY(180deg)',
            border: `1px solid`,
            borderColor: theme.palette.mode === 'dark' ? alpha('#0EA5E9', 0.4) : alpha('#0EA5E9', 0.3),
            borderRadius: 3,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            p: 4,
            bgcolor: theme.palette.mode === 'dark'
              ? alpha('#0EA5E9', 0.06)
              : alpha('#0EA5E9', 0.04),
            boxShadow: theme.palette.mode === 'dark'
              ? '0 4px 24px rgba(0,0,0,0.4)'
              : '0 4px 24px rgba(14,165,233,0.12)',
            textAlign: 'center',
          }}>
            <Typography sx={{
              fontSize: 10,
              textTransform: 'uppercase',
              letterSpacing: '0.12em',
              color: '#0EA5E9',
              mb: 1.5,
              fontFamily: MONO,
            }}>
              Answer
            </Typography>
            <Typography sx={{ fontSize: 17, lineHeight: 1.6 }}>
              {card.back}
            </Typography>
          </Box>
        </Box>
      </Box>

      {/* Rating row — only visible after flip, before rating */}
      <Box sx={{
        opacity: flipped && !isRated && !allDone ? 1 : 0,
        pointerEvents: flipped && !isRated && !allDone ? 'auto' : 'none',
        transition: 'opacity 0.25s',
      }}>
        <Typography sx={{ fontSize: 11, color: 'text.secondary', textAlign: 'center', mb: 1 }}>
          How well did you know this?
        </Typography>
        <Box sx={{ display: 'flex', gap: 1, justifyContent: 'center' }}>
          {easeConfig.map(({ id, label, color, bg }) => (
            <Button
              key={id}
              variant="outlined"
              size="small"
              onClick={() => handleRate(id as 'again' | 'hard' | 'good' | 'easy')}
              sx={{
                borderColor: color,
                color,
                bgcolor: bg,
                fontSize: 12,
                fontWeight: 600,
                px: 1.5, py: 0.5,
                textTransform: 'none',
                '&:hover': { bgcolor: bg, borderColor: color, opacity: 0.85 },
              }}
            >
              {label}
            </Button>
          ))}
        </Box>
      </Box>

      {/* Nav dots */}
      <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'center', flexWrap: 'wrap' }}>
        {content.cards.map((_, i) => (
          <Box
            key={i}
            onClick={() => { setCardIndex(i); setFlipped(false) }}
            sx={{
              width: i === cardIndex ? 20 : 7,
              height: 7,
              borderRadius: 4,
              cursor: 'pointer',
              bgcolor: i === cardIndex
                ? '#0EA5E9'
                : rated[i]
                ? '#10B981'
                : 'action.disabled',
              transition: 'all 0.25s cubic-bezier(0.4,0,0.2,1)',
            }}
          />
        ))}
      </Box>

      {allDone && (
        <Box sx={{
          textAlign: 'center', py: 2,
          bgcolor: alpha('#10B981', 0.08),
          border: `1px solid ${alpha('#10B981', 0.2)}`,
          borderRadius: 2,
        }}>
          <Typography sx={{ fontSize: 22, mb: 0.5 }}>🎉</Typography>
          <Typography sx={{ fontWeight: 700, fontSize: 15, color: '#16A34A' }}>
            Deck complete!
          </Typography>
          <Typography sx={{ fontSize: 12, color: 'text.secondary', mt: 0.25 }}>
            All {total} cards reviewed
          </Typography>
        </Box>
      )}
    </Box>
  )
}

/** Vertical timeline with connecting spine */
function TimelineView({ content }: { content: TimelineContent }) {
  const theme = useTheme()
  const colors = ['#7C3AED', '#0EA5E9', '#10B981', '#F59E0B', '#EC4899', '#06B6D4', '#F97316', '#8B5CF6', '#16A34A', '#DC2626']

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column' }}>
      {content.events.map((ev, i) => (
        <Box key={i} sx={{ display: 'flex', gap: 0 }}>
          {/* Spine column */}
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 48, flexShrink: 0 }}>
            <Box sx={{
              width: 36, height: 36, borderRadius: '50%',
              bgcolor: colors[i % colors.length],
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0, mt: 0.25,
              boxShadow: `0 0 0 4px ${alpha(colors[i % colors.length], 0.15)}`,
            }}>
              <Typography sx={{ fontSize: 9, fontWeight: 800, color: '#fff', fontFamily: MONO }}>
                {ev.year.replace(/[^0-9]/g, '').slice(0, 4) || i + 1}
              </Typography>
            </Box>
            {i < content.events.length - 1 && (
              <Box sx={{ width: 2, flex: 1, minHeight: 20, bgcolor: 'divider', my: 0.5 }} />
            )}
          </Box>

          {/* Event content */}
          <Box sx={{ pb: i < content.events.length - 1 ? 3 : 0, pl: 1.5, pt: 0.5 }}>
            <Typography sx={{ fontWeight: 700, fontSize: 14, lineHeight: 1.3 }}>{ev.title}</Typography>
            <Typography sx={{
              fontSize: 11, fontWeight: 600,
              color: colors[i % colors.length],
              fontFamily: MONO, mb: 0.5,
            }}>
              {ev.year}
            </Typography>
            <Typography sx={{ fontSize: 13.5, color: 'text.secondary', lineHeight: 1.6 }}>
              {ev.description}
            </Typography>
          </Box>
        </Box>
      ))}
    </Box>
  )
}

/** Markdown text renderer for story/eli5/speedlearn/brainstorm */
function TextContentView({ text }: { text: string }) {
  const theme = useTheme()
  return (
    <Box sx={{
      fontSize: 14.5,
      lineHeight: 1.85,
      '& h1': { fontSize: 22, fontWeight: 700, mt: 2.5, mb: 1, fontFamily: SERIF },
      '& h2': { fontSize: 18, fontWeight: 700, mt: 2, mb: 0.75 },
      '& h3': { fontSize: 15, fontWeight: 700, mt: 1.75, mb: 0.5 },
      '& p': { mb: 1.25, color: 'text.primary' },
      '& ul, & ol': { pl: 2.5, mb: 1.25 },
      '& li': { mb: 0.5 },
      '& strong': { fontWeight: 700, color: 'text.primary' },
      '& em': { color: 'text.secondary' },
      '& code': {
        bgcolor: 'action.hover',
        px: 0.75, py: 0.15,
        borderRadius: 0.75,
        fontSize: '0.85em',
        fontFamily: MONO,
      },
      '& blockquote': {
        borderLeft: `3px solid`,
        borderColor: 'primary.main',
        pl: 1.5, ml: 0, my: 1.5,
        color: 'text.secondary',
        fontStyle: 'italic',
      },
    }}>
      <ReactMarkdown>{text}</ReactMarkdown>
    </Box>
  )
}

/** Format selector card used in the empty state grid */
function FormatCard({
  f,
  selected,
  onClick,
}: {
  f: typeof FORMATS[number]
  selected: boolean
  onClick: () => void
}) {
  const theme = useTheme()
  const accent = theme.palette.primary.main
  return (
    <Box
      data-testid={`format-card-${f.id}`}
      onClick={onClick}
      sx={{
        textAlign: 'left',
        border: `1px solid`,
        borderColor: selected ? accent : 'divider',
        borderRadius: 3,
        p: 2,
        cursor: 'pointer',
        bgcolor: selected ? alpha(accent, theme.palette.mode === 'dark' ? 0.12 : 0.08) : 'background.paper',
        transition: 'all 0.15s',
        '&:hover': {
          borderColor: selected ? accent : 'text.disabled',
          transform: 'translateY(-2px)',
        },
      }}
    >
      <Box sx={{ color: selected ? accent : 'text.secondary', mb: 1, '& svg': { fontSize: 24 } }}>
        {f.icon}
      </Box>
      <Typography sx={{ fontSize: 14, fontWeight: 600, color: 'text.primary', mb: 0.5 }}>
        {f.label}
      </Typography>
      <Typography sx={{ fontSize: 12.5, color: 'text.secondary', lineHeight: 1.5 }}>
        {f.desc}
      </Typography>
    </Box>
  )
}

/** In-lesson format tabs — switch the learning mode in place (re-generates). */
function LessonTabs({ active, disabled, onPick }: {
  active: UIFormat
  disabled: boolean
  onPick: (f: UIFormat) => void
}) {
  return (
    <Box sx={{ display: 'inline-flex', gap: 0.25, p: 0.4, borderRadius: 2.5, bgcolor: 'action.hover' }}>
      {FORMATS.map(f => {
        const on = active === f.id
        return (
          <Box
            key={f.id}
            component="button"
            data-testid={`lesson-tab-${f.id}`}
            aria-pressed={on}
            disabled={disabled}
            onClick={() => !on && !disabled && onPick(f.id)}
            sx={{
              display: 'flex', alignItems: 'center', gap: 0.5,
              height: 28, px: 1.25, borderRadius: 1.5, border: 0,
              fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600,
              cursor: disabled || on ? 'default' : 'pointer',
              bgcolor: on ? 'background.paper' : 'transparent',
              color: on ? 'text.primary' : 'text.secondary',
              boxShadow: on ? '0 1px 3px rgba(0,0,0,0.12)' : 'none',
              opacity: disabled && !on ? 0.5 : 1,
              transition: 'background 0.15s, color 0.15s',
              '&:hover': disabled || on ? {} : { color: 'text.primary' },
            }}
          >
            <Box sx={{ display: 'flex', '& svg': { fontSize: 15 } }}>{f.icon}</Box>
            {f.label}
          </Box>
        )
      })}
    </Box>
  )
}

/** Collapsed 44px strip for a lesson side-rail (vertical label + expand). */
function CollapsedRail({ label, side, onOpen }: {
  label: string; side: 'left' | 'right'; onOpen: () => void
}) {
  return (
    <Box sx={{
      width: 44, flexShrink: 0, display: { xs: 'none', md: 'flex' },
      flexDirection: 'column', alignItems: 'center', py: 1.5, gap: 1.5,
    }}>
      <Tooltip title="Expand panel" placement={side === 'left' ? 'right' : 'left'} arrow>
        <IconButton size="small" onClick={onOpen} sx={{ color: 'text.secondary' }}>
          {side === 'left' ? <ChevronRightIcon fontSize="small" /> : <ChevronLeftIcon fontSize="small" />}
        </IconButton>
      </Tooltip>
      <Typography sx={{
        writingMode: 'vertical-rl', transform: side === 'right' ? 'rotate(180deg)' : 'none',
        fontFamily: MONO, fontSize: 10, color: 'text.disabled', letterSpacing: '0.14em', textTransform: 'uppercase',
      }}>
        {label}
      </Typography>
    </Box>
  )
}

/**
 * Left rail — the derived lesson outline.
 *
 * For step-based formats (guided/animated) the parent passes `activeIndex` +
 * `onSelect`, turning the rail into a live table-of-contents: completed steps
 * show a check, the active step is highlighted, and clicking navigates. For
 * other formats it stays a read-only structural map.
 */
function OutlineRail({ items, format, activeIndex, onSelect, title, subtitle, onCollapse }: {
  items: OutlineItem[]
  format: UIFormat
  activeIndex?: number
  onSelect?: (index: number) => void
  title?: string
  subtitle?: string
  onCollapse: () => void
}) {
  const noun = format === 'quiz' ? 'questions'
    : format === 'flashcard' ? 'cards'
    : format === 'timeline' ? 'events'
    : format === 'mindmap' ? 'branches'
    : 'steps'
  const interactive = activeIndex !== undefined
  const doneCount = interactive ? Math.max(0, Math.min(activeIndex!, items.length)) : 0
  const TEAL = '#3A8D7A'

  return (
    <Box sx={{ width: 270, flexShrink: 0, overflowY: 'auto', p: 2.25, display: { xs: 'none', md: 'block' } }}>
      {title && (
        <Box sx={{ mb: 2 }}>
          <Typography sx={{ fontSize: 15, fontWeight: 700, lineHeight: 1.25, color: 'text.primary' }}>
            {title}
          </Typography>
          {subtitle && (
            <Typography sx={{ fontSize: 12, color: 'text.secondary', lineHeight: 1.5, mt: 0.5,
              display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
              {subtitle}
            </Typography>
          )}
        </Box>
      )}
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 1.25 }}>
        <Typography sx={{ flex: 1, fontFamily: MONO, fontSize: 10.5, color: 'text.disabled', letterSpacing: '0.12em' }}>
          OUTLINE · {items.length} {noun.toUpperCase()}
        </Typography>
        {interactive && (
          <Typography sx={{ fontFamily: MONO, fontSize: 10, color: 'text.disabled', mr: 0.5 }}>
            {doneCount}/{items.length}
          </Typography>
        )}
        <Tooltip title="Collapse" arrow>
          <IconButton size="small" onClick={onCollapse} sx={{ color: 'text.disabled' }}>
            <ChevronLeftIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>
      <Stack spacing={0.25}>
        {items.map((it) => {
          const done   = interactive && it.index < activeIndex!
          const active = interactive && it.index === activeIndex!
          return (
            <Box
              key={it.index}
              data-testid={`outline-item-${it.index}`}
              aria-current={active ? 'step' : undefined}
              onClick={interactive ? () => onSelect?.(it.index) : undefined}
              sx={{
                display: 'flex', gap: 1.25, alignItems: 'flex-start', p: 1, borderRadius: 2,
                cursor: interactive ? 'pointer' : 'default',
                bgcolor: active ? 'action.selected' : 'transparent',
                transition: 'background 0.15s',
                '&:hover': interactive ? { bgcolor: active ? 'action.selected' : 'action.hover' } : {},
              }}
            >
              <Box sx={{
                width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
                display: 'grid', placeItems: 'center',
                fontFamily: MONO, fontSize: 10, fontWeight: 700,
                bgcolor: done ? TEAL : active ? alpha(ACCENT, 0.15) : 'action.hover',
                color:   done ? '#fff' : active ? ACCENT : 'text.secondary',
                border:  active ? `1px solid ${ACCENT}` : 'none',
              }}>
                {done ? <CheckCircleIcon sx={{ fontSize: 13 }} /> : String(it.index + 1).padStart(2, '0')}
              </Box>
              <Box sx={{ minWidth: 0 }}>
                <Typography sx={{
                  fontSize: 13, fontWeight: active ? 600 : 500,
                  color: active ? 'text.primary' : 'text.secondary', lineHeight: 1.35,
                  display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                }}>
                  {it.label}
                </Typography>
                {it.sub && (
                  <Typography sx={{ fontFamily: MONO, fontSize: 10.5, color: 'text.disabled' }}>{it.sub}</Typography>
                )}
              </Box>
            </Box>
          )
        })}
      </Stack>
    </Box>
  )
}

/** Right rail — connected concepts derived from the lesson's recurring terms. */
function ConceptsRail({ concepts, onCollapse }: {
  concepts: string[]; onCollapse: () => void
}) {
  const dotColors = ['#7E8FB0', '#3A8D7A', '#C0905C', '#9AA56A', '#B86D76', '#7C8DB5']
  return (
    <Box sx={{ width: 256, flexShrink: 0, overflowY: 'auto', p: 2.25, display: { xs: 'none', lg: 'block' } }}>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 1.25 }}>
        <Typography sx={{ flex: 1, fontFamily: MONO, fontSize: 10.5, color: 'text.disabled', letterSpacing: '0.12em' }}>
          CONNECTED CONCEPTS
        </Typography>
        <Tooltip title="Collapse" arrow>
          <IconButton size="small" onClick={onCollapse} sx={{ color: 'text.disabled' }}>
            <ChevronRightIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>
      <Typography sx={{ fontSize: 12.5, color: 'text.secondary', lineHeight: 1.6, mb: 1.75 }}>
        Recurring ideas pulled from this lesson.
      </Typography>
      <Stack spacing={0.25}>
        {concepts.map((c, i) => (
          <Box key={c} sx={{ display: 'flex', gap: 1.25, alignItems: 'center', p: 1, borderRadius: 2 }}>
            <Box sx={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, bgcolor: dotColors[i % dotColors.length] }} />
            <Typography sx={{ fontSize: 13, color: 'text.primary', textTransform: 'capitalize' }}>{c}</Typography>
          </Box>
        ))}
      </Stack>
    </Box>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Extract plain text from a KB file (reads up to 3 pages, max 8 000 chars). */
async function fetchFileContext(kbId: string, fileId: string): Promise<string> {
  const parts: string[] = []
  let totalPages = 1
  for (let p = 1; p <= Math.min(totalPages, 3); p++) {
    const result = await readerApi.getContent(kbId, fileId, p)
    if (p === 1) totalPages = result.total_pages ?? 1
    const text = result.content.blocks
      .map(b => (Array.isArray(b.content) ? (b.content as string[]).join(' ') : (b.content as string)))
      .filter(Boolean)
      .join('\n')
    if (text) parts.push(text)
  }
  return parts.join('\n\n').slice(0, 8_000)
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function LearnPage() {
  const qc = useQueryClient()
  const theme = useTheme()
  const [searchParams, setSearchParams] = useSearchParams()

  // ── Form state ─────────────────────────────────────────────────────────────
  const [topic, setTopic]         = useState(() => searchParams.get('topic') ?? '')
  const [format, setFormat]       = useState<UIFormat>('guided')
  const [difficulty, setDifficulty] = useState<Difficulty>('intermediate')
  const [language, setLanguage]     = useState<string>('English')

  // ── Consume ?topic= URL param (set by Chat "Turn into lesson") ─────────────
  useEffect(() => {
    if (searchParams.get('topic')) {
      setSearchParams({}, { replace: true }) // clean URL after consuming
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Session / stream state ─────────────────────────────────────────────────
  const [activeSessionId, setActiveSessionId]   = useState<string | null>(null)
  const [streamingText, setStreamingText]         = useState('')
  const [streamingContent, setStreamingContent]   = useState<unknown>(null)
  const [isStreaming, setIsStreaming]             = useState(false)
  const [streamError, setStreamError]             = useState<string | null>(null)
  const [lastXP, setLastXP]                       = useState<number | null>(null)
  const [newBadges, setNewBadges]                 = useState<string[]>([])
  const [activeFormat, setActiveFormat]           = useState<UIFormat>('guided')

  // ── Hover state for sidebar delete ─────────────────────────────────────────
  const [hoveredSession, setHoveredSession] = useState<string | null>(null)

  // ── Source mode state ─────────────────────────────────────────────────────
  const [sourceMode, setSourceMode]               = useState<SourceMode>('topic')
  const [webUrl, setWebUrl]                       = useState('')
  const [uploadFile, setUploadFile]               = useState<File | null>(null)
  const [uploadText, setUploadText]               = useState('')
  const [selectedKbId, setSelectedKbId]           = useState('')
  const [selectedFileId, setSelectedFileId]       = useState('')
  const [isDragOver, setIsDragOver]               = useState(false)
  // Collapsed by default so the setup screen matches the lab's clean canvas
  // (icon rail + centered form); history is one click away via the expand chevron.
  const [sidebarOpen, setSidebarOpen]             = useState(false)

  // ── Lesson side-rails (Stage B.2) — collapsible outline + connected concepts ─
  const [outlineOpen, setOutlineOpen]   = useState(true)
  const [conceptsOpen, setConceptsOpen] = useState(true)
  // Active step for step-based formats (guided/animated) — lifted so the outline
  // rail can show done/active marks and navigate. Reset on new content.
  const [lessonStep, setLessonStep]     = useState(0)

  const abortRef    = useRef<AbortController | null>(null)
  const bottomRef   = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // ── Queries ─────────────────────────────────────────────────────────────────
  const { data: sessions = [] } = useQuery({
    queryKey: ['learn-sessions'],
    queryFn:  () => learnApi.listSessions(),
  })

  const { data: userStats, refetch: refetchStats } = useQuery({
    queryKey: ['learn-stats'],
    queryFn:  () => learnApi.getUserStats(),
  })

  const { data: activeSession } = useQuery({
    queryKey: ['learn-session', activeSessionId],
    queryFn:  () => learnApi.getSession(activeSessionId!),
    enabled:  !!activeSessionId && !isStreaming,
  })

  // KB source — list all KBs when in 'kb' mode
  const { data: kbList = [] } = useQuery({
    queryKey: ['kb-list'],
    queryFn:  () => kbApi.list(),
    enabled:  sourceMode === 'kb',
    staleTime: 60_000,
  })

  // KB source — list files once a KB is selected
  const { data: kbFiles = [] } = useQuery({
    queryKey: ['kb-files', selectedKbId],
    queryFn:  () => kbApi.listFiles(selectedKbId),
    enabled:  sourceMode === 'kb' && !!selectedKbId,
    staleTime: 30_000,
  })

  // ── Delete ─────────────────────────────────────────────────────────────────
  const deleteMutation = useMutation({
    mutationFn: (id: string) => learnApi.deleteSession(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['learn-sessions'] })
      setActiveSessionId(null)
      setStreamingText('')
      setStreamingContent(null)
    },
  })

  // Auto-scroll during text streaming
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [streamingText])

  // ── File upload handler ──────────────────────────────────────────────────────
  const handleFileRead = (file: File) => {
    setUploadFile(file)
    setUploadText('')
    const isTextLike = /\.(txt|md|markdown|csv|json|html?)$/i.test(file.name)
      || ['text/plain', 'text/markdown', 'text/csv', 'application/json', 'text/html'].includes(file.type)
    if (isTextLike) {
      const fr = new FileReader()
      fr.onload = e => setUploadText((e.target?.result as string).slice(0, 10_000))
      fr.readAsText(file)
    } else {
      setUploadText('__UNSUPPORTED__')
    }
    if (!topic) setTopic(file.name.replace(/\.[^/.]+$/, ''))
  }

  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFileRead(file)
  }

  // ── Stream handler ──────────────────────────────────────────────────────────
  // `overrideFormat` lets the in-lesson format tabs re-generate the SAME topic /
  // source / difficulty / language in a different format, switching the stage in
  // place (Stage B.2) — without re-opening the setup screen.
  const handleGenerate = async (overrideFormat?: UIFormat) => {
    if (isStreaming) return
    const genUIFormat: UIFormat = overrideFormat ?? format
    if (overrideFormat && overrideFormat !== format) setFormat(overrideFormat)

    // ── Resolve effective topic + source params ───────────────────────────────
    let effectiveTopic = topic.trim()
    let contextText    = ''
    let sourceType: SourceType = 'topic'
    let sourceRef: string | undefined

    if (sourceMode === 'kb') {
      if (!selectedKbId || !selectedFileId) return
      sourceType = 'kb_file'
      sourceRef  = selectedFileId
      if (!effectiveTopic) {
        const f = kbFiles.find(f => f.id === selectedFileId)
        effectiveTopic = f?.name.replace(/\.[^/.]+$/, '') ?? 'Knowledge Base'
      }
      try {
        contextText = await fetchFileContext(selectedKbId, selectedFileId)
      } catch { /* proceed without context */ }

    } else if (sourceMode === 'web') {
      if (!webUrl.trim()) return
      sourceType = 'url'
      sourceRef  = webUrl.trim()
      if (!effectiveTopic) {
        try { effectiveTopic = new URL(webUrl.trim()).hostname }
        catch { effectiveTopic = webUrl.trim() }
      }
      // context_text left empty — backend will fetch the URL

    } else if (sourceMode === 'wikipedia') {
      if (!effectiveTopic) return
      // Wikipedia = the article URL for the topic, fetched by the backend.
      sourceType = 'url'
      sourceRef  = wikipediaUrlFor(effectiveTopic)
      // context_text left empty — backend will fetch the article

    } else if (sourceMode === 'upload') {
      if (!uploadText || uploadText === '__UNSUPPORTED__') return
      sourceType  = 'upload'
      contextText = uploadText
      if (!effectiveTopic && uploadFile) {
        effectiveTopic = uploadFile.name.replace(/\.[^/.]+$/, '')
      }

    } else {
      // 'topic' mode
      if (!effectiveTopic) return
    }

    if (!effectiveTopic) return

    // Update topic in state so the header shows it
    if (effectiveTopic !== topic) setTopic(effectiveTopic)

    setIsStreaming(true)
    setStreamError(null)
    setStreamingText('')
    setStreamingContent(null)
    setLastXP(null)
    setNewBadges([])
    setActiveSessionId(null)
    setActiveFormat(genUIFormat)
    setLessonStep(0)

    const controller  = new AbortController()
    abortRef.current  = controller
    let accumulatedText = ''
    let accumulatedJson = ''
    // 'animated' generates guided content; only the presentation differs.
    const genFormat = backendFormatFor(genUIFormat)
    const isJson = isObjectFormat(genFormat)

    try {
      await learnApi.streamSession(
        effectiveTopic,
        genFormat,
        difficulty,
        (event) => {
          if (event.type === 'token') {
            if (isJson) {
              accumulatedJson += event.content
            } else {
              accumulatedText += event.content
              setStreamingText(accumulatedText)
            }
          } else if (event.type === 'done') {
            setActiveSessionId(event.session_id)
            setLastXP(event.xp_earned)
            setNewBadges(event.new_badges)
            if (isJson && accumulatedJson) {
              try { setStreamingContent(JSON.parse(accumulatedJson)) }
              catch { setStreamError('Failed to parse generated content.') }
            } else if (!isJson) {
              setStreamingContent({ text: accumulatedText })
            }
            qc.invalidateQueries({ queryKey: ['learn-sessions'] })
            refetchStats()
          } else if (event.type === 'error') {
            setStreamError(event.error)
          }
        },
        controller.signal,
        sourceType,
        sourceRef,
        contextText,
        language,
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

  const handleLoadSession = (session: LearnSession) => {
    setActiveSessionId(session.id)
    setActiveFormat(session.format)
    setLessonStep(0)
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

  const handleXPEarned = (xp: number) => {
    refetchStats()
    setLastXP(prev => (prev ?? 0) + xp)
  }

  const handleNew = () => {
    setActiveSessionId(null)
    setStreamingText('')
    setStreamingContent(null)
    setStreamError(null)
    setLastXP(null)
    setNewBadges([])
    setLessonStep(0)
    setTopic('')
    setWebUrl('')
    setUploadFile(null)
    setUploadText('')
    setSelectedKbId('')
    setSelectedFileId('')
  }

  // Derived display state
  const displayContent = streamingContent ?? activeSession?.content
  const displayFormat  = activeSessionId ? activeFormat : format
  const displayText    = streamingText || (displayContent as TextContent)?.text || ''
  const isJsonFormat   = isObjectFormat(displayFormat)
  const hasContent     = !!(displayContent || streamingText)
  const selectedDiff   = DIFFICULTIES.find(d => d.id === difficulty)!
  const lessonActive   = hasContent && !isStreaming

  // Derived lesson rails — structural outline + recurring concepts (no fake data).
  const outline  = useMemo(() => lessonOutline(displayFormat, displayContent), [displayFormat, displayContent])
  const concepts = useMemo(() => lessonConcepts(displayFormat, displayContent), [displayFormat, displayContent])
  // Step-based formats get a live, navigable outline (active/done states).
  const isStepFormat = displayFormat === 'guided' || displayFormat === 'animated'
  const lessonIntro  = isStepFormat ? (displayContent as GuidedContent | undefined)?.intro : undefined

  const isGenerateEnabled = !isStreaming && (() => {
    switch (sourceMode) {
      case 'topic':     return !!topic.trim()
      case 'web':       return !!webUrl.trim()
      case 'wikipedia': return !!topic.trim()
      case 'kb':        return !!selectedKbId && !!selectedFileId
      case 'upload':    return !!uploadText && uploadText !== '__UNSUPPORTED__'
      default:       return false
    }
  })()

  // ─── Render ─────────────────────────────────────────────────────────────────
  return (
    <Box sx={{ display: 'flex', height: '100%', overflow: 'hidden' }}>

      {/* ═══════════════════ LEFT SIDEBAR ═══════════════════ */}
      <Box sx={{
        width: sidebarOpen ? 240 : 0,
        flexShrink: 0,
        borderRight: sidebarOpen ? `1px solid ${theme.palette.divider}` : 'none',
        transition: 'width 0.22s cubic-bezier(0.4, 0, 0.2, 1)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        bgcolor: theme.palette.mode === 'dark'
          ? 'rgba(14,13,20,0.6)'
          : 'rgba(249,248,245,0.8)',
      }}>
        {/* Sidebar header: label + collapse button */}
        <Box sx={{ px: 2, pt: 1.5, pb: 0.75, display: 'flex', alignItems: 'center', justifyContent: 'space-between', minWidth: 240 }}>
          <Typography sx={{
            fontFamily: MONO,
            fontSize: 9.5,
            textTransform: 'uppercase',
            letterSpacing: '0.13em',
            color: 'text.disabled',
            fontWeight: 500,
          }}>
            Learn
          </Typography>
          <Tooltip title="Collapse sidebar" placement="right">
            <IconButton
              size="small"
              onClick={() => setSidebarOpen(false)}
              sx={{ p: 0.3, color: 'text.disabled', '&:hover': { color: 'text.primary', bgcolor: 'action.hover' } }}
            >
              <ChevronLeftIcon sx={{ fontSize: 15 }} />
            </IconButton>
          </Tooltip>
        </Box>

        {/* Stats */}
        {userStats && <StatsBar stats={userStats} />}

        {/* Badges strip */}
        {userStats && userStats.badges.length > 0 && (
          <Box sx={{ px: 1.75, py: 1, borderBottom: 1, borderColor: 'divider' }}>
            <Typography sx={{ fontSize: 10.5, color: 'text.disabled', fontFamily: MONO, textTransform: 'uppercase', letterSpacing: '0.1em', mb: 0.75 }}>
              Badges
            </Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
              {userStats.badges.map(b => (
                <Tooltip key={b} title={BADGE_LABELS[b] ?? b} placement="right">
                  <Box
                    sx={{
                      fontSize: 16, cursor: 'default', lineHeight: 1,
                      transition: 'transform 0.15s',
                      '&:hover': { transform: 'scale(1.25)' },
                    }}
                  >
                    {BADGE_LABELS[b]?.split(' ')[0] ?? '🏅'}
                  </Box>
                </Tooltip>
              ))}
            </Box>
          </Box>
        )}

        {/* Session history */}
        <Box sx={{ flex: 1, overflowY: 'auto' }}>
          <Box sx={{ px: 2, pt: 1.25, pb: 0.5, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Typography sx={{ fontSize: 10.5, color: 'text.disabled', fontFamily: MONO, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
              History
            </Typography>
            {sessions.length > 0 && (
              <Typography sx={{ fontSize: 10, color: 'text.disabled' }}>
                {sessions.length}
              </Typography>
            )}
          </Box>

          {sessions.length === 0 ? (
            <Box sx={{ px: 2, py: 1 }}>
              <Typography sx={{ fontSize: 12, color: 'text.disabled', lineHeight: 1.5 }}>
                Your sessions will appear here
              </Typography>
            </Box>
          ) : (
            <List dense disablePadding>
              {sessions.map(s => (
                <ListItemButton
                  key={s.id}
                  selected={s.id === activeSessionId}
                  onClick={() => handleLoadSession(s)}
                  onMouseEnter={() => setHoveredSession(s.id)}
                  onMouseLeave={() => setHoveredSession(null)}
                  sx={{
                    py: 0.85, px: 1.75, pr: 1,
                    '&.Mui-selected': {
                      bgcolor: alpha(theme.palette.primary.main, 0.1),
                    },
                  }}
                >
                  <ListItemIcon sx={{ minWidth: 26, color: 'text.disabled' }}>
                    {FORMAT_ICON_MAP[s.format]}
                  </ListItemIcon>
                  <ListItemText
                    primary={s.topic}
                    secondary={`${s.format} · ${s.difficulty}`}
                    primaryTypographyProps={{ sx: { fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }}
                    secondaryTypographyProps={{ sx: { fontSize: 10.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }}
                  />
                  <IconButton
                    size="small"
                    aria-label="Delete session"
                    onClick={(e) => { e.stopPropagation(); deleteMutation.mutate(s.id) }}
                    sx={{
                      opacity: hoveredSession === s.id ? 1 : 0,
                      transition: 'opacity 0.15s',
                      color: 'text.disabled',
                      p: 0.25,
                      '&:hover': { color: 'error.main', bgcolor: 'transparent' },
                    }}
                  >
                    <DeleteOutlineIcon sx={{ fontSize: 14 }} />
                  </IconButton>
                </ListItemButton>
              ))}
            </List>
          )}
        </Box>
      </Box>

      {/* ═══════════════════ MAIN AREA ═══════════════════ */}
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}>

        {/* Expand sidebar button — shown only when sidebar is closed */}
        {!sidebarOpen && (
          <Tooltip title="Expand sidebar" placement="right" arrow>
            <IconButton
              size="small"
              onClick={() => setSidebarOpen(true)}
              sx={{
                position: 'absolute',
                top: 14,
                left: 0,
                zIndex: 10,
                p: 0.4,
                borderRadius: '0 6px 6px 0',
                border: `1px solid ${theme.palette.divider}`,
                borderLeft: 'none',
                bgcolor: theme.palette.mode === 'dark' ? 'rgba(14,13,20,0.85)' : 'rgba(249,248,245,0.95)',
                color: 'text.disabled',
                boxShadow: '2px 0 8px rgba(0,0,0,0.08)',
                transition: 'all 0.15s',
                '&:hover': {
                  color: 'text.primary',
                  bgcolor: 'action.hover',
                  boxShadow: '2px 0 12px rgba(0,0,0,0.14)',
                },
              }}
            >
              <ChevronRightIcon sx={{ fontSize: 15 }} />
            </IconButton>
          </Tooltip>
        )}

        {/* ─── Header ─────────────────────────────────────────────────────────── */}
        <Box sx={{
          flexShrink: 0,
          px: 2.5,
          pt: hasContent && !isStreaming ? 1.25 : 2,
          pb: hasContent && !isStreaming ? 0.75 : 1.5,
          borderBottom: `1px solid ${theme.palette.divider}`,
        }}>
          {/* Center the setup form to a readable column (lab); full-width in a lesson. */}
          <Box sx={{ maxWidth: lessonActive ? 'none' : 880, mx: lessonActive ? 0 : 'auto' }}>
          {/* Title row */}
          <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5, mb: hasContent && !isStreaming ? 0 : 1, flexWrap: 'wrap' }}>
            {hasContent ? (
              <Box>
                <Typography component="h1" sx={{
                  fontFamily: SERIF,
                  fontWeight: 400,
                  fontSize: hasContent && !isStreaming ? 22 : 28,
                  letterSpacing: '-0.01em',
                  lineHeight: 1.15,
                }}>
                  {topic || 'Learning session'}
                </Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mt: 0.5 }}>
                  <Box sx={{ color: 'text.disabled', display: 'flex', fontSize: 14 }}>
                    {FORMAT_ICON_MAP[displayFormat]}
                  </Box>
                  <Typography sx={{ fontSize: 12.5, color: 'text.secondary', textTransform: 'capitalize' }}>
                    {displayFormat}
                  </Typography>
                  <Box sx={{
                    px: 0.75, py: 0.1,
                    borderRadius: 0.75,
                    bgcolor: selectedDiff.bg,
                    border: `1px solid ${alpha(selectedDiff.color, 0.3)}`,
                  }}>
                    <Typography sx={{ fontSize: 10.5, fontWeight: 600, color: selectedDiff.color }}>
                      {difficulty}
                    </Typography>
                  </Box>
                </Box>
              </Box>
            ) : (
              <Box>
                <Typography sx={{
                  fontFamily: MONO, fontSize: 11, letterSpacing: '0.12em',
                  color: 'text.disabled', mb: 0.75,
                }}>
                  — LEARN
                </Typography>
                <Typography component="h1" sx={{
                  fontWeight: 700,
                  fontSize: { xs: 24, sm: 28, md: 32 },
                  letterSpacing: '-0.02em',
                  lineHeight: 1.05,
                }}>
                  What do you want to{' '}
                  <Box component="em" sx={{ fontStyle: 'normal', color: 'primary.main' }}>
                    learn
                  </Box>
                  ?
                </Typography>
              </Box>
            )}
            {hasContent && !isStreaming && (
              <Button
                variant="text"
                size="small"
                onClick={handleNew}
                sx={{ ml: 'auto', color: 'text.secondary', fontSize: 12, height: 32, alignSelf: 'flex-start' }}
              >
                New session
              </Button>
            )}
          </Box>

          {/* In-lesson format tabs — switch the mode in place (re-generates) */}
          {lessonActive && (
            <Box sx={{ mt: 1 }}>
              <LessonTabs active={displayFormat} disabled={isStreaming} onPick={handleGenerate} />
            </Box>
          )}

          {/* ── Source mode selector + input ──────────────────────────────────── */}
          {/* Hidden when content is showing — frees vertical space for the learning panel */}
          {!(hasContent && !isStreaming) && <Box sx={{ mb: 1.25 }}>
            {/* Source mode pills */}
            <Box sx={{ display: 'flex', gap: 0.5, mb: 0.75, flexWrap: 'wrap' }}>
              {SOURCE_MODES.map(sm => {
                const active = sourceMode === sm.id
                return (
                  <Tooltip key={sm.id} title={sm.tip} placement="top" arrow>
                    <Box
                      onClick={() => !isStreaming && setSourceMode(sm.id)}
                      sx={{
                        display: 'flex', alignItems: 'center', gap: 0.5,
                        px: 1.1, py: 0.35,
                        borderRadius: 1,
                        border: '1px solid',
                        borderColor: active ? 'primary.main' : 'divider',
                        bgcolor: active ? alpha(ACCENT, theme.palette.mode === 'dark' ? 0.18 : 0.08) : 'transparent',
                        cursor: isStreaming ? 'default' : 'pointer',
                        transition: 'all 0.15s',
                        fontSize: 13,
                        '&:hover': isStreaming ? {} : {
                          borderColor: 'primary.main',
                          bgcolor: alpha(ACCENT, theme.palette.mode === 'dark' ? 0.12 : 0.05),
                        },
                      }}
                    >
                      <Box sx={{ fontSize: 13, color: active ? 'primary.main' : 'text.disabled', display: 'flex', lineHeight: 1 }}>
                        {sm.icon}
                      </Box>
                      <Typography sx={{ fontSize: 11.5, fontWeight: active ? 600 : 400, color: active ? 'primary.main' : 'text.secondary', lineHeight: 1 }}>
                        {sm.label}
                      </Typography>
                    </Box>
                  </Tooltip>
                )
              })}
            </Box>

            {/* Source input + action button */}
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start', flexWrap: 'wrap' }}>

              {/* ── Input area (changes per source mode) ── */}
              <Box sx={{ flex: 1, minWidth: 200 }}>

                {/* TOPIC mode */}
                {sourceMode === 'topic' && (
                  <TextField
                    placeholder="What do you want to learn?"
                    value={topic}
                    onChange={e => setTopic(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && !e.shiftKey && isGenerateEnabled && handleGenerate()}
                    size="small"
                    disabled={isStreaming}
                    fullWidth
                    sx={{ '& .MuiOutlinedInput-root': { fontSize: 13 } }}
                  />
                )}

                {/* WIKIPEDIA mode — fetches the article via the URL source */}
                {sourceMode === 'wikipedia' && (
                  <TextField
                    placeholder="Wikipedia article or topic (e.g. Photosynthesis)"
                    value={topic}
                    onChange={e => setTopic(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && !e.shiftKey && isGenerateEnabled && handleGenerate()}
                    size="small"
                    disabled={isStreaming}
                    fullWidth
                    InputProps={{
                      startAdornment: (
                        <InputAdornment position="start">
                          <MenuBookIcon sx={{ fontSize: 15, color: 'text.disabled' }} />
                        </InputAdornment>
                      ),
                    }}
                    sx={{ '& .MuiOutlinedInput-root': { fontSize: 13 } }}
                  />
                )}

                {/* WEB mode */}
                {sourceMode === 'web' && (
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.6 }}>
                    <TextField
                      placeholder="https://example.com/article"
                      value={webUrl}
                      onChange={e => setWebUrl(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && !e.shiftKey && isGenerateEnabled && handleGenerate()}
                      size="small"
                      disabled={isStreaming}
                      fullWidth
                      InputProps={{
                        startAdornment: (
                          <InputAdornment position="start">
                            <LanguageIcon sx={{ fontSize: 15, color: 'text.disabled' }} />
                          </InputAdornment>
                        ),
                      }}
                      sx={{ '& .MuiOutlinedInput-root': { fontSize: 13 } }}
                    />
                    <TextField
                      placeholder="What to focus on (optional — leave blank to learn the full page)"
                      value={topic}
                      onChange={e => setTopic(e.target.value)}
                      size="small"
                      disabled={isStreaming}
                      fullWidth
                      sx={{ '& .MuiOutlinedInput-root': { fontSize: 12 } }}
                    />
                  </Box>
                )}

                {/* LIBRARY (KB) mode */}
                {sourceMode === 'kb' && (
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.6 }}>
                    <Box sx={{ display: 'flex', gap: 0.75 }}>
                      <FormControl size="small" sx={{ flex: 1 }} disabled={isStreaming}>
                        <InputLabel sx={{ fontSize: 12 }}>Knowledge Base</InputLabel>
                        <Select
                          label="Knowledge Base"
                          value={selectedKbId}
                          onChange={e => { setSelectedKbId(e.target.value as string); setSelectedFileId('') }}
                          sx={{ fontSize: 13 }}
                        >
                          {kbList.length === 0 && (
                            <MenuItem value="" disabled sx={{ fontSize: 12, color: 'text.disabled' }}>
                              No knowledge bases yet
                            </MenuItem>
                          )}
                          {kbList.map(kb => (
                            <MenuItem key={kb.id} value={kb.id} sx={{ fontSize: 13 }}>
                              {kb.name}
                            </MenuItem>
                          ))}
                        </Select>
                      </FormControl>
                      <FormControl size="small" sx={{ flex: 1 }} disabled={!selectedKbId || isStreaming}>
                        <InputLabel sx={{ fontSize: 12 }}>File</InputLabel>
                        <Select
                          label="File"
                          value={selectedFileId}
                          onChange={e => {
                            const fid = e.target.value as string
                            setSelectedFileId(fid)
                            const f = kbFiles.find(f => f.id === fid)
                            if (f && !topic) setTopic(f.name.replace(/\.[^/.]+$/, ''))
                          }}
                          sx={{ fontSize: 13 }}
                        >
                          {kbFiles.filter(f => f.status === 'ready').length === 0 && (
                            <MenuItem value="" disabled sx={{ fontSize: 12, color: 'text.disabled' }}>
                              {selectedKbId ? 'No ready files' : 'Pick a KB first'}
                            </MenuItem>
                          )}
                          {kbFiles.filter(f => f.status === 'ready').map(f => (
                            <MenuItem key={f.id} value={f.id} sx={{ fontSize: 13 }}>
                              {f.name}
                            </MenuItem>
                          ))}
                        </Select>
                      </FormControl>
                    </Box>
                    <TextField
                      placeholder="What to focus on (optional — leave blank to learn about the whole file)"
                      value={topic}
                      onChange={e => setTopic(e.target.value)}
                      size="small"
                      disabled={isStreaming}
                      fullWidth
                      sx={{ '& .MuiOutlinedInput-root': { fontSize: 12 } }}
                    />
                  </Box>
                )}

                {/* UPLOAD mode */}
                {sourceMode === 'upload' && (
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.6 }}>
                    {/* Hidden file input */}
                    <input
                      ref={fileInputRef}
                      type="file"
                      hidden
                      accept=".txt,.md,.markdown,.csv,.json,.html,.htm"
                      onChange={e => { const f = e.target.files?.[0]; if (f) handleFileRead(f) }}
                    />
                    {/* Drop zone */}
                    <Box
                      onDragOver={e => { e.preventDefault(); setIsDragOver(true) }}
                      onDragLeave={() => setIsDragOver(false)}
                      onDrop={handleFileDrop}
                      onClick={() => !isStreaming && fileInputRef.current?.click()}
                      sx={{
                        border: '1.5px dashed',
                        borderColor: isDragOver ? 'primary.main' : uploadFile ? alpha('#10B981', 0.6) : 'divider',
                        borderRadius: 1.5,
                        py: 1.25, px: 1.5,
                        textAlign: 'center',
                        cursor: isStreaming ? 'default' : 'pointer',
                        transition: 'all 0.15s',
                        bgcolor: isDragOver
                          ? alpha(ACCENT, 0.06)
                          : uploadFile
                          ? alpha('#10B981', 0.05)
                          : 'transparent',
                        '&:hover': isStreaming ? {} : {
                          borderColor: 'primary.main',
                          bgcolor: alpha(ACCENT, 0.04),
                        },
                      }}
                    >
                      {uploadFile ? (
                        <Box>
                          <Typography sx={{ fontSize: 12.5, color: '#10B981', fontWeight: 600 }}>
                            📎 {uploadFile.name}
                          </Typography>
                          <Typography sx={{ fontSize: 11, color: 'text.disabled', mt: 0.25 }}>
                            {uploadText === '__UNSUPPORTED__'
                              ? 'Unsupported format — use .txt, .md, .json, or .csv'
                              : `${uploadText.length.toLocaleString()} characters extracted`}
                          </Typography>
                        </Box>
                      ) : (
                        <Box>
                          <UploadFileIcon sx={{ fontSize: 20, color: 'text.disabled', mb: 0.25 }} />
                          <Typography sx={{ fontSize: 12.5, color: 'text.secondary' }}>
                            Drop a file here or click to upload
                          </Typography>
                          <Typography sx={{ fontSize: 11, color: 'text.disabled', mt: 0.25 }}>
                            .txt · .md · .json · .csv · .html
                          </Typography>
                        </Box>
                      )}
                    </Box>
                    {uploadText === '__UNSUPPORTED__' && (
                      <Alert severity="warning" sx={{ py: 0.25, fontSize: 12, borderRadius: 1.5 }}>
                        File format not supported for direct upload. Add the file to a Knowledge Base instead and use Library mode.
                      </Alert>
                    )}
                    <TextField
                      placeholder="What to focus on (optional — leave blank to learn about the whole document)"
                      value={topic}
                      onChange={e => setTopic(e.target.value)}
                      size="small"
                      disabled={isStreaming}
                      fullWidth
                      sx={{ '& .MuiOutlinedInput-root': { fontSize: 12 } }}
                    />
                  </Box>
                )}
              </Box>

              {/* ── Generate / Stop button ── */}
              <Box sx={{ flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                {isStreaming ? (
                  <Button
                    variant="outlined"
                    color="error"
                    size="small"
                    startIcon={<StopIcon sx={{ fontSize: 14 }} />}
                    onClick={() => abortRef.current?.abort()}
                    sx={{ height: 36, fontSize: 12 }}
                  >
                    Stop
                  </Button>
                ) : (
                  <Button
                    variant="contained"
                    size="small"
                    disabled={!isGenerateEnabled}
                    onClick={() => handleGenerate()}
                    endIcon={<ArrowForwardIcon sx={{ fontSize: 14 }} />}
                    sx={{ height: 36, fontSize: 12, px: 1.75 }}
                  >
                    Generate
                  </Button>
                )}
              </Box>

            </Box>
          </Box>}
          </Box>{/* end centered setup column */}

        </Box>

        {/* ─── Content area (+ lesson rails) ──────────────────────────────────── */}
        <Box sx={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>

          {/* Left rail — derived lesson outline */}
          {lessonActive && outline.length > 0 && (
            outlineOpen
              ? <OutlineRail
                  items={outline}
                  format={displayFormat}
                  activeIndex={isStepFormat ? Math.min(lessonStep, outline.length - 1) : undefined}
                  onSelect={isStepFormat ? setLessonStep : undefined}
                  title={topic || undefined}
                  subtitle={lessonIntro}
                  onCollapse={() => setOutlineOpen(false)}
                />
              : <CollapsedRail label={`Outline · ${outline.length}`} side="left" onOpen={() => setOutlineOpen(true)} />
          )}

          {/* Center — streaming / error / content views */}
          <Box data-testid="lesson-stage" sx={{ flex: 1, overflowY: 'auto', p: hasContent && !isStreaming ? 2 : 3 }}>

          {/* Streaming indicator */}
          {isStreaming && (
            <Box sx={{ mb: 2.5 }}>
              <LinearProgress sx={{ mb: 1, borderRadius: 4, height: 2 }} />
              <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>
                Generating <strong>{format}</strong> on "{topic}"…
              </Typography>
            </Box>
          )}

          {/* Error */}
          {streamError && (
            <Alert
              severity="error"
              sx={{ mb: 2.5, borderRadius: 2 }}
              onClose={() => setStreamError(null)}
            >
              {streamError}
            </Alert>
          )}

          {/* XP / badge celebration */}
          {lastXP !== null && lastXP > 0 && (
            <Alert
              severity="success"
              icon={<EmojiEventsIcon />}
              sx={{ mb: 2.5, borderRadius: 2 }}
              onClose={() => { setLastXP(null); setNewBadges([]) }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                <Typography sx={{ fontSize: 13.5, fontWeight: 700 }}>+{lastXP} XP earned!</Typography>
                {newBadges.map(b => (
                  <Chip
                    key={b}
                    label={BADGE_LABELS[b] ?? b}
                    size="small"
                    sx={{ bgcolor: '#F59E0B', color: '#fff', fontSize: 11, height: 22 }}
                  />
                ))}
              </Box>
            </Alert>
          )}

          {/* ── EMPTY STATE ─────────────────────────────────────────────────── */}
          {!isStreaming && !hasContent && !streamError && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3.5, maxWidth: 860, mx: 'auto', width: '100%' }}>
              {/* Format card grid (lab: FORMAT eyebrow + 3-col, left-aligned) */}
              <Box>
                <Typography sx={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: '0.12em', color: 'text.disabled', mb: 1.5 }}>
                  FORMAT
                </Typography>
                <Box sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: '1fr 1fr 1fr' } }}>
                  {FORMATS.map(f => (
                    <FormatCard
                      key={f.id}
                      f={f}
                      selected={format === f.id}
                      onClick={() => setFormat(f.id)}
                    />
                  ))}
                </Box>
              </Box>

              {/* Difficulty */}
              <Box>
                <Typography sx={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: '0.12em', color: 'text.disabled', mb: 1 }}>
                  DIFFICULTY
                </Typography>
                <Box sx={{ display: 'flex', gap: 1 }}>
                  {DIFFICULTIES.map(d => (
                    <Box
                      key={d.id}
                      onClick={() => setDifficulty(d.id)}
                      sx={{
                        px: 1.5, py: 0.6,
                        borderRadius: 1.5,
                        border: `1.5px solid`,
                        borderColor: difficulty === d.id ? d.color : 'divider',
                        bgcolor: difficulty === d.id ? d.bg : 'transparent',
                        cursor: 'pointer',
                        transition: 'all 0.15s',
                        '&:hover': { borderColor: d.color },
                      }}
                    >
                      <Typography sx={{ fontSize: 13, fontWeight: 600, color: difficulty === d.id ? d.color : 'text.secondary' }}>
                        {d.label}
                      </Typography>
                    </Box>
                  ))}
                </Box>
              </Box>

              {/* Language (generate-in-language) — pills, matching the lab */}
              <Box>
                <Typography sx={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: '0.12em', color: 'text.disabled', mb: 1, display: 'flex', alignItems: 'center', gap: 0.75 }}>
                  <TranslateIcon sx={{ fontSize: 13 }} /> LANGUAGE
                </Typography>
                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                  {LANGUAGES.map(l => {
                    const active = language === l
                    return (
                      <Box
                        key={l}
                        onClick={() => setLanguage(l)}
                        sx={{
                          px: 1.5, py: 0.6,
                          borderRadius: 1.5,
                          border: '1.5px solid',
                          borderColor: active ? 'primary.main' : 'divider',
                          bgcolor: active ? alpha(ACCENT, theme.palette.mode === 'dark' ? 0.16 : 0.08) : 'transparent',
                          cursor: 'pointer',
                          transition: 'all 0.15s',
                          '&:hover': { borderColor: 'primary.main' },
                        }}
                      >
                        <Typography sx={{ fontSize: 13, fontWeight: active ? 700 : 500, color: active ? 'primary.main' : 'text.secondary' }}>
                          {l}
                        </Typography>
                      </Box>
                    )
                  })}
                </Box>
              </Box>
            </Box>
          )}

          {/* ── TEXT FORMATS (streaming or loaded) ─────────────────────────── */}
          {!isJsonFormat && (displayText || isStreaming) && (
            <Paper
              variant="outlined"
              sx={{ p: 3.5, borderRadius: 2.5, maxWidth: 760, borderColor: 'divider' }}
            >
              <TextContentView text={displayText} />
              {isStreaming && (
                <Box sx={{
                  display: 'inline-block',
                  width: 2, height: 18,
                  bgcolor: 'primary.main',
                  ml: 0.5, mb: '-3px',
                  '@keyframes blink': { '0%,100%': { opacity: 1 }, '50%': { opacity: 0 } },
                  animation: 'blink 1s step-end infinite',
                }} />
              )}
            </Paper>
          )}

          {/* ── JSON FORMATS — shown after stream done ─────────────────────── */}
          {isJsonFormat && displayContent && (
            <Box sx={{ maxWidth: displayFormat === 'guided' ? 'none' : 760 }}>
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
                <Paper variant="outlined" sx={{ p: 3, borderRadius: 2.5 }}>
                  <Typography sx={{ fontSize: 20, fontWeight: 700, fontFamily: SERIF, mb: 2 }}>
                    {(displayContent as MindmapContent).root}
                  </Typography>
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.25 }}>
                    {(displayContent as MindmapContent).branches.map((branch, i) => (
                      <MindmapNodeView key={i} node={branch} depth={1} />
                    ))}
                  </Box>
                </Paper>
              )}
              {displayFormat === 'timeline' && (
                <Paper variant="outlined" sx={{ p: 3, borderRadius: 2.5 }}>
                  <Typography sx={{ fontSize: 20, fontWeight: 700, fontFamily: SERIF, mb: 2.5 }}>
                    Timeline
                  </Typography>
                  <TimelineView content={displayContent as TimelineContent} />
                </Paper>
              )}
              {displayFormat === 'guided' && (
                <GuidedViewer content={displayContent as GuidedContent} activeStep={lessonStep} onStepChange={setLessonStep} />
              )}
              {displayFormat === 'animated' && (
                <AnimatedView content={displayContent as GuidedContent} activeStep={lessonStep} onStepChange={setLessonStep} />
              )}
            </Box>
          )}

          {/* ── JSON streaming indicator ────────────────────────────────────── */}
          {isJsonFormat && isStreaming && (
            <Box sx={{
              display: 'flex', alignItems: 'center', gap: 1.5,
              color: 'text.secondary', py: 2,
            }}>
              <CircularProgress size={18} thickness={3} />
              <Typography sx={{ fontSize: 13.5 }}>
                Building your {displayFormat}…
              </Typography>
            </Box>
          )}

          <Box ref={bottomRef} />
          </Box>

          {/* Right rail — connected concepts derived from the lesson */}
          {lessonActive && concepts.length > 0 && (
            conceptsOpen
              ? <ConceptsRail concepts={concepts} onCollapse={() => setConceptsOpen(false)} />
              : <CollapsedRail label="Concepts" side="right" onOpen={() => setConceptsOpen(true)} />
          )}
        </Box>
      </Box>
    </Box>
  )
}
