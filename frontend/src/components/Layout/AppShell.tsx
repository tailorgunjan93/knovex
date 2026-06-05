/**
 * App Shell — overall layout wrapper
 *
 * Structure:
 *   ┌───────────────────────────────────────────┐  ← TopBar (52px)
 *   ├──────────┬────────────────────────────────┤
 *   │ Sidebar  │   Main content (Outlet)        │
 *   │ (220px   │   fills remaining width        │
 *   │  / 56px  │                                │
 *   │  glass)  │                                │
 *   └──────────┴────────────────────────────────┘
 *
 * [Update banner — shown only when update is downloaded, above TopBar]
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
import CloseIcon              from '@mui/icons-material/Close'
import SystemUpdateAltIcon    from '@mui/icons-material/SystemUpdateAlt'
import { useQuery }           from '@tanstack/react-query'
import Sidebar                from './Sidebar'
import CommandPalette         from '@/components/CommandPalette'
import type { Command }       from '@/components/CommandPalette/commands'
import WelcomeScreen          from '@/components/Onboarding/WelcomeScreen'
import { getTheme }           from '@/theme'
import { useSettingsStore, useThemeMode } from '@/store/settings.store'
import { settingsApi }        from '@/api/settings.api'

const THEME_CYCLE: Record<string, string> = { dark: 'medium', medium: 'light', light: 'dark' }

interface UpdateInfo {
  version:      string
  releaseNotes: string | null
}

export default function AppShell() {
  const { settings, setSettings } = useSettingsStore()
  const themeMode       = useThemeMode()
  const navigate        = useNavigate()

  const [updateInfo,    setUpdateInfo]    = useState<UpdateInfo | null>(null)
  const [bannerVisible, setBannerVisible] = useState(false)
  const [savingName,    setSavingName]    = useState(false)

  // ── Load settings on mount ─────────────────────────────────────────────────
  const { data, isLoading: settingsLoading } = useQuery({
    queryKey: ['settings'],
    queryFn:  settingsApi.get,
    staleTime: 60_000,
  })
  useEffect(() => { if (data) setSettings(data) }, [data, setSettings])

  // ── First-run onboarding: show Welcome until `onboarded` is true ────────────
  // Only decide once settings have actually loaded, so we never flash the
  // welcome screen for an already-onboarded user.
  const needsOnboarding = !settingsLoading && settings != null && settings.onboarded === false

  const completeOnboarding = (name: string) => {
    setSavingName(true)
    settingsApi.update({ display_name: name, onboarded: true })
      .then(setSettings)
      .catch(() => {/* keep showing welcome on failure */})
      .finally(() => setSavingName(false))
  }

  // ── Wire Electron IPC navigation ──────────────────────────────────────────
  useEffect(() => {
    if (!window.knovex?.onNavigate) return
    const cleanup = window.knovex.onNavigate((route) => navigate(route))
    return cleanup
  }, [navigate])

  // ── Command palette (Ctrl/Cmd+K) ───────────────────────────────────────────
  const [paletteOpen, setPaletteOpen] = useState(false)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPaletteOpen((o) => !o)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const cycleTheme = () => {
    const next = THEME_CYCLE[themeMode] ?? 'dark'
    settingsApi.update({ theme: next }).then(setSettings).catch(() => {})
  }

  // Command set — extend here to add KB/file/recent-lesson sources (OCP).
  const commands: Command[] = useMemo(() => [
    { id: 'nav-library',  title: 'Go to Library',     keywords: 'kb knowledge base collections', kind: 'navigate', hint: 'Go', run: () => navigate('/kb') },
    { id: 'nav-chat',     title: 'Ask Knovex',         keywords: 'chat question ask',             kind: 'navigate', hint: 'Go', run: () => navigate('/chat') },
    { id: 'nav-reader',   title: 'Open Reader',        keywords: 'pdf document read file',        kind: 'navigate', hint: 'Go', run: () => navigate('/reader') },
    { id: 'nav-learn',    title: 'Start Learning',     keywords: 'lesson quiz flashcard guided',  kind: 'navigate', hint: 'Go', run: () => navigate('/learn') },
    { id: 'nav-progress', title: 'View Progress',      keywords: 'stats streak mastery heatmap',  kind: 'navigate', hint: 'Go', run: () => navigate('/progress') },
    { id: 'nav-settings', title: 'Open Settings',      keywords: 'preferences keys providers',    kind: 'navigate', hint: 'Go', run: () => navigate('/settings') },
    { id: 'theme-cycle',  title: 'Cycle theme',        keywords: 'dark light mid appearance',     kind: 'theme',    hint: 'Theme', run: cycleTheme },
  ], [navigate, themeMode])

  // ── Auto-update banner ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!window.knovex?.onUpdateDownloaded) return
    const cleanup = window.knovex.onUpdateDownloaded((info) => {
      setUpdateInfo(info)
      setBannerVisible(true)
    })
    return cleanup
  }, [])

  const theme = useMemo(() => getTheme(themeMode), [themeMode])

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box
        sx={{
          display:       'flex',
          flexDirection: 'column',
          height:        '100vh',
          overflow:      'hidden',
          bgcolor:       'background.default',
        }}
      >
        {/* ── Update available banner ── */}
        <Collapse in={bannerVisible} unmountOnExit>
          <Box
            sx={{
              display:     'flex',
              alignItems:  'center',
              gap:          1.5,
              px:           2,
              py:           0.75,
              bgcolor:     'primary.main',
              color:       '#1A140C',
              flexShrink:   0,
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
              onClick={() => window.knovex?.installUpdate()}
              sx={{
                bgcolor:    '#1A140C',
                color:      'primary.main',
                fontWeight:  600,
                fontSize:    12,
                px:          1.5,
                py:          0.4,
                minWidth:    0,
                borderRadius: 1.5,
                '&:hover': { bgcolor: '#2C2218' },
              }}
            >
              Restart now
            </Button>
            <IconButton
              size="small"
              onClick={() => setBannerVisible(false)}
              sx={{ color: '#1A140C', ml: 0.5 }}
              aria-label="Dismiss update banner"
            >
              <CloseIcon sx={{ fontSize: 16 }} />
            </IconButton>
          </Box>
        </Collapse>

        {/* ── Sidebar + main content ──
           No app TopBar: the lab design is rail + content only, and the Electron
           window uses the native OS frame (no frame:false / titleBarStyle), so
           window controls + dragging come from the OS — the old TopBar's macOS
           dots and drag region were decorative/redundant. */}
        <Box sx={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          <Sidebar />
          <Box
            component="main"
            sx={{
              flex:      1,
              overflow:  'auto',
              display:   'flex',
              flexDirection: 'column',
              bgcolor:   'background.default',
            }}
          >
            <Outlet />
          </Box>
        </Box>
      </Box>

      {/* ── Command palette (Ctrl/Cmd+K) ── */}
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} commands={commands} />

      {/* ── First-run onboarding overlay ── */}
      {needsOnboarding && (
        <WelcomeScreen onComplete={completeOnboarding} saving={savingName} />
      )}
    </ThemeProvider>
  )
}
