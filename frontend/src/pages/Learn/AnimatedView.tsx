/**
 * AnimatedView — "watch the concept build itself, step by step".
 *
 * Renders GuidedContent as an auto-advancing sequence: a row of step-nodes with
 * a travelling highlight, plus the current step's explanation revealed with the
 * shared beat animation. Distinct from GuidedViewer (which is manual, read-at-
 * your-pace) — this is the lab's "Animated" format: play / pause / step.
 *
 * Reuses the motion wrapper (@/lib/motion) and honours reduced-motion. The
 * step index maths live in the pure, exported `clampStep` for unit testing.
 */

import { useEffect, useRef, useState } from 'react'
import { Box, IconButton, Tooltip, Typography, useTheme, alpha } from '@mui/material'
import PlayArrowRoundedIcon from '@mui/icons-material/PlayArrowRounded'
import PauseRoundedIcon from '@mui/icons-material/PauseRounded'
import ChevronLeftRoundedIcon from '@mui/icons-material/ChevronLeftRounded'
import ChevronRightRoundedIcon from '@mui/icons-material/ChevronRightRounded'
import ReplayRoundedIcon from '@mui/icons-material/ReplayRounded'
import AutoAwesomeRoundedIcon from '@mui/icons-material/AutoAwesomeRounded'
import type { GuidedContent } from '@/api/learn.api'
import { BRAND } from '@/theme/tokens'
import { usePrefersReducedMotion } from '@/lib/motion'
import AnimatedBeat from './AnimatedBeat'

const MONO = '"IBM Plex Mono", "Geist Mono", monospace'
const STEP_MS = 4200 // dwell per step while playing

/** Clamp a step index into [0, total-1]; total 0 → 0. Pure (unit-tested). */
export function clampStep(idx: number, total: number): number {
  if (total <= 0) return 0
  return Math.min(total - 1, Math.max(0, idx))
}

export default function AnimatedView({ content, activeStep, onStepChange }: {
  content: GuidedContent
  /** Controlled active step index (lifted so an outline rail can drive/track it). */
  activeStep?: number
  /** Called when the view advances; when provided, `activeStep` is the source of truth. */
  onStepChange?: (idx: number) => void
}) {
  const theme  = useTheme()
  const isDark = theme.palette.mode === 'dark'
  const reduce = usePrefersReducedMotion()
  const accent = BRAND.copper

  const steps = content.steps ?? []
  const total = steps.length
  // Controllable step index (see GuidedViewer for the same pattern).
  const [internalIdx, setInternalIdx] = useState(0)
  const idx = activeStep ?? internalIdx
  const setIdx = (v: number) => { onStepChange ? onStepChange(v) : setInternalIdx(v) }
  const [playing, setPlaying] = useState(!reduce)   // autoplay unless reduced-motion
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const atEnd = idx >= total - 1
  const go = (next: number) => setIdx(clampStep(next, total))

  // Auto-advance while playing; stop at the last step.
  useEffect(() => {
    if (!playing || total === 0) return
    if (atEnd) { setPlaying(false); return }
    timer.current = setTimeout(() => setIdx(clampStep(idx + 1, total)), STEP_MS)
    return () => { if (timer.current) clearTimeout(timer.current) }
  }, [playing, idx, atEnd, total])

  if (total === 0) {
    return (
      <Typography sx={{ fontSize: 13.5, color: 'text.secondary' }}>
        No steps to animate.
      </Typography>
    )
  }

  const step = steps[clampStep(idx, total)]

  return (
    <Box sx={{ maxWidth: 760 }}>
      {/* Concept-flow node row */}
      <Box sx={{ position: 'relative', display: 'flex', alignItems: 'center', mb: 0.5, px: 1 }}>
        {/* baseline */}
        <Box sx={{ position: 'absolute', left: 24, right: 24, top: '50%', height: 2,
                   bgcolor: alpha(accent, 0.2), borderRadius: 2 }} />
        {/* progress fill up to current node */}
        <Box sx={{ position: 'absolute', left: 24, top: '50%', height: 2, borderRadius: 2,
                   width: total > 1 ? `calc((100% - 48px) * ${idx / (total - 1)})` : 0,
                   background: BRAND.gradient,
                   transition: reduce ? 'none' : 'width 0.5s cubic-bezier(0.22,1,0.36,1)' }} />
        <Box sx={{ display: 'flex', justifyContent: 'space-between', width: '100%', position: 'relative' }}>
          {steps.map((_, i) => {
            const done = i < idx
            const on   = i === idx
            return (
              <Box key={i} onClick={() => go(i)}
                sx={{ width: 30, height: 30, borderRadius: '50%', cursor: 'pointer', flexShrink: 0,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontFamily: MONO, fontSize: 11, fontWeight: 700,
                      color: on || done ? BRAND.onAccent : 'text.disabled',
                      background: on || done ? BRAND.gradient : (isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)'),
                      border: `1px solid ${on ? accent : 'transparent'}`,
                      boxShadow: on ? `0 0 0 4px ${alpha(accent, 0.18)}` : 'none',
                      transition: reduce ? 'none' : 'all 0.25s ease' }}>
                {i + 1}
              </Box>
            )
          })}
        </Box>
      </Box>

      {/* Controls */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 2.5 }}>
        {atEnd ? (
          <Tooltip title="Replay" arrow>
            <IconButton size="small" onClick={() => { setIdx(0); setPlaying(true) }} sx={{ color: accent }}>
              <ReplayRoundedIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        ) : (
          <Tooltip title={playing ? 'Pause' : 'Play'} arrow>
            <IconButton size="small" onClick={() => setPlaying(p => !p)} sx={{ color: accent }}>
              {playing ? <PauseRoundedIcon fontSize="small" /> : <PlayArrowRoundedIcon fontSize="small" />}
            </IconButton>
          </Tooltip>
        )}
        <Tooltip title="Previous step" arrow>
          <span><IconButton size="small" disabled={idx <= 0} onClick={() => { setPlaying(false); go(idx - 1) }} sx={{ color: 'text.secondary' }}>
            <ChevronLeftRoundedIcon fontSize="small" />
          </IconButton></span>
        </Tooltip>
        <Tooltip title="Next step" arrow>
          <span><IconButton size="small" disabled={atEnd} onClick={() => { setPlaying(false); go(idx + 1) }} sx={{ color: 'text.secondary' }}>
            <ChevronRightRoundedIcon fontSize="small" />
          </IconButton></span>
        </Tooltip>
        <Typography sx={{ fontFamily: MONO, fontSize: 10.5, color: 'text.disabled', ml: 0.5 }}>
          step {idx + 1} / {total}
        </Typography>
      </Box>

      {/* Current step — revealed with the shared beat animation (remounts on idx) */}
      <Box key={idx}>
        <Typography sx={{ fontSize: 17, fontWeight: 700, color: 'text.primary', mb: 1.25, letterSpacing: '-0.01em' }}>
          {step.title}
        </Typography>
        <AnimatedBeat icon={<AutoAwesomeRoundedIcon />} label="Explanation" accent={accent} isLatest hasNext={!!step.key_insight}>
          <Typography sx={{ fontSize: 14.5, lineHeight: 1.75, color: 'text.primary' }}>
            {step.explanation}
          </Typography>
        </AnimatedBeat>
        {step.key_insight && (
          <Box sx={{ mt: 1.25 }}>
            <AnimatedBeat icon={<AutoAwesomeRoundedIcon />} label="Key insight" accent={BRAND.copperDark} isLatest hasNext={false}>
              <Typography sx={{ fontSize: 14, lineHeight: 1.7, color: 'text.primary' }}>
                {step.key_insight}
              </Typography>
            </AnimatedBeat>
          </Box>
        )}
      </Box>
    </Box>
  )
}
