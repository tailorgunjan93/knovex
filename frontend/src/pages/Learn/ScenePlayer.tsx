/**
 * ScenePlayer — the real "Animated" mode: a motion-graphics explainer that
 * renders an LLM-authored scene script (shapes, text, arrows) and plays it
 * scene-by-scene with narration, in the spirit of 3Blue1Brown / Kurzgesagt.
 *
 * Coordinate space (from the backend): x 0..100 left→right, y 0..100 top→bottom,
 * center (50,50). Text/nodes/circles are percent-positioned HTML; arrows/lines
 * live in an SVG overlay sized to the stage's measured pixels (so angles and
 * arrowheads don't distort). Pure helpers are exported for unit testing.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { Box, IconButton, Tooltip, Typography, useTheme, alpha, type Theme } from '@mui/material'
import PlayArrowRoundedIcon from '@mui/icons-material/PlayArrowRounded'
import PauseRoundedIcon from '@mui/icons-material/PauseRounded'
import ChevronLeftRoundedIcon from '@mui/icons-material/ChevronLeftRounded'
import ChevronRightRoundedIcon from '@mui/icons-material/ChevronRightRounded'
import ReplayRoundedIcon from '@mui/icons-material/ReplayRounded'
import type { AnimatedContent, SceneElement } from '@/api/learn.api'
import { BRAND } from '@/theme/tokens'
import { Motion, usePrefersReducedMotion } from '@/lib/motion'

const MONO = '"IBM Plex Mono", "Geist Mono", monospace'

/** Clamp a scene index into [0, total-1]; total 0 → 0. Pure (unit-tested). */
export function clampScene(idx: number, total: number): number {
  if (total <= 0) return 0
  return Math.min(total - 1, Math.max(0, idx))
}

/** Scene dwell in ms, clamped to a sane 3–8s. Pure (unit-tested). */
export function sceneDurationMs(duration: number | undefined): number {
  const s = typeof duration === 'number' && duration > 0 ? duration : 5
  return Math.min(8, Math.max(3, s)) * 1000
}

const TEXT_SIZE: Record<string, number> = { title: 30, heading: 21, body: 15, small: 12 }

function resolveColor(theme: Theme, c?: string): string {
  switch (c) {
    case 'accent':  return BRAND.copper
    case 'primary': return theme.palette.text.primary
    case 'muted':   return theme.palette.text.disabled
    case 'blue':    return '#5B9BD5'
    case 'green':   return '#5FB97B'
    case 'amber':   return '#E0A84E'
    default:        return c || BRAND.copper
  }
}

// enter → framer-motion initial/animate for HTML elements
function htmlEnter(enter: string | undefined, reduce: boolean) {
  if (reduce) return { initial: { opacity: 1 }, animate: { opacity: 1 } }
  switch (enter) {
    case 'rise': return { initial: { opacity: 0, y: 14 }, animate: { opacity: 1, y: 0 } }
    case 'pop':  return { initial: { opacity: 0, scale: 0.6 }, animate: { opacity: 1, scale: 1 } }
    case 'fade':
    case 'draw':
    default:     return { initial: { opacity: 0 }, animate: { opacity: 1 } }
  }
}

export default function ScenePlayer({ content, activeStep, onStepChange }: {
  content: AnimatedContent
  activeStep?: number
  onStepChange?: (idx: number) => void
}) {
  const theme  = useTheme()
  const reduce = usePrefersReducedMotion()
  const scenes = content.scenes ?? []
  const total  = scenes.length

  const [internalIdx, setInternalIdx] = useState(0)
  const idx = clampScene(activeStep ?? internalIdx, total)
  const setIdx = (v: number) => {
    const c = clampScene(v, total)
    onStepChange ? onStepChange(c) : setInternalIdx(c)
  }
  const [playing, setPlaying] = useState(!reduce)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Measure the stage in px so the SVG overlay (arrows/lines) is undistorted.
  const stageRef = useRef<HTMLDivElement | null>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  useEffect(() => {
    const el = stageRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }))
    ro.observe(el)
    setSize({ w: el.clientWidth, h: el.clientHeight })
    return () => ro.disconnect()
  }, [])

  const scene = scenes[idx]
  const atEnd = idx >= total - 1

  // Auto-advance while playing.
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current)
    if (!playing || atEnd || !scene) return
    timer.current = setTimeout(() => setIdx(idx + 1), sceneDurationMs(scene?.duration))
    return () => { if (timer.current) clearTimeout(timer.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, playing, total])

  const px = (xPct: number) => (xPct / 100) * size.w
  const py = (yPct: number) => (yPct / 100) * size.h

  const lines = useMemo(
    () => (scene?.elements ?? []).filter(e => e.type === 'arrow' || e.type === 'line'),
    [scene],
  )
  const blocks = useMemo(
    () => (scene?.elements ?? []).filter(e => e.type !== 'arrow' && e.type !== 'line'),
    [scene],
  )

  if (total === 0) return null

  return (
    <Box>
      {/* ── Stage (16:9) ── */}
      <Box
        ref={stageRef}
        data-testid="scene-stage"
        sx={{
          position: 'relative', width: '100%', aspectRatio: '16 / 9',
          borderRadius: 3, overflow: 'hidden',
          border: '1px solid', borderColor: 'divider',
          background: theme.palette.mode === 'dark'
            ? 'radial-gradient(120% 120% at 50% 0%, #1b1714 0%, #0f0d0b 100%)'
            : 'radial-gradient(120% 120% at 50% 0%, #fbf7f0 0%, #f1ebe1 100%)',
        }}
      >
        {/* SVG overlay for arrows + lines (measured px → no distortion) */}
        <svg
          width={size.w} height={size.h}
          style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
        >
          <defs>
            <marker id="kx-arrow" markerWidth="10" markerHeight="10" refX="7" refY="3"
              orient="auto" markerUnits="strokeWidth">
              <path d="M0,0 L7,3 L0,6 Z" fill={BRAND.copper} />
            </marker>
          </defs>
          {lines.map((el, i) => {
            const stroke = resolveColor(theme, el.color) || BRAND.copper
            const drawn = !reduce && el.enter === 'draw'
            return (
              <Motion.line
                key={`${idx}-line-${i}`}
                x1={px(el.x1 ?? 0)} y1={py(el.y1 ?? 0)}
                x2={px(el.x2 ?? 0)} y2={py(el.y2 ?? 0)}
                stroke={el.type === 'arrow' ? BRAND.copper : stroke}
                strokeWidth={2}
                markerEnd={el.type === 'arrow' ? 'url(#kx-arrow)' : undefined}
                initial={drawn ? { pathLength: 0, opacity: 0 } : { opacity: 0 }}
                animate={drawn ? { pathLength: 1, opacity: 1 } : { opacity: 1 }}
                transition={{ duration: reduce ? 0 : 0.6, delay: reduce ? 0 : 0.2 + i * 0.15 }}
              />
            )
          })}
        </svg>

        {/* HTML layer: text, nodes, circles (percent-positioned) */}
        {blocks.map((el, i) => (
          <SceneBlock key={`${idx}-block-${i}`} el={el} index={i} reduce={reduce} theme={theme} />
        ))}
      </Box>

      {/* ── Narration subtitle ── */}
      <Box sx={{ mt: 1.5, minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', px: 2 }}>
        <Motion.div key={`narr-${idx}`} initial={{ opacity: 0, y: reduce ? 0 : 6 }} animate={{ opacity: 1, y: 0 }}>
          <Typography sx={{ fontSize: 15, lineHeight: 1.55, textAlign: 'center', color: 'text.secondary', maxWidth: 720 }}>
            {scene?.narration}
          </Typography>
        </Motion.div>
      </Box>

      {/* ── Controls ── */}
      <Box sx={{ mt: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.5 }}>
        <Tooltip title="Previous"><span><IconButton size="small" disabled={idx === 0} onClick={() => { setPlaying(false); setIdx(idx - 1) }}><ChevronLeftRoundedIcon /></IconButton></span></Tooltip>
        {atEnd
          ? <Tooltip title="Replay"><IconButton size="small" onClick={() => { setIdx(0); setPlaying(true) }}><ReplayRoundedIcon /></IconButton></Tooltip>
          : <Tooltip title={playing ? 'Pause' : 'Play'}><IconButton size="small" onClick={() => setPlaying(p => !p)} sx={{ color: BRAND.copper }}>{playing ? <PauseRoundedIcon /> : <PlayArrowRoundedIcon />}</IconButton></Tooltip>}
        <Tooltip title="Next"><span><IconButton size="small" disabled={atEnd} onClick={() => { setPlaying(false); setIdx(idx + 1) }}><ChevronRightRoundedIcon /></IconButton></span></Tooltip>

        {/* scene dots */}
        <Box sx={{ display: 'flex', gap: 0.6, ml: 1.5 }}>
          {scenes.map((_, i) => (
            <Box key={i} onClick={() => { setPlaying(false); setIdx(i) }}
              sx={{
                width: i === idx ? 18 : 7, height: 7, borderRadius: 4, cursor: 'pointer',
                bgcolor: i === idx ? BRAND.copper : alpha(theme.palette.text.disabled, 0.4),
                transition: 'all 0.2s',
              }} />
          ))}
        </Box>
        <Typography sx={{ ml: 1.5, fontFamily: MONO, fontSize: 11, color: 'text.disabled' }}>
          {idx + 1}/{total}
        </Typography>
      </Box>
    </Box>
  )
}

function SceneBlock({ el, index, reduce, theme }: {
  el: SceneElement
  index: number
  reduce: boolean
  theme: Theme
}) {
  const { initial, animate } = htmlEnter(el.enter, reduce)
  const transition = { duration: reduce ? 0 : 0.45, delay: reduce ? 0 : 0.15 + index * 0.22, ease: 'easeOut' as const }
  const color = resolveColor(theme, el.color)
  const common = {
    position: 'absolute' as const,
    left: `${el.x ?? 50}%`, top: `${el.y ?? 50}%`,
    transform: 'translate(-50%, -50%)',
  }

  if (el.type === 'text') {
    const fs = TEXT_SIZE[el.size ?? 'body'] ?? 15
    return (
      <Motion.div initial={initial} animate={animate} transition={transition}
        style={{ ...common, textAlign: 'center', maxWidth: '80%' }}>
        <Typography sx={{ fontSize: fs, fontWeight: (el.size === 'title' || el.size === 'heading') ? 700 : 500, color, lineHeight: 1.25 }}>
          {el.text}
        </Typography>
      </Motion.div>
    )
  }

  if (el.type === 'circle') {
    const d = `${(el.r ?? 10) * 2}%`
    return (
      <Motion.div initial={initial} animate={animate} transition={transition}
        style={{ ...common, width: d, aspectRatio: '1 / 1', display: 'flex', alignItems: 'center', justifyContent: 'center',
          borderRadius: '50%', border: `1.5px solid ${color}`, background: alpha(color, 0.12) }}>
        <Typography sx={{ fontSize: 12.5, fontWeight: 600, color, textAlign: 'center', px: 1 }}>{el.label}</Typography>
      </Motion.div>
    )
  }

  // node (labelled box)
  return (
    <Motion.div initial={initial} animate={animate} transition={transition}
      style={{ ...common, width: `${el.w ?? 24}%`, height: `${el.h ?? 14}%`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        borderRadius: 10, border: `1.5px solid ${color}`, background: alpha(color, 0.12), padding: '0 8px' }}>
      <Typography sx={{ fontSize: 13.5, fontWeight: 600, color, textAlign: 'center', lineHeight: 1.2 }}>{el.label}</Typography>
    </Motion.div>
  )
}
