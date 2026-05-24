/**
 * FileRow — a single file entry in the KB detail view
 *
 * Shows status badge (with animated ingestion indicator),
 * file name, format, size, chunk count, and action buttons.
 */

import {
  Box,
  Chip,
  CircularProgress,
  IconButton,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import RefreshIcon from '@mui/icons-material/Refresh'
import FolderOffIcon from '@mui/icons-material/FolderOff'
import type { FileRecord } from '../../../api/kb.api'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Props {
  file: FileRecord
  onRemove: (fileId: string) => void
  onReindex: (fileId: string) => void
  onUpdatePath: (fileId: string) => void
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`
}

const STATUS_COLOR: Record<string, 'default' | 'success' | 'warning' | 'error' | 'info'> = {
  pending: 'default',
  ingesting: 'info',
  ready: 'success',
  stale: 'warning',
  missing: 'error',
  error: 'error',
}

const FORMAT_LABELS: Record<string, string> = {
  pdf: 'PDF',
  docx: 'DOCX',
  txt: 'TXT',
  md: 'MD',
  csv: 'CSV',
  udf: 'UDF',
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function FileRow({ file, onRemove, onReindex, onUpdatePath }: Props) {
  const isIngesting = file.status === 'ingesting' || file.status === 'pending'
  const isMissing = file.status === 'missing'
  const isStaleOrError = file.status === 'stale' || file.status === 'error'

  return (
    <Stack
      direction="row"
      alignItems="center"
      spacing={1.5}
      sx={{
        px: 2,
        py: 1.25,
        borderBottom: '1px solid',
        borderColor: 'divider',
        '&:last-child': { borderBottom: 'none' },
        '&:hover': { bgcolor: 'action.hover' },
      }}
    >
      {/* Format badge */}
      <Chip
        label={FORMAT_LABELS[file.format] ?? file.format.toUpperCase()}
        size="small"
        variant="outlined"
        sx={{ minWidth: 44, fontWeight: 700, fontSize: '0.65rem', flexShrink: 0 }}
      />

      {/* Name + path info */}
      <Box flex={1} minWidth={0}>
        <Typography
          variant="body2"
          fontWeight={600}
          noWrap
          sx={{ color: isMissing ? 'text.disabled' : 'text.primary' }}
        >
          {isMissing && <FolderOffIcon sx={{ fontSize: 14, mr: 0.5, verticalAlign: 'middle', color: 'error.main' }} />}
          {file.name}
        </Typography>
        <Typography variant="caption" color="text.secondary" noWrap display="block">
          {formatBytes(file.size_bytes)}
          {file.chunk_count > 0 && ` · ${file.chunk_count} chunks`}
          {file.error_message && ` · ${file.error_message}`}
        </Typography>
      </Box>

      {/* Status badge */}
      <Stack direction="row" alignItems="center" spacing={0.5} flexShrink={0}>
        {isIngesting && <CircularProgress size={12} thickness={5} />}
        <Chip
          label={file.status}
          size="small"
          color={STATUS_COLOR[file.status] ?? 'default'}
          sx={{ textTransform: 'capitalize', fontWeight: 600, fontSize: '0.65rem' }}
        />
      </Stack>

      {/* Actions */}
      <Stack direction="row" spacing={0} flexShrink={0}>
        {isMissing && (
          <Tooltip title="Locate file">
            <IconButton size="small" onClick={() => onUpdatePath(file.id)}>
              <FolderOffIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
        {isStaleOrError && (
          <Tooltip title="Re-index">
            <IconButton size="small" onClick={() => onReindex(file.id)}>
              <RefreshIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
        <Tooltip title="Remove from KB">
          <IconButton size="small" color="error" onClick={() => onRemove(file.id)}>
            <DeleteOutlineIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Stack>
    </Stack>
  )
}
