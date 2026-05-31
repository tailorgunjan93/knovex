/**
 * Knovex Sidebar — slim icon-only rail (redesign Phase 2).
 *
 *   ┌────┐
 *   │ ◆  │  ← K-graph brand mark
 *   │ ▦  │  Library
 *   │ ◌  │  Ask Knovex
 *   │ ▢  │  Reader
 *   │ ▤  │  Learn
 *   │ ▥  │  Progress
 *   │    │
 *   │ ☼  │  theme cycle (dark → mid → light)
 *   │ ⚙  │  Settings
 *   │ YN │  avatar (initials from display_name; "Y" when unset)
 *   └────┘
 *
 * 64px, icon-only, tooltips on hover. Replaces the old 220/56px expanding
 * sidebar. The avatar reads display_name from settings (fallback "You") — no
 * hardcoded personal name (fixes the "fresh install is called Gunjan" bug).
 *
 * Keeps the default export name `Sidebar` so AppShell needs no change.
 */

import { useNavigate, useLocation } from 'react-router-dom'
import {
  Box, Tooltip, IconButton, useTheme, alpha,
} from '@mui/material'
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutline'
import SettingsOutlinedIcon  from '@mui/icons-material/SettingsOutlined'
import LightModeOutlinedIcon from '@mui/icons-material/LightModeOutlined'
import ContrastOutlinedIcon  from '@mui/icons-material/ContrastOutlined'
import DarkModeOutlinedIcon  from '@mui/icons-material/DarkModeOutlined'
import { useQueryClient, useMutation } from '@tanstack/react-query'
import KnovexMark from '@/components/brand/KnovexMark'
import { BRAND } from '@/theme/tokens'
import { useSettingsStore, useThemeMode } from '@/store/settings.store'
import { settingsApi } from '@/api/settings.api'
import { resolveDisplayName, initialsOf } from '@/lib/displayName'

export const RAIL_WIDTH = 64

// ── Custom SVG icons (carried over from the previous rail) ──────────────────────
function LibraryIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none"
         stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
         style={{ display: 'block' }}>
      <rect x="2.25" y="2.25" width="3" height="11.5" rx="0.6" />
      <rect x="6.25" y="2.25" width="3" height="11.5" rx="0.6" />
      <path d="M10.6 3.3l2.8.75 -2.3 8.5 -2.8-.75z" />
    </svg>
  )
}
function DocIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none"
         stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
         style={{ display: 'block' }}>
      <path d="M3.5 2.5h6.2l2.8 2.8v8.2H3.5z" />
      <path d="M9.5 2.5v3h3" />
      <path d="M5.5 8.5h5M5.5 10.5h5M5.5 6.5h2" />
    </svg>
  )
}
function LessonIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none"
         stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
         style={{ display: 'block' }}>
      <rect x="2.25" y="3.5" width="9.5" height="7" rx="1" />
      <path d="M13 5.5l1.7-.6v6l-1.7-.6" />
      <path d="M4.5 6.5h5M4.5 8.5h3" />
    </svg>
  )
}
function ProgressIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none"
         stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
         style={{ display: 'block' }}>
      <path d="M2.5 12.5h11" />
      <path d="M3.5 12.5V9M6.5 12.5V6M9.5 12.5V8M12.5 12.5V4" />
    </svg>
  )
}

interface RailItem { label: string; icon: React.ReactNode; path: string }
const RAIL_ITEMS: RailItem[] = [
  { label: 'Library',    icon: <LibraryIcon />,                                  path: '/kb' },
  { label: 'Ask Knovex', icon: <ChatBubbleOutlineIcon sx={{ fontSize: 19 }} />,  path: '/chat' },
  { label: 'Reader',     icon: <DocIcon />,                                      path: '/reader' },
  { label: 'Learn',      icon: <LessonIcon />,                                   path: '/learn' },
  { label: 'Progress',   icon: <ProgressIcon />,                                 path: '/progress' },
]

const THEME_CYCLE: Record<string, string> = { dark: 'medium', medium: 'light', light: 'dark' }
const THEME_LABELS: Record<string, string> = { dark: 'Dark', medium: 'Mid', light: 'Light' }

export default function Sidebar() {
  const navigate = useNavigate()
  const location = useLocation()
  const theme    = useTheme()
  const themeMode = useThemeMode()
  const { settings, setSettings } = useSettingsStore()
  const qc = useQueryClient()

  const displayName = settings?.display_name
  const isActive = (path: string) => location.pathname.startsWith(path)

  const themeMutation = useMutation({
    mutationFn: (mode: string) => settingsApi.update({ theme: mode }),
    onSuccess: (updated) => { setSettings(updated); qc.invalidateQueries({ queryKey: ['settings'] }) },
  })
  const cycleTheme = () => themeMutation.mutate(THEME_CYCLE[themeMode] ?? 'dark')

  const ThemeIcon = themeMode === 'dark' ? DarkModeOutlinedIcon
                  : themeMode === 'medium' ? ContrastOutlinedIcon
                  : LightModeOutlinedIcon

  const railBtn = (active: boolean) => ({
    width: 44, height: 44, borderRadius: 2.5,
    color: active ? 'primary.main' : 'text.secondary',
    bgcolor: active ? alpha(theme.palette.primary.main, 0.14) : 'transparent',
    '&:hover': { bgcolor: alpha(theme.palette.primary.main, active ? 0.16 : 0.08), color: active ? 'primary.main' : 'text.primary' },
    transition: 'background 120ms ease, color 120ms ease',
  })

  return (
    <Box
      sx={{
        width: RAIL_WIDTH, minWidth: RAIL_WIDTH, height: '100%', flexShrink: 0,
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        py: 1.5, gap: 0.5,
        bgcolor: 'background.default',
        borderRight: `1px solid ${theme.palette.divider}`,
      }}
    >
      {/* Brand mark */}
      <Tooltip title="Knovex" placement="right" arrow>
        <Box
          onClick={() => navigate('/kb')}
          sx={{
            width: 38, height: 38, borderRadius: 2.5, mb: 1.5, cursor: 'pointer',
            bgcolor: 'background.paper', border: `1px solid ${theme.palette.divider}`,
            display: 'grid', placeItems: 'center',
            boxShadow: `0 4px 16px -6px ${alpha(BRAND.copper, 0.4)}`,
            transition: 'transform 150ms ease, box-shadow 150ms ease',
            '&:hover': { transform: 'translateY(-1px)', boxShadow: `0 8px 22px -6px ${alpha(BRAND.copper, 0.6)}` },
          }}
        >
          <KnovexMark size={22} />
        </Box>
      </Tooltip>

      {/* Primary nav */}
      {RAIL_ITEMS.map((it) => (
        <Tooltip key={it.path} title={it.label} placement="right" arrow>
          <IconButton aria-label={it.label} onClick={() => navigate(it.path)} sx={railBtn(isActive(it.path))}>
            {it.icon}
          </IconButton>
        </Tooltip>
      ))}

      <Box sx={{ flex: 1 }} />

      {/* Theme cycle */}
      <Tooltip title={`Theme: ${THEME_LABELS[themeMode]} → ${THEME_LABELS[THEME_CYCLE[themeMode] ?? 'dark']}`} placement="right" arrow>
        <IconButton aria-label="Cycle theme" onClick={cycleTheme} disabled={themeMutation.isPending}
          sx={{ ...railBtn(false), '&:hover': { bgcolor: alpha(theme.palette.primary.main, 0.08), color: 'primary.main' } }}>
          <ThemeIcon sx={{ fontSize: 18 }} />
        </IconButton>
      </Tooltip>

      {/* Settings */}
      <Tooltip title="Settings" placement="right" arrow>
        <IconButton aria-label="Settings" onClick={() => navigate('/settings')} sx={railBtn(isActive('/settings'))}>
          <SettingsOutlinedIcon sx={{ fontSize: 18 }} />
        </IconButton>
      </Tooltip>

      {/* Avatar — initials from display_name, never a hardcoded name */}
      <Tooltip title={resolveDisplayName(displayName)} placement="right" arrow>
        <Box
          onClick={() => navigate('/settings')}
          sx={{
            width: 30, height: 30, borderRadius: 2.5, mt: 0.5, cursor: 'pointer',
            bgcolor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)',
            border: `1px solid ${theme.palette.divider}`,
            display: 'grid', placeItems: 'center',
            fontSize: 11, fontWeight: 700, color: 'text.secondary',
            fontFamily: '"IBM Plex Mono", monospace',
          }}
        >
          {initialsOf(displayName)}
        </Box>
      </Tooltip>
    </Box>
  )
}
