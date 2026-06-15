/**
 * ConnectAICard — the first-run safety net.
 *
 * Shown on any AI surface (Chat, Learn) when no LLM provider is configured, so a
 * brand-new user is GUIDED to set one up instead of hitting a raw auth error and
 * giving up. Explains the two no-friction paths (a free online key, or fully
 * offline Ollama) in plain language and routes to the existing Settings → AI tab,
 * which already has the provider picker, key field, Test Connection and Ollama
 * detect.
 */
import { Box, Typography, useTheme, alpha } from '@mui/material'
import { useNavigate } from 'react-router-dom'
import KeyRoundedIcon from '@mui/icons-material/KeyRounded'
import ComputerRoundedIcon from '@mui/icons-material/ComputerRounded'
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded'
import { BRAND } from '@/theme/tokens'

const MONO = '"IBM Plex Mono", "Geist Mono", monospace'

export default function ConnectAICard({ compact = false }: { compact?: boolean }) {
  const theme  = useTheme()
  const isDark = theme.palette.mode === 'dark'
  const navigate = useNavigate()
  const accent = theme.palette.primary.main

  const Path = ({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) => (
    <Box sx={{
      flex: 1, minWidth: 180, display: 'flex', gap: 1.25, alignItems: 'flex-start',
      px: 1.75, py: 1.5, borderRadius: 2.5,
      bgcolor: alpha(accent, isDark ? 0.07 : 0.05),
      border: `1px solid ${alpha(accent, 0.22)}`,
    }}>
      <Box sx={{ width: 30, height: 30, borderRadius: 2, flexShrink: 0,
                 display: 'grid', placeItems: 'center',
                 bgcolor: alpha(accent, 0.14), color: accent }}>
        {icon}
      </Box>
      <Box minWidth={0}>
        <Typography sx={{ fontSize: 13.5, fontWeight: 700, color: 'text.primary', mb: 0.25 }}>{title}</Typography>
        <Typography sx={{ fontSize: 12, color: 'text.secondary', lineHeight: 1.45 }}>{body}</Typography>
      </Box>
    </Box>
  )

  return (
    <Box
      data-testid="connect-ai-card"
      sx={{
        maxWidth: 620, mx: 'auto', my: compact ? 1.5 : 4, px: 3, py: compact ? 2.5 : 3.5,
        borderRadius: 4, textAlign: 'center',
        bgcolor: 'background.paper',
        border: `1px solid ${theme.palette.divider}`,
        boxShadow: isDark ? '0 18px 50px rgba(0,0,0,0.4)' : '0 14px 40px rgba(20,18,14,0.10)',
      }}
    >
      <Typography sx={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: '0.14em',
                        textTransform: 'uppercase', color: alpha(accent, 0.85), mb: 1 }}>
        One quick setup
      </Typography>
      <Typography sx={{ fontSize: compact ? 18 : 22, fontWeight: 800, letterSpacing: '-0.01em', mb: 0.75 }}>
        Connect your AI to get started
      </Typography>
      <Typography sx={{ fontSize: 14, color: 'text.secondary', lineHeight: 1.6, mb: 2.25, maxWidth: 480, mx: 'auto' }}>
        Knovex uses an AI model to answer questions and build lessons. Pick whichever suits you —
        it takes about a minute, and everything stays on your machine.
      </Typography>

      <Box sx={{ display: 'flex', gap: 1.25, flexWrap: 'wrap', mb: 2.25, textAlign: 'left' }}>
        <Path
          icon={<KeyRoundedIcon sx={{ fontSize: 17 }} />}
          title="Use a free online key"
          body="Groq or Gemini — free, no credit card. Get a key, paste it, done."
        />
        <Path
          icon={<ComputerRoundedIcon sx={{ fontSize: 17 }} />}
          title="Run fully offline"
          body="Use Ollama on your own machine — 100% private, no key needed."
        />
      </Box>

      <Box
        component="button"
        onClick={() => navigate('/settings?tab=llm')}
        sx={{
          height: 44, px: 3, borderRadius: 3, border: 0, cursor: 'pointer',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 0.75,
          fontFamily: 'inherit', fontSize: 14.5, fontWeight: 700,
          background: BRAND.gradient, color: BRAND.onAccent,
          '&:hover': { filter: 'brightness(1.08)' },
        }}
      >
        Set up AI
        <ArrowForwardRoundedIcon sx={{ fontSize: 18 }} />
      </Box>
    </Box>
  )
}
