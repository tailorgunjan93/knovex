/**
 * Embedding / Dense Vector Search Settings Tab
 *
 * Allows the user to:
 *   1. Toggle dense vector search on/off (master switch)
 *   2. Choose provider: local ONNX or OpenAI
 *   3. Download the local model (~45 MB) with progress indicator
 *   4. Enter OpenAI API key when using cloud embeddings
 */

import { useEffect, useRef, useState } from 'react'
import {
  Alert,
  Box,
  CircularProgress,
  LinearProgress,
  MenuItem,
  Select,
  TextField,
  Typography,
  alpha,
  useTheme,
} from '@mui/material'
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline'
import DownloadIcon from '@mui/icons-material/Download'
import MemoryIcon from '@mui/icons-material/Memory'
import CloudIcon from '@mui/icons-material/Cloud'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { settingsApi, type EmbeddingSettings, type AppSettings } from '@/api/settings.api'
import { BRAND } from '@/theme/tokens'

const MONO  = '"IBM Plex Mono", "Geist Mono", monospace'

interface Props {
  settings: AppSettings
}

export default function EmbeddingSettingsTab({ settings }: Props) {
  const theme       = useTheme()
  const isDark      = theme.palette.mode === 'dark'
  const accent      = theme.palette.primary.main
  const queryClient = useQueryClient()

  const emb = settings.embedding ?? { enabled: false, provider: 'local', model: 'text-embedding-3-small', api_key: '' }

  const [enabled,   setEnabled]   = useState(emb.enabled)
  const [provider,  setProvider]  = useState(emb.provider || 'local')
  const [openaiKey, setOpenaiKey] = useState(emb.api_key || '')
  const [saved,     setSaved]     = useState(false)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // ── Model status ──────────────────────────────────────────────────────────
  const { data: modelStatus, refetch: refetchStatus } = useQuery({
    queryKey: ['embedding-model-status'],
    queryFn:  settingsApi.getEmbeddingModelStatus,
    refetchInterval: 0,
  })

  // ── Download progress ─────────────────────────────────────────────────────
  const [downloading, setDownloading] = useState(false)
  const [progress,    setProgress]    = useState({ downloaded: 0, total: 0, error: '' })

  const startPoll = () => {
    if (pollRef.current) return
    pollRef.current = setInterval(async () => {
      try {
        const p = await settingsApi.getDownloadProgress()
        setProgress({ downloaded: p.downloaded, total: p.total, error: p.error })
        if (!p.running) {
          clearInterval(pollRef.current!)
          pollRef.current = null
          setDownloading(false)
          refetchStatus()
        }
      } catch { /* ignore */ }
    }, 800)
  }

  const downloadMutation = useMutation({
    mutationFn: settingsApi.downloadEmbeddingModel,
    onSuccess: (res) => {
      if (res.status === 'already_ready') {
        refetchStatus()
      } else {
        setDownloading(true)
        startPoll()
      }
    },
  })

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current) }, [])

  // ── Save ──────────────────────────────────────────────────────────────────
  const saveMutation = useMutation({
    mutationFn: (patch: Partial<EmbeddingSettings>) =>
      settingsApi.update({ embedding: patch }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    },
  })

  const handleSave = () => {
    saveMutation.mutate({
      enabled,
      provider,
      api_key: provider === 'openai' ? openaiKey : '',
      model: 'text-embedding-3-small',
    })
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  const pct = progress.total > 0 ? Math.round((progress.downloaded / progress.total) * 100) : 0
  const modelReady = modelStatus?.ready ?? false
  const divider = `1px solid ${theme.palette.divider}`

  const row = (label: string, sub: string, right: React.ReactNode) => (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, py: 1.5,
               borderBottom: divider, '&:last-child': { borderBottom: 'none' } }}>
      <Box flex={1} minWidth={0}>
        <Typography sx={{ fontSize: 13, fontWeight: 500, color: 'text.primary' }}>{label}</Typography>
        <Typography sx={{ fontSize: 11.5, color: 'text.secondary', mt: 0.25 }}>{sub}</Typography>
      </Box>
      {right}
    </Box>
  )

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <Box sx={{ maxWidth: 720 }}>
      <Typography sx={{ fontSize: 20, fontWeight: 700, mb: 0.5 }}>Dense search</Typography>
      <Typography sx={{ fontSize: 13.5, color: 'text.secondary', lineHeight: 1.6, mb: 2.5 }}>
        Add semantic vector search on top of keyword (FTS5). Optional — keyword search works without any model.
      </Typography>

      {/* Master toggle */}
      <Box sx={{ p: 2.5, mb: 2.5, borderRadius: 2,
                 border: `1px solid ${enabled ? alpha(accent, 0.35) : theme.palette.divider}`,
                 bgcolor: enabled ? alpha(accent, isDark ? 0.07 : 0.04) : alpha(theme.palette.background.paper, 0.6) }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Box flex={1}>
            <Typography sx={{ fontSize: 14, fontWeight: 600, color: 'text.primary' }}>
              Dense vector search
            </Typography>
            <Typography sx={{ fontSize: 12, color: 'text.secondary', mt: 0.5 }}>
              Adds semantic similarity on top of keyword (FTS5) search. Finds relevant chunks even
              when query words don't appear verbatim. Uses Reciprocal Rank Fusion to combine both signals.
            </Typography>
          </Box>
          {/* Toggle switch */}
          <Box
            onClick={() => setEnabled(v => !v)}
            sx={{ width: 44, height: 24, borderRadius: 12, cursor: 'pointer', flexShrink: 0,
                  bgcolor: enabled ? accent : alpha(isDark ? '#fff' : '#000', 0.18),
                  position: 'relative', transition: 'background 0.2s ease' }}
          >
            <Box sx={{ position: 'absolute', top: 3, left: enabled ? 22 : 3,
                       width: 18, height: 18, borderRadius: '50%', bgcolor: '#fff',
                       transition: 'left 0.2s ease', boxShadow: '0 1px 3px rgba(0,0,0,0.3)' }} />
          </Box>
        </Box>

        {enabled && (
          <Box sx={{ mt: 1.5, display: 'flex', alignItems: 'center', gap: 1,
                     px: 1, py: 0.5, borderRadius: 1,
                     bgcolor: alpha(accent, isDark ? 0.12 : 0.08) }}>
            <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: accent, flexShrink: 0 }} />
            <Typography sx={{ fontFamily: MONO, fontSize: 10.5, color: accent }}>
              hybrid FTS5 + dense · RRF fusion active
            </Typography>
          </Box>
        )}
      </Box>

      {/* Provider & model config — only shown when enabled */}
      {enabled && (
        <Box sx={{ p: 2.5, borderRadius: 2, border: divider,
                   bgcolor: alpha(theme.palette.background.paper, 0.6) }}>

          {/* Provider selector */}
          {row(
            'Embedding provider',
            'Where to compute the vector embeddings',
            <Select
              size="small"
              value={provider}
              onChange={e => setProvider(e.target.value)}
              sx={{ fontSize: 13, width: 180, height: 32 }}
            >
              <MenuItem value="local">
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <MemoryIcon sx={{ fontSize: 14 }} />
                  <span>Local (ONNX)</span>
                </Box>
              </MenuItem>
              <MenuItem value="openai">
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <CloudIcon sx={{ fontSize: 14 }} />
                  <span>OpenAI API</span>
                </Box>
              </MenuItem>
            </Select>
          )}

          {/* Local model section */}
          {provider === 'local' && (
            <>
              {row(
                'Model',
                'all-MiniLM-L6-v2 · 384 dims · ~45 MB · runs fully offline',
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  {modelReady ? (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75,
                               px: 1.25, py: 0.5, borderRadius: 1,
                               bgcolor: alpha('#22c55e', 0.1), border: `1px solid ${alpha('#22c55e', 0.3)}` }}>
                      <CheckCircleOutlineIcon sx={{ fontSize: 13, color: '#22c55e' }} />
                      <Typography sx={{ fontFamily: MONO, fontSize: 11, color: '#22c55e' }}>
                        Ready
                      </Typography>
                    </Box>
                  ) : (
                    <Box
                      onClick={() => !downloading && downloadMutation.mutate()}
                      sx={{ display: 'flex', alignItems: 'center', gap: 0.75,
                            px: 1.25, py: 0.5, borderRadius: 1, cursor: 'pointer',
                            bgcolor: alpha(accent, 0.12), border: `1px solid ${alpha(accent, 0.3)}`,
                            color: accent,
                            '&:hover': { bgcolor: alpha(accent, 0.18) },
                            opacity: downloading ? 0.7 : 1 }}
                    >
                      {downloading
                        ? <CircularProgress size={11} sx={{ color: accent }} />
                        : <DownloadIcon sx={{ fontSize: 13 }} />}
                      <Typography sx={{ fontFamily: MONO, fontSize: 11 }}>
                        {downloading ? `${pct}%` : 'Download'}
                      </Typography>
                    </Box>
                  )}
                </Box>
              )}

              {/* Download progress bar */}
              {downloading && progress.total > 0 && (
                <Box sx={{ mt: 1 }}>
                  <LinearProgress
                    variant="determinate"
                    value={pct}
                    sx={{ height: 4, borderRadius: 2,
                          bgcolor: alpha(accent, 0.15),
                          '& .MuiLinearProgress-bar': { bgcolor: accent } }}
                  />
                  <Typography sx={{ fontFamily: MONO, fontSize: 10, color: 'text.disabled', mt: 0.5 }}>
                    {(progress.downloaded / 1e6).toFixed(1)} MB / {(progress.total / 1e6).toFixed(1)} MB
                  </Typography>
                </Box>
              )}

              {progress.error && (
                <Alert severity="error" sx={{ mt: 1, fontSize: 12 }}>
                  Download failed: {progress.error}
                </Alert>
              )}

              {!modelReady && !downloading && (
                <Box sx={{ mt: 1, px: 1, py: 0.75, borderRadius: 1,
                           bgcolor: alpha('#f59e0b', 0.08), border: `1px solid ${alpha('#f59e0b', 0.25)}` }}>
                  <Typography sx={{ fontSize: 11.5, color: '#f59e0b' }}>
                    Model not downloaded yet. Dense search will fall back to FTS5 until the model is ready.
                    Click <strong>Download</strong> above — it's a one-time ~45 MB download.
                  </Typography>
                </Box>
              )}
            </>
          )}

          {/* OpenAI section */}
          {provider === 'openai' && (
            <>
              {row(
                'Model',
                'text-embedding-3-small · 1536 dims · billed per token',
                <Typography sx={{ fontFamily: MONO, fontSize: 11, color: 'text.disabled' }}>
                  text-embedding-3-small
                </Typography>
              )}
              {row(
                'OpenAI API key',
                'Same key used for LLM inference (or a separate embeddings-only key)',
                <TextField
                  size="small"
                  type="password"
                  value={openaiKey}
                  onChange={e => setOpenaiKey(e.target.value)}
                  placeholder="sk-..."
                  sx={{ width: 220, '& input': { fontSize: 13, fontFamily: MONO } }}
                />
              )}
            </>
          )}
        </Box>
      )}

      {/* Save button */}
      <Box sx={{ mt: 2.5, display: 'flex', justifyContent: 'flex-end', gap: 1.5 }}>
        {saved && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75,
                     px: 1.25, py: 0.5, borderRadius: 1,
                     bgcolor: alpha('#22c55e', 0.1), border: `1px solid ${alpha('#22c55e', 0.25)}` }}>
            <CheckCircleOutlineIcon sx={{ fontSize: 13, color: '#22c55e' }} />
            <Typography sx={{ fontFamily: MONO, fontSize: 11, color: '#22c55e' }}>Saved</Typography>
          </Box>
        )}
        <Box
          onClick={handleSave}
          sx={{ height: 38, px: 2.5, borderRadius: 99, cursor: 'pointer',
                background: BRAND.gradient, color: BRAND.onAccent,
                display: 'flex', alignItems: 'center', gap: 0.75,
                opacity: saveMutation.isPending ? 0.6 : 1,
                '&:hover': { filter: 'brightness(1.05)' } }}
        >
          {saveMutation.isPending && <CircularProgress size={11} sx={{ color: BRAND.onAccent }} />}
          <Typography sx={{ fontSize: 13, fontWeight: 700 }}>Save embedding settings</Typography>
        </Box>
      </Box>
    </Box>
  )
}
