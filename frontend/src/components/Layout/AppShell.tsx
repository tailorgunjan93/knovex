/**
 * App Shell — overall layout wrapper
 *
 * Structure:
 *   [Update banner — shown only when update is downloaded]
 *   [Sidebar 64px] | [Main content area — fills remaining width]
 *
 * Provides the CssBaseline and ThemeProvider at the root level.
 */

import { useMemo, useEffect, useState } from 'react'
import { Outlet, useNavigate } from 'react-router-dom'
import {
  Box,
  ThemeProvider,
  CssBaseline,
  Typography,
  Button,
  IconButton,
  Collapse,
} from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'
import SystemUpdateAltIcon from '@mui/icons-material/SystemUpdateAlt'
import { useQuery } from '@tanstack/react-query'
import Sidebar from './Sidebar'
import { getTheme } from '@/theme'
import { useSettingsStore, useThemeMode } from '@/store/settings.store'
import { settingsApi } from '@/api/settings.api'

interface UpdateInfo {
  version: string
  releaseNotes: string | null
}

export default function AppShell() {
  const { setSettings } = useSettingsStore()
  const themeMode = useThemeMode()
  const navigate = useNavigate()

  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null)
  const [bannerVisible, setBannerVisible] = useState(false)

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

  // Listen for auto-update download completion
  useEffect(() => {
    if (!window.knovex?.onUpdateDownloaded) return
    const cleanup = window.knovex.onUpdateDownloaded((info) => {
      setUpdateInfo(info)
      setBannerVisible(true)
    })
    return cleanup
  }, [])

  const theme = useMemo(() => getTheme(themeMode), [themeMode])

  const handleInstallUpdate = () => {
    window.knovex?.installUpdate()
  }

  const handleDismissBanner = () => {
    setBannerVisible(false)
  }

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          height: '100vh',
          overflow: 'hidden',
          bgcolor: 'background.default',
        }}
      >
        {/* ── Update available banner ── */}
        <Collapse in={bannerVisible} unmountOnExit>
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1.5,
              px: 2,
              py: 0.75,
              bgcolor: 'primary.main',
              color: '#1A140C',
              flexShrink: 0,
            }}
          >
            <SystemUpdateAltIcon sx={{ fontSize: 18 }} />
            <Typography variant="body2" fontWeight={600} sx={{ flex: 1 }}>
              Knovex {updateInfo?.version} is ready —&nbsp;
              <span style={{ fontWeight: 400 }}>restart to apply the update.</span>
            </Typography>
            <Button
              size="small"
              variant="contained"
              onClick={handleInstallUpdate}
              sx={{
                bgcolor: '#1A140C',
                color: 'primary.main',
                fontWeight: 600,
                fontSize: 12,
                px: 1.5,
                py: 0.4,
                minWidth: 0,
                borderRadius: 1.5,
                '&:hover': { bgcolor: '#2C2218' },
              }}
            >
              Restart now
            </Button>
            <IconButton
              size="small"
              onClick={handleDismissBanner}
              sx={{ color: '#1A140C', ml: 0.5 }}
              aria-label="Dismiss update banner"
            >
              <CloseIcon sx={{ fontSize: 16 }} />
            </IconButton>
          </Box>
        </Collapse>

        {/* ── Main chrome ── */}
        <Box sx={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
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
      </Box>
    </ThemeProvider>
  )
}
