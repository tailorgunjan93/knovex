/**
 * App Settings Tab — v0.5.0
 *
 * Sections:
 *  - Appearance: Light / Medium / Dark theme toggle (auto-saves on click)
 *  - Storage:    KB data path display + native folder picker to change it
 *  - About:      Real app version via Electron IPC, links
 */

import { useState, useEffect } from 'react'
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
  TextField,
  InputAdornment,
  IconButton,
  Tooltip,
} from '@mui/material'
import LightModeIcon from '@mui/icons-material/LightMode'
import ContrastIcon from '@mui/icons-material/Contrast'
import DarkModeIcon from '@mui/icons-material/DarkMode'
import FolderOpenIcon from '@mui/icons-material/FolderOpen'
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
  const [storagePath, setStoragePath] = useState(settings.kb_storage_path || '')
  const [appVersion, setAppVersion] = useState<string>('—')

  // Fetch real app version from Electron IPC (falls back to '—' in browser)
  useEffect(() => {
    if (window.knovex?.appVersion) {
      window.knovex.appVersion().then(setAppVersion).catch(() => {})
    }
  }, [])

  // Theme mutation — auto-saves on toggle click
  const themeMutation = useMutation({
    mutationFn: (t: string) => settingsApi.update({ theme: t }),
    onSuccess: (updated) => {
      setSettings(updated)
      qc.invalidateQueries({ queryKey: ['settings'] })
    },
  })

  // Storage path mutation
  const pathMutation = useMutation({
    mutationFn: (p: string) => settingsApi.update({ kb_storage_path: p }),
    onSuccess: (updated) => {
      setSettings(updated)
      qc.invalidateQueries({ queryKey: ['settings'] })
    },
  })

  const handleThemeChange = (_: React.MouseEvent, value: string | null) => {
    if (!value) return
    setTheme(value)
    themeMutation.mutate(value)
  }

  const handlePickFolder = async () => {
    if (!window.knovex?.openFolderPicker) return
    const chosen = await window.knovex.openFolderPicker()
    if (chosen) setStoragePath(chosen)
  }

  const handleSavePath = () => {
    if (storagePath) pathMutation.mutate(storagePath)
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, maxWidth: 520 }}>

      {/* ── Appearance ── */}
      <Box>
        <Typography variant="h6" fontWeight={600} sx={{ mb: 1.5 }}>Appearance</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>Theme</Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
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
          {themeMutation.isPending && <CircularProgress size={14} />}
        </Box>
      </Box>

      <Divider />

      {/* ── Storage path ── */}
      <Box>
        <Typography variant="h6" fontWeight={600} sx={{ mb: 0.5 }}>Storage</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
          Location where knowledge base files and the SQLite database are stored.
          Changing this path takes effect after restarting the app.
        </Typography>

        <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
          <TextField
            label="KB Storage Path"
            value={storagePath}
            onChange={(e) => setStoragePath(e.target.value)}
            placeholder="(using default)"
            size="small"
            fullWidth
            InputProps={{
              endAdornment: window.knovex?.openFolderPicker ? (
                <InputAdornment position="end">
                  <Tooltip title="Browse…">
                    <IconButton size="small" onClick={handlePickFolder}>
                      <FolderOpenIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </InputAdornment>
              ) : undefined,
            }}
          />
          <Button
            variant="outlined"
            size="small"
            onClick={handleSavePath}
            disabled={!storagePath || pathMutation.isPending}
            sx={{ whiteSpace: 'nowrap', mt: 0.25 }}
          >
            {pathMutation.isPending ? <CircularProgress size={16} /> : 'Save'}
          </Button>
        </Box>

        {pathMutation.isSuccess && (
          <Alert severity="success" sx={{ mt: 1.5 }}>Path saved. Restart the app to apply.</Alert>
        )}
        {pathMutation.isError && (
          <Alert severity="error" sx={{ mt: 1.5 }}>Failed to save path.</Alert>
        )}
      </Box>

      <Divider />

      {/* ── About ── */}
      <Box>
        <Typography variant="h6" fontWeight={600} sx={{ mb: 1 }}>About</Typography>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
          <Typography variant="body2">
            <strong>Knovex</strong> — AI-powered Desktop Knowledge Base
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Version: {appVersion}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            <em>Secure · Fast · Reliable · Cost-Effective</em>
          </Typography>
          <Box sx={{ display: 'flex', gap: 2, mt: 0.5 }}>
            <Link
              href="https://github.com/tailorgunjan93/knovex"
              target="_blank"
              rel="noopener noreferrer"
              variant="body2"
            >
              GitHub
            </Link>
            <Link
              href="https://github.com/tailorgunjan93/knovex/blob/main/CHANGELOG.md"
              target="_blank"
              rel="noopener noreferrer"
              variant="body2"
            >
              Changelog
            </Link>
          </Box>
        </Box>
      </Box>

    </Box>
  )
}
