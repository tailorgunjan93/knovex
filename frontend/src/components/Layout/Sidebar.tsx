/**
 * Knovex Sidebar — refined icon rail (visual redesign, "studio" pass).
 *
 *   ┌────┐
 *   │ ◆  │  ← K-graph brand mark (gradient-ring tile)
 *   │▌▦  │  Library      ← gliding copper edge-indicator marks the active page
 *   │ ◌  │  Ask Knovex
 *   │ ▢  │  Reader
 *   │ ▤  │  Learn
 *   │ ▧  │  Review (due badge)
 *   │ ▥  │  Progress
 *   │    │
 *   │ ── │  hairline divider
 *   │ ☼  │  theme cycle (dark → mid → light, icon rotates in)
 *   │ ⚙  │  Settings
 *   │ ◉  │  avatar — copper-ring circle, initials from display_name
 *   └────┘
 *
 * Design notes (vs the previous flat rail):
 *   • The rail is its own surface (`background.paper` + hairline right border
 *     + faint copper wash at the top) instead of blending into the canvas.
 *   • Active page = a copper gradient edge-bar that GLIDES between items
 *     (framer-motion `layoutId`, spring physics from MOTION tokens) + a soft
 *     tinted tile behind the icon. Honors prefers-reduced-motion (opt-in gate).
 *   • Hover = quick copper tint + 1px icon lift, `MOTION.duration.quick` with
 *     the design-lab ease-out curve. Keyboard focus gets a copper ring.
 *   • Bottom cluster sits under a fading hairline: theme toggle (icon rotates
 *     on change), settings, then a circular gradient-ring avatar.
 *
 * All aria-labels, tooltips, routes and the default export are unchanged so
 * existing tests/E2E keep passing. Avatar still derives from display_name
 * (fallback "You") — never a hardcoded personal name.
 */

import { useNavigate, useLocation } from 'react-router-dom'
import {
  Box, Tooltip, IconButton, Badge, useTheme, alpha,
} from '@mui/material'
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutline'
import SettingsOutlinedIcon  from '@mui/icons-material/SettingsOutlined'
import LightModeOutlinedIcon from '@mui/icons-material/LightModeOutlined'
import ContrastOutlinedIcon  from '@mui/icons-material/ContrastOutlined'
import DarkModeOutlinedIcon  from '@mui/icons-material/DarkModeOutlined'
import StyleOutlinedIcon     from '@mui/icons-material/StyleOutlined'
import { useQueryClient, useMutation, useQuery } from '@tanstack/react-query'
import KnovexMark from '@/components/brand/KnovexMark'
import { BRAND } from '@/theme/tokens'
import { Motion, MOTION, usePrefersReducedMotion } from '@/lib/motion'
import { useSettingsStore, useThemeMode } from '@/store/settings.store'
import { settingsApi } from '@/api/settings.api'
import { learnApi } from '@/api/learn.api'
import { resolveDisplayName, initialsOf } from '@/lib/displayName'
import { useAppVersion } from '@/lib/useAppVersion'

export const RAIL_WIDTH = 64

// ── Custom SVG icons (cohesive 1.5-stroke set, carried over) ─────────────────
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
  { label: 'Review',     icon: <StyleOutlinedIcon sx={{ fontSize: 19 }} />,      path: '/review' },
  { label: 'Progress',   icon: <ProgressIcon />,                                 path: '/progress' },
]

const THEME_CYCLE: Record<string, string> = { dark: 'medium', medium: 'light', light: 'dark' }
const THEME_LABELS: Record<string, string> = { dark: 'Dark', medium: 'Mid', light: 'Light' }

/** Shared layoutId — the copper edge-bar glides between whichever slot is active. */
const ACTIVE_INDICATOR_ID = 'knx-rail-active-indicator'

/**
 * One rail row: a full-width relative slot so the active edge-indicator can
 * pin to the rail's left edge while the 44px button stays centered.
 */
function RailSlot({ active, reduced, children }: {
  active: boolean
  reduced: boolean
  children: React.ReactNode
}) {
  return (
    <Box sx={{ position: 'relative', width: '100%', display: 'flex', justifyContent: 'center' }}>
      {active && (
        <Motion.div
          layoutId={ACTIVE_INDICATOR_ID}
          transition={reduced ? { duration: 0 } : MOTION.spring}
          style={{
            position: 'absolute', left: 0, top: 9, width: 3, height: 26,
            borderRadius: '0 4px 4px 0',
            background: BRAND.gradient,
            boxShadow: `0 0 10px ${alpha(BRAND.copper, 0.55)}`,
          }}
        />
      )}
      {children}
    </Box>
  )
}

/** Centered fading hairline used to group the rail's sections. */
function RailDivider({ sx }: { sx?: object }) {
  const theme = useTheme()
  return (
    <Box
      aria-hidden
      sx={{
        width: 28, height: '1px', flexShrink: 0,
        background: `linear-gradient(90deg, transparent, ${theme.palette.divider}, transparent)`,
        ...sx,
      }}
    />
  )
}

export default function Sidebar() {
  const navigate = useNavigate()
  const location = useLocation()
  const theme    = useTheme()
  const themeMode = useThemeMode()
  const reduced  = usePrefersReducedMotion()
  const { settings, setSettings } = useSettingsStore()
  const qc = useQueryClient()
  const appVersion = useAppVersion()

  const displayName = settings?.display_name
  const isActive = (path: string) => location.pathname.startsWith(path)
  const isLight  = theme.palette.mode === 'light'

  // Spaced-repetition due count → the "Review" badge (the return hook). Polled
  // so it stays current while the app is open; failures degrade to no badge.
  const { data: dueCount = 0 } = useQuery({
    queryKey: ['reviews', 'count'],
    queryFn: () => learnApi.getDueReviewCount(),
    refetchInterval: 60_000,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  })

  const themeMutation = useMutation({
    mutationFn: (mode: string) => settingsApi.update({ theme: mode }),
    onSuccess: (updated) => { setSettings(updated); qc.invalidateQueries({ queryKey: ['settings'] }) },
  })
  const cycleTheme = () => themeMutation.mutate(THEME_CYCLE[themeMode] ?? 'dark')

  const ThemeIcon = themeMode === 'dark' ? DarkModeOutlinedIcon
                  : themeMode === 'medium' ? ContrastOutlinedIcon
                  : LightModeOutlinedIcon

  // Quick-state transition shared by every interactive element on the rail.
  const quick = `${MOTION.duration.quick}s ${MOTION.ease.out}`

  const railBtn = (active: boolean) => ({
    width: 44, height: 44, borderRadius: 2.5,
    color: active ? 'primary.main' : 'text.secondary',
    bgcolor: active ? alpha(theme.palette.primary.main, isLight ? 0.12 : 0.14) : 'transparent',
    boxShadow: active ? `inset 0 0 0 1px ${alpha(theme.palette.primary.main, isLight ? 0.28 : 0.22)}` : 'none',
    transition: `background-color ${quick}, color ${quick}, box-shadow ${quick}`,
    '& svg': { transition: `transform ${quick}` },
    '&:hover': {
      bgcolor: alpha(theme.palette.primary.main, active ? (isLight ? 0.16 : 0.18) : 0.09),
      color: active ? 'primary.main' : 'text.primary',
      '& svg': { transform: 'translateY(-1px)' },
    },
    '&.Mui-focusVisible': {
      boxShadow: `0 0 0 2px ${alpha(theme.palette.primary.main, 0.5)}`,
    },
  })

  // Gradient-ring trick: paint the surface inside padding-box and the copper
  // gradient inside border-box, so a transparent border reads as a copper ring.
  const gradientRing = (borderWidth: number) => ({
    border: `${borderWidth}px solid transparent`,
    background: `linear-gradient(${theme.palette.background.paper}, ${theme.palette.background.paper}) padding-box, ${BRAND.gradient} border-box`,
  })

  return (
    <Box
      component="nav"
      aria-label="Primary"
      sx={{
        width: RAIL_WIDTH, minWidth: RAIL_WIDTH, height: '100%', flexShrink: 0,
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        py: 1.5, gap: 0.5,
        bgcolor: 'background.paper',
        borderRight: `1px solid ${theme.palette.divider}`,
        // Faint copper wash from the top — ties the rail to the brand without shouting.
        backgroundImage: `linear-gradient(180deg, ${alpha(BRAND.copper, isLight ? 0.05 : 0.06)}, transparent 34%)`,
      }}
    >
      {/* Brand mark — gradient-ring tile */}
      <Tooltip title="Knovex" placement="right" arrow>
        <Box
          onClick={() => navigate('/kb')}
          sx={{
            width: 38, height: 38, borderRadius: 2.5, cursor: 'pointer',
            ...gradientRing(1),
            display: 'grid', placeItems: 'center',
            boxShadow: `0 4px 16px -6px ${alpha(BRAND.copper, 0.4)}`,
            transition: `transform ${quick}, box-shadow ${quick}`,
            '&:hover': { transform: 'translateY(-1px)', boxShadow: `0 8px 22px -6px ${alpha(BRAND.copper, 0.6)}` },
          }}
        >
          <KnovexMark size={22} />
        </Box>
      </Tooltip>

      <RailDivider sx={{ my: 1 }} />

      {/* Primary nav — the copper edge-bar glides to the active item */}
      {RAIL_ITEMS.map((it) => {
        const isReview = it.path === '/review'
        const icon = isReview ? (
          <Badge
            badgeContent={dueCount}
            max={99}
            overlap="circular"
            sx={{ '& .MuiBadge-badge': { fontSize: 9, height: 16, minWidth: 16, fontWeight: 700, bgcolor: BRAND.copper, color: BRAND.onAccent } }}
          >
            {it.icon}
          </Badge>
        ) : it.icon
        const title = isReview && dueCount > 0 ? `${it.label} — ${dueCount} due` : it.label
        return (
          <RailSlot key={it.path} active={isActive(it.path)} reduced={reduced}>
            <Tooltip title={title} placement="right" arrow>
              <IconButton aria-label={it.label} onClick={() => navigate(it.path)} sx={railBtn(isActive(it.path))}>
                {icon}
              </IconButton>
            </Tooltip>
          </RailSlot>
        )
      })}

      <Box sx={{ flex: 1 }} />

      <RailDivider sx={{ mb: 0.75 }} />

      {/* Theme cycle — icon rotates in on change */}
      <Tooltip title={`Theme: ${THEME_LABELS[themeMode]} → ${THEME_LABELS[THEME_CYCLE[themeMode] ?? 'dark']}`} placement="right" arrow>
        <IconButton aria-label="Cycle theme" onClick={cycleTheme} disabled={themeMutation.isPending}
          sx={{ ...railBtn(false), '&:hover': { bgcolor: alpha(theme.palette.primary.main, 0.09), color: 'primary.main' } }}>
          <Motion.div
            key={themeMode}
            initial={reduced ? false : { rotate: -60, opacity: 0, scale: 0.7 }}
            animate={{ rotate: 0, opacity: 1, scale: 1 }}
            transition={{ duration: MOTION.duration.quick }}
            style={{ display: 'flex' }}
          >
            <ThemeIcon sx={{ fontSize: 18 }} />
          </Motion.div>
        </IconButton>
      </Tooltip>

      {/* Settings — participates in the same gliding indicator */}
      <RailSlot active={isActive('/settings')} reduced={reduced}>
        <Tooltip title="Settings" placement="right" arrow>
          <IconButton aria-label="Settings" onClick={() => navigate('/settings')} sx={railBtn(isActive('/settings'))}>
            <SettingsOutlinedIcon sx={{ fontSize: 18 }} />
          </IconButton>
        </Tooltip>
      </RailSlot>

      {/* Avatar — copper gradient ring, initials from display_name (never hardcoded) */}
      <Tooltip title={resolveDisplayName(displayName)} placement="right" arrow>
        <Box
          onClick={() => navigate('/settings')}
          sx={{
            width: 32, height: 32, borderRadius: '50%', mt: 0.5, cursor: 'pointer',
            ...gradientRing(1.5),
            display: 'grid', placeItems: 'center',
            fontSize: 11, fontWeight: 700, lineHeight: 1,
            color: isLight ? BRAND.copperDark : BRAND.copperLight,
            fontFamily: '"IBM Plex Mono", monospace',
            boxShadow: `0 2px 10px -4px ${alpha(BRAND.copper, 0.45)}`,
            transition: `transform ${quick}, box-shadow ${quick}`,
            '&:hover': { transform: 'translateY(-1px)', boxShadow: `0 6px 16px -4px ${alpha(BRAND.copper, 0.6)}` },
          }}
        >
          {initialsOf(displayName)}
        </Box>
      </Tooltip>

      {/* App version — visible at the rail foot; click → Settings → About */}
      {appVersion && (
        <Tooltip title={`Knovex v${appVersion} — click for details`} placement="right" arrow>
          <Box
            onClick={() => navigate('/settings')}
            sx={{
              mt: 0.75, cursor: 'pointer', fontSize: 8.5, lineHeight: 1,
              fontFamily: '"IBM Plex Mono", monospace', color: 'text.disabled',
              transition: `color ${quick}`,
              '&:hover': { color: 'text.secondary' },
            }}
          >
            v{appVersion}
          </Box>
        </Tooltip>
      )}
    </Box>
  )
}
