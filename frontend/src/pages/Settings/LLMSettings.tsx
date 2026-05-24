/**
 * LLM Settings Tab
 *
 * Provider dropdown → model input → masked API key → test button.
 * Supports: OpenAI, Anthropic, Groq, Gemini, Cerebras, AWS Bedrock, Ollama.
 */

import { useState } from 'react'
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
  Chip,
  Divider,
  InputAdornment,
  IconButton,
  FormHelperText,
} from '@mui/material'
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline'
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline'
import VisibilityIcon from '@mui/icons-material/Visibility'
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff'
import WifiTetheringIcon from '@mui/icons-material/WifiTethering'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { settingsApi, type AppSettings } from '@/api/settings.api'

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
  const [provider, setProvider] = useState(currentLLM.provider)
  const [model, setModel] = useState(currentLLM.model)
  const [apiKey, setApiKey] = useState('')          // always empty on load (masked)
  const [baseUrl, setBaseUrl] = useState(currentLLM.base_url || 'http://localhost:11434')
  const [awsRegion, setAwsRegion] = useState(currentLLM.aws_region || 'us-east-1')
  const [awsKeyId, setAwsKeyId] = useState('')
  const [awsSecretKey, setAwsSecretKey] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [testResult, setTestResult] = useState<{ success: boolean; msg: string } | null>(null)

  const providerInfo = PROVIDERS.find((p) => p.id === provider)

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

      {/* Base URL (Ollama) */}
      {providerInfo?.hasBaseUrl && (
        <TextField
          label="Ollama Base URL"
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
          placeholder="http://localhost:11434"
          fullWidth
          helperText="Default: http://localhost:11434"
        />
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
    </Box>
  )
}
