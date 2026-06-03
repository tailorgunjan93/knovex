/**
 * App Settings Tab — "03 · APPEARANCE" (lab screen 20).
 *
 *  - Look & feel: Dark / Charcoal / Parchment theme (auto-saves on click)
 *  - Storage:     KB data path + native folder picker
 *  - About:       app version + links
 */

import { useState, useEffect } from 'react'
import {
  Box, Typography, Button, Alert, CircularProgress, Link,
} from '@mui/material'
import FolderOpenIcon from '@mui/icons-material/FolderOpen'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { settingsApi, type AppSettings } from '@/api/settings.api'
import { useSettingsStore } from '@/store/settings.store'
import { BRAND } from '@/theme/tokens'
import OcrPackCard from './OcrPackCard'

const MONO = '"IBM Plex Mono", "Geist Mono", monospace'

// Theme value (stored) → lab label. The three locked themes:
// dark obsidian · charcoal/medium · light parchment.
const THEMES: Array<{ value: string; label: string }> = [
  { value: 'dark',   label: 'Dark' },
  { value: 'medium', label: 'Charcoal' },
  { value: 'light',  label: 'Parchment' },
]

interface AppSettingsProps {
  settings: AppSettings
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <Typography sx={{ fontFamily: MONO, fontSize: 10, letterSpacing: '0.13em', color: 'text.disabled', mb: 1.25 }}>
      {children}
    </Typography>
  )
}

export default function AppSettingsTab({ settings }: AppSettingsProps) {
  const qc = useQueryClient()
  const { setSettings } = useSettingsStore()

  const [theme, setTheme] = useState(settings.theme)
  const [storagePath, setStoragePath] = useState(settings.kb_storage_path || '')
  const [appVersion, setAppVersion] = useState<string>('—')

  useEffect(() => {
    if (window.knovex?.appVersion) {
      window.knovex.appVersion().then(setAppVersion).catch(() => {})
    }
  }, [])

  const themeMutation = useMutation({
    mutationFn: (t: string) => settingsApi.update({ theme: t }),
    onSuccess: (updated) => {
      setSettings(updated)
      qc.invalidateQueries({ queryKey: ['settings'] })
    },
  })

  const pathMutation = useMutation({
    mutationFn: (p: string) => settingsApi.update({ kb_storage_path: p }),
    onSuccess: (updated) => {
      setSettings(updated)
      qc.invalidateQueries({ queryKey: ['settings'] })
    },
  })

  const applyTheme = (value: string) => {
    if (value === theme) return
    setTheme(value)
    themeMutation.mutate(value)
  }

  const handlePickFolder = async () => {
    if (!window.knovex?.openFolderPicker) return
    const chosen = await window.knovex.openFolderPicker()
    if (chosen) setStoragePath(chosen)
  }

  const pathDirty = storagePath !== (settings.kb_storage_path || '')

  return (
    <Box sx={{ maxWidth: 720 }}>
      <Typography sx={{ fontSize: 20, fontWeight: 700, mb: 0.5 }}>Look &amp; feel</Typography>
      <Typography sx={{ fontSize: 13.5, color: 'text.secondary', lineHeight: 1.6, mb: 3 }}>
        Set it once — every screen and reader inherits it.
      </Typography>

      {/* ── Theme ── */}
      <SectionLabel>THEME</SectionLabel>
      <Box sx={{ display: 'inline-flex', gap: 0.5, p: 0.5, borderRadius: 2.5, bgcolor: 'action.hover', mb: 4 }}>
        {THEMES.map(t => {
          const active = theme === t.value
          return (
            <Box
              key={t.value}
              component="button"
              onClick={() => applyTheme(t.value)}
              sx={{
                height: 34, px: 2, borderRadius: 2, border: 0, cursor: 'pointer',
                fontFamily: 'inherit', fontSize: 13, fontWeight: 600,
                background: active ? BRAND.gradient : 'transparent',
                color: active ? BRAND.onAccent : 'text.secondary',
                transition: 'color 0.12s',
                '&:hover': active ? {} : { color: 'text.primary' },
              }}
            >
              {t.label}
            </Box>
          )
        })}
      </Box>

      {/* ── Storage ── */}
      <SectionLabel>STORAGE</SectionLabel>
      <Box sx={{
        display: 'flex', alignItems: 'center', gap: 1.5, p: 1.25, pl: 2, mb: 0.75,
        borderRadius: 2.5, border: '1px solid', borderColor: 'divider', bgcolor: 'background.paper',
        '&:focus-within': { borderColor: 'primary.main' },
      }}>
        <FolderOpenIcon sx={{ color: 'text.disabled', fontSize: 20, flexShrink: 0 }} />
        <Box
          component="input"
          value={storagePath}
          onChange={(e) => setStoragePath((e.target as HTMLInputElement).value)}
          placeholder="(using default)"
          sx={{
            flex: 1, minWidth: 0, border: 0, outline: 0, bgcolor: 'transparent',
            color: 'text.primary', fontFamily: MONO, fontSize: 13,
            '&::placeholder': { color: 'text.disabled', opacity: 1 },
          }}
        />
        {window.knovex?.openFolderPicker && (
          <Button
            onClick={handlePickFolder}
            sx={{ fontSize: 12.5, textTransform: 'none', color: 'text.secondary', borderRadius: 99,
                  '&:hover': { bgcolor: 'action.hover' } }}
          >
            Browse…
          </Button>
        )}
        {pathDirty && (
          <Button
            disableElevation
            onClick={() => pathMutation.mutate(storagePath)}
            disabled={pathMutation.isPending}
            sx={{ fontSize: 12.5, fontWeight: 700, textTransform: 'none', borderRadius: 99, px: 2,
                  background: BRAND.gradient, color: BRAND.onAccent,
                  '&:hover': { background: BRAND.gradient, filter: 'brightness(1.05)' } }}
          >
            {pathMutation.isPending ? <CircularProgress size={14} /> : 'Save'}
          </Button>
        )}
      </Box>
      <Typography sx={{ fontSize: 12, color: 'text.disabled', mb: 4 }}>
        Where knowledge-base files and the database live. Takes effect after a restart.
      </Typography>
      {pathMutation.isSuccess && (
        <Alert severity="success" sx={{ mt: -3, mb: 4, borderRadius: 2 }}>Path saved. Restart the app to apply.</Alert>
      )}

      {/* ── Advanced (OCR pack) ── */}
      <SectionLabel>ADVANCED</SectionLabel>
      <Box sx={{ mb: 4 }}>
        <OcrPackCard />
      </Box>

      {/* ── About ── */}
      <SectionLabel>ABOUT</SectionLabel>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
        <Typography sx={{ fontSize: 13.5 }}>
          <strong>Knovex</strong> — AI-powered desktop knowledge base · v{appVersion}
        </Typography>
        <Typography sx={{ fontSize: 12, color: 'text.disabled', fontFamily: MONO }}>
          Secure · Fast · Reliable · Cost-Effective
        </Typography>
        <Box sx={{ display: 'flex', gap: 2, mt: 0.5 }}>
          <Link href="https://github.com/tailorgunjan93/knovex" target="_blank" rel="noopener noreferrer" sx={{ fontSize: 13 }}>GitHub</Link>
          <Link href="https://github.com/tailorgunjan93/knovex/blob/main/CHANGELOG.md" target="_blank" rel="noopener noreferrer" sx={{ fontSize: 13 }}>Changelog</Link>
        </Box>
      </Box>
    </Box>
  )
}
