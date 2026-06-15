/**
 * WelcomeScreen — first-run onboarding (2 steps).
 *
 * Step 1 — "what should I call you?" (display_name; no name is ever assumed).
 * Step 2 — "connect your AI": a brand-new user doesn't know they need a key, so
 *   instead of letting their first Chat/Learn attempt fail with a raw auth error,
 *   we proactively show the two no-friction paths (a free online key, or fully
 *   offline Ollama) and route them into Settings → AI. "I'll do this later" is
 *   safe because every AI surface also shows the ConnectAICard if no AI is set.
 *
 * Skipping at either point still marks onboarding complete so the screen never
 * reappears (the app falls back to "You" for an empty name).
 */

import { useState } from 'react'
import { Box, Typography, useTheme, alpha } from '@mui/material'
import { useNavigate } from 'react-router-dom'
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded'
import KeyRoundedIcon from '@mui/icons-material/KeyRounded'
import ComputerRoundedIcon from '@mui/icons-material/ComputerRounded'
import KnovexMark from '@/components/brand/KnovexMark'
import { BRAND } from '@/theme/tokens'

const MONO = '"IBM Plex Mono", "Geist Mono", monospace'

interface WelcomeScreenProps {
  /** Persist the chosen name (may be empty) and mark onboarding complete. */
  onComplete: (name: string) => void
  saving?: boolean
}

export default function WelcomeScreen({ onComplete, saving = false }: WelcomeScreenProps) {
  const theme = useTheme()
  const navigate = useNavigate()
  const [step, setStep] = useState<1 | 2>(1)
  const [name, setName] = useState('')

  const primaryBtn = {
    width: '100%', height: 46, borderRadius: 3, border: 0,
    cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.7 : 1,
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 0.75,
    fontFamily: 'inherit', fontSize: 15, fontWeight: 700,
    background: BRAND.gradient, color: BRAND.onAccent,
    '&:hover': { filter: saving ? 'none' : 'brightness(1.08)' },
  } as const

  const textBtn = {
    mt: 1.5, p: 0, border: 0, background: 'none', fontFamily: 'inherit', fontSize: 13,
    color: 'text.disabled', cursor: saving ? 'default' : 'pointer',
    '&:hover': { color: 'text.secondary' },
  } as const

  const finishAndSetup = () => {
    if (saving) return
    onComplete(name.trim())
    navigate('/settings?tab=llm')
  }

  return (
    <Box sx={{
      position: 'fixed', inset: 0, zIndex: 2000,
      display: 'grid', placeItems: 'center', overflow: 'hidden',
      bgcolor: 'background.default',
    }}>
      {/* ambient copper glow */}
      <Box sx={{
        position: 'absolute', inset: 0, opacity: 0.5, pointerEvents: 'none',
        background: `radial-gradient(600px 320px at 50% 12%, ${alpha(BRAND.copper, 0.15)}, transparent),
                     radial-gradient(500px 280px at 80% 90%, ${alpha(BRAND.copperDark, 0.12)}, transparent)`,
      }} />

      <Box sx={{ position: 'relative', width: step === 1 ? 420 : 480, maxWidth: '90vw', textAlign: 'center', px: 2 }}>
        <Box sx={{
          width: 64, height: 64, borderRadius: 4, mx: 'auto', mb: 3,
          display: 'grid', placeItems: 'center',
          bgcolor: 'background.paper', border: `1px solid ${theme.palette.divider}`,
          boxShadow: `0 12px 36px -10px ${alpha(BRAND.copper, 0.5)}`,
        }}>
          <KnovexMark size={38} />
        </Box>

        {step === 1 ? (
          <>
            <Typography sx={{ fontFamily: MONO, fontSize: 11, letterSpacing: '0.14em', color: BRAND.copperDark, mb: 1 }}>
              WELCOME TO KNOVEX
            </Typography>
            <Typography variant="h4" sx={{ fontWeight: 700, letterSpacing: '-0.02em', mb: 1 }}>
              What should I <Box component="em" sx={{ fontStyle: 'normal', color: 'primary.main' }}>call you</Box>?
            </Typography>
            <Typography color="text.secondary" sx={{ mb: 3.5, lineHeight: 1.6 }}>
              So Knovex can greet you properly. You can change this anytime in Settings —
              and it never leaves this machine.
            </Typography>

            <Box
              component="input"
              autoFocus
              value={name}
              placeholder="Your name"
              onChange={(e) => setName((e.target as HTMLInputElement).value)}
              onKeyDown={(e) => { if ((e as React.KeyboardEvent).key === 'Enter') setStep(2) }}
              sx={{
                width: '100%', height: 48, px: 2, mb: 1.5, borderRadius: 3, textAlign: 'center',
                border: `1px solid ${theme.palette.divider}`, bgcolor: 'background.paper',
                color: 'text.primary', fontFamily: 'inherit', fontSize: 17, outline: 'none',
                '&:focus': { borderColor: BRAND.copper },
              }}
            />

            <Box component="button" onClick={() => setStep(2)} disabled={saving} sx={primaryBtn}>
              Continue
              <ArrowForwardRoundedIcon sx={{ fontSize: 18 }} />
            </Box>
            <Box component="button" onClick={() => !saving && onComplete('')} disabled={saving} sx={textBtn}>
              Skip setup
            </Box>
          </>
        ) : (
          <>
            <Typography sx={{ fontFamily: MONO, fontSize: 11, letterSpacing: '0.14em', color: BRAND.copperDark, mb: 1 }}>
              ONE QUICK SETUP
            </Typography>
            <Typography variant="h4" sx={{ fontWeight: 700, letterSpacing: '-0.02em', mb: 1 }}>
              Connect your <Box component="em" sx={{ fontStyle: 'normal', color: 'primary.main' }}>AI</Box>
            </Typography>
            <Typography color="text.secondary" sx={{ mb: 2.75, lineHeight: 1.6 }}>
              Knovex uses an AI model to answer questions and build lessons. Pick whichever suits you —
              it takes about a minute, and everything stays on your machine.
            </Typography>

            <Box sx={{ display: 'flex', gap: 1.25, flexWrap: 'wrap', mb: 3, textAlign: 'left' }}>
              <PathCard
                icon={<KeyRoundedIcon sx={{ fontSize: 17 }} />}
                title="Use a free online key"
                body="Groq or Gemini — free, no credit card. Get a key, paste it, done."
              />
              <PathCard
                icon={<ComputerRoundedIcon sx={{ fontSize: 17 }} />}
                title="Run fully offline"
                body="Use Ollama on your machine — 100% private, no key needed."
              />
            </Box>

            <Box component="button" onClick={finishAndSetup} disabled={saving} sx={primaryBtn}>
              {saving ? 'Setting up…' : 'Set up my AI'}
              {!saving && <ArrowForwardRoundedIcon sx={{ fontSize: 18 }} />}
            </Box>
            <Box component="button" onClick={() => !saving && onComplete(name.trim())} disabled={saving} sx={textBtn}>
              I'll do this later
            </Box>
          </>
        )}
      </Box>
    </Box>
  )
}

function PathCard({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  const theme  = useTheme()
  const isDark = theme.palette.mode === 'dark'
  const accent = theme.palette.primary.main
  return (
    <Box sx={{
      flex: 1, minWidth: 190, display: 'flex', gap: 1.25, alignItems: 'flex-start',
      px: 1.75, py: 1.5, borderRadius: 2.5,
      bgcolor: alpha(accent, isDark ? 0.07 : 0.05),
      border: `1px solid ${alpha(accent, 0.22)}`,
    }}>
      <Box sx={{ width: 30, height: 30, borderRadius: 2, flexShrink: 0,
                 display: 'grid', placeItems: 'center', bgcolor: alpha(accent, 0.14), color: accent }}>
        {icon}
      </Box>
      <Box minWidth={0}>
        <Typography sx={{ fontSize: 13.5, fontWeight: 700, color: 'text.primary', mb: 0.25 }}>{title}</Typography>
        <Typography sx={{ fontSize: 12, color: 'text.secondary', lineHeight: 1.45 }}>{body}</Typography>
      </Box>
    </Box>
  )
}
