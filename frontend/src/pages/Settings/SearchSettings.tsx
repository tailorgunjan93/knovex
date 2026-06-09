/**
 * Search Settings — multi-engine card list (lab screen 18).
 *
 * Enable as many engines as you like; Knovex blends the top results from every
 * active engine (see SearchService.search_blended). Free engines (DuckDuckGo,
 * Wikipedia) need no key; Serper / Brave take an API key.
 */

import { useState } from 'react'
import {
  Box, Typography, TextField, Checkbox, Chip, InputAdornment, IconButton,
  CircularProgress, Button, alpha, useTheme,
} from '@mui/material'
import VisibilityIcon from '@mui/icons-material/Visibility'
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline'
import WifiTetheringIcon from '@mui/icons-material/WifiTethering'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { settingsApi, type AppSettings, type SearchEngineConfig } from '@/api/settings.api'
import { BRAND } from '@/theme/tokens'

interface EngineMeta {
  id: string
  label: string
  sub: string
  free: boolean
}

const ENGINES: EngineMeta[] = [
  { id: 'duckduckgo', label: 'DuckDuckGo',   sub: 'Free · No key required',       free: true },
  { id: 'wikipedia',  label: 'Wikipedia',    sub: 'Free · Encyclopedic grounding', free: true },
  { id: 'serper',     label: 'Serper',       sub: 'High-quality SERP results',     free: false },
  { id: 'brave',      label: 'Brave Search', sub: 'Privacy-focused',               free: false },
]

interface Props {
  settings: AppSettings
}

export default function SearchSettingsTab({ settings }: Props) {
  const engines = settings.search_engines ?? {}
  return (
    <Box sx={{ maxWidth: 720 }}>
      <Typography sx={{ fontSize: 20, fontWeight: 700, mb: 0.5 }}>Web search engines</Typography>
      <Typography sx={{ fontSize: 13.5, color: 'text.secondary', lineHeight: 1.6, mb: 2.5 }}>
        Enable as many as you like — Knovex blends the top results from every active engine.
      </Typography>

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        {ENGINES.map(e => (
          <EngineCard key={e.id} meta={e} config={engines[e.id]} />
        ))}
      </Box>
    </Box>
  )
}

function EngineCard({ meta, config }: { meta: EngineMeta; config: SearchEngineConfig | undefined }) {
  const theme = useTheme()
  const isDark = theme.palette.mode === 'dark'
  const qc = useQueryClient()
  const enabled = config?.enabled ?? false

  const [apiKey, setApiKey] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [test, setTest] = useState<{ ok: boolean; msg: string } | null>(null)

  const save = useMutation({
    mutationFn: (patch: Partial<{ enabled: boolean; api_key: string }>) =>
      settingsApi.setSearchEngine(meta.id, patch),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['settings'] }); setApiKey('') },
  })

  const keySaved = !meta.free && !!config?.api_key

  const testEngine = useMutation({
    mutationFn: () => settingsApi.testSearchEngine(meta.id),
    onSuccess: (r) => setTest(
      r.success
        ? {
            ok: true,
            msg: `${r.result_count} result${r.result_count === 1 ? '' : 's'}`
              + (r.latency_ms != null ? ` · ${r.latency_ms}ms` : '')
              + (r.sample_title ? ` — “${r.sample_title}”` : ''),
          }
        : { ok: false, msg: r.error || 'No results' },
    ),
    onError: () => setTest({ ok: false, msg: 'Test failed — check your connection' }),
  })

  // Paid engines can only be tested once a key is saved (the probe uses the
  // stored key, not the unsaved text field).
  const canTest = meta.free || keySaved

  return (
    <Box sx={{
      p: 2, borderRadius: 3,
      border: '1px solid', borderColor: enabled ? alpha(BRAND.copper, 0.45) : 'divider',
      bgcolor: enabled ? alpha(BRAND.copper, isDark ? 0.05 : 0.03) : 'background.paper',
      transition: 'border-color 0.15s, background 0.15s',
    }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.75 }}>
        <Checkbox
          checked={enabled}
          onChange={(e) => save.mutate({ enabled: e.target.checked })}
          sx={{ p: 0.5, color: 'text.disabled', '&.Mui-checked': { color: BRAND.copper } }}
        />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontSize: 15, fontWeight: 700, lineHeight: 1.2 }}>{meta.label}</Typography>
          <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>{meta.sub}</Typography>
        </Box>

        {meta.free ? (
          <Chip
            label="Free"
            size="small"
            sx={{ fontSize: 11, height: 24, borderRadius: 99, color: '#3A8D7A',
                  bgcolor: alpha('#3A8D7A', 0.14), fontWeight: 600 }}
          />
        ) : (
          <TextField
            type={showKey ? 'text' : 'password'}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            onBlur={() => { if (apiKey.trim()) save.mutate({ api_key: apiKey.trim() }) }}
            placeholder={keySaved ? `Saved: ${config?.api_key} — enter to replace` : `${meta.label} API key`}
            size="small"
            sx={{ width: 240, '& .MuiOutlinedInput-root': { borderRadius: 2, fontSize: 12.5, fontFamily: '"IBM Plex Mono", monospace' } }}
            InputProps={{
              endAdornment: (
                <InputAdornment position="end">
                  {save.isPending ? <CircularProgress size={14} /> : (
                    <IconButton size="small" onClick={() => setShowKey(s => !s)}>
                      {showKey ? <VisibilityOffIcon sx={{ fontSize: 16 }} /> : <VisibilityIcon sx={{ fontSize: 16 }} />}
                    </IconButton>
                  )}
                </InputAdornment>
              ),
            }}
          />
        )}

        <Button
          size="small"
          disabled={!canTest || testEngine.isPending}
          onClick={() => { setTest(null); testEngine.mutate() }}
          startIcon={testEngine.isPending
            ? <CircularProgress size={12} />
            : <WifiTetheringIcon sx={{ fontSize: 14 }} />}
          sx={{ fontSize: 12.5, textTransform: 'none', borderRadius: 99, px: 1.5, whiteSpace: 'nowrap',
                color: 'text.secondary', '&:hover': { bgcolor: 'action.hover' } }}
        >
          Test
        </Button>
      </Box>

      {test && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mt: 1, ml: 5.5,
                   color: test.ok ? '#3A8D7A' : 'error.main' }}>
          {test.ok ? <CheckCircleIcon sx={{ fontSize: 15 }} /> : <ErrorOutlineIcon sx={{ fontSize: 15 }} />}
          <Typography sx={{ fontSize: 12 }}>{test.msg}</Typography>
        </Box>
      )}
    </Box>
  )
}
