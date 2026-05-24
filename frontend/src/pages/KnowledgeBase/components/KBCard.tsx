/**
 * KBCard — visual card representing a single Knowledge Base
 *
 * Displays name, icon, colour accent, file count, size, and chunk count.
 * Clicking navigates to the KB detail view.
 */

import { Box, Card, CardActionArea, Chip, Stack, Typography } from '@mui/material'
import FolderIcon from '@mui/icons-material/Folder'
import type { KB } from '../../../api/kb.api'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface Props {
  kb: KB
  onClick: (id: string) => void
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function KBCard({ kb, onClick }: Props) {
  const isEmoji = /\p{Emoji}/u.test(kb.icon)

  return (
    <Card
      elevation={0}
      sx={{
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 2,
        transition: 'border-color 0.15s, box-shadow 0.15s',
        '&:hover': {
          borderColor: kb.color,
          boxShadow: `0 0 0 1px ${kb.color}44`,
        },
      }}
    >
      <CardActionArea onClick={() => onClick(kb.id)} sx={{ p: 2 }}>
        {/* Header row */}
        <Stack direction="row" alignItems="flex-start" spacing={1.5}>
          {/* Icon circle */}
          <Box
            sx={{
              width: 44,
              height: 44,
              borderRadius: 2,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              bgcolor: `${kb.color}22`,
              flexShrink: 0,
              fontSize: isEmoji ? '1.4rem' : undefined,
              color: kb.color,
            }}
          >
            {isEmoji ? kb.icon : <FolderIcon />}
          </Box>

          {/* Name + date */}
          <Box flex={1} minWidth={0}>
            <Typography
              variant="subtitle1"
              fontWeight={700}
              noWrap
              sx={{ color: 'text.primary', lineHeight: 1.3 }}
            >
              {kb.name}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Created {new Date(kb.created_at).toLocaleDateString()}
            </Typography>
          </Box>
        </Stack>

        {/* Stats row */}
        <Stack direction="row" spacing={1} sx={{ mt: 1.5, flexWrap: 'wrap' }}>
          <Chip
            size="small"
            label={`${kb.stats.file_count} file${kb.stats.file_count !== 1 ? 's' : ''}`}
            sx={{ bgcolor: `${kb.color}18`, color: kb.color, fontWeight: 600 }}
          />
          {kb.stats.total_size_bytes > 0 && (
            <Chip
              size="small"
              label={formatBytes(kb.stats.total_size_bytes)}
              variant="outlined"
              sx={{ color: 'text.secondary', borderColor: 'divider' }}
            />
          )}
          {kb.stats.total_chunks > 0 && (
            <Chip
              size="small"
              label={`${kb.stats.total_chunks} chunks`}
              variant="outlined"
              sx={{ color: 'text.secondary', borderColor: 'divider' }}
            />
          )}
        </Stack>
      </CardActionArea>
    </Card>
  )
}
