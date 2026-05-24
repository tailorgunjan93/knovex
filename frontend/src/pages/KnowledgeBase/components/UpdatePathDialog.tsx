/**
 * UpdatePathDialog — lets the user provide a new path for a missing file
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
  Typography,
} from '@mui/material'
import FolderOpenIcon from '@mui/icons-material/FolderOpen'

interface Props {
  open: boolean
  onClose: () => void
  onUpdate: (newPath: string) => Promise<void>
}

export default function UpdatePathDialog({ open, onClose, onUpdate }: Props) {
  const [path, setPath] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleBrowse = async () => {
    if (window.knovex?.openFilePicker) {
      const result = await window.knovex.openFilePicker({
        filters: [
          { name: 'Supported files', extensions: ['pdf', 'docx', 'txt', 'md', 'csv', 'udf'] },
        ],
      })
      if (result && !result.canceled && result.filePaths.length > 0) {
        setPath(result.filePaths[0])
      }
    }
  }

  const handleSubmit = async () => {
    if (!path.trim()) { setError('Path is required'); return }
    setLoading(true)
    setError('')
    try {
      await onUpdate(path.trim())
      setPath('')
      onClose()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to update path')
    } finally {
      setLoading(false)
    }
  }

  const handleClose = () => {
    setPath('')
    setError('')
    onClose()
  }

  return (
    <Dialog open={open} onClose={handleClose} fullWidth maxWidth="sm">
      <DialogTitle>Locate Missing File</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          The file has been moved or renamed. Provide the new path to re-link and re-index it.
        </Typography>
        <Stack direction="row" spacing={1} alignItems="flex-start">
          <TextField
            label="New file path"
            fullWidth
            value={path}
            onChange={e => setPath(e.target.value)}
            error={!!error}
            helperText={error}
            placeholder="/path/to/your/file.pdf"
          />
          {window.knovex?.openFilePicker && (
            <Button
              variant="outlined"
              startIcon={<FolderOpenIcon />}
              onClick={handleBrowse}
              sx={{ mt: '4px', flexShrink: 0 }}
            >
              Browse
            </Button>
          )}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={handleClose} disabled={loading}>Cancel</Button>
        <Button
          variant="contained"
          onClick={handleSubmit}
          disabled={loading || !path.trim()}
        >
          {loading ? 'Updating…' : 'Update & Re-index'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
