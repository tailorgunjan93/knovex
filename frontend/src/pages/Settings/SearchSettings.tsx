/**
 * Search Settings Tab
 *
 * Engine selection (DuckDuckGo / Serper / Brave) + conditional API key input.
 */

import { useState } from 'react'
import {
  Box,
  Typography,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  TextField,
  Button,
  Alert,
  CircularProgress,
  InputAdornment,
  IconButton,
} from '@mui/material'
import VisibilityIcon from '@mui/icons-material/Visibility'
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { settingsApi, type AppSettings } from '@/api/settings.api'

const ENGINES = [
  { id: 'duckduckgo', label: 'DuckDuckGo', requiresKey: false, hint: 'Free, no API key required' },
  { id: 'serper',     label: 'Serper',     requiresKey: true,  hint: 'High-quality results — get a key at serper.dev' },
  { id: 'brave',      label: 'Brave Search', requiresKey: true, hint: 'Privacy-focused — get a key at api.search.brave.com' },
]

interface SearchSettingsProps {
  settings: AppSettings
}

export default function SearchSettingsTab({ settings }: SearchSettingsProps) {
  const qc = useQueryClient()

  const [engine, setEngine] = useState(settings.search.engine)
  const [apiKey, setApiKey] = useState('')
  const [showKey, setShowKey] = useState(false)

  const engineInfo = ENGINES.find((e) => e.id === engine)

  const saveMutation = useMutation({
    mutationFn: () =>
      settingsApi.update({
        search: {
          engine,
          ...(apiKey ? { api_key: apiKey } : {}),
        },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settings'] })
    },
  })

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, maxWidth: 520 }}>
      <Typography variant="h6" fontWeight={600}>Web Search</Typography>

      <FormControl fullWidth>
        <InputLabel>Search Engine</InputLabel>
        <Select
          label="Search Engine"
          value={engine}
          onChange={(e) => {
            setEngine(e.target.value)
            setApiKey('')
          }}
        >
          {ENGINES.map((e) => (
            <MenuItem key={e.id} value={e.id}>{e.label}</MenuItem>
          ))}
        </Select>
        {engineInfo && (
          <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, ml: 1 }}>
            {engineInfo.hint}
          </Typography>
        )}
      </FormControl>

      {engineInfo?.requiresKey && (
        <TextField
          label="API Key"
          type={showKey ? 'text' : 'password'}
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder={settings.search.api_key ? '****' : 'Enter API key'}
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

      <Box>
        <Button
          variant="contained"
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending}
          startIcon={saveMutation.isPending ? <CircularProgress size={16} /> : undefined}
        >
          Save
        </Button>
      </Box>

      {saveMutation.isSuccess && (
        <Alert severity="success" sx={{ maxWidth: 360 }}>Search settings saved.</Alert>
      )}
    </Box>
  )
}
