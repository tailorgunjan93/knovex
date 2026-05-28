/**
 * CreateKBDialog — Modal form for creating a new Knowledge Base
 *
 * Lets the user choose a name, colour accent, and icon emoji.
 * Validates name length client-side before calling the API.
 */

import { useState } from 'react'
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Props {
  open: boolean
  onClose: () => void
  onCreate: (data: { name: string; color: string; icon: string }) => Promise<void>
  loading?: boolean
}

// ─── Presets ──────────────────────────────────────────────────────────────────

const COLOR_PRESETS = [
  { value: '#DDA76A', label: 'Amber'  },   // brand amber — default
  { value: '#B5803E', label: 'Copper' },
  { value: '#3A8D7A', label: 'Sage'   },
  { value: '#2563EB', label: 'Blue'   },
  { value: '#7C3AED', label: 'Violet' },
  { value: '#DB2777', label: 'Pink'   },
]

const ICON_PRESETS = ['📁', '📚', '🔬', '💡', '📊', '🎯', '🌐', '🧠', '📝', '🗂️']

// ─── Component ────────────────────────────────────────────────────────────────

export default function CreateKBDialog({ open, onClose, onCreate, loading }: Props) {
  const [name, setName] = useState('')
  const [color, setColor] = useState('#DDA76A')
  const [icon, setIcon] = useState('📁')
  const [error, setError] = useState('')

  const handleClose = () => {
    setName('')
    setColor('#DDA76A')
    setIcon('📁')
    setError('')
    onClose()
  }

  const handleSubmit = async () => {
    const trimmed = name.trim()
    if (!trimmed) {
      setError('Name is required')
      return
    }
    if (trimmed.length > 100) {
      setError('Name must be 100 characters or less')
      return
    }
    setError('')
    await onCreate({ name: trimmed, color, icon })
    handleClose()
  }

  return (
    <Dialog open={open} onClose={handleClose} fullWidth maxWidth="xs">
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <AddIcon />
        New Knowledge Base
      </DialogTitle>

      <DialogContent>
        <Stack spacing={3} sx={{ mt: 1 }}>
          {/* Name */}
          <TextField
            label="Name"
            fullWidth
            autoFocus
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSubmit()}
            error={!!error}
            helperText={error || `${name.length}/100`}
            inputProps={{ maxLength: 100 }}
          />

          {/* Colour picker */}
          <div>
            <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>
              Accent colour
            </Typography>
            <Stack direction="row" spacing={1} flexWrap="wrap">
              {COLOR_PRESETS.map(c => (
                <button
                  key={c.value}
                  title={c.label}
                  onClick={() => setColor(c.value)}
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: '50%',
                    backgroundColor: c.value,
                    border: color === c.value ? '3px solid white' : '2px solid transparent',
                    outline: color === c.value ? `2px solid ${c.value}` : 'none',
                    cursor: 'pointer',
                    padding: 0,
                  }}
                />
              ))}
            </Stack>
          </div>

          {/* Icon picker */}
          <div>
            <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>
              Icon
            </Typography>
            <ToggleButtonGroup
              value={icon}
              exclusive
              onChange={(_, v) => v && setIcon(v)}
              size="small"
              sx={{ flexWrap: 'wrap', gap: 0.5 }}
            >
              {ICON_PRESETS.map(i => (
                <ToggleButton key={i} value={i} sx={{ fontSize: '1.2rem', minWidth: 40 }}>
                  {i}
                </ToggleButton>
              ))}
            </ToggleButtonGroup>
          </div>

          {/* Preview */}
          <Stack direction="row" alignItems="center" spacing={1.5} sx={{ opacity: 0.8 }}>
            <Typography variant="body2" color="text.secondary">Preview:</Typography>
            <Stack
              direction="row"
              alignItems="center"
              spacing={1}
              sx={{
                px: 1.5,
                py: 0.75,
                borderRadius: 1.5,
                bgcolor: `${color}22`,
                border: `1px solid ${color}55`,
              }}
            >
              <span style={{ fontSize: '1rem' }}>{icon}</span>
              <Typography variant="body2" fontWeight={600} color={color}>
                {name.trim() || 'My Knowledge Base'}
              </Typography>
            </Stack>
          </Stack>
        </Stack>
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={handleClose} disabled={loading}>Cancel</Button>
        <Button
          variant="contained"
          onClick={handleSubmit}
          disabled={loading || !name.trim()}
          startIcon={<AddIcon />}
        >
          {loading ? 'Creating…' : 'Create'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
