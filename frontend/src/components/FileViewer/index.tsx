/**
 * FileViewer — renders ContentBlocks returned by the Reader API
 *
 * Supports all block types:
 *   paragraph   → MUI Typography body
 *   heading     → MUI Typography h3–h6 (mapped from level 1–6)
 *   table_row   → horizontal key:value list inside a subtle Paper chip
 *   code        → monospaced pre block
 *   page        → full PDF page block with page number badge
 *
 * Props:
 *   kbId, fileId — used to fetch content
 *   format        — used to decide PDF vs paginated view
 *
 * Features:
 *   - Pagination toolbar (prev/next/page indicator)
 *   - Loading skeleton while fetching
 *   - Error alert with retry
 *   - "Open Q&A" toggle to show InlineQA sidebar
 */

import { useState } from 'react'
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  IconButton,
  Paper,
  Skeleton,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material'
import NavigateBeforeIcon from '@mui/icons-material/NavigateBefore'
import NavigateNextIcon from '@mui/icons-material/NavigateNext'
import QuestionAnswerIcon from '@mui/icons-material/QuestionAnswer'
import CloseIcon from '@mui/icons-material/Close'
import { useQuery } from '@tanstack/react-query'
import { readerApi, type ContentBlock } from '../../api/reader.api'
import InlineQA from '../../pages/KnowledgeBase/components/InlineQA'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Props {
  kbId: string
  fileId: string
  fileName: string
  format: string
  onClose?: () => void
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const MUI_HEADING_VARIANTS: Record<number, 'h4' | 'h5' | 'h6'> = {
  1: 'h4',
  2: 'h4',
  3: 'h5',
  4: 'h5',
  5: 'h6',
  6: 'h6',
}

// ─── Block renderers ──────────────────────────────────────────────────────────

function RenderBlock({ block }: { block: ContentBlock }) {
  switch (block.type) {
    case 'heading': {
      const level = block.level ?? 2
      const variant = MUI_HEADING_VARIANTS[level] ?? 'h6'
      return (
        <Typography
          variant={variant}
          fontWeight={700}
          sx={{ mt: level <= 2 ? 3 : 2, mb: 0.5, color: 'text.primary' }}
        >
          {String(block.content)}
        </Typography>
      )
    }

    case 'paragraph':
      return (
        <Typography
          variant="body2"
          sx={{ lineHeight: 1.75, color: 'text.secondary', mb: 1 }}
        >
          {String(block.content)}
        </Typography>
      )

    case 'table_row': {
      const cells = Array.isArray(block.content) ? block.content : [String(block.content)]
      const headers = (block.metadata?.headers as string[] | undefined) ?? []
      return (
        <Paper
          variant="outlined"
          sx={{
            px: 2,
            py: 1,
            mb: 1,
            display: 'flex',
            flexWrap: 'wrap',
            gap: 1,
            borderRadius: 1.5,
          }}
        >
          {cells.map((cell, i) => (
            <Box key={i} sx={{ display: 'flex', alignItems: 'baseline', gap: 0.5 }}>
              {headers[i] && (
                <Typography variant="caption" color="text.disabled" fontWeight={600}>
                  {headers[i]}:
                </Typography>
              )}
              <Typography variant="body2">{cell}</Typography>
              {i < cells.length - 1 && (
                <Typography variant="body2" color="text.disabled" sx={{ ml: 1 }}>|</Typography>
              )}
            </Box>
          ))}
        </Paper>
      )
    }

    case 'code':
      return (
        <Box
          component="pre"
          sx={{
            fontFamily: 'monospace',
            fontSize: '0.82rem',
            bgcolor: 'action.hover',
            border: '1px solid',
            borderColor: 'divider',
            borderRadius: 1.5,
            p: 2,
            overflowX: 'auto',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            mb: 1.5,
          }}
        >
          {String(block.content)}
        </Box>
      )

    case 'page': {
      const pageNum = (block.metadata?.page_num as number | undefined) ?? '?'
      return (
        <Box sx={{ mb: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
            <Chip
              label={`Page ${pageNum}`}
              size="small"
              sx={{ bgcolor: 'primary.main', color: '#fff', fontWeight: 700, fontSize: '0.7rem' }}
            />
            <Divider sx={{ flex: 1 }} />
          </Box>
          <Typography
            variant="body2"
            sx={{ lineHeight: 1.8, color: 'text.secondary', whiteSpace: 'pre-wrap' }}
          >
            {String(block.content)}
          </Typography>
        </Box>
      )
    }

    default:
      return (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          {String(block.content)}
        </Typography>
      )
  }
}

// ─── Loading skeleton ─────────────────────────────────────────────────────────

function ContentSkeleton() {
  return (
    <Box sx={{ p: 3 }}>
      <Skeleton variant="text" width="60%" height={32} sx={{ mb: 2 }} />
      {Array.from({ length: 8 }).map((_, i) => (
        <Skeleton key={i} variant="text" width={`${70 + Math.random() * 30}%`} height={20} sx={{ mb: 0.5 }} />
      ))}
      <Skeleton variant="text" width="40%" height={28} sx={{ mt: 3, mb: 1.5 }} />
      {Array.from({ length: 5 }).map((_, i) => (
        <Skeleton key={i} variant="text" width={`${60 + Math.random() * 40}%`} height={20} sx={{ mb: 0.5 }} />
      ))}
    </Box>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function FileViewer({ kbId, fileId, fileName, format, onClose }: Props) {
  const [page, setPage] = useState(1)
  const [qaOpen, setQaOpen] = useState(false)

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['file-content', kbId, fileId, page],
    queryFn: () => readerApi.getContent(kbId, fileId, page),
    staleTime: 60_000,
  })

  const totalPages = data?.total_pages ?? 1
  const blocks = data?.content.blocks ?? []

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflow: 'hidden',
        bgcolor: 'background.default',
      }}
    >
      {/* ── Toolbar ──────────────────────────────────────────────────────── */}
      <Stack
        direction="row"
        alignItems="center"
        spacing={1}
        sx={{
          px: 2,
          py: 1,
          borderBottom: '1px solid',
          borderColor: 'divider',
          flexShrink: 0,
          minHeight: 48,
        }}
      >
        <Typography
          variant="subtitle2"
          fontWeight={700}
          noWrap
          sx={{ flex: 1, color: 'text.primary' }}
        >
          {fileName}
        </Typography>

        {/* Pagination */}
        {totalPages > 1 && (
          <Stack direction="row" alignItems="center" spacing={0.5}>
            <Tooltip title="Previous page">
              <span>
                <IconButton
                  size="small"
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page <= 1 || isLoading}
                >
                  <NavigateBeforeIcon fontSize="small" />
                </IconButton>
              </span>
            </Tooltip>
            <Typography variant="caption" color="text.secondary" sx={{ minWidth: 60, textAlign: 'center' }}>
              {page} / {totalPages}
            </Typography>
            <Tooltip title="Next page">
              <span>
                <IconButton
                  size="small"
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages || isLoading}
                >
                  <NavigateNextIcon fontSize="small" />
                </IconButton>
              </span>
            </Tooltip>
          </Stack>
        )}

        {/* Q&A toggle */}
        <Tooltip title={qaOpen ? 'Close Q&A' : 'Ask a question about this file'}>
          <IconButton
            size="small"
            color={qaOpen ? 'primary' : 'default'}
            onClick={() => setQaOpen(o => !o)}
          >
            <QuestionAnswerIcon fontSize="small" />
          </IconButton>
        </Tooltip>

        {onClose && (
          <Tooltip title="Close viewer">
            <IconButton size="small" onClick={onClose}>
              <CloseIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
      </Stack>

      {/* ── Body ─────────────────────────────────────────────────────────── */}
      <Box sx={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Content pane */}
        <Box sx={{ flex: 1, overflow: 'auto', px: 3, py: 2 }}>
          {isLoading ? (
            <ContentSkeleton />
          ) : isError ? (
            <Alert
              severity="error"
              action={
                <Button color="inherit" size="small" onClick={() => refetch()}>
                  Retry
                </Button>
              }
            >
              {(error as Error)?.message ?? 'Failed to load content'}
            </Alert>
          ) : blocks.length === 0 ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 200 }}>
              <Typography color="text.disabled">(No content to display)</Typography>
            </Box>
          ) : (
            blocks.map((block, i) => <RenderBlock key={i} block={block} />)
          )}

          {/* Loading indicator for page change */}
          {isLoading && (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
              <CircularProgress size={28} />
            </Box>
          )}
        </Box>

        {/* Q&A sidebar */}
        {qaOpen && (
          <InlineQA
            kbId={kbId}
            fileId={fileId}
            fileName={fileName}
            onClose={() => setQaOpen(false)}
          />
        )}
      </Box>
    </Box>
  )
}
