/**
 * Settings Page — tabbed view with LLM, Search, and App settings.
 * Header follows KnovexUI "Make Knovex yours" pattern.
 */

import { useState } from 'react'
import { Box, Button, Tabs, Tab, Typography, CircularProgress, useTheme } from '@mui/material'
import RefreshIcon from '@mui/icons-material/Refresh'
import CheckIcon from '@mui/icons-material/Check'
import { useQuery } from '@tanstack/react-query'
import MemoryIcon from '@mui/icons-material/Memory'
import TravelExploreIcon from '@mui/icons-material/TravelExplore'
import TuneIcon from '@mui/icons-material/Tune'
import ScatterPlotIcon from '@mui/icons-material/ScatterPlot'
import { settingsApi } from '@/api/settings.api'
import LLMSettingsTab from './LLMSettings'
import SearchSettingsTab from './SearchSettings'
import AppSettingsTab from './AppSettings'
import EmbeddingSettingsTab from './EmbeddingSettings'
import ScreenHeader from '@/components/Layout/ScreenHeader'

const TABS = [
  { label: 'LLM',        icon: <MemoryIcon fontSize="small" />,        section: '01 · INFERENCE' },
  { label: 'Search',     icon: <TravelExploreIcon fontSize="small" />, section: '02 · RETRIEVAL' },
  { label: 'App',        icon: <TuneIcon fontSize="small" />,          section: '03 · APPEARANCE' },
  { label: 'Embeddings', icon: <ScatterPlotIcon fontSize="small" />,   section: '04 · EMBEDDINGS' },
]

const MONO = '"IBM Plex Mono", "Geist Mono", monospace'

export default function SettingsPage() {
  const [tab, setTab] = useState(0)
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
        eyebrow="SETTINGS — WORKSPACE"
        title="Make Knovex"
        emphasis="yours"
        sub="Bring your own keys, pick your engines, tune the app. Everything stays on this machine."
        actions={
          <>
            <Button
              size="small"
              variant="outlined"
              startIcon={<RefreshIcon sx={{ fontSize: 14 }} />}
              sx={{ fontSize: 12, height: 32 }}
            >
              Reset
            </Button>
            <Button
              size="small"
              variant="contained"
              startIcon={<CheckIcon sx={{ fontSize: 14 }} />}
              sx={{ fontSize: 12, height: 32 }}
            >
              All saved
            </Button>
          </>
        }
      />

      <Box sx={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Vertical tab rail */}
        <Box
          sx={{
            width: 160,
            flexShrink: 0,
            borderRight: `1px solid ${theme.palette.divider}`,
            display: 'flex',
            flexDirection: 'column',
            pt: 2,
            gap: 0.25,
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
                  gap: 1.25,
                  px: 2,
                  py: 0,
                  height: 34,
                  mx: 1,
                  borderRadius: 0.875,
                  cursor: 'pointer',
                  color: active ? 'text.primary' : 'text.secondary',
                  bgcolor: active ? (theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.07)') : 'transparent',
                  position: 'relative',
                  transition: 'background 80ms ease, color 80ms ease',
                  '&:hover': {
                    bgcolor: active
                      ? (theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.07)')
                      : (theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)'),
                    color: 'text.primary',
                  },
                  '&::before': active ? {
                    content: '""',
                    position: 'absolute',
                    left: -9,
                    top: 6,
                    bottom: 6,
                    width: 2,
                    borderRadius: '0 2px 2px 0',
                    bgcolor: 'primary.main',
                  } : {},
                }}
              >
                <Box sx={{ color: active ? 'primary.main' : 'inherit', display: 'flex', alignItems: 'center', flexShrink: 0 }}>
                  {t.icon}
                </Box>
                <Typography sx={{ fontSize: 13, fontWeight: active ? 500 : 450, letterSpacing: '-0.005em', lineHeight: 1 }}>
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

          {tab === 0 && <LLMSettingsTab settings={settings} />}
          {tab === 1 && <SearchSettingsTab settings={settings} />}
          {tab === 2 && <AppSettingsTab settings={settings} />}
          {tab === 3 && <EmbeddingSettingsTab settings={settings} />}
        </Box>
      </Box>
    </Box>
  )
}
