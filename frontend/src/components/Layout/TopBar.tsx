/**
 * Knovex TopBar — matches KnovexUI titlebar exactly
 *
 * 38 px titlebar:
 *   [macOS dots] [Knovex · context  synced 2m] [spacer] [search ⌘K] [spacer] [📎 📥 ☀️/🌙]
 *
 * Theme cycles through all 3 modes: dark → mid → light → dark
 */

import { useState } from 'react'
import { useQueryClient, useMutation } from '@tanstack/react-query'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  Box,
  Snackbar,
  Typography,
  IconButton,
  Tooltip,
  useTheme,
  alpha,
} from '@mui/material'
import SearchIcon            from '@mui/icons-material/Search'
import PaperclipIcon         from '@mui/icons-material/AttachFile'
import InboxIcon             from '@mui/icons-material/MoveToInbox'
import LightModeOutlinedIcon from '@mui/icons-material/LightModeOutlined'
import ContrastOutlinedIcon  from '@mui/icons-material/ContrastOutlined'
import DarkModeOutlinedIcon  from '@mui/icons-material/DarkModeOutlined'
import { useThemeMode, useSettingsStore } from '@/store/settings.store'
import { settingsApi } from '@/api/settings.api'

export const TOPBAR_HEIGHT = 38

// ── Theme cycle: dark → mid → light → dark ───────────────────────────────────
const THEME_CYCLE: Record<string, string> = {
  dark:   'medium',
  medium: 'light',
  light:  'dark',
}

const THEME_LABELS: Record<string, string> = {
  dark:   'Dark',
  medium: 'Mid',
  light:  'Light',
}

// ── Route → page name ─────────────────────────────────────────────────────────
function usePageTitle(): string {
  const { pathname } = useLocation()
  if (pathname.startsWith('/kb'))       return 'Library'
  if (pathname.startsWith('/chat'))     return 'Ask Knovex'
  if (pathname.startsWith('/reader'))   return 'Reader'
  if (pathname.startsWith('/learn'))    return 'Learn'
  if (pathname.startsWith('/progress')) return 'Progress'
  if (pathname.startsWith('/settings')) return 'Settings'
  return ''
}

const MONO = '"IBM Plex Mono", "Geist Mono", monospace'

export default function TopBar() {
  const theme      = useTheme()
  const themeMode  = useThemeMode()
  const { setSettings } = useSettingsStore()
  const qc         = useQueryClient()
  const navigate   = useNavigate()
  const pageTitle  = usePageTitle()
  const [searchSnack, setSearchSnack] = useState(false)

  const themeMutation = useMutation({
    mutationFn: (mode: string) => settingsApi.update({ theme: mode }),
    onSuccess: (updated) => {
      setSettings(updated)
      qc.invalidateQueries({ queryKey: ['settings'] })
    },
  })

  const handleThemeCycle = () => {
    const next = THEME_CYCLE[themeMode] ?? 'dark'
    themeMutation.mutate(next)
  }

  const isDark = theme.palette.mode === 'dark'

  // Theme icon
  const ThemeIcon = themeMode === 'dark'   ? DarkModeOutlinedIcon
                  : themeMode === 'medium' ? ContrastOutlinedIcon
                  :                          LightModeOutlinedIcon

  return (
    <Box
      sx={{
        height:    TOPBAR_HEIGHT,
        minHeight: TOPBAR_HEIGHT,
        display:   'flex',
        alignItems: 'center',
        px: 1.5,
        gap: 1,
        flexShrink: 0,
        zIndex: 100,
        bgcolor: alpha(theme.palette.background.paper, 0.97),
        backdropFilter:       'blur(20px) saturate(180%)',
        WebkitBackdropFilter: 'blur(20px) saturate(180%)',
        borderBottom: `1px solid ${theme.palette.divider}`,
        WebkitAppRegion: 'drag' as string,
      } as React.CSSProperties}
    >
      {/* ── macOS traffic lights ── */}
      <Box
        sx={{
          display: 'flex', gap: 0.75, mr: 0.5, flexShrink: 0,
          WebkitAppRegion: 'no-drag' as string,
        } as React.CSSProperties}
      >
        <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: '#FF5F57', border: '0.5px solid rgba(0,0,0,0.18)' }} />
        <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: '#FEBC2E', border: '0.5px solid rgba(0,0,0,0.18)' }} />
        <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: '#28C840', border: '0.5px solid rgba(0,0,0,0.18)' }} />
      </Box>

      {/* ── App title + page context ── */}
      <Box
        sx={{
          display: 'flex', alignItems: 'center', gap: 0.5,
          minWidth: 0,
          WebkitAppRegion: 'no-drag' as string,
        } as React.CSSProperties}
      >
        <Typography
          sx={{
            fontSize:    12,
            fontWeight:  500,
            color:       'text.secondary',
            whiteSpace:  'nowrap',
            userSelect:  'none',
            letterSpacing: '-0.01em',
          }}
        >
          Knovex
        </Typography>

        {pageTitle && (
          <>
            <Typography sx={{ fontSize: 11, color: 'text.disabled', userSelect: 'none' }}>·</Typography>
            <Typography
              sx={{
                fontSize:    12,
                fontWeight:  500,
                color:       'text.primary',
                whiteSpace:  'nowrap',
                userSelect:  'none',
                letterSpacing: '-0.01em',
              }}
            >
              {pageTitle}
            </Typography>
          </>
        )}

        {/* Synced indicator */}
        <Typography
          sx={{
            fontFamily:    MONO,
            fontSize:       9.5,
            color:          'text.disabled',
            whiteSpace:     'nowrap',
            userSelect:     'none',
            ml:             1,
            display:        { xs: 'none', md: 'block' },
          }}
        >
          synced 2m ago
        </Typography>
      </Box>

      <Box flex={1} />

      {/* ── Search bar ── */}
      <Box
        onClick={() => setSearchSnack(true)}
        sx={{
          display: 'flex', alignItems: 'center', gap: 1,
          width: 260, height: 26,
          bgcolor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)',
          border: `1px solid ${theme.palette.divider}`,
          borderRadius: 1.75,
          px: 1.25,
          cursor: 'pointer',
          transition: 'border-color 0.15s ease, background 0.15s ease',
          '&:hover': {
            bgcolor: isDark ? 'rgba(255,255,255,0.09)' : 'rgba(0,0,0,0.07)',
            borderColor: alpha(theme.palette.primary.main, 0.4),
          },
          WebkitAppRegion: 'no-drag' as string,
        } as React.CSSProperties}
      >
        <SearchIcon sx={{ fontSize: 13, color: 'text.disabled', flexShrink: 0 }} />
        <Typography sx={{ flex: 1, fontSize: 12, color: 'text.disabled', userSelect: 'none' }}>
          Search library, notes, prompts…
        </Typography>
        <Box
          sx={{
            fontFamily: MONO,
            fontSize: 10,
            bgcolor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.07)',
            border: `1px solid ${theme.palette.divider}`,
            borderRadius: 0.5,
            px: 0.75, py: 0.2,
            color: 'text.disabled',
            lineHeight: 1,
          }}
        >
          ⌘K
        </Box>
      </Box>

      <Box flex={1} />

      {/* ── Right action icons ── */}
      <Box
        sx={{
          display: 'flex', alignItems: 'center', gap: 0.25,
          WebkitAppRegion: 'no-drag' as string,
        } as React.CSSProperties}
      >
        {/* Capture / paperclip → open Reader to upload */}
        <Tooltip title="Open Reader to capture a file" placement="bottom">
          <IconButton
            size="small"
            onClick={() => navigate('/reader')}
            sx={{
              color: 'text.disabled',
              width: 26, height: 26,
              borderRadius: 1.25,
              '&:hover': { color: 'primary.main', bgcolor: alpha(theme.palette.primary.main, 0.10) },
            }}
          >
            <PaperclipIcon sx={{ fontSize: 14 }} />
          </IconButton>
        </Tooltip>

        {/* Review queue / inbox → open Progress */}
        <Tooltip title="View your progress" placement="bottom">
          <IconButton
            size="small"
            onClick={() => navigate('/progress')}
            sx={{
              color: 'text.disabled',
              width: 26, height: 26,
              borderRadius: 1.25,
              '&:hover': { color: 'primary.main', bgcolor: alpha(theme.palette.primary.main, 0.10) },
            }}
          >
            <InboxIcon sx={{ fontSize: 14 }} />
          </IconButton>
        </Tooltip>

        {/* Theme cycle: dark → mid → light → dark */}
        <Tooltip
          title={`Theme: ${THEME_LABELS[themeMode]} → click for ${THEME_LABELS[THEME_CYCLE[themeMode] ?? 'dark']}`}
          placement="bottom"
        >
          <IconButton
            size="small"
            onClick={handleThemeCycle}
            disabled={themeMutation.isPending}
            sx={{
              color: 'text.disabled',
              width: 26, height: 26,
              borderRadius: 1.25,
              transition: 'all 0.15s ease',
              '&:hover': {
                color: 'primary.main',
                bgcolor: alpha(theme.palette.primary.main, 0.10),
              },
            }}
          >
            <ThemeIcon sx={{ fontSize: 14 }} />
          </IconButton>
        </Tooltip>
      </Box>

      {/* Search coming-soon toast */}
      <Snackbar
        open={searchSnack}
        autoHideDuration={2500}
        onClose={() => setSearchSnack(false)}
        message="Global search — coming soon ⌘K"
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
      />
    </Box>
  )
}
