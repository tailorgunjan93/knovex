/**
 * LLM Settings Tab
 *
 * Provider dropdown → model input → masked API key → test button.
 * Supports: OpenAI, Anthropic, Groq, Gemini, Cerebras, AWS Bedrock, Ollama.
 *
 * Also includes the Embeddings section (Sprint 7):
 *   - Local ONNX model (all-MiniLM-L6-v2, first-launch download)
 *   - OpenAI Embeddings API (optional key, skip local download)
 */

import { useRef, useState } from 'react'
import {
  Box,
  Typography,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Button,
  Alert,
  CircularProgress,
  LinearProgress,
  Chip,
  Divider,
  InputAdornment,
  IconButton,
  FormHelperText,
  Tooltip,
} from '@mui/material'
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline'
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline'
import VisibilityIcon from '@mui/icons-material/Visibility'
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff'
import WifiTetheringIcon from '@mui/icons-material/WifiTethering'
import RadarIcon from '@mui/icons-material/Radar'
import LockIcon from '@mui/icons-material/Lock'
import DownloadIcon from '@mui/icons-material/Download'
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { settingsApi, type AppSettings } from '@/api/settings.api'
import { setupApi } from '@/api/setup.api'

const PROVIDERS = [
  { id: 'openai',    label: 'OpenAI',         requiresKey: true,  hasBaseUrl: false },
  { id: 'anthropic', label: 'Anthropic',       requiresKey: true,  hasBaseUrl: false },
  { id: 'groq',      label: 'Groq',            requiresKey: true,  hasBaseUrl: false },
  { id: 'gemini',    label: 'Google Gemini',   requiresKey: true,  hasBaseUrl: false },
  { id: 'cerebras',  label: 'Cerebras',        requiresKey: true,  hasBaseUrl: false },
  { id: 'bedrock',   label: 'AWS Bedrock',     requiresKey: false, hasBaseUrl: false },
  { id: 'ollama',    label: 'Ollama (local)',  requiresKey: false, hasBaseUrl: true  },
]

interface LLMSettingsProps {
  settings: AppSettings
}

export default function LLMSettingsTab({ settings }: LLMSettingsProps) {
  const qc = useQueryClient()

  const currentLLM = settings.llm
  const currentEmb = settings.embedding ?? { provider: 'local', model: 'text-embedding-3-small', api_key: '' }

  const [provider, setProvider] = useState(currentLLM.provider)
  const [model, setModel] = useState(currentLLM.model)
  const [apiKey, setApiKey] = useState('')          // always empty on load (masked)
  const [baseUrl, setBaseUrl] = useState(currentLLM.base_url || 'http://localhost:11434')
  const [awsRegion, setAwsRegion] = useState(currentLLM.aws_region || 'us-east-1')
  const [awsKeyId, setAwsKeyId] = useState('')
  const [awsSecretKey, setAwsSecretKey] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [testResult, setTestResult] = useState<{ success: boolean; msg: string } | null>(null)

  // ── Embedding state ────────────────────────────────────────────────────────
  const [embProvider, setEmbProvider] = useState(currentEmb.provider)
  const [embApiKey, setEmbApiKey]     = useState('')   // always empty on load
  const [showEmbKey, setShowEmbKey]   = useState(false)
  const [dlProgress, setDlProgress]   = useState<number | null>(null)  // null = idle
  const [dlError, setDlError]         = useState<string | null>(null)
  const [dlDone, setDlDone]           = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  // Local model status
  const modelStatusQuery = useQuery({
    queryKey: ['embedding-model-status'],
    queryFn: setupApi.getModelStatus,
    refetchOnWindowFocus: false,
  })

  const embSaveMutation = useMutation({
    mutationFn: () =>
      settingsApi.update({
        embedding: {
          provider: embProvider,
          ...(embApiKey ? { api_key: embApiKey } : {}),
        },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settings'] })
    },
  })

  const handleDownloadModel = () => {
    setDlProgress(0)
    setDlError(null)
    setDlDone(false)
    abortRef.current = new AbortController()
    setupApi
      .downloadModel(
        (pct) => setDlProgress(pct),
        abortRef.current.signal,
      )
      .then(() => {
        setDlProgress(100)
        setDlDone(true)
        modelStatusQuery.refetch()
      })
      .catch((err: Error) => {
        if (err.name !== 'AbortError') {
          setDlError(err.message)
        }
        setDlProgress(null)
      })
  }

  const providerInfo = PROVIDERS.find((p) => p.id === provider)

  // Ollama auto-detect
  const detectMutation = useMutation({
    mutationFn: settingsApi.detectOllama,
    onSuccess: (result) => {
      if (result.detected) {
        setBaseUrl(result.url)
        // Auto-select first detected model if model field is blank
        if (!model && result.models.length > 0) {
          setModel(result.models[0])
        }
      }
    },
  })

  // Model catalogue for selected provider
  const { data: modelsData } = useQuery({
    queryKey: ['llm-models', provider],
    queryFn: () => settingsApi.getModels(provider),
  })

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: (patch: Parameters<typeof settingsApi.update>[0]) =>
      settingsApi.update(patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settings'] })
    },
  })

  // Test mutation
  const testMutation = useMutation({
    mutationFn: async () => {
      // Save first, then test
      await saveMutation.mutateAsync(buildPatch())
      return settingsApi.testLLM()
    },
    onSuccess: (result) => {
      setTestResult(
        result.success
          ? { success: true, msg: `Connected — ${result.latency_ms}ms` }
          : { success: false, msg: result.error ?? 'Connection failed' },
      )
    },
    onError: (err: Error) => {
      setTestResult({ success: false, msg: err.message })
    },
  })

  const buildPatch = () => ({
    llm: {
      provider,
      model,
      ...(apiKey ? { api_key: apiKey } : {}),
      base_url: baseUrl,
      aws_region: awsRegion,
      ...(awsKeyId ? { aws_access_key_id: awsKeyId } : {}),
      ...(awsSecretKey ? { aws_secret_access_key: awsSecretKey } : {}),
    },
  })

  const handleSave = () => {
    saveMutation.mutate(buildPatch())
    setTestResult(null)
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, maxWidth: 520 }}>
      <Typography variant="h6" fontWeight={600}>LLM Provider</Typography>

      {/* Provider */}
      <FormControl fullWidth>
        <InputLabel>Provider</InputLabel>
        <Select
          label="Provider"
          value={provider}
          onChange={(e) => {
            setProvider(e.target.value)
            setModel('')
            setTestResult(null)
          }}
        >
          {PROVIDERS.map((p) => (
            <MenuItem key={p.id} value={p.id}>{p.label}</MenuItem>
          ))}
        </Select>
      </FormControl>

      {/* Model */}
      {modelsData?.models.length ? (
        <FormControl fullWidth>
          <InputLabel>Model</InputLabel>
          <Select
            label="Model"
            value={model}
            onChange={(e) => setModel(e.target.value)}
          >
            {modelsData.models.map((m) => (
              <MenuItem key={m.id} value={m.id}>{m.name}</MenuItem>
            ))}
          </Select>
        </FormControl>
      ) : (
        <TextField
          label="Model"
          value={model}
          onChange={(e) => setModel(e.target.value)}
          placeholder="e.g. gpt-4o-mini"
          fullWidth
        />
      )}

      {/* API Key (non-Bedrock, non-Ollama) */}
      {providerInfo?.requiresKey && (
        <TextField
          label="API Key"
          type={showKey ? 'text' : 'password'}
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder={currentLLM.api_key ? 'sk-...****' : 'Enter API key'}
          fullWidth
          InputProps={{
            endAdornment: (
              <InputAdornment position="end">
                <IconButton size="small" onClick={() => setShowKey(!showKey)}>
                  {showKey ? <VisibilityOffIcon /> : <VisibilityIcon />}
                </IconButton>
              </InputAdornment>
            ),
          }}
          helperText="Leave blank to keep existing key"
        />
      )}

      {/* Base URL (Ollama) + auto-detect button */}
      {providerInfo?.hasBaseUrl && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          <TextField
            label="Ollama Base URL"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder="http://localhost:11434"
            fullWidth
            helperText="Default: http://localhost:11434"
          />
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Button
              variant="outlined"
              size="small"
              startIcon={
                detectMutation.isPending
                  ? <CircularProgress size={14} />
                  : <RadarIcon fontSize="small" />
              }
              disabled={detectMutation.isPending}
              onClick={() => detectMutation.mutate()}
            >
              Auto-Detect Ollama
            </Button>
            {detectMutation.isSuccess && (
              <Typography variant="caption" color={
                detectMutation.data?.detected ? 'success.main' : 'warning.main'
              }>
                {detectMutation.data?.detected
                  ? `✓ Found ${detectMutation.data.models.length} model(s) at ${detectMutation.data.url}`
                  : '✗ Ollama not found on localhost:11434'
                }
              </Typography>
            )}
          </Box>
          {detectMutation.isSuccess && detectMutation.data?.detected && detectMutation.data.models.length > 0 && (
            <FormControl fullWidth size="small">
              <InputLabel>Detected Models</InputLabel>
              <Select
                label="Detected Models"
                value={model}
                onChange={(e) => setModel(e.target.value)}
              >
                {detectMutation.data.models.map((m) => (
                  <MenuItem key={m} value={m}>{m}</MenuItem>
                ))}
              </Select>
              <FormHelperText>Select a model from your Ollama installation</FormHelperText>
            </FormControl>
          )}
        </Box>
      )}

      {/* AWS Bedrock credentials */}
      {provider === 'bedrock' && (
        <>
          <TextField
            label="AWS Region"
            value={awsRegion}
            onChange={(e) => setAwsRegion(e.target.value)}
            placeholder="us-east-1"
            fullWidth
          />
          <TextField
            label="AWS Access Key ID"
            value={awsKeyId}
            onChange={(e) => setAwsKeyId(e.target.value)}
            type={showKey ? 'text' : 'password'}
            fullWidth
            InputProps={{
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton size="small" onClick={() => setShowKey(!showKey)}>
                    {showKey ? <VisibilityOffIcon /> : <VisibilityIcon />}
                  </IconButton>
                </InputAdornment>
              ),
            }}
          />
          <TextField
            label="AWS Secret Access Key"
            value={awsSecretKey}
            onChange={(e) => setAwsSecretKey(e.target.value)}
            type="password"
            fullWidth
          />
        </>
      )}

      <Divider />

      {/* Test result */}
      {testResult && (
        <Alert
          severity={testResult.success ? 'success' : 'error'}
          icon={testResult.success ? <CheckCircleOutlineIcon /> : <ErrorOutlineIcon />}
        >
          {testResult.msg}
        </Alert>
      )}

      {/* Actions */}
      <Box sx={{ display: 'flex', gap: 1.5 }}>
        <Button
          variant="contained"
          onClick={handleSave}
          disabled={saveMutation.isPending}
          startIcon={saveMutation.isPending ? <CircularProgress size={16} /> : undefined}
        >
          Save
        </Button>
        <Button
          variant="outlined"
          onClick={() => testMutation.mutate()}
          disabled={testMutation.isPending}
          startIcon={
            testMutation.isPending
              ? <CircularProgress size={16} />
              : <WifiTetheringIcon />
          }
        >
          Test Connection
        </Button>
      </Box>

      {saveMutation.isSuccess && !testMutation.isPending && (
        <Typography variant="caption" color="success.main">
          ✓ Settings saved
        </Typography>
      )}

      <Divider />

      {/* ── Embeddings section ──────────────────────────────────────────── */}
      <Typography variant="h6" fontWeight={600} sx={{ mt: 0.5 }}>
        Embeddings
        <Tooltip
          title="Embeddings enable semantic (meaning-based) search over your knowledge base. Without them, only keyword search (FTS5) is used."
          placement="right"
        >
          <InfoOutlinedIcon sx={{ fontSize: 16, ml: 0.8, mb: '-2px', color: 'text.secondary', cursor: 'help' }} />
        </Tooltip>
      </Typography>

      <Typography variant="body2" color="text.secondary" sx={{ mt: -1.5 }}>
        Choose between a <strong>local ONNX model</strong> (private, ~45 MB one-time download)
        or the <strong>OpenAI Embeddings API</strong> (cloud, requires key, no disk footprint).
        Leave both blank to stay in FTS5-only keyword mode.
      </Typography>

      {/* Provider toggle */}
      <FormControl fullWidth>
        <InputLabel>Embedding Provider</InputLabel>
        <Select
          label="Embedding Provider"
          value={embProvider}
          onChange={(e) => setEmbProvider(e.target.value)}
        >
          <MenuItem value="local">Local ONNX model (all-MiniLM-L6-v2)</MenuItem>
          <MenuItem value="openai">OpenAI Embeddings API</MenuItem>
        </Select>
        <FormHelperText>
          {embProvider === 'local'
            ? 'Runs 100% on-device — no API key needed'
            : 'Uses text-embedding-3-small — fast and cheap'}
        </FormHelperText>
      </FormControl>

      {/* OpenAI embedding key */}
      {embProvider === 'openai' && (
        <TextField
          label="OpenAI Embedding API Key"
          type={showEmbKey ? 'text' : 'password'}
          value={embApiKey}
          onChange={(e) => setEmbApiKey(e.target.value)}
          placeholder={currentEmb.api_key ? 'sk-...****' : 'Enter OpenAI API key'}
          fullWidth
          InputProps={{
            endAdornment: (
              <InputAdornment position="end">
                <IconButton size="small" onClick={() => setShowEmbKey(!showEmbKey)}>
                  {showEmbKey ? <VisibilityOffIcon /> : <VisibilityIcon />}
                </IconButton>
              </InputAdornment>
            ),
          }}
          helperText="Can be the same key as your LLM provider, or a separate restricted key"
        />
      )}

      {/* Local model download card */}
      {embProvider === 'local' && (
        <Box
          sx={{
            border: 1,
            borderColor: 'divider',
            borderRadius: 2,
            p: 2,
            display: 'flex',
            flexDirection: 'column',
            gap: 1.5,
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Box>
              <Typography variant="subtitle2" fontWeight={600}>
                all-MiniLM-L6-v2 (ONNX)
              </Typography>
              <Typography variant="caption" color="text.secondary">
                384-dim · ~45 MB · CPU inference
              </Typography>
            </Box>
            {modelStatusQuery.data?.ready || dlDone ? (
              <Chip label="Ready" color="success" size="small" icon={<CheckCircleOutlineIcon />} />
            ) : (
              <Chip label="Not downloaded" size="small" variant="outlined" />
            )}
          </Box>

          {/* Download progress */}
          {dlProgress !== null && !dlDone && (
            <Box>
              <LinearProgress variant="determinate" value={dlProgress} sx={{ borderRadius: 1 }} />
              <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5 }}>
                Downloading… {dlProgress.toFixed(0)}%
              </Typography>
            </Box>
          )}

          {dlError && (
            <Alert severity="error" icon={<ErrorOutlineIcon />} sx={{ py: 0.5 }}>
              {dlError}
            </Alert>
          )}

          {(dlDone || modelStatusQuery.data?.ready) && (
            <Alert severity="success" icon={<CheckCircleOutlineIcon />} sx={{ py: 0.5 }}>
              Model ready — semantic search enabled
            </Alert>
          )}

          {!modelStatusQuery.data?.ready && !dlDone && dlProgress === null && (
            <Button
              variant="outlined"
              size="small"
              startIcon={<DownloadIcon />}
              onClick={handleDownloadModel}
              sx={{ alignSelf: 'flex-start' }}
            >
              Download Model (~45 MB)
            </Button>
          )}

          {dlProgress !== null && !dlDone && (
            <Button
              variant="text"
              size="small"
              color="error"
              onClick={() => {
                abortRef.current?.abort()
                setDlProgress(null)
              }}
              sx={{ alignSelf: 'flex-start' }}
            >
              Cancel
            </Button>
          )}
        </Box>
      )}

      {/* Embedding save */}
      <Box sx={{ display: 'flex', gap: 1.5 }}>
        <Button
          variant="outlined"
          size="small"
          onClick={() => embSaveMutation.mutate()}
          disabled={embSaveMutation.isPending}
          startIcon={embSaveMutation.isPending ? <CircularProgress size={14} /> : undefined}
        >
          Save Embedding Settings
        </Button>
      </Box>

      {embSaveMutation.isSuccess && (
        <Typography variant="caption" color="success.main">
          ✓ Embedding settings saved
        </Typography>
      )}

      <Divider />

      {/* Encryption notice */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color: 'text.secondary' }}>
        <LockIcon sx={{ fontSize: 16, color: 'success.main' }} />
        <Typography variant="caption">
          API keys are encrypted at rest using Fernet symmetric encryption.
          The key is stored in your user config directory (
          <code>~/.config/Knovex/.knovex.key</code>), readable only by your OS user.
        </Typography>
      </Box>
    </Box>
  )
}
