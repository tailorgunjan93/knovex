/**
 * Settings Page — tabbed view with LLM, Search, and App settings.
 */

import { useState } from 'react'
import { Box, Tabs, Tab, Typography, CircularProgress } from '@mui/material'
import { useQuery } from '@tanstack/react-query'
import MemoryIcon from '@mui/icons-material/Memory'
import TravelExploreIcon from '@mui/icons-material/TravelExplore'
import TuneIcon from '@mui/icons-material/Tune'
import { settingsApi } from '@/api/settings.api'
import LLMSettingsTab from './LLMSettings'
import SearchSettingsTab from './SearchSettings'
import AppSettingsTab from './AppSettings'

const TABS = [
  { label: 'LLM',    icon: <MemoryIcon fontSize="small" /> },
  { label: 'Search', icon: <TravelExploreIcon fontSize="small" /> },
  { label: 'App',    icon: <TuneIcon fontSize="small" /> },
]

export default function SettingsPage() {
  const [tab, setTab] = useState(0)

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
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <Box sx={{ px: 3, pt: 3, pb: 1, borderBottom: '1px solid', borderColor: 'divider' }}>
        <Typography variant="h5" fontWeight={700}>Settings</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
          Configure LLM providers, web search, and app preferences.
        </Typography>
      </Box>

      <Box sx={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Vertical tabs */}
        <Tabs
          orientation="vertical"
          value={tab}
          onChange={(_, v) => setTab(v)}
          sx={{
            borderRight: '1px solid',
            borderColor: 'divider',
            minWidth: 140,
            pt: 1,
          }}
        >
          {TABS.map((t, i) => (
            <Tab
              key={t.label}
              label={t.label}
              icon={t.icon}
              iconPosition="start"
              sx={{
                justifyContent: 'flex-start',
                minHeight: 44,
                textTransform: 'none',
                fontWeight: 500,
                px: 2,
              }}
            />
          ))}
        </Tabs>

        {/* Tab content */}
        <Box sx={{ flex: 1, overflow: 'auto', p: 3 }}>
          {tab === 0 && <LLMSettingsTab settings={settings} />}
          {tab === 1 && <SearchSettingsTab settings={settings} />}
          {tab === 2 && <AppSettingsTab settings={settings} />}
        </Box>
      </Box>
    </Box>
  )
}
