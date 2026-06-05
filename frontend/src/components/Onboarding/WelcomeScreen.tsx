/**
 * WelcomeScreen — first-run onboarding.
 *
 * Shown once, gated on settings.onboarded === false (AppShell). Asks "what
 * should I call you?", saves display_name + onboarded=true. Skipping still sets
 * onboarded=true with an empty name (the app falls back to "You"), so the
 * screen never reappears. This is the user-facing half of the root fix for the
 * "fresh install is called Gunjan" bug — no name is assumed, the user chooses.
 */

import { useState } from 'react'
import { Box, Typography, useTheme, alpha } from '@mui/material'
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded'
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
  const [name, setName] = useState('')

  const finish = () => { if (!saving) onComplete(name.trim()) }

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

      <Box sx={{ position: 'relative', width: 420, maxWidth: '90vw', textAlign: 'center', px: 2 }}>
        <Box sx={{
          width: 64, height: 64, borderRadius: 4, mx: 'auto', mb: 3,
          display: 'grid', placeItems: 'center',
          bgcolor: 'background.paper', border: `1px solid ${theme.palette.divider}`,
          boxShadow: `0 12px 36px -10px ${alpha(BRAND.copper, 0.5)}`,
        }}>
          <KnovexMark size={38} />
        </Box>

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
          onKeyDown={(e) => { if ((e as React.KeyboardEvent).key === 'Enter') finish() }}
          sx={{
            width: '100%', height: 48, px: 2, mb: 1.5, borderRadius: 3, textAlign: 'center',
            border: `1px solid ${theme.palette.divider}`, bgcolor: 'background.paper',
            color: 'text.primary', fontFamily: 'inherit', fontSize: 17, outline: 'none',
            '&:focus': { borderColor: BRAND.copper },
          }}
        />

        <Box
          component="button"
          onClick={finish}
          disabled={saving}
          sx={{
            width: '100%', height: 46, borderRadius: 3, border: 0,
            cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.7 : 1,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 0.75,
            fontFamily: 'inherit', fontSize: 15, fontWeight: 700,
            background: BRAND.gradient, color: BRAND.onAccent,
            '&:hover': { filter: saving ? 'none' : 'brightness(1.08)' },
          }}
        >
          {saving ? 'Setting up…' : 'Get started'}
          {!saving && <ArrowForwardRoundedIcon sx={{ fontSize: 18 }} />}
        </Box>

        <Box
          component="button"
          onClick={() => !saving && onComplete('')}
          disabled={saving}
          sx={{
            mt: 1.5, p: 0, border: 0, background: 'none',
            fontFamily: 'inherit', fontSize: 13, color: 'text.disabled',
            cursor: saving ? 'default' : 'pointer',
            '&:hover': { color: 'text.secondary' },
          }}
        >
          Skip for now
        </Box>
      </Box>
    </Box>
  )
}
