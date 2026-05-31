/**
 * CreateKBDialog — New-collection modal (lab design).
 *
 * Live glyph-tile preview that reflects the chosen color + symbol, mono section
 * labels (NAME / COLOR / SYMBOL), single-char symbols, and a copper-gradient
 * Create action. Keeps the onCreate({name,color,icon}) contract + validation.
 */

import { useState } from 'react'
import {
  Box, Dialog, Typography, useTheme, alpha, CircularProgress,
} from '@mui/material'
import CloseRoundedIcon from '@mui/icons-material/CloseRounded'
import CheckRoundedIcon from '@mui/icons-material/CheckRounded'
import { BRAND } from '@/theme/tokens'

interface Props {
  open: boolean
  onClose: () => void
  onCreate: (data: { name: string; color: string; icon: string }) => Promise<void>
  loading?: boolean
}

const MONO = '"IBM Plex Mono", "Geist Mono", monospace'

const COLORS = ['#DDA76A', '#3A8D7A', '#C0905C', '#9AA56A', '#B86D76', '#7E8FB0', '#8E857A', '#B07CF2']
const SYMBOLS = ['ƒ', 'η', 'Σ', 'M', '∇', 'H', 'λ', 'π', '∂', '📚', '🔬', '💡']

export default function CreateKBDialog({ open, onClose, onCreate, loading }: Props) {
  const theme = useTheme()
  const [name, setName]   = useState('')
  const [color, setColor] = useState(COLORS[0])
  const [icon, setIcon]   = useState(SYMBOLS[0])
  const [error, setError] = useState('')

  const reset = () => { setName(''); setColor(COLORS[0]); setIcon(SYMBOLS[0]); setError('') }
  const handleClose = () => { reset(); onClose() }

  const handleSubmit = async () => {
    const trimmed = name.trim()
    if (!trimmed)             { setError('Name is required'); return }
    if (trimmed.length > 100) { setError('Name must be 100 characters or less'); return }
    setError('')
    await onCreate({ name: trimmed, color, icon })
    handleClose()
  }

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="xs"
      fullWidth
      slotProps={{ paper: { sx: { borderRadius: 4, bgcolor: 'background.paper', p: 3 } } }}
    >
      {/* Header with live glyph preview */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2.5 }}>
        <Box sx={{
          width: 42, height: 42, borderRadius: 2.5, display: 'grid', placeItems: 'center',
          fontSize: 22, fontWeight: 700, color,
          bgcolor: alpha(color, 0.14), border: `1px solid ${alpha(color, 0.5)}`,
          transition: 'all .15s',
        }}>{icon}</Box>
        <Box sx={{ flex: 1 }}>
          <Typography variant="h6" sx={{ fontWeight: 700 }}>New collection</Typography>
          <Typography variant="caption" color="text.secondary">
            Group related documents so Knovex can link their concepts.
          </Typography>
        </Box>
        <Box component="button" onClick={handleClose} aria-label="Close" sx={{
          border: 0, background: 'none', cursor: 'pointer', color: 'text.disabled',
          display: 'grid', placeItems: 'center', '&:hover': { color: 'text.primary' },
        }}>
          <CloseRoundedIcon fontSize="small" />
        </Box>
      </Box>

      {/* Name */}
      <Typography sx={{ fontFamily: MONO, fontSize: 10.5, color: 'text.disabled', letterSpacing: '0.1em', mb: 0.75 }}>NAME</Typography>
      <Box
        component="input"
        autoFocus
        value={name}
        placeholder="e.g. Reinforcement Learning"
        maxLength={100}
        onChange={(e) => setName((e.target as HTMLInputElement).value)}
        onKeyDown={(e) => { if ((e as React.KeyboardEvent).key === 'Enter') handleSubmit() }}
        sx={{
          width: '100%', height: 40, px: 1.5, mb: 0.5, borderRadius: 2,
          border: `1px solid ${error ? theme.palette.error.main : theme.palette.divider}`,
          bgcolor: 'background.default', color: 'text.primary',
          fontFamily: 'inherit', fontSize: 14, outline: 'none',
          '&:focus': { borderColor: BRAND.copper },
        }}
      />
      <Typography variant="caption" color={error ? 'error' : 'text.disabled'} sx={{ display: 'block', mb: 2.5 }}>
        {error || `${name.length}/100`}
      </Typography>

      {/* Color */}
      <Typography sx={{ fontFamily: MONO, fontSize: 10.5, color: 'text.disabled', letterSpacing: '0.1em', mb: 0.75 }}>COLOR</Typography>
      <Box sx={{ display: 'flex', gap: 1, mb: 2.5, flexWrap: 'wrap' }}>
        {COLORS.map((c) => (
          <Box key={c} onClick={() => setColor(c)} sx={{
            width: 26, height: 26, borderRadius: '50%', bgcolor: c, cursor: 'pointer',
            outline: color === c ? `2px solid ${c}` : '2px solid transparent',
            outlineOffset: 2, transition: 'outline-color .15s',
          }} />
        ))}
      </Box>

      {/* Symbol */}
      <Typography sx={{ fontFamily: MONO, fontSize: 10.5, color: 'text.disabled', letterSpacing: '0.1em', mb: 0.75 }}>SYMBOL</Typography>
      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 3 }}>
        {SYMBOLS.map((g) => (
          <Box key={g} component="button" onClick={() => setIcon(g)} sx={{
            width: 36, height: 36, borderRadius: 2, cursor: 'pointer', fontFamily: 'inherit',
            fontSize: 18, fontWeight: 700,
            border: `1px solid ${icon === g ? BRAND.copper : theme.palette.divider}`,
            bgcolor: icon === g ? alpha(BRAND.copper, 0.14) : 'transparent',
            color: icon === g ? BRAND.copper : theme.palette.text.secondary,
          }}>{g}</Box>
        ))}
      </Box>

      {/* Actions */}
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
        <Box component="button" onClick={handleClose} disabled={loading} sx={{
          height: 36, px: 2, borderRadius: 99, border: 0, background: 'none', cursor: 'pointer',
          fontFamily: 'inherit', fontSize: 13.5, fontWeight: 600, color: 'text.secondary',
          '&:hover': { color: 'text.primary' },
        }}>Cancel</Box>
        <Box component="button" onClick={handleSubmit} disabled={loading || !name.trim()} sx={{
          height: 36, px: 2, borderRadius: 99, border: 0,
          cursor: loading || !name.trim() ? 'default' : 'pointer',
          opacity: !name.trim() ? 0.5 : 1,
          display: 'inline-flex', alignItems: 'center', gap: 0.6,
          fontFamily: 'inherit', fontSize: 13.5, fontWeight: 700,
          background: BRAND.gradient, color: BRAND.onAccent,
          '&:hover': { filter: loading || !name.trim() ? 'none' : 'brightness(1.08)' },
        }}>
          {loading ? <CircularProgress size={15} sx={{ color: BRAND.onAccent }} /> : <CheckRoundedIcon sx={{ fontSize: 16 }} />}
          {loading ? 'Creating…' : 'Create collection'}
        </Box>
      </Box>
    </Dialog>
  )
}
