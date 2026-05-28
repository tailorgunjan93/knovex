/**
 * Knovex Sidebar — matches KnovexUI nav-rail design exactly
 *
 * Structure (expanded 220px):
 *   ┌─────────────────────────────────┐
 *   │  [K] Kno v ex                   │  ← brand: K badge + Instrument Serif name
 *   │       v2 · workspace            │  ← mono tag
 *   │                                 │
 *   │  WORKSPACE                      │  ← mono section label
 *   │  □ Library                 24   │
 *   │  □ Ask Knovex               •   │
 *   │  □ Reader                       │
 *   │  □ Learn                    3   │
 *   │  □ Progress                     │
 *   │                                 │
 *   │  PINNED                         │
 *   │  □ ML Foundations               │
 *   │  □ Backprop · derivation        │
 *   │  □ Daily review queue      12   │
 *   ├─────────────────────────────────│
 *   │  ⚙ Settings                     │
 *   │  < COLLAPSE                     │
 *   └─────────────────────────────────┘
 *
 * Collapsed (56px): icons only with tooltips
 */

import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import {
  Box,
  CircularProgress,
  Tooltip,
  IconButton,
  Typography,
  Divider,
  useTheme,
  alpha,
} from '@mui/material'
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutline'
import AutoStoriesIcon       from '@mui/icons-material/AutoStories'
import SettingsOutlinedIcon  from '@mui/icons-material/SettingsOutlined'
import ChevronLeftIcon       from '@mui/icons-material/ChevronLeft'
import AddIcon               from '@mui/icons-material/Add'
import ChevronRightIcon      from '@mui/icons-material/ChevronRight'
import ArticleOutlinedIcon   from '@mui/icons-material/ArticleOutlined'
import FolderOutlinedIcon    from '@mui/icons-material/FolderOutlined'
import BoltOutlinedIcon      from '@mui/icons-material/BoltOutlined'
import { useQuery }          from '@tanstack/react-query'
import { kbApi }             from '@/api/kb.api'

// ── Custom SVG icons matching the reference exactly ────────────────────────────

/** Library icon — 3 vertical "book spines" (matches KnovexUI `library` icon) */
function LibraryIcon({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none"
         stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
         style={{ display: 'block', flexShrink: 0 }}>
      <rect x="2.25" y="2.25" width="3" height="11.5" rx="0.6" />
      <rect x="6.25" y="2.25" width="3" height="11.5" rx="0.6" />
      <path d="M10.6 3.3l2.8.75 -2.3 8.5 -2.8-.75z" />
    </svg>
  )
}

/** Progress icon — ascending bar chart (matches KnovexUI `progress` icon) */
function ProgressIcon({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none"
         stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
         style={{ display: 'block', flexShrink: 0 }}>
      <path d="M2.5 12.5h11" />
      <path d="M3.5 12.5V9M6.5 12.5V6M9.5 12.5V8M12.5 12.5V4" />
    </svg>
  )
}

/** Doc icon — document with folded corner + lines */
function DocIcon({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none"
         stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
         style={{ display: 'block', flexShrink: 0 }}>
      <path d="M3.5 2.5h6.2l2.8 2.8v8.2H3.5z" />
      <path d="M9.5 2.5v3h3" />
      <path d="M5.5 8.5h5M5.5 10.5h5M5.5 6.5h2" />
    </svg>
  )
}

/** Bolt icon — lightning bolt */
function BoltIcon({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none"
         stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
         style={{ display: 'block', flexShrink: 0 }}>
      <path d="M9 2L4 9h3l-1 5 5-7H8z" />
    </svg>
  )
}

/** Folder icon */
function FolderIcon({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none"
         stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
         style={{ display: 'block', flexShrink: 0 }}>
      <path d="M2.5 4.5a1 1 0 0 1 1-1h3l1.3 1.5h4.7a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1z" />
    </svg>
  )
}

/** Lesson/Learn icon — screen with text lines */
function LessonIcon({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none"
         stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
         style={{ display: 'block', flexShrink: 0 }}>
      <rect x="2.25" y="3.5" width="9.5" height="7" rx="1" />
      <path d="M13 5.5l1.7-.6v6l-1.7-.6" />
      <path d="M4.5 6.5h5M4.5 8.5h3" />
    </svg>
  )
}

// ── Constants ──────────────────────────────────────────────────────────────────

const SIDEBAR_EXPANDED  = 220
const SIDEBAR_COLLAPSED = 56
const STORAGE_KEY       = 'knovex.sidebar.collapsed'

const MONO = '"IBM Plex Mono", "Geist Mono", monospace'

// ── Nav items ──────────────────────────────────────────────────────────────────

interface NavItem {
  label:  string
  icon:   React.ReactNode
  path:   string
  count?: number | string
  dot?:   boolean
  muted?: boolean
}

// counts injected dynamically in the component
const WORKSPACE_ITEMS: NavItem[] = [
  { label: 'Library',    icon: <LibraryIcon />,                                path: '/kb' },
  { label: 'Ask Knovex', icon: <ChatBubbleOutlineIcon sx={{ fontSize: 15 }} />, path: '/chat',     dot: true },
  { label: 'Reader',     icon: <DocIcon />,                                     path: '/reader' },
  { label: 'Learn',      icon: <LessonIcon />,                                  path: '/learn' },
  { label: 'Progress',   icon: <ProgressIcon />,                                path: '/progress' },
]

// ── Component ──────────────────────────────────────────────────────────────────

export default function Sidebar() {
  const navigate  = useNavigate()
  const location  = useLocation()
  const theme     = useTheme()

  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try { return localStorage.getItem(STORAGE_KEY) === 'true' }
    catch { return false }
  })

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, String(collapsed)) }
    catch { /* quota exceeded — ignore */ }
  }, [collapsed])

  // ── Live KB data for Library count + PINNED section ───────────────────────
  const { data: kbs = [], isLoading: kbsLoading } = useQuery({
    queryKey:        ['kbs'],
    queryFn:          kbApi.list,
    staleTime:        30_000,
    refetchInterval: 60_000,
  })

  // Top 3 most recently updated KBs for the Pinned section
  const pinnedKbs = [...kbs]
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
    .slice(0, 3)

  const isDark   = theme.palette.mode === 'dark'
  const isActive = (path: string) => location.pathname.startsWith(path)

  // ── Colours ────────────────────────────────────────────────────────────────

  // Sidebar gradient: from paper → default (matches reference nav-rail CSS)
  // Works for all 3 themes: dark(#111114→#0B0B0C), mid(#23222A→#1C1B1F), light(#FFFBF3→#F5F1EA)
  const sidebarBg = `linear-gradient(to bottom, ${alpha(theme.palette.background.paper, 0.97)}, ${alpha(theme.palette.background.default, 0.97)})`

  const activeBg = isDark
    ? 'rgba(255,255,255,0.07)'
    : 'rgba(0,0,0,0.07)'

  const hoverBg = isDark
    ? 'rgba(255,255,255,0.04)'
    : 'rgba(0,0,0,0.04)'

  const activeColor  = theme.palette.primary.main
  const defaultColor = theme.palette.text.secondary
  const borderColor  = theme.palette.divider

  const sidebarWidth = collapsed ? SIDEBAR_COLLAPSED : SIDEBAR_EXPANDED

  // ── Nav item renderer ──────────────────────────────────────────────────────

  const NavButton = ({ item }: { item: NavItem }) => {
    // Muted/pinned items are never shown as active (they're decorative)
    const active = !item.muted && isActive(item.path)

    const button = (
      <Box
        onClick={() => navigate(item.path)}
        sx={{
          display:        'flex',
          alignItems:     'center',
          gap:             1.25,
          px:              collapsed ? 0 : 1.125,
          py:              0,
          height:          30,
          mx:              1,
          borderRadius:    0.875,
          cursor:          'pointer',
          justifyContent:  collapsed ? 'center' : 'flex-start',
          color:           active
            ? theme.palette.text.primary
            : item.muted
              ? alpha(defaultColor, 0.78)
              : defaultColor,
          bgcolor:         active ? activeBg : 'transparent',
          transition:      'background 80ms ease, color 80ms ease',
          userSelect:      'none',
          position:        'relative',
          opacity:         item.muted ? 0.85 : 1,
          '&:hover': {
            bgcolor: active ? activeBg : hoverBg,
            color:   theme.palette.text.primary,
            opacity: 1,
          },
          '&::before': active ? {
            content:      '""',
            position:     'absolute',
            left:         -8,
            top:           6,
            bottom:        6,
            width:         2,
            borderRadius: '0 2px 2px 0',
            bgcolor:       activeColor,
          } : {},
        }}
      >
        {/* Icon */}
        <Box
          sx={{
            flexShrink: 0,
            display:    'flex',
            alignItems: 'center',
            color:      active ? activeColor : 'inherit',
          }}
        >
          {item.icon}
        </Box>

        {/* Label — hidden when collapsed */}
        {!collapsed && (
          <>
            <Typography
              sx={{
                fontWeight:    active ? 500 : 450,
                fontSize:      13,
                letterSpacing: '-0.005em',
                whiteSpace:    'nowrap',
                overflow:      'hidden',
                textOverflow:  'ellipsis',
                color:         'inherit',
                lineHeight:    1,
                flex:          1,
              }}
            >
              {item.label}
            </Typography>

            {/* Orange dot indicator */}
            {item.dot && (
              <Box
                sx={{
                  width:        6,
                  height:       6,
                  borderRadius: '50%',
                  bgcolor:      '#FF9500',
                  flexShrink:   0,
                }}
              />
            )}

            {/* Count badge */}
            {item.count !== undefined && (
              <Typography
                sx={{
                  fontFamily:  MONO,
                  fontSize:    10.5,
                  color:       'text.disabled',
                  flexShrink:  0,
                  lineHeight:  1,
                }}
              >
                {item.count}
              </Typography>
            )}
          </>
        )}
      </Box>
    )

    return collapsed
      ? <Tooltip title={item.label} placement="right" arrow>{button}</Tooltip>
      : button
  }

  // ── Section label ──────────────────────────────────────────────────────────

  const SectionLabel = ({ label }: { label: string }) => !collapsed ? (
    <Typography
      sx={{
        fontFamily:    MONO,
        fontSize:       9.5,
        textTransform: 'uppercase',
        letterSpacing: '0.13em',
        color:          'text.disabled',
        fontWeight:     500,
        px:             2.5,
        pt:             0.5,
        pb:             0.75,
        userSelect:    'none',
      }}
    >
      {label}
    </Typography>
  ) : null

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <Box
      sx={{
        width:      sidebarWidth,
        minWidth:   sidebarWidth,
        height:     '100%',
        display:    'flex',
        flexDirection: 'column',
        background: sidebarBg,
        backdropFilter:       'blur(20px) saturate(160%)',
        WebkitBackdropFilter: 'blur(20px) saturate(160%)',
        borderRight: `1px solid ${borderColor}`,
        transition:  'width 0.22s cubic-bezier(0.4,0,0.2,1)',
        overflow:    'hidden',
        flexShrink:  0,
        py:          1,
      }}
    >
      {/* ── Brand area ── */}
      <Box
        sx={{
          display:    'flex',
          alignItems: 'center',
          gap:        1.25,
          px:         collapsed ? 0 : 1.75,
          py:         0.25,
          mb:         0.5,
          justifyContent: collapsed ? 'center' : 'flex-start',
        }}
      >
        {/* K badge */}
        <Box
          sx={{
            width:         26,
            height:        26,
            borderRadius:  0.875,
            background:    `linear-gradient(135deg, ${theme.palette.primary.light}, ${theme.palette.primary.main})`,
            display:       'flex',
            alignItems:    'center',
            justifyContent:'center',
            flexShrink:     0,
            boxShadow:      `inset 0 1px 0 rgba(255,255,255,0.15), 0 1px 3px rgba(0,0,0,0.35)`,
          }}
        >
          <Typography sx={{ fontWeight: 800, fontSize: 12, color: '#1A140C', lineHeight: 1 }}>
            K
          </Typography>
        </Box>

        {/* Brand text — hidden when collapsed */}
        {!collapsed && (
          <Box>
            <Typography
              component="div"
              sx={{
                fontFamily:    '"Instrument Serif", Georgia, serif',
                fontSize:       22,
                letterSpacing: '-0.01em',
                color:          'text.primary',
                lineHeight:     1,
                userSelect:    'none',
              }}
            >
              Kno
              <Box component="em" sx={{ fontStyle: 'italic', color: activeColor }}>v</Box>
              ex
            </Typography>
            <Typography
              sx={{
                fontFamily:    MONO,
                fontSize:       9,
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
                color:          'text.disabled',
                userSelect:    'none',
                mt:             0.25,
              }}
            >
              v2 · workspace
            </Typography>
          </Box>
        )}
      </Box>

      {/* ── Nav items ── */}
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.125, flex: 1, pt: 0.5, overflowY: 'auto', overflowX: 'hidden' }}>

        {/* WORKSPACE section */}
        <SectionLabel label="Workspace" />
        {WORKSPACE_ITEMS.map(item => {
          // Inject live Library count from API
          const liveItem: NavItem = item.label === 'Library' && kbs.length > 0
            ? { ...item, count: kbs.length }
            : item
          return (
          <Box key={item.path + item.label}>
            <NavButton item={liveItem} />

            {/* ── New Chat sub-item below Ask Knovex ── */}
            {item.label === 'Ask Knovex' && !collapsed && (
              <Tooltip title="Start a new conversation" placement="right">
                <Box
                  onClick={() => navigate('/chat', { state: { newChat: Date.now() } })}
                  sx={{
                    display:     'flex',
                    alignItems:  'center',
                    gap:          0.75,
                    pl:           4.5,    // indent to align with label text
                    pr:           1.5,
                    height:       24,
                    mx:           1,
                    mb:           0.25,
                    borderRadius: 0.75,
                    cursor:       'pointer',
                    color:        'text.disabled',
                    userSelect:   'none',
                    transition:   'background 80ms, color 80ms',
                    '&:hover': {
                      bgcolor: hoverBg,
                      color:   activeColor,
                    },
                  }}
                >
                  <AddIcon sx={{ fontSize: 11 }} />
                  <Typography sx={{ fontSize: 11, fontFamily: MONO, letterSpacing: '0.01em' }}>
                    New chat
                  </Typography>
                </Box>
              </Tooltip>
            )}
          </Box>
          )
        })}

        {/* PINNED section — top 3 most recently updated real KBs */}
        {!collapsed && (
          <Box sx={{ mt: 1.5 }}>
            <SectionLabel label="Pinned" />

            {kbsLoading && (
              <Box sx={{ px: 2.5, py: 0.5 }}>
                <CircularProgress size={11} sx={{ color: 'text.disabled' }} />
              </Box>
            )}

            {!kbsLoading && pinnedKbs.length === 0 && (
              <Typography sx={{ px: 2.5, fontSize: 11, color: 'text.disabled', fontStyle: 'italic' }}>
                No collections yet
              </Typography>
            )}

            {pinnedKbs.map(kb => {
              const item: NavItem = {
                label: kb.name,
                icon:  <FolderIcon />,
                // Navigate directly into this KB via URL param
                path:  `/kb?kb_id=${kb.id}`,
                count: kb.stats.file_count > 0 ? kb.stats.file_count : undefined,
                muted: true,
              }
              return <NavButton key={kb.id} item={item} />
            })}
          </Box>
        )}
      </Box>

      {/* ── Divider + bottom items ── */}
      <Box>
        <Divider sx={{ mx: 1, mb: 0.5, borderColor: alpha(borderColor, 0.6) }} />

        {/* Settings */}
        {(() => {
          const active = isActive('/settings')
          const btn = (
            <Box
              onClick={() => navigate('/settings')}
              sx={{
                display:        'flex',
                alignItems:     'center',
                gap:             1.25,
                px:              collapsed ? 0 : 1.125,
                py:              0,
                height:          30,
                mx:              1,
                mb:              0.5,
                borderRadius:    0.875,
                cursor:          'pointer',
                justifyContent:  collapsed ? 'center' : 'flex-start',
                color:           active ? theme.palette.text.primary : defaultColor,
                bgcolor:         active ? activeBg : 'transparent',
                transition:      'background 80ms ease, color 80ms ease',
                userSelect:      'none',
                position:        'relative',
                '&:hover': {
                  bgcolor: active ? activeBg : hoverBg,
                  color:   theme.palette.text.primary,
                },
                '&::before': active ? {
                  content:      '""',
                  position:     'absolute',
                  left:         -8,
                  top:           6,
                  bottom:        6,
                  width:         2,
                  borderRadius: '0 2px 2px 0',
                  bgcolor:       activeColor,
                } : {},
              }}
            >
              <Box sx={{ flexShrink: 0, display: 'flex', alignItems: 'center', color: active ? activeColor : 'inherit' }}>
                <SettingsOutlinedIcon sx={{ fontSize: 15 }} />
              </Box>
              {!collapsed && (
                <Typography sx={{ fontWeight: active ? 500 : 450, fontSize: 13, letterSpacing: '-0.005em', whiteSpace: 'nowrap', color: 'inherit', lineHeight: 1 }}>
                  Settings
                </Typography>
              )}
            </Box>
          )
          return collapsed
            ? <Tooltip title="Settings" placement="right" arrow>{btn}</Tooltip>
            : btn
        })()}

        {/* Collapse toggle */}
        <Divider sx={{ mx: 1, mt: 0.5, borderColor: alpha(borderColor, 0.6) }} />
        <Box
          sx={{
            display:    'flex',
            alignItems: 'center',
            justifyContent: collapsed ? 'center' : 'space-between',
            px: 1.5,
            pt: 0.5,
            pb: 0.25,
          }}
        >
          {!collapsed && (
            <Typography
              sx={{
                fontFamily:    MONO,
                fontSize:       9,
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
                color:          'text.disabled',
                userSelect:    'none',
              }}
            >
              Collapse
            </Typography>
          )}

          <Tooltip
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            placement="right"
            arrow
          >
            <IconButton
              size="small"
              onClick={() => setCollapsed(c => !c)}
              sx={{
                width: 24, height: 24,
                color: 'text.disabled',
                borderRadius: 1,
                border: `1px solid ${alpha(borderColor, 0.8)}`,
                '&:hover': {
                  color: 'primary.main',
                  borderColor: alpha(theme.palette.primary.main, 0.5),
                  bgcolor: hoverBg,
                },
                transition: 'all 0.15s ease',
              }}
            >
              {collapsed
                ? <ChevronRightIcon sx={{ fontSize: 12 }} />
                : <ChevronLeftIcon  sx={{ fontSize: 12 }} />
              }
            </IconButton>
          </Tooltip>
        </Box>

        {/* User profile footer */}
        <Box
          sx={{
            display:    'flex',
            alignItems: 'center',
            gap:        1.25,
            px:         collapsed ? 0 : 1.5,
            py:         1,
            justifyContent: collapsed ? 'center' : 'flex-start',
          }}
        >
          {/* Avatar */}
          <Box
            sx={{
              width:          28,
              height:         28,
              borderRadius:   0.875,
              bgcolor:        isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.10)',
              display:        'flex',
              alignItems:     'center',
              justifyContent: 'center',
              flexShrink:     0,
              border:         `1px solid ${alpha(borderColor, 1)}`,
            }}
          >
            <Typography sx={{ fontSize: 10, fontWeight: 600, color: 'text.secondary', lineHeight: 1, fontFamily: MONO }}>
              GN
            </Typography>
          </Box>

          {/* Name + plan — hidden when collapsed */}
          {!collapsed && (
            <Box minWidth={0}>
              <Typography sx={{ fontSize: 12, fontWeight: 500, color: 'text.primary', lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                Gunjan T.
              </Typography>
              <Typography sx={{ fontFamily: MONO, fontSize: 9, color: 'text.disabled', lineHeight: 1.4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                PRO
              </Typography>
            </Box>
          )}
        </Box>
      </Box>
    </Box>
  )
}
