/**
 * Knovex Sidebar Navigation
 *
 * Vertical sidebar with icons + labels for: KB, Chat, Learn, Settings.
 * Highlights the active route.
 */

import { useNavigate, useLocation } from 'react-router-dom'
import {
  Box,
  Tooltip,
  IconButton,
  Divider,
  Typography,
  useTheme,
} from '@mui/material'
import FolderOpenIcon from '@mui/icons-material/FolderOpen'
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutline'
import AutoStoriesIcon from '@mui/icons-material/AutoStories'
import SettingsOutlinedIcon from '@mui/icons-material/SettingsOutlined'

interface NavItem {
  label: string
  icon: React.ReactNode
  path: string
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Knowledge Base', icon: <FolderOpenIcon />, path: '/kb' },
  { label: 'Chat', icon: <ChatBubbleOutlineIcon />, path: '/chat' },
  { label: 'Learn', icon: <AutoStoriesIcon />, path: '/learn' },
]

const SIDEBAR_WIDTH = 64

export default function Sidebar() {
  const navigate = useNavigate()
  const location = useLocation()
  const theme = useTheme()

  const isActive = (path: string) => location.pathname.startsWith(path)

  const activeColor = theme.palette.primary.main
  // Use MUI action.selected token — automatically matches the active theme accent
  const activeBg = theme.palette.action.selected ?? (
    theme.palette.mode === 'dark'
      ? 'rgba(200,146,74,0.15)'
      : 'rgba(200,146,74,0.10)'
  )

  return (
    <Box
      sx={{
        width: SIDEBAR_WIDTH,
        minWidth: SIDEBAR_WIDTH,
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        py: 1.5,
        bgcolor: 'background.paper',
        borderRight: `1px solid ${theme.palette.divider}`,
        gap: 0.5,
      }}
    >
      {/* Logo */}
      <Box sx={{ mb: 1.5, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Typography
          variant="h6"
          sx={{
            fontWeight: 800,
            fontSize: 20,
            background: `linear-gradient(135deg, ${theme.palette.primary.main}, ${theme.palette.secondary.main})`,
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}
        >
          K
        </Typography>
      </Box>

      <Divider sx={{ width: '60%', mb: 0.5 }} />

      {/* Navigation items */}
      {NAV_ITEMS.map((item) => (
        <Tooltip key={item.path} title={item.label} placement="right">
          <IconButton
            onClick={() => navigate(item.path)}
            sx={{
              width: 44,
              height: 44,
              borderRadius: 2,
              color: isActive(item.path) ? activeColor : 'text.secondary',
              bgcolor: isActive(item.path) ? activeBg : 'transparent',
              '&:hover': {
                bgcolor: activeBg,
                color: activeColor,
              },
              transition: 'all 0.15s ease',
            }}
          >
            {item.icon}
          </IconButton>
        </Tooltip>
      ))}

      {/* Spacer */}
      <Box sx={{ flex: 1 }} />

      <Divider sx={{ width: '60%', mb: 0.5 }} />

      {/* Settings at bottom */}
      <Tooltip title="Settings" placement="right">
        <IconButton
          onClick={() => navigate('/settings')}
          sx={{
            width: 44,
            height: 44,
            borderRadius: 2,
            color: isActive('/settings') ? activeColor : 'text.secondary',
            bgcolor: isActive('/settings') ? activeBg : 'transparent',
            '&:hover': {
              bgcolor: activeBg,
              color: activeColor,
            },
            transition: 'all 0.15s ease',
          }}
        >
          <SettingsOutlinedIcon />
        </IconButton>
      </Tooltip>
    </Box>
  )
}
