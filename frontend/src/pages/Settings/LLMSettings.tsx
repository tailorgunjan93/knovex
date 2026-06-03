/**
 * LLM Settings — multi-provider card grid (lab screen 17).
 *
 * Each provider is an independently-configured card: paste a key, pick a model,
 * test it. One provider is "Active" (answers chat & page Q&A); the rest stay on
 * standby. Backed by the per-provider store (settings.llm_providers) + the
 * active selector (settings.llm.provider) — see settings_service.
 *
 * Embeddings live in their own Settings tab now (not here).
 */

import { useEffect, useState } from 'react'
import {
  Box, Typography, TextField, Button, Chip, Switch, InputAdornment,
  IconButton, CircularProgress, Tooltip, Select, MenuItem, FormControl,
  InputLabel, alpha, useTheme,
} from '@mui/material'
import VisibilityIcon from '@mui/icons-material/Visibility'
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline'
import WifiTetheringIcon from '@mui/icons-material/WifiTethering'
import SyncIcon from '@mui/icons-material/Sync'
import LockIcon from '@mui/icons-material/Lock'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { settingsApi, type AppSettings, type LLMProviderConfig } from '@/api/settings.api'
import { BRAND } from '@/theme/tokens'

const MONO = '"IBM Plex Mono", "Geist Mono", monospace'

interface ProviderMeta {
  id: string
  label: string
  letter: string
  color: string
  requiresKey: boolean
  hasBaseUrl?: boolean
  isBedrock?: boolean
  defaultModel: string
}

const PROVIDERS: ProviderMeta[] = [
  { id: 'openai',    label: 'OpenAI',        letter: 'O',  color: '#10A37F', requiresKey: true,  defaultModel: 'gpt-4o-mini' },
  { id: 'anthropic', label: 'Anthropic',     letter: 'A',  color: '#C9714E', requiresKey: true,  defaultModel: 'claude-haiku-4-5' },
  { id: 'groq',      label: 'Groq',          letter: 'Gq', color: '#F55036', requiresKey: true,  defaultModel: 'llama-3.3-70b-versatile' },
  { id: 'gemini',    label: 'Google Gemini', letter: 'Ge', color: '#4285F4', requiresKey: true,  defaultModel: 'gemini-2.0-flash' },
  { id: 'cerebras',  label: 'Cerebras',      letter: 'Ce', color: '#F76707', requiresKey: true,  defaultModel: 'llama3.3-70b' },
  { id: 'bedrock',   label: 'AWS Bedrock',   letter: 'Be', color: '#FF9900', requiresKey: false, isBedrock: true, defaultModel: 'anthropic.claude-3-5-sonnet-20240620-v1:0' },
  { id: 'ollama',    label: 'Ollama',        letter: 'Ol', color: '#6E7079', requiresKey: false, hasBaseUrl: true, defaultModel: 'llama3.2:3b' },
]

interface Props {
  settings: AppSettings
}

export default function LLMSettingsTab({ settings }: Props) {
  const theme = useTheme()
  const activeProvider = settings.llm.provider
  const providers = settings.llm_providers ?? {}
  const configuredCount = PROVIDERS.filter(p => providers[p.id]?.configured).length

  return (
    <Box>
      {/* Section intro + count chip */}
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2, mb: 2.5, flexWrap: 'wrap' }}>
        <Box sx={{ flex: 1, minWidth: 280 }}>
          <Typography sx={{ fontSize: 20, fontWeight: 700, mb: 0.5 }}>LLM providers</Typography>
          <Typography sx={{ fontSize: 13.5, color: 'text.secondary', lineHeight: 1.6, maxWidth: 620 }}>
            Connect any combination. The active provider answers chat &amp; page Q&amp;A; the rest stand by for fallback.
          </Typography>
        </Box>
        <Chip
          label={`${configuredCount} configured · ${PROVIDERS.length} supported`}
          size="small"
          sx={{ fontFamily: MONO, fontSize: 11.5, height: 28, borderRadius: 99,
                bgcolor: 'action.hover', color: 'text.secondary' }}
        />
      </Box>

      {/* Provider grid */}
      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' } }}>
        {PROVIDERS.map(p => (
          <ProviderCard
            key={p.id}
            meta={p}
            config={providers[p.id]}
            isActive={activeProvider === p.id}
          />
        ))}
      </Box>

      {/* Encryption notice */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color: 'text.secondary', mt: 3 }}>
        <LockIcon sx={{ fontSize: 16, color: '#3A8D7A' }} />
        <Typography sx={{ fontSize: 12 }}>
          Keys are encrypted at rest (Fernet) in your user config directory — never sent anywhere but the provider you choose.
        </Typography>
      </Box>
    </Box>
  )
}

// ─── Provider card ───────────────────────────────────────────────────────────

function ProviderCard({ meta, config, isActive }: {
  meta: ProviderMeta
  config: LLMProviderConfig | undefined
  isActive: boolean
}) {
  const theme = useTheme()
  const isDark = theme.palette.mode === 'dark'
  const qc = useQueryClient()

  const configured = config?.configured ?? false
  const [apiKey, setApiKey]   = useState('')                       // blank = keep existing
  const [model, setModel]     = useState(config?.model || meta.defaultModel)
  const [baseUrl, setBaseUrl] = useState(config?.base_url || 'http://localhost:11434')
  const [awsRegion, setAwsRegion] = useState(config?.aws_region || 'us-east-1')
  const [awsKeyId, setAwsKeyId]   = useState('')
  const [awsSecret, setAwsSecret] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [test, setTest] = useState<{ ok: boolean; msg: string } | null>(null)

  const dirty =
    !!apiKey || !!awsKeyId || !!awsSecret ||
    model !== (config?.model || meta.defaultModel) ||
    (meta.hasBaseUrl && baseUrl !== (config?.base_url || 'http://localhost:11434')) ||
    (meta.isBedrock && awsRegion !== (config?.aws_region || 'us-east-1'))

  const buildPatch = () => ({
    model,
    ...(apiKey ? { api_key: apiKey } : {}),
    ...(meta.hasBaseUrl ? { base_url: baseUrl } : {}),
    ...(meta.isBedrock ? {
      aws_region: awsRegion,
      ...(awsKeyId ? { aws_access_key_id: awsKeyId } : {}),
      ...(awsSecret ? { aws_secret_access_key: awsSecret } : {}),
    } : {}),
  })

  const save = useMutation({
    mutationFn: () => settingsApi.setProvider(meta.id, buildPatch()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settings'] })
      setApiKey(''); setAwsKeyId(''); setAwsSecret('')
    },
  })

  const activate = useMutation({
    mutationFn: () => settingsApi.activateProvider(meta.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settings'] }),
  })

  const testConn = useMutation({
    mutationFn: async () => {
      if (dirty) await save.mutateAsync()
      return settingsApi.testProvider(meta.id)
    },
    onSuccess: (r) => setTest(r.success
      ? { ok: true, msg: `Connected — ${r.latency_ms}ms` }
      : { ok: false, msg: r.error ?? 'Connection failed' }),
    onError: (e: Error) => setTest({ ok: false, msg: e.message }),
  })

  // ── Model catalogue (live-fetchable per provider) ──────────────────────────
  const { data: modelsData, isFetching: modelsFetching } = useQuery({
    queryKey: ['llm-models', meta.id],
    queryFn: () => settingsApi.getModels(meta.id),
    staleTime: 5 * 60_000,
  })
  const models = modelsData?.models ?? []

  // Auto-select the first model if the current one isn't in the fetched list.
  useEffect(() => {
    if (models.length && !models.find(m => m.id === model)) setModel(models[0].id)
  }, [modelsData])  // eslint-disable-line react-hooks/exhaustive-deps

  // Refresh using the entered (unsaved) key so live models load before saving.
  const refreshModels = async () => {
    const r = await qc.fetchQuery({
      queryKey: ['llm-models', meta.id],
      queryFn: () => settingsApi.getModels(meta.id, apiKey || undefined),
    })
    if (r.models.length && !r.models.find(m => m.id === model)) setModel(r.models[0].id)
  }

  const status = isActive ? 'Active' : configured ? 'Configured · standby' : 'Not connected'
  const statusColor = isActive ? '#3A8D7A' : configured ? 'text.secondary' : 'text.disabled'

  return (
    <Box data-testid={`provider-${meta.id}`} sx={{
      borderRadius: 3, p: 2.25,
      border: '1px solid', borderColor: isActive ? alpha(BRAND.copper, 0.5) : 'divider',
      bgcolor: isActive ? alpha(BRAND.copper, isDark ? 0.06 : 0.04) : 'background.paper',
      display: 'flex', flexDirection: 'column', gap: 1.5,
      transition: 'border-color 0.15s, background 0.15s',
    }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
        <Box sx={{
          width: 38, height: 38, borderRadius: 2, flexShrink: 0,
          display: 'grid', placeItems: 'center', bgcolor: meta.color, color: '#fff',
          fontWeight: 800, fontSize: 14, fontFamily: MONO,
        }}>
          {meta.letter}
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontSize: 15, fontWeight: 700, lineHeight: 1.2 }}>{meta.label}</Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: isActive ? '#3A8D7A' : configured ? 'text.disabled' : 'transparent', border: configured || isActive ? 'none' : '1px solid', borderColor: 'divider' }} />
            <Typography sx={{ fontSize: 11.5, color: statusColor, fontWeight: isActive ? 600 : 400 }}>{status}</Typography>
          </Box>
        </Box>
        <Tooltip title={isActive ? 'Active provider' : configured ? 'Make active' : 'Add a key first'} arrow>
          <span>
            <Switch
              size="small"
              checked={isActive}
              disabled={isActive || !configured || activate.isPending}
              onChange={() => activate.mutate()}
            />
          </span>
        </Tooltip>
      </Box>

      {/* Credentials */}
      {meta.requiresKey && (
        <TextField
          type={showKey ? 'text' : 'password'}
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder={configured ? `Saved: ${config?.api_key || '••••'} — enter to replace` : 'Paste API key'}
          size="small"
          fullWidth
          InputProps={{
            endAdornment: (
              <InputAdornment position="end">
                <IconButton size="small" onClick={() => setShowKey(s => !s)}>
                  {showKey ? <VisibilityOffIcon sx={{ fontSize: 16 }} /> : <VisibilityIcon sx={{ fontSize: 16 }} />}
                </IconButton>
              </InputAdornment>
            ),
          }}
          sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2, fontSize: 13 } }}
        />
      )}

      {meta.hasBaseUrl && (
        <TextField
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
          placeholder="http://localhost:11434"
          size="small"
          fullWidth
          sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2, fontSize: 13 } }}
        />
      )}

      {meta.isBedrock && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          <TextField value={awsRegion} onChange={(e) => setAwsRegion(e.target.value)} placeholder="us-east-1" size="small" fullWidth sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2, fontSize: 13 } }} />
          <TextField value={awsKeyId} onChange={(e) => setAwsKeyId(e.target.value)} placeholder={configured ? 'Access key saved — enter to replace' : 'AWS Access Key ID'} type={showKey ? 'text' : 'password'} size="small" fullWidth sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2, fontSize: 13 } }} />
          <TextField value={awsSecret} onChange={(e) => setAwsSecret(e.target.value)} placeholder="AWS Secret Access Key" type="password" size="small" fullWidth sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2, fontSize: 13 } }} />
        </Box>
      )}

      {/* Model — dropdown from the provider's catalogue, with live refresh */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
        {models.length ? (
          <FormControl size="small" fullWidth>
            <InputLabel>Model</InputLabel>
            <Select
              label="Model"
              value={models.find(m => m.id === model) ? model : ''}
              onChange={(e) => setModel(e.target.value)}
              sx={{ borderRadius: 2, fontFamily: MONO, fontSize: 12.5 }}
            >
              {models.map(m => (
                <MenuItem key={m.id} value={m.id} sx={{ fontFamily: MONO, fontSize: 12.5 }}>{m.name}</MenuItem>
              ))}
            </Select>
          </FormControl>
        ) : (
          <TextField
            value={model}
            onChange={(e) => setModel(e.target.value)}
            label="Model"
            size="small"
            fullWidth
            sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2, fontFamily: MONO, fontSize: 12.5 } }}
          />
        )}
        <Tooltip title={apiKey ? 'Fetch live models with the entered key' : 'Refresh model list'} arrow>
          <span>
            <IconButton size="small" disabled={modelsFetching} onClick={refreshModels} sx={{ color: 'text.secondary' }}>
              <SyncIcon sx={{
                fontSize: 16,
                '@keyframes spin': { '0%': { transform: 'rotate(0deg)' }, '100%': { transform: 'rotate(360deg)' } },
                animation: modelsFetching ? 'spin 0.7s linear infinite' : 'none',
              }} />
            </IconButton>
          </span>
        </Tooltip>
      </Box>

      {/* Test result */}
      {test && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, color: test.ok ? '#3A8D7A' : 'error.main' }}>
          {test.ok ? <CheckCircleIcon sx={{ fontSize: 15 }} /> : <ErrorOutlineIcon sx={{ fontSize: 15 }} />}
          <Typography sx={{ fontSize: 12 }}>{test.msg}</Typography>
        </Box>
      )}

      {/* Footer actions */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.25 }}>
        <Button
          size="small"
          disabled={!dirty || save.isPending}
          onClick={() => save.mutate()}
          sx={{ fontSize: 12.5, textTransform: 'none', borderRadius: 99, px: 1.5,
                color: BRAND.copper, '&:hover': { bgcolor: alpha(BRAND.copper, 0.08) } }}
        >
          {save.isPending ? <CircularProgress size={14} /> : save.isSuccess && !dirty ? 'Saved ✓' : 'Save'}
        </Button>
        <Box sx={{ flex: 1 }} />
        <Button
          size="small"
          disabled={testConn.isPending}
          onClick={() => { setTest(null); testConn.mutate() }}
          startIcon={testConn.isPending ? <CircularProgress size={12} /> : <WifiTetheringIcon sx={{ fontSize: 14 }} />}
          sx={{ fontSize: 12.5, textTransform: 'none', borderRadius: 99, px: 1.5, color: 'text.secondary',
                '&:hover': { bgcolor: 'action.hover' } }}
        >
          Test connection
        </Button>
      </Box>
    </Box>
  )
}
