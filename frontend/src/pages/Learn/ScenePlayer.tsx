/**
 * ScenePlayer — the real "Animated" mode: a motion-graphics explainer that
 * renders an LLM-authored scene script (shapes, text, arrows) and plays it
 * scene-by-scene with narration, in the spirit of 3Blue1Brown / Kurzgesagt.
 *
 * Coordinate space (from the backend): x 0..100 left→right, y 0..100 top→bottom,
 * center (50,50). Text/nodes/circles are percent-positioned HTML; arrows/lines
 * live in an SVG overlay sized to the stage's measured pixels (so angles and
 * arrowheads don't distort). Pure helpers are exported for unit testing.
 *
 * Visual language (v0.12.9): material depth (radial-gradient fills + soft
 * shadows), a glow on the focal/accent element (staging), expo/spring easing,
 * and a faint animated grid + vignette for a "studio" feel.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { Box, IconButton, Tooltip, Typography, useTheme, alpha, type Theme } from '@mui/material'
import PlayArrowRoundedIcon from '@mui/icons-material/PlayArrowRounded'
import PauseRoundedIcon from '@mui/icons-material/PauseRounded'
import ChevronLeftRoundedIcon from '@mui/icons-material/ChevronLeftRounded'
import ChevronRightRoundedIcon from '@mui/icons-material/ChevronRightRounded'
import ReplayRoundedIcon from '@mui/icons-material/ReplayRounded'
import type { AnimatedContent, SceneElement, SemanticAnimatedContent } from '@/api/learn.api'
import { BRAND } from '@/theme/tokens'
import { Motion, usePrefersReducedMotion } from '@/lib/motion'
import { compileSemanticScenes, isSemanticAnimated } from '@/lib/sceneLayout'

const MONO = '"IBM Plex Mono", "Geist Mono", monospace'

// Smooth deceleration ( easeOutExpo-ish) — feels deliberate, not snappy.
const EXPO = [0.16, 1, 0.3, 1] as const

/** Clamp a scene index into [0, total-1]; total 0 → 0. Pure (unit-tested). */
export function clampScene(idx: number, total: number): number {
  if (total <= 0) return 0
  return Math.min(total - 1, Math.max(0, idx))
}

/**
 * Clamp a 0–100 stage percentage into the visible 4..96 band so an element the
 * model placed near (or past) an edge can't escape the frame. Pure (unit-tested).
 */
export function clampPct(v: number | undefined, fallback = 50): number {
  const n = typeof v === 'number' && Number.isFinite(v) ? v : fallback
  return Math.min(96, Math.max(4, n))
}

/** Scene dwell in ms, clamped to a sane 3–8s. Pure (unit-tested). */
export function sceneDurationMs(duration: number | undefined): number {
  const s = typeof duration === 'number' && duration > 0 ? duration : 5
  return Math.min(8, Math.max(3, s)) * 1000
}

const TEXT_SIZE: Record<string, number> = { title: 32, heading: 22, body: 15, small: 12 }

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

function isAccentColor(c?: string): boolean {
  return c === 'accent' || c === undefined || c === ''
}

// enter → framer-motion initial/animate for HTML elements
function htmlEnter(enter: string | undefined, reduce: boolean) {
  if (reduce) return { initial: { opacity: 1 }, animate: { opacity: 1 } }
  switch (enter) {
    case 'rise': return { initial: { opacity: 0, y: 22 }, animate: { opacity: 1, y: 0 } }
    case 'pop':  return { initial: { opacity: 0, scale: 0.4 }, animate: { opacity: 1, scale: 1 } }
    case 'fade':
    case 'draw':
    default:     return { initial: { opacity: 0, scale: 0.94 }, animate: { opacity: 1, scale: 1 } }
  }
}

export default function ScenePlayer({ content, activeStep, onStepChange }: {
  content: AnimatedContent | SemanticAnimatedContent
  activeStep?: number
  onStepChange?: (idx: number) => void
}) {
  const theme  = useTheme()
  const isDark = theme.palette.mode === 'dark'
  const reduce = usePrefersReducedMotion()
  // Semantic format (diagram/items/steps): the app's layout engine computes all
  // positions (Mermaid model). Legacy scenes render as-is.
  const scenes = useMemo(
    () => (isSemanticAnimated(content)
      ? compileSemanticScenes(content)
      : (content as AnimatedContent).scenes ?? []),
    [content],
  )
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

  const gridColor = isDark ? 'rgba(245,241,234,0.05)' : 'rgba(20,18,14,0.05)'

  return (
    <Box data-testid="scene-player">
      {/* ── Stage (16:9) ── */}
      <Box
        ref={stageRef}
        data-testid="scene-stage"
        sx={{
          position: 'relative', width: '100%', aspectRatio: '16 / 9',
          borderRadius: 3, overflow: 'hidden',
          border: '1px solid', borderColor: 'divider',
          boxShadow: isDark ? '0 24px 60px rgba(0,0,0,0.45)' : '0 18px 50px rgba(20,18,14,0.12)',
          background: isDark
            ? 'radial-gradient(130% 130% at 50% -5%, #221c17 0%, #14110e 48%, #0c0a08 100%)'
            : 'radial-gradient(130% 130% at 50% -5%, #fdf9f3 0%, #f4eee3 55%, #ece4d6 100%)',
        }}
      >
        {/* faint blueprint grid (depth) */}
        <Box aria-hidden sx={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          backgroundImage: `linear-gradient(to right, ${gridColor} 1px, transparent 1px),
                            linear-gradient(to bottom, ${gridColor} 1px, transparent 1px)`,
          backgroundSize: '40px 40px',
          maskImage: 'radial-gradient(ellipse at 50% 45%, #000 55%, transparent 88%)',
          WebkitMaskImage: 'radial-gradient(ellipse at 50% 45%, #000 55%, transparent 88%)',
        }} />
        {/* vignette */}
        <Box aria-hidden sx={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          boxShadow: `inset 0 0 120px ${isDark ? 'rgba(0,0,0,0.55)' : 'rgba(20,18,14,0.10)'}`,
        }} />

        {/* SVG overlay for arrows + lines (measured px → no distortion) */}
        <svg
          width={size.w} height={size.h}
          style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
        >
          <defs>
            <marker id="kx-arrow" markerWidth="9" markerHeight="9" refX="6.5" refY="3"
              orient="auto" markerUnits="strokeWidth">
              <path d="M0,0 L7,3 L0,6 Z" fill={BRAND.copper} />
            </marker>
            {/* userSpaceOnUse region tied to the stage: the default
                objectBoundingBox filter region collapses to zero area for
                axis-aligned (perfectly horizontal/vertical) arrows — a line's
                geometric bbox has zero height/width — which clips those arrows to
                nothing. A user-space region keeps every arrow visible, including
                horizontal flow edges and vertical tree edges. */}
            <filter id="kx-glow" filterUnits="userSpaceOnUse"
              x={0} y={0} width={size.w || 1} height={size.h || 1}>
              <feGaussianBlur stdDeviation="2.2" result="b" />
              <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
          </defs>
          {lines.map((el, i) => {
            const isArrow = el.type === 'arrow'
            const stroke = isArrow ? BRAND.copper : (resolveColor(theme, el.color) || BRAND.copper)
            const drawn = !reduce && el.enter === 'draw'
            return (
              <Motion.line
                key={`${idx}-line-${i}`}
                x1={px(el.x1 ?? 0)} y1={py(el.y1 ?? 0)}
                x2={px(el.x2 ?? 0)} y2={py(el.y2 ?? 0)}
                stroke={stroke}
                strokeWidth={isArrow ? 2.6 : 2}
                strokeLinecap="round"
                filter={isArrow ? 'url(#kx-glow)' : undefined}
                markerEnd={isArrow ? 'url(#kx-arrow)' : undefined}
                initial={drawn ? { pathLength: 0, opacity: 0 } : { opacity: 0 }}
                animate={drawn ? { pathLength: 1, opacity: 1 } : { opacity: 1 }}
                transition={{ duration: reduce ? 0 : 0.7, delay: reduce ? 0 : 0.25 + i * 0.15, ease: EXPO }}
              />
            )
          })}
        </svg>

        {/* HTML layer: text, nodes, circles (percent-positioned) */}
        {blocks.map((el, i) => (
          <SceneBlock key={`${idx}-block-${i}`} el={el} index={i} reduce={reduce} theme={theme} isDark={isDark} />
        ))}
      </Box>

      {/* ── Narration caption — the teacher's explanation for this beat ── */}
      <Box sx={{ mt: 1.75, minHeight: 64, display: 'flex', justifyContent: 'center', px: 2 }}>
        <Motion.div
          key={`narr-${idx}`}
          initial={{ opacity: 0, y: reduce ? 0 : 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: reduce ? 0 : 0.5, ease: EXPO }}
          style={{ width: '100%', maxWidth: 760 }}
        >
          <Box sx={{
            display: 'flex', gap: 1.25, alignItems: 'flex-start',
            px: 2, py: 1.5, borderRadius: 2.5,
            borderLeft: `3px solid ${BRAND.copper}`,
            bgcolor: isDark ? alpha(BRAND.copper, 0.07) : alpha(BRAND.copper, 0.05),
          }}>
            <Typography sx={{ fontSize: 16, lineHeight: 1.6, color: 'text.primary' }}>
              {scene?.narration}
            </Typography>
          </Box>
        </Motion.div>
      </Box>

      {/* ── Controls ── */}
      <Box sx={{ mt: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.5 }}>
        <Tooltip title="Previous"><span><IconButton size="small" disabled={idx === 0} onClick={() => { setPlaying(false); setIdx(idx - 1) }}><ChevronLeftRoundedIcon /></IconButton></span></Tooltip>
        {atEnd
          ? <Tooltip title="Replay"><IconButton size="small" onClick={() => { setIdx(0); setPlaying(true) }}><ReplayRoundedIcon /></IconButton></Tooltip>
          : <Tooltip title={playing ? 'Pause' : 'Play'}><IconButton size="small" onClick={() => setPlaying(p => !p)} sx={{ color: BRAND.copper }}>{playing ? <PauseRoundedIcon /> : <PlayArrowRoundedIcon />}</IconButton></Tooltip>}
        <Tooltip title="Next"><span><IconButton data-testid="scene-next" size="small" disabled={atEnd} onClick={() => { setPlaying(false); setIdx(idx + 1) }}><ChevronRightRoundedIcon /></IconButton></span></Tooltip>

        {/* scene dots */}
        <Box sx={{ display: 'flex', gap: 0.6, ml: 1.5 }}>
          {scenes.map((_, i) => (
            <Box key={i} data-testid={`scene-dot-${i}`} onClick={() => { setPlaying(false); setIdx(i) }}
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

function SceneBlock({ el, index, reduce, theme, isDark }: {
  el: SceneElement
  index: number
  reduce: boolean
  theme: Theme
  isDark: boolean
}) {
  const { initial, animate } = htmlEnter(el.enter, reduce)
  const stagger = 0.15 + index * 0.2
  const transition = reduce
    ? { duration: 0 }
    : el.enter === 'pop'
      ? { type: 'spring' as const, stiffness: 300, damping: 17, delay: stagger }
      : { duration: 0.6, delay: stagger, ease: EXPO }
  const color = resolveColor(theme, el.color)
  const accent = isAccentColor(el.color)
  const common = {
    position: 'absolute' as const,
    left: `${clampPct(el.x)}%`, top: `${clampPct(el.y)}%`,
  }
  // Framer drives `transform` for the enter animation, which would clobber a
  // static translate(-50%,-50%) and leave elements top-left-anchored (off-centre).
  // Compose the centring in front of Framer's generated transform instead.
  const center = (_latest: object, generated: string) => `translate(-50%, -50%) ${generated}`

  // Shared "material" for shapes: gradient fill + a soft shadow; the focal/accent
  // element gets a glow so the eye goes there (staging).
  const fill = `radial-gradient(circle at 35% 28%, ${alpha(color, isDark ? 0.34 : 0.22)}, ${alpha(color, isDark ? 0.10 : 0.06)})`
  const shapeShadow = accent
    ? `0 0 26px ${alpha(color, 0.42)}, 0 8px 22px ${alpha('#000', isDark ? 0.4 : 0.16)}`
    : `0 8px 22px ${alpha('#000', isDark ? 0.34 : 0.12)}`

  if (el.type === 'text') {
    const fs = TEXT_SIZE[el.size ?? 'body'] ?? 15
    const isTitle = el.size === 'title' || el.size === 'heading'
    return (
      <Motion.div initial={initial} animate={animate} transition={transition} transformTemplate={center}
        style={{ ...common, textAlign: 'center', maxWidth: '82%' }}>
        <Typography sx={{
          fontSize: fs,
          fontWeight: isTitle ? 800 : 500,
          letterSpacing: isTitle ? '-0.01em' : 0,
          color, lineHeight: 1.22,
          textShadow: accent && isTitle ? `0 0 22px ${alpha(color, 0.5)}` : 'none',
        }}>
          {el.text}
        </Typography>
      </Motion.div>
    )
  }

  if (el.type === 'circle') {
    const d = `${(el.r ?? 10) * 2}%`
    return (
      <Motion.div initial={initial} animate={animate} transition={transition} transformTemplate={center}
        style={{ ...common, width: d, aspectRatio: '1 / 1', display: 'flex', alignItems: 'center', justifyContent: 'center',
          borderRadius: '50%', border: `1.5px solid ${alpha(color, 0.9)}`, background: fill, boxShadow: shapeShadow }}>
        <Typography sx={{ fontSize: 12.5, fontWeight: 600, color, textAlign: 'center', px: 1 }}>{el.label}</Typography>
      </Motion.div>
    )
  }

  if (el.type === 'code') {
    const codeLines = (el.code ?? '').replace(/\r/g, '').split('\n')
    const hi = el.highlight ?? -1
    return (
      <Motion.div data-testid="scene-code" initial={initial} animate={animate} transition={transition} transformTemplate={center}
        style={{ ...common, width: `${el.w ?? 58}%`, maxWidth: '90%' }}>
        <Box sx={{
          fontFamily: MONO, fontSize: 12.5, lineHeight: 1.65, textAlign: 'left',
          borderRadius: 2, overflow: 'hidden', border: `1px solid ${alpha(BRAND.copper, 0.3)}`,
          bgcolor: isDark ? 'rgba(8,7,6,0.94)' : 'rgba(252,249,243,0.99)', boxShadow: shapeShadow,
        }}>
          <Box sx={{ px: 1.25, py: 0.4, fontSize: 10.5, color: 'text.disabled',
            borderBottom: `1px solid ${theme.palette.divider}` }}>{el.lang || 'code'}</Box>
          <Box sx={{ py: 0.75 }}>
            {codeLines.map((ln, li) => {
              const active = li + 1 === hi
              return (
                <Box key={li} sx={{ display: 'flex', whiteSpace: 'pre',
                  bgcolor: active ? alpha(BRAND.copper, 0.18) : 'transparent',
                  borderLeft: active ? `2px solid ${BRAND.copper}` : '2px solid transparent' }}>
                  <Box component="span" sx={{ width: 26, color: 'text.disabled', userSelect: 'none', textAlign: 'right', pr: 1 }}>{li + 1}</Box>
                  <Box component="span" sx={{ color: active ? 'text.primary' : 'text.secondary' }}>{ln || ' '}</Box>
                </Box>
              )
            })}
          </Box>
        </Box>
      </Motion.div>
    )
  }

  // node (labelled box)
  return (
    <Motion.div initial={initial} animate={animate} transition={transition} transformTemplate={center}
      style={{ ...common, width: `${el.w ?? 24}%`, height: `${el.h ?? 14}%`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        borderRadius: 12, border: `1.5px solid ${alpha(color, 0.9)}`, background: fill,
        boxShadow: shapeShadow, padding: '0 8px' }}>
      <Typography sx={{ fontSize: 13.5, fontWeight: 600, color, textAlign: 'center', lineHeight: 1.2 }}>{el.label}</Typography>
    </Motion.div>
  )
}
