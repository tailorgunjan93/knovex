/**
 * App Shell — overall layout wrapper
 *
 * Structure:
 *   [Sidebar 64px] | [Main content area — fills remaining width]
 *
 * Provides the CssBaseline and ThemeProvider at the root level.
 */

import { useMemo, useEffect } from 'react'
import { Outlet, useNavigate } from 'react-router-dom'
import { Box, ThemeProvider, CssBaseline } from '@mui/material'
import { useQuery } from '@tanstack/react-query'
import Sidebar from './Sidebar'
import { getTheme } from '@/theme'
import { useSettingsStore, useThemeMode } from '@/store/settings.store'
import { settingsApi } from '@/api/settings.api'

export default function AppShell() {
  const { setSettings } = useSettingsStore()
  const themeMode = useThemeMode()
  const navigate = useNavigate()

  // Load settings on mount
  const { data } = useQuery({
    queryKey: ['settings'],
    queryFn: settingsApi.get,
    staleTime: 60_000,
  })

  useEffect(() => {
    if (data) setSettings(data)
  }, [data, setSettings])

  // Wire up tray-initiated navigation from Electron main process
  useEffect(() => {
    if (!window.knovex?.onNavigate) return
    const cleanup = window.knovex.onNavigate((route) => navigate(route))
    return cleanup
  }, [navigate])

  const theme = useMemo(() => getTheme(themeMode), [themeMode])

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box
        sx={{
          display: 'flex',
          height: '100vh',
          overflow: 'hidden',
          bgcolor: 'background.default',
        }}
      >
        <Sidebar />
        <Box
          component="main"
          sx={{
            flex: 1,
            overflow: 'auto',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <Outlet />
        </Box>
      </Box>
    </ThemeProvider>
  )
}
