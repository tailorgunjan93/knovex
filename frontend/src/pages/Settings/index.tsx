/**
 * Settings Page — tabbed view with LLM, Search, and App settings.
 * Header follows KnovexUI "Make Knovex yours" pattern.
 */

import { useState } from 'react'
import { Box, Button, Typography, CircularProgress, alpha, useTheme } from '@mui/material'
import RefreshIcon from '@mui/icons-material/Refresh'
import CheckIcon from '@mui/icons-material/Check'
import { useQuery } from '@tanstack/react-query'
import PersonOutlineIcon from '@mui/icons-material/PersonOutline'
import MemoryIcon from '@mui/icons-material/Memory'
import TravelExploreIcon from '@mui/icons-material/TravelExplore'
import TuneIcon from '@mui/icons-material/Tune'
import ScatterPlotIcon from '@mui/icons-material/ScatterPlot'
import { settingsApi } from '@/api/settings.api'
import ProfileSettingsTab from './ProfileSettings'
import LLMSettingsTab from './LLMSettings'
import SearchSettingsTab from './SearchSettings'
import AppSettingsTab from './AppSettings'
import EmbeddingSettingsTab from './EmbeddingSettings'
import ScreenHeader from '@/components/Layout/ScreenHeader'
import { useSearchParams } from 'react-router-dom'
import { BRAND } from '@/theme/tokens'

const TABS = [
  { label: 'Profile',    icon: <PersonOutlineIcon fontSize="small" />, section: '00 · IDENTITY' },
  { label: 'LLM',        icon: <MemoryIcon fontSize="small" />,        section: '01 · INFERENCE' },
  { label: 'Search',     icon: <TravelExploreIcon fontSize="small" />, section: '02 · RETRIEVAL' },
  { label: 'App',        icon: <TuneIcon fontSize="small" />,          section: '03 · APPEARANCE' },
  { label: 'Embeddings', icon: <ScatterPlotIcon fontSize="small" />,   section: '04 · EMBEDDINGS' },
]

// Deep-link support: /settings?tab=llm opens the AI tab directly (used by the
// "Connect your AI" first-run card and onboarding).
const TAB_BY_NAME: Record<string, number> = { profile: 0, llm: 1, ai: 1, search: 2, app: 3, embeddings: 4 }

const MONO = '"IBM Plex Mono", "Geist Mono", monospace'

export default function SettingsPage() {
  const [searchParams] = useSearchParams()
  const [tab, setTab] = useState(() => TAB_BY_NAME[(searchParams.get('tab') ?? '').toLowerCase()] ?? 0)
  const theme = useTheme()

  const { data: settings, isLoading, error } = useQuery({
    queryKey: ['settings'],
    queryFn: settingsApi.get,
    staleTime: 30_000,
  })

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
        <CircularProgress />
      </Box>
    )
  }

  if (error || !settings) {
    return (
      <Box sx={{ p: 4 }}>
        <Typography color="error">Failed to load settings. Is the backend running?</Typography>
      </Box>
    )
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* KnovexUI screen header — "Make Knovex yours" */}
      <ScreenHeader
        eyebrow="SETTINGS"
        title="Make Knovex"
        emphasis="yours"
        actions={
          <>
            <Button
              size="small"
              startIcon={<RefreshIcon sx={{ fontSize: 14 }} />}
              sx={{
                fontSize: 12.5, height: 36, px: 2, borderRadius: 99, textTransform: 'none',
                color: 'text.secondary', border: '1px solid', borderColor: 'divider',
                '&:hover': { bgcolor: 'action.hover', borderColor: 'text.disabled' },
              }}
            >
              Reset
            </Button>
            <Button
              size="small"
              disableElevation
              startIcon={<CheckIcon sx={{ fontSize: 14 }} />}
              sx={{
                fontSize: 12.5, height: 36, px: 2, borderRadius: 99, fontWeight: 700, textTransform: 'none',
                background: BRAND.gradient, color: BRAND.onAccent,
                '&:hover': { background: BRAND.gradient, filter: 'brightness(1.05)' },
              }}
            >
              All saved
            </Button>
          </>
        }
      />

      <Box sx={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Vertical nav rail (lab: amber-filled active row, no divider) */}
        <Box
          sx={{
            width: 220,
            flexShrink: 0,
            display: 'flex',
            flexDirection: 'column',
            pt: 1,
            px: 1.5,
            gap: 0.5,
          }}
        >
          {TABS.map((t, i) => {
            const active = tab === i
            return (
              <Box
                key={t.label}
                onClick={() => setTab(i)}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1.5,
                  px: 1.75,
                  height: 44,
                  borderRadius: 2,
                  cursor: 'pointer',
                  color: active ? BRAND.onAccent : 'text.secondary',
                  background: active ? BRAND.gradient : 'transparent',
                  transition: 'background 0.12s, color 0.12s',
                  '&:hover': active ? {} : { bgcolor: 'action.hover', color: 'text.primary' },
                }}
              >
                <Box sx={{ color: active ? BRAND.onAccent : 'text.disabled', display: 'flex', alignItems: 'center', flexShrink: 0 }}>
                  {t.icon}
                </Box>
                <Typography sx={{ fontSize: 14, fontWeight: active ? 700 : 500, letterSpacing: '-0.005em', lineHeight: 1 }}>
                  {t.label}
                </Typography>
              </Box>
            )
          })}
        </Box>

        {/* Tab content */}
        <Box sx={{ flex: 1, overflow: 'auto', px: 3.5, py: 2.5 }}>
          {/* Section header — "01 · INFERENCE" style */}
          <Box sx={{ mb: 2.5 }}>
            <Typography
              sx={{
                fontFamily:    MONO,
                fontSize:       10,
                textTransform: 'uppercase',
                letterSpacing: '0.13em',
                color:          'text.disabled',
                mb:             0.5,
              }}
            >
              {TABS[tab].section}
            </Typography>
          </Box>

          {tab === 0 && <ProfileSettingsTab settings={settings} />}
          {tab === 1 && <LLMSettingsTab settings={settings} />}
          {tab === 2 && <SearchSettingsTab settings={settings} />}
          {tab === 3 && <AppSettingsTab settings={settings} />}
          {tab === 4 && <EmbeddingSettingsTab settings={settings} />}
        </Box>
      </Box>
    </Box>
  )
}
