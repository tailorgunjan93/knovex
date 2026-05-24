/**
 * App Settings Tab
 *
 * Theme selector (Light / Medium / Dark) + KB storage path + About section.
 */

import { useState } from 'react'
import {
  Box,
  Typography,
  ToggleButtonGroup,
  ToggleButton,
  Button,
  Divider,
  Alert,
  CircularProgress,
  Link,
} from '@mui/material'
import LightModeIcon from '@mui/icons-material/LightMode'
import ContrastIcon from '@mui/icons-material/Contrast'
import DarkModeIcon from '@mui/icons-material/DarkMode'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { settingsApi, type AppSettings } from '@/api/settings.api'
import { useSettingsStore } from '@/store/settings.store'

interface AppSettingsProps {
  settings: AppSettings
}

export default function AppSettingsTab({ settings }: AppSettingsProps) {
  const qc = useQueryClient()
  const { setSettings } = useSettingsStore()

  const [theme, setTheme] = useState(settings.theme)

  const saveMutation = useMutation({
    mutationFn: (t: string) => settingsApi.update({ theme: t }),
    onSuccess: (updated) => {
      setSettings(updated)
      qc.invalidateQueries({ queryKey: ['settings'] })
    },
  })

  const handleThemeChange = (_: React.MouseEvent, value: string | null) => {
    if (!value) return
    setTheme(value)
    saveMutation.mutate(value)
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, maxWidth: 520 }}>
      <Typography variant="h6" fontWeight={600}>Appearance</Typography>

      {/* Theme selector */}
      <Box>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          Theme
        </Typography>
        <ToggleButtonGroup
          value={theme}
          exclusive
          onChange={handleThemeChange}
          size="small"
          aria-label="theme"
        >
          <ToggleButton value="light" aria-label="light">
            <LightModeIcon sx={{ mr: 0.75, fontSize: 18 }} />
            Light
          </ToggleButton>
          <ToggleButton value="medium" aria-label="medium">
            <ContrastIcon sx={{ mr: 0.75, fontSize: 18 }} />
            Medium
          </ToggleButton>
          <ToggleButton value="dark" aria-label="dark">
            <DarkModeIcon sx={{ mr: 0.75, fontSize: 18 }} />
            Dark
          </ToggleButton>
        </ToggleButtonGroup>

        {saveMutation.isPending && (
          <CircularProgress size={14} sx={{ ml: 1.5, mt: 0.5 }} />
        )}
      </Box>

      <Divider />

      {/* Storage path */}
      <Box>
        <Typography variant="h6" fontWeight={600} sx={{ mb: 0.5 }}>Storage</Typography>
        <Typography variant="body2" color="text.secondary">
          KB data is stored at:
        </Typography>
        <Typography
          variant="body2"
          sx={{
            mt: 0.5,
            p: 1,
            bgcolor: 'action.hover',
            borderRadius: 1,
            fontFamily: 'monospace',
            fontSize: 12,
            wordBreak: 'break-all',
          }}
        >
          {settings.kb_storage_path || '(default)'}
        </Typography>
      </Box>

      <Divider />

      {/* About */}
      <Box>
        <Typography variant="h6" fontWeight={600} sx={{ mb: 1 }}>About</Typography>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
          <Typography variant="body2">
            <strong>Knovex</strong> — AI-powered Desktop Knowledge Base
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Version: {settings.backend_port ? '0.1.0' : '—'}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            <em>Secure · Fast · Reliable · Cost-Effective</em>
          </Typography>
          <Link
            href="https://github.com/tailorgunjan93"
            target="_blank"
            rel="noopener noreferrer"
            variant="body2"
            sx={{ mt: 0.5 }}
          >
            GitHub
          </Link>
        </Box>
      </Box>
    </Box>
  )
}
