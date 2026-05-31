/**
 * GuidedViewer — interactive personal-tutor lesson player
 *
 * Phase state machine per step:
 *   reading  → learner reads the content sections
 *   checking → MCQ quiz_check appears (if present)
 *   pacing   → emoji pace-check every 3 steps
 *   (advance to next step or completion)
 *
 * Animations:
 *   slideInRight / slideInLeft   — step transitions
 *   fadeInUp with stagger        — section cascade entrance
 *   pulseGlow                    — breathing dot on active step
 *   shake                        — wrong answer feedback
 *   bounceIn                     — correct answer celebration
 *   confettiBurst                — confetti particles on correct / completion
 */

import { useRef, useState } from 'react'
import {
  Box,
  Button,
  Chip,
  IconButton,
  LinearProgress,
  Typography,
  alpha,
  useTheme,
} from '@mui/material'
import LightbulbIcon          from '@mui/icons-material/Lightbulb'
import CodeIcon                from '@mui/icons-material/Code'
import CompareArrowsIcon       from '@mui/icons-material/CompareArrows'
import StarBorderIcon          from '@mui/icons-material/StarBorder'
import HelpOutlineIcon         from '@mui/icons-material/HelpOutline'
import ArrowBackIcon           from '@mui/icons-material/ArrowBack'
import ArrowForwardIcon        from '@mui/icons-material/ArrowForward'
import CheckCircleOutlineIcon  from '@mui/icons-material/CheckCircleOutline'
import CheckCircleIcon         from '@mui/icons-material/CheckCircle'
import CancelIcon              from '@mui/icons-material/Cancel'
import SchoolIcon              from '@mui/icons-material/School'
import TipsAndUpdatesIcon      from '@mui/icons-material/TipsAndUpdates'
import type { GuidedContent, QuizCheck } from '../../api/learn.api'
import AnimatedBeat from './AnimatedBeat'

const SERIF = '"Instrument Serif", Georgia, serif'
const MONO  = '"IBM Plex Mono", "Geist Mono", monospace'

// How often to show a pace check (every N steps completed)
const PACE_EVERY = 3

// ─── Confetti burst ───────────────────────────────────────────────────────────

const CONFETTI_COLORS = ['#6366F1', '#10B981', '#F59E0B', '#0EA5E9', '#EC4899', '#8B5CF6', '#F97316']

function ConfettiBurst({ active }: { active: boolean }) {
  if (!active) return null
  const pieces = Array.from({ length: 24 }, (_, i) => ({
    id: i,
    color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
    x: (Math.random() - 0.5) * 260,
    y: -(60 + Math.random() * 120),
    rot: Math.random() * 720,
    delay: Math.random() * 0.3,
    size: 6 + Math.random() * 6,
  }))

  return (
    <Box sx={{
      position: 'absolute',
      top: '50%', left: '50%',
      pointerEvents: 'none',
      zIndex: 100,
    }}>
      {pieces.map(p => (
        <Box
          key={p.id}
          sx={{
            position: 'absolute',
            width:  p.size,
            height: p.size,
            borderRadius: Math.random() > 0.5 ? '50%' : 1,
            bgcolor: p.color,
            top: 0, left: 0,
            '@keyframes burst': {
              '0%':   { transform: 'translate(0,0) rotate(0deg)', opacity: 1 },
              '80%':  { opacity: 1 },
              '100%': { transform: `translate(${p.x}px,${p.y}px) rotate(${p.rot}deg)`, opacity: 0 },
            },
            animation: `burst 0.9s cubic-bezier(0.25, 0.46, 0.45, 0.94) ${p.delay}s forwards`,
          }}
        />
      ))}
    </Box>
  )
}

// Beat entrance animation lives in ./AnimatedBeat (consumes @/lib/motion).

// ─── MCQ quiz check ───────────────────────────────────────────────────────────

type AnswerState = 'idle' | 'correct' | 'wrong'

interface QuizPanelProps {
  quiz:       QuizCheck
  onContinue: () => void
}

function QuizPanel({ quiz, onContinue }: QuizPanelProps) {
  const theme    = useTheme()
  const isDark   = theme.palette.mode === 'dark'
  const [chosen,   setChosen]   = useState<number | null>(null)
  const [answered, setAnswered] = useState<AnswerState>('idle')
  const [showHint, setShowHint] = useState(false)
  const [confetti, setConfetti] = useState(false)
  const [canContinue, setCanContinue] = useState(false)

  function pick(idx: number) {
    if (answered !== 'idle') return
    setChosen(idx)
    const isCorrect = idx === quiz.correct
    setAnswered(isCorrect ? 'correct' : 'wrong')
    if (isCorrect) {
      setConfetti(true)
      setTimeout(() => setConfetti(false), 1200)
    }
    setTimeout(() => setCanContinue(true), 1400)
  }

  const borderFor = (i: number): string => {
    if (answered === 'idle' || chosen !== i) {
      return `1px solid ${theme.palette.divider}`
    }
    return answered === 'correct'
      ? `1px solid #10B981`
      : `1px solid #EF4444`
  }

  const bgFor = (i: number): string => {
    if (answered === 'idle' || chosen !== i) {
      return isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.025)'
    }
    return answered === 'correct'
      ? (isDark ? alpha('#10B981', 0.14) : alpha('#10B981', 0.10))
      : (isDark ? alpha('#EF4444', 0.14) : alpha('#EF4444', 0.10))
  }

  return (
    <Box sx={{
      p: 2.5, borderRadius: 2,
      bgcolor: isDark ? alpha('#6366F1', 0.06) : alpha('#6366F1', 0.04),
      border: `1px solid ${alpha('#6366F1', 0.22)}`,
      position: 'relative',
      '@keyframes slideInUp': {
        from: { opacity: 0, transform: 'translateY(20px)' },
        to:   { opacity: 1, transform: 'translateY(0)' },
      },
      animation: 'slideInUp 0.32s ease-out both',
    }}>
      {/* Confetti */}
      <Box sx={{ position: 'absolute', top: '40%', left: '50%', pointerEvents: 'none', zIndex: 10 }}>
        <ConfettiBurst active={confetti} />
      </Box>

      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.75 }}>
        <Box sx={{
          width: 24, height: 24, borderRadius: '50%',
          bgcolor: alpha('#6366F1', 0.15),
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <HelpOutlineIcon sx={{ fontSize: 13, color: '#6366F1' }} />
        </Box>
        <Typography sx={{ fontFamily: MONO, fontSize: 9.5, textTransform: 'uppercase', letterSpacing: '0.12em', color: '#6366F1' }}>
          Quick check
        </Typography>
      </Box>

      {/* Question */}
      <Typography sx={{ fontSize: 14, fontWeight: 600, lineHeight: 1.5, mb: 2, color: 'text.primary' }}>
        {quiz.question}
      </Typography>

      {/* Options */}
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        {quiz.options.map((opt, i) => {
          const isChosen  = chosen === i
          const isCorrect = i === quiz.correct
          const showTick  = answered !== 'idle' && isCorrect
          const showX     = answered === 'wrong' && isChosen && !isCorrect

          return (
            <Box
              key={i}
              onClick={() => pick(i)}
              sx={{
                display: 'flex', alignItems: 'center', gap: 1.25,
                p: '10px 14px',
                borderRadius: 1.5,
                border: borderFor(i),
                bgcolor: bgFor(i),
                cursor: answered === 'idle' ? 'pointer' : 'default',
                transition: 'all 0.18s',
                '@keyframes shake': {
                  '0%, 100%': { transform: 'translateX(0)' },
                  '20%':      { transform: 'translateX(-6px)' },
                  '40%':      { transform: 'translateX(6px)' },
                  '60%':      { transform: 'translateX(-4px)' },
                  '80%':      { transform: 'translateX(4px)' },
                },
                '@keyframes bounceIn': {
                  '0%':   { transform: 'scale(0.96)' },
                  '50%':  { transform: 'scale(1.025)' },
                  '100%': { transform: 'scale(1)' },
                },
                ...(answered !== 'idle' && isChosen && answered === 'wrong' && {
                  animation: 'shake 0.45s ease',
                }),
                ...(answered === 'correct' && isChosen && {
                  animation: 'bounceIn 0.35s ease',
                }),
                '&:hover': answered === 'idle' ? {
                  bgcolor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.045)',
                  borderColor: alpha('#6366F1', 0.4),
                } : {},
              }}
            >
              {/* Letter badge */}
              <Box sx={{
                width: 22, height: 22, borderRadius: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
                bgcolor: answered === 'idle'
                  ? alpha('#6366F1', 0.1)
                  : showTick   ? alpha('#10B981', 0.18)
                  : showX      ? alpha('#EF4444', 0.18)
                  :              alpha('#6366F1', 0.1),
              }}>
                {showTick
                  ? <CheckCircleIcon sx={{ fontSize: 13, color: '#10B981' }} />
                  : showX
                  ? <CancelIcon     sx={{ fontSize: 13, color: '#EF4444' }} />
                  : <Typography sx={{ fontFamily: MONO, fontSize: 9.5, color: '#6366F1', fontWeight: 700 }}>
                      {String.fromCharCode(65 + i)}
                    </Typography>
                }
              </Box>
              <Typography sx={{ fontSize: 13, lineHeight: 1.45, color: 'text.primary', flex: 1 }}>
                {opt}
              </Typography>
            </Box>
          )
        })}
      </Box>

      {/* Feedback */}
      {answered !== 'idle' && (
        <Box sx={{
          mt: 1.75, p: 1.5, borderRadius: 1.5,
          bgcolor: answered === 'correct'
            ? (isDark ? alpha('#10B981', 0.1) : alpha('#10B981', 0.07))
            : (isDark ? alpha('#F59E0B', 0.1) : alpha('#F59E0B', 0.07)),
          border: `1px solid ${answered === 'correct' ? alpha('#10B981', 0.25) : alpha('#F59E0B', 0.25)}`,
          '@keyframes fadeIn': {
            from: { opacity: 0 }, to: { opacity: 1 },
          },
          animation: 'fadeIn 0.3s ease-out both',
        }}>
          <Typography sx={{ fontSize: 12.5, lineHeight: 1.55, color: 'text.primary' }}>
            {answered === 'correct' ? quiz.feedback_correct : quiz.feedback_wrong}
          </Typography>
        </Box>
      )}

      {/* Footer actions */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mt: 2, gap: 1 }}>
        <Button
          size="small"
          startIcon={<TipsAndUpdatesIcon sx={{ fontSize: 13 }} />}
          onClick={() => setShowHint(h => !h)}
          sx={{ textTransform: 'none', fontSize: 11.5, color: '#F59E0B', '&:hover': { bgcolor: alpha('#F59E0B', 0.08) } }}
        >
          {showHint ? 'Hide hint' : 'Show hint'}
        </Button>

        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button
            size="small"
            onClick={onContinue}
            sx={{
              textTransform: 'none', fontSize: 11.5,
              color: 'text.disabled',
              '&:hover': { bgcolor: 'action.hover' },
            }}
          >
            Skip →
          </Button>
          {canContinue && (
            <Button
              variant="contained"
              size="small"
              onClick={onContinue}
              sx={{
                textTransform: 'none', fontSize: 12, fontWeight: 600,
                bgcolor: '#6366F1', px: 2,
                '@keyframes popIn': {
                  from: { opacity: 0, transform: 'scale(0.85)' },
                  to:   { opacity: 1, transform: 'scale(1)' },
                },
                animation: 'popIn 0.28s cubic-bezier(0.34,1.56,0.64,1) both',
                '&:hover': { bgcolor: '#4F46E5' },
              }}
            >
              Continue →
            </Button>
          )}
        </Box>
      </Box>

      {/* Hint */}
      {showHint && (
        <Box sx={{
          mt: 1.5, p: 1.5, borderRadius: 1.5,
          bgcolor: isDark ? alpha('#F59E0B', 0.07) : alpha('#F59E0B', 0.06),
          border: `1px solid ${alpha('#F59E0B', 0.22)}`,
          '@keyframes fadeSlideIn': {
            from: { opacity: 0, transform: 'translateY(-8px)' },
            to:   { opacity: 1, transform: 'translateY(0)' },
          },
          animation: 'fadeSlideIn 0.25s ease-out both',
        }}>
          <Typography sx={{ fontFamily: MONO, fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#F59E0B', mb: 0.5 }}>
            Hint
          </Typography>
          <Typography sx={{ fontSize: 12.5, color: isDark ? 'rgba(255,255,255,0.75)' : 'rgba(0,0,0,0.65)', lineHeight: 1.5, fontStyle: 'italic' }}>
            Think about what was explained in the analogy section above.
          </Typography>
        </Box>
      )}
    </Box>
  )
}

// ─── Pace check panel ─────────────────────────────────────────────────────────

type PaceRating = 'lost' | 'hmm' | 'got_it'

interface PacePanelProps {
  onRate: (r: PaceRating) => void
}

function PacePanel({ onRate }: PacePanelProps) {
  const theme  = useTheme()
  const isDark = theme.palette.mode === 'dark'
  const [chosen, setChosen] = useState<PaceRating | null>(null)

  const options: { id: PaceRating; emoji: string; label: string; color: string }[] = [
    { id: 'lost',   emoji: '😕', label: 'Lost',      color: '#EF4444' },
    { id: 'hmm',    emoji: '🤔', label: 'Sort of…',  color: '#F59E0B' },
    { id: 'got_it', emoji: '😊', label: "Got it!",   color: '#10B981' },
  ]

  function pick(id: PaceRating) {
    setChosen(id)
    setTimeout(() => onRate(id), 500)
  }

  return (
    <Box sx={{
      p: 2.5, borderRadius: 2, textAlign: 'center',
      bgcolor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
      border: `1px solid ${theme.palette.divider}`,
      '@keyframes slideInUp': {
        from: { opacity: 0, transform: 'translateY(20px)' },
        to:   { opacity: 1, transform: 'translateY(0)' },
      },
      animation: 'slideInUp 0.35s ease-out both',
    }}>
      <Typography sx={{ fontFamily: SERIF, fontSize: 17, mb: 0.5, color: 'text.primary' }}>
        How are you feeling?
      </Typography>
      <Typography sx={{ fontSize: 12.5, color: 'text.secondary', mb: 2.5 }}>
        Your pace, your rules — let's make sure you're with me.
      </Typography>

      <Box sx={{ display: 'flex', gap: 1.5, justifyContent: 'center' }}>
        {options.map(o => (
          <Box
            key={o.id}
            onClick={() => pick(o.id)}
            sx={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.5,
              px: 2.5, py: 1.75, borderRadius: 2, cursor: 'pointer',
              border: `1px solid ${chosen === o.id ? o.color : theme.palette.divider}`,
              bgcolor: chosen === o.id
                ? (isDark ? alpha(o.color, 0.12) : alpha(o.color, 0.08))
                : 'transparent',
              transition: 'all 0.18s',
              '@keyframes wiggle': {
                '0%, 100%': { transform: 'rotate(0)' },
                '25%': { transform: 'rotate(-8deg)' },
                '75%': { transform: 'rotate(8deg)' },
              },
              '&:hover': {
                bgcolor: isDark ? alpha(o.color, 0.1) : alpha(o.color, 0.07),
                borderColor: o.color,
                '& .emoji': { animation: 'wiggle 0.4s ease' },
              },
            }}
          >
            <Typography className="emoji" sx={{ fontSize: 28, lineHeight: 1 }}>
              {o.emoji}
            </Typography>
            <Typography sx={{ fontSize: 12, fontWeight: 600, color: chosen === o.id ? o.color : 'text.secondary' }}>
              {o.label}
            </Typography>
          </Box>
        ))}
      </Box>
    </Box>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

type Phase = 'reading' | 'checking' | 'pacing' | 'done'

interface Props {
  content: GuidedContent
}

export default function GuidedViewer({ content }: Props) {
  const theme   = useTheme()
  const isDark  = theme.palette.mode === 'dark'

  const [stepIdx,    setStepIdx]    = useState(0)
  const [phase,      setPhase]      = useState<Phase>('reading')
  const [completed,  setCompleted]  = useState(false)
  const [seen,       setSeen]       = useState<Set<number>>(new Set([0]))
  const [direction,  setDirection]  = useState<'forward' | 'back'>('forward')
  const [confetti,   setConfetti]   = useState(false)
  // Conversational reveal: how many beats of the current step are shown.
  // Starts at 1 (just the explanation) and grows as the learner taps Continue —
  // replaces the old "wall of text" where all sections appeared at once.
  const [revealed,   setRevealed]   = useState(1)

  // track how many steps have been completed (for pace-check cadence)
  const completedCount = useRef(0)

  const steps      = content.steps ?? []
  const totalSteps = steps.length
  const step       = steps[stepIdx]
  const isFirst    = stepIdx === 0
  const isLast     = stepIdx === totalSteps - 1
  const progress   = totalSteps > 1 ? (stepIdx / (totalSteps - 1)) * 100 : 0

  if (!step) return null

  // Beats in the current step: explanation, example, [analogy], key_insight, check_in.
  const beatCount     = step.analogy ? 5 : 4
  const allBeatsShown = revealed >= beatCount

  // ── Navigation helpers ─────────────────────────────────────────────────────

  function goTo(idx: number) {
    setDirection(idx > stepIdx ? 'forward' : 'back')
    setStepIdx(idx)
    setPhase('reading')
    setRevealed(1)   // restart the conversational reveal for the new step
    setSeen(prev => new Set([...prev, idx]))
  }

  // After reading: if beats remain, reveal them all first; otherwise advance.
  function handleGotIt() {
    if (revealed < beatCount) {
      setRevealed(beatCount)   // reveal the rest in one tap (skip-ahead)
      return
    }
    const quiz = step.quiz_check
    if (quiz) {
      setPhase('checking')
    } else {
      advanceOrComplete()
    }
  }

  // After quiz: check if pace check is due
  function handleQuizDone() {
    completedCount.current += 1
    if (completedCount.current % PACE_EVERY === 0 && !isLast) {
      setPhase('pacing')
    } else {
      advanceOrComplete()
    }
  }

  // After pace check
  function handlePaceRate(rating: 'lost' | 'hmm' | 'got_it') {
    // "lost" surfacing is cosmetic here — just continue
    advanceOrComplete()
  }

  function advanceOrComplete() {
    if (isLast) {
      setCompleted(true)
      setConfetti(true)
      setTimeout(() => setConfetti(false), 1400)
    } else {
      goTo(stepIdx + 1)
    }
  }

  // ── Completion screen ──────────────────────────────────────────────────────

  if (completed) {
    return (
      <Box sx={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        py: 5, px: 3, textAlign: 'center', gap: 2.5,
        position: 'relative',
        '@keyframes fadeInScale': {
          from: { opacity: 0, transform: 'scale(0.85)' },
          to:   { opacity: 1, transform: 'scale(1)' },
        },
        animation: 'fadeInScale 0.5s cubic-bezier(0.34,1.56,0.64,1) both',
      }}>
        {/* Confetti */}
        <Box sx={{ position: 'absolute', top: '25%', left: '50%', pointerEvents: 'none', zIndex: 10 }}>
          <ConfettiBurst active={confetti} />
        </Box>

        {/* Check icon */}
        <Box sx={{
          width: 68, height: 68, borderRadius: '50%',
          bgcolor: alpha('#10B981', 0.13),
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          '@keyframes springBounce': {
            '0%':   { transform: 'scale(0)' },
            '55%':  { transform: 'scale(1.22)' },
            '75%':  { transform: 'scale(0.92)' },
            '90%':  { transform: 'scale(1.06)' },
            '100%': { transform: 'scale(1)' },
          },
          animation: 'springBounce 0.7s cubic-bezier(0.34,1.56,0.64,1) 0.15s both',
        }}>
          <CheckCircleIcon sx={{ fontSize: 36, color: '#10B981' }} />
        </Box>

        <Box>
          <Typography sx={{ fontFamily: SERIF, fontSize: 27, lineHeight: 1.2, mb: 0.75 }}>
            Lesson complete! 🎉
          </Typography>
          <Typography sx={{ fontSize: 13, color: 'text.secondary', maxWidth: 380 }}>
            You worked through all {totalSteps} steps of <em>{content.topic}</em>.
            Review any step below, or start a quiz to test what you've learned.
          </Typography>
        </Box>

        {/* Key insights recap */}
        <Box sx={{
          width: '100%', maxWidth: 540,
          bgcolor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
          border: `1px solid ${theme.palette.divider}`,
          borderRadius: 2, p: 2,
        }}>
          <Typography sx={{ fontFamily: MONO, fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'text.disabled', mb: 1.5 }}>
            Key insights
          </Typography>
          {steps.map((s, i) => (
            <Box key={i} sx={{ display: 'flex', gap: 1.25, mb: i < steps.length - 1 ? 1.25 : 0,
              '@keyframes fadeInLeft': {
                from: { opacity: 0, transform: 'translateX(-10px)' },
                to:   { opacity: 1, transform: 'translateX(0)' },
              },
              animation: `fadeInLeft 0.35s ease-out ${i * 70}ms both`,
            }}>
              <Box sx={{
                width: 20, height: 20, borderRadius: '50%',
                bgcolor: alpha('#6366F1', 0.15),
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0, mt: 0.1,
              }}>
                <Typography sx={{ fontFamily: MONO, fontSize: 9, color: '#6366F1', fontWeight: 700 }}>
                  {i + 1}
                </Typography>
              </Box>
              <Typography sx={{ fontSize: 12.5, color: 'text.secondary', lineHeight: 1.55 }}>
                {s.key_insight}
              </Typography>
            </Box>
          ))}
        </Box>

        <Button
          variant="outlined"
          size="small"
          onClick={() => { setCompleted(false); completedCount.current = 0; goTo(0) }}
          sx={{ textTransform: 'none', fontSize: 12 }}
        >
          Review from step 1
        </Button>
      </Box>
    )
  }

  // ── Slide animation key ────────────────────────────────────────────────────
  // Using key=stepIdx on the animated wrapper causes React to remount it,
  // triggering the CSS entrance animation every time the step changes.

  const slideAnim = direction === 'forward'
    ? `@keyframes slideInRight { from { opacity:0; transform:translateX(28px) } to { opacity:1; transform:translateX(0) } }`
    : `@keyframes slideInLeft  { from { opacity:0; transform:translateX(-28px) } to { opacity:1; transform:translateX(0) } }`
  const animName = direction === 'forward' ? 'slideInRight' : 'slideInLeft'

  // ── Step view ──────────────────────────────────────────────────────────────

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0 }}>

      {/* ── Progress header ── */}
      <Box sx={{ px: 3, pt: 2.5, pb: 1.5 }}>
        {/* Intro banner on step 0 */}
        {stepIdx === 0 && content.intro && (
          <Box sx={{
            display: 'flex', gap: 1.25, alignItems: 'flex-start',
            p: 1.75, mb: 2,
            bgcolor: isDark ? alpha('#6366F1', 0.08) : alpha('#6366F1', 0.06),
            border: `1px solid ${alpha('#6366F1', 0.2)}`,
            borderRadius: 2,
            '@keyframes fadeIn': {
              from: { opacity: 0 }, to: { opacity: 1 },
            },
            animation: 'fadeIn 0.5s ease-out both',
          }}>
            <SchoolIcon sx={{ fontSize: 15, color: '#6366F1', mt: 0.1, flexShrink: 0 }} />
            <Typography sx={{ fontSize: 13, color: isDark ? 'rgba(255,255,255,0.75)' : 'rgba(0,0,0,0.7)', lineHeight: 1.55 }}>
              {content.intro}
            </Typography>
          </Box>
        )}

        {/* Step counter + progress bar */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1 }}>
          <Typography sx={{ fontFamily: MONO, fontSize: 10, color: 'text.disabled', textTransform: 'uppercase', letterSpacing: '0.1em', flexShrink: 0 }}>
            Step {stepIdx + 1} of {totalSteps}
          </Typography>
          <Box sx={{ flex: 1 }}>
            <LinearProgress
              variant="determinate"
              value={progress}
              sx={{
                height: 3, borderRadius: 4,
                bgcolor: 'action.hover',
                '& .MuiLinearProgress-bar': {
                  bgcolor: '#6366F1', borderRadius: 4,
                  transition: 'transform 0.5s ease',
                },
              }}
            />
          </Box>

          {/* Step dots */}
          <Box sx={{ display: 'flex', gap: 0.5, flexShrink: 0 }}>
            {steps.map((_, i) => {
              const isActive = i === stepIdx
              return (
                <Box
                  key={i}
                  onClick={() => goTo(i)}
                  sx={{
                    width:        isActive ? 16 : 6,
                    height:       6,
                    borderRadius: 3,
                    cursor:       'pointer',
                    transition:   'all 0.25s',
                    bgcolor:      isActive  ? '#6366F1'
                                : seen.has(i) ? alpha('#6366F1', 0.4)
                                :               'action.disabledBackground',
                    ...(isActive && {
                      '@keyframes pulseGlow': {
                        '0%, 100%': { boxShadow: `0 0 0 0 ${alpha('#6366F1', 0.5)}` },
                        '50%':      { boxShadow: `0 0 0 4px ${alpha('#6366F1', 0)}` },
                      },
                      animation: 'pulseGlow 1.8s ease-in-out infinite',
                    }),
                  }}
                />
              )
            })}
          </Box>
        </Box>

        {/* Phase indicator pill */}
        {phase !== 'reading' && (
          <Box sx={{ display: 'flex', justifyContent: 'center', mt: 0.5 }}>
            <Chip
              label={phase === 'checking' ? '🧠 Quick check' : phase === 'pacing' ? '🙋 Pace check' : ''}
              size="small"
              sx={{
                fontFamily: MONO, fontSize: 9.5, height: 20,
                bgcolor: phase === 'checking' ? alpha('#8B5CF6', 0.12) : alpha('#F59E0B', 0.12),
                color:   phase === 'checking' ? '#8B5CF6' : '#F59E0B',
                '@keyframes popIn': {
                  from: { opacity: 0, transform: 'scale(0.8)' },
                  to:   { opacity: 1, transform: 'scale(1)' },
                },
                animation: 'popIn 0.25s cubic-bezier(0.34,1.56,0.64,1) both',
              }}
            />
          </Box>
        )}
      </Box>

      {/* ── Animated step wrapper ── */}
      <Box
        key={stepIdx}
        sx={{
          [slideAnim]: {},   // inject the @keyframes rule
          animation: `${animName} 0.32s ease-out both`,
        }}
      >
        {/* Step title */}
        <Box sx={{ px: 3, pb: 1.5 }}>
          <Chip
            label={`Step ${stepIdx + 1}`}
            size="small"
            sx={{ fontFamily: MONO, fontSize: 9.5, height: 20, bgcolor: alpha('#6366F1', 0.12), color: '#6366F1', mb: 1 }}
          />
          <Typography sx={{ fontFamily: SERIF, fontSize: 22, lineHeight: 1.25, color: 'text.primary' }}>
            {step.title}
          </Typography>
        </Box>

        {/* Reading phase — conversational beats, revealed one at a time */}
        {phase === 'reading' && (() => {
          // Build the ordered beats for this step (skip null analogy).
          const beats = [
            { icon: <LightbulbIcon />,     label: 'Explanation',       accent: '#6366F1',
              node: <Typography sx={{ fontSize: 13.5, lineHeight: 1.7, color: 'text.primary', whiteSpace: 'pre-wrap' }}>{step.explanation}</Typography> },
            { icon: <CodeIcon />,          label: 'Real-world example', accent: '#0EA5E9',
              node: <Typography sx={{ fontSize: 13, lineHeight: 1.65, color: isDark ? 'rgba(255,255,255,0.8)' : 'rgba(0,0,0,0.75)' }}>{step.example}</Typography> },
            ...(step.analogy ? [{ icon: <CompareArrowsIcon />, label: 'Think of it like…', accent: '#F59E0B',
              node: <Typography sx={{ fontSize: 13, lineHeight: 1.65, color: isDark ? 'rgba(255,255,255,0.8)' : 'rgba(0,0,0,0.75)', fontStyle: 'italic' }}>{step.analogy}</Typography> }] : []),
            { icon: <StarBorderIcon />,    label: 'Key insight',        accent: '#10B981',
              node: <Typography sx={{ fontSize: 13, fontWeight: 600, lineHeight: 1.55, color: 'text.primary' }}>{step.key_insight}</Typography> },
            { icon: <HelpOutlineIcon />,   label: 'Check yourself',     accent: '#8B5CF6',
              node: <Typography sx={{ fontSize: 13, lineHeight: 1.6, color: isDark ? 'rgba(255,255,255,0.75)' : 'rgba(0,0,0,0.65)' }}>{step.check_in}</Typography> },
          ]
          const shown = Math.min(revealed, beats.length)
          const moreBeats = shown < beats.length
          return (
            <Box sx={{ px: 3, pb: 2, display: 'flex', flexDirection: 'column', gap: 1.25 }}>
              {beats.slice(0, shown).map((b, i) => (
                <AnimatedBeat
                  key={b.label}
                  icon={b.icon}
                  label={b.label}
                  accent={b.accent}
                  isLatest={i === shown - 1}
                  hasNext={i < shown - 1}
                >
                  {b.node}
                </AnimatedBeat>
              ))}

              {/* In-step Continue — reveals the next beat instead of dumping all at once */}
              {moreBeats && (
                <Button
                  variant="text"
                  onClick={() => setRevealed(r => r + 1)}
                  endIcon={<ArrowForwardIcon sx={{ fontSize: 16 }} />}
                  sx={{ alignSelf: 'flex-start', textTransform: 'none', fontSize: 12.5, fontWeight: 600,
                        color: '#6366F1', mt: 0.5, '&:hover': { bgcolor: alpha('#6366F1', 0.08) } }}
                >
                  Continue
                </Button>
              )}

              {/* Beat progress pips */}
              <Box sx={{ display: 'flex', gap: 0.5, mt: 0.5 }}>
                {beats.map((_, i) => (
                  <Box key={i} sx={{
                    width: i < shown ? 18 : 7, height: 4, borderRadius: 2,
                    bgcolor: i < shown ? '#6366F1' : theme.palette.divider,
                    transition: 'width 0.3s ease, background 0.3s ease',
                  }} />
                ))}
              </Box>
            </Box>
          )
        })()}

        {/* Checking phase — MCQ quiz */}
        {phase === 'checking' && step.quiz_check && (
          <Box sx={{ px: 3, pb: 2 }}>
            <QuizPanel quiz={step.quiz_check} onContinue={handleQuizDone} />
          </Box>
        )}

        {/* Pacing phase — emoji pace check */}
        {phase === 'pacing' && (
          <Box sx={{ px: 3, pb: 2 }}>
            <PacePanel onRate={handlePaceRate} />
          </Box>
        )}
      </Box>

      {/* ── Navigation ── */}
      <Box sx={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        px: 3, py: 2,
        borderTop: `1px solid ${theme.palette.divider}`,
        mt: 'auto',
      }}>
        <IconButton
          onClick={() => goTo(stepIdx - 1)}
          disabled={isFirst}
          size="small"
          aria-label="Previous step"
          sx={{ opacity: isFirst ? 0 : 1, pointerEvents: isFirst ? 'none' : 'auto' }}
        >
          <ArrowBackIcon fontSize="small" />
        </IconButton>

        {phase === 'reading' && (
          <Button
            variant="contained"
            onClick={handleGotIt}
            endIcon={!allBeatsShown ? <ArrowForwardIcon />
                     : isLast && !step.quiz_check ? <CheckCircleOutlineIcon /> : <ArrowForwardIcon />}
            sx={{
              textTransform: 'none', fontSize: 13, fontWeight: 600,
              bgcolor: '#6366F1', px: 3,
              '&:hover': { bgcolor: '#4F46E5' },
            }}
          >
            {!allBeatsShown ? 'Reveal all'
             : isLast && !step.quiz_check ? 'Complete lesson' : 'Got it — next →'}
          </Button>
        )}

        {phase !== 'reading' && (
          // Placeholder to keep layout stable while quiz/pace panel has its own actions
          <Box sx={{ height: 36 }} />
        )}

        <Box sx={{ width: 34 }} />
      </Box>

    </Box>
  )
}
