/**
 * AnimatedBeat — kinetic entrance for a single guided-lesson beat.
 *
 * Wraps a beat card so it springs in (slide + fade + slight scale) with a
 * draw-on connector down the left gutter and a popping icon chip — so the
 * explanation visibly "builds itself" as it teaches (the animated step-through
 * direction), for ANY topic with no pre-made assets.
 *
 * Consumes the Phase-1 motion wrapper (@/lib/motion) — the only allowed framer
 * importer — and honors reduced-motion: when the OS asks to reduce motion, the
 * beat renders statically (no transforms), preserving full content + a11y.
 */

import { Box, Typography, useTheme, alpha } from '@mui/material'
import { Motion, usePrefersReducedMotion } from '@/lib/motion'

const MONO = '"IBM Plex Mono", "Geist Mono", monospace'

// "Smooth & cinematic" feel — softer spring, longer travel, graceful glide.
// Tuned locally (not the shared MOTION token) so this is the beat's signature
// motion while the global spring default stays available for other consumers.
const BEAT_SPRING = { type: 'spring' as const, stiffness: 210, damping: 26, mass: 1 }
const EASE_OUT = [0.22, 1, 0.36, 1] as const

interface AnimatedBeatProps {
  icon: React.ReactNode
  label: string
  accent: string
  /** true when this is the most-recently-revealed beat (gets the entrance). */
  isLatest: boolean
  /** true when another beat follows — draws the connector through the gutter. */
  hasNext: boolean
  children: React.ReactNode
}

export default function AnimatedBeat({ icon, label, accent, isLatest, hasNext, children }: AnimatedBeatProps) {
  const theme   = useTheme()
  const isDark  = theme.palette.mode === 'dark'
  const reduce  = usePrefersReducedMotion()

  // Only the latest beat animates; earlier ones are already settled.
  const animate = isLatest && !reduce

  return (
    <Motion.div
      initial={animate ? { opacity: 0, y: 24, scale: 0.97 } : false}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={BEAT_SPRING}
      style={{ position: 'relative' }}
    >
      {/* Gutter connector — draws downward toward the next beat (slow, staggered) */}
      {hasNext && (
        <Motion.div
          aria-hidden
          initial={animate ? { scaleY: 0 } : false}
          animate={{ scaleY: 1 }}
          transition={{ duration: 0.55, ease: EASE_OUT, delay: 0.12 }}
          style={{
            position: 'absolute',
            left: 19, top: 40, bottom: -14, width: 2,
            transformOrigin: 'top',
            background: alpha(accent, isDark ? 0.4 : 0.32),
            borderRadius: 2,
          }}
        />
      )}

      <Box sx={{
        display: 'flex', gap: 1.5, p: 2, borderRadius: 2, position: 'relative',
        bgcolor: isDark ? alpha(accent, 0.07) : alpha(accent, 0.06),
        border:  `1px solid ${alpha(accent, isDark ? 0.18 : 0.2)}`,
      }}>
        {/* Icon chip — pops in slightly after the card */}
        <Motion.div
          initial={animate ? { scale: 0.7, opacity: 0 } : false}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 240, damping: 24, delay: 0.14 }}
          style={{
            flexShrink: 0, width: 24, height: 24, borderRadius: 7,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: accent, background: alpha(accent, isDark ? 0.16 : 0.14),
          }}
        >
          <Box sx={{ display: 'flex', '& .MuiSvgIcon-root': { fontSize: 15 } }}>{icon}</Box>
        </Motion.div>

        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{
            fontFamily: MONO, fontSize: 9, textTransform: 'uppercase',
            letterSpacing: '0.12em', color: accent, mb: 0.6,
          }}>
            {label}
          </Typography>
          {children}
        </Box>
      </Box>
    </Motion.div>
  )
}
