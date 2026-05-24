/**
 * KBDetail — expanded view for a single Knowledge Base
 *
 * Features:
 *  - Files list with status badges
 *  - Click a ready file to open FileViewer with inline Q&A
 *  - Drag-and-drop file add (calls Electron file picker)
 *  - Reindex individual / all files
 *  - Update path for missing files
 *  - Delete KB with confirmation
 *  - Auto-refresh file statuses while any file is ingesting
 */

import { useEffect, useRef, useState } from 'react'
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  IconButton,
  Paper,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import AddIcon from '@mui/icons-material/Add'
import RefreshIcon from '@mui/icons-material/Refresh'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { kbApi, type KB, type FileRecord } from '../../../api/kb.api'
import FileRow from './FileRow'
import ConfirmDialog from './ConfirmDialog'
import UpdatePathDialog from './UpdatePathDialog'
import FileViewer from '../../../components/FileViewer'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Props {
  kbId: string
  onBack: () => void
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function KBDetail({ kbId, onBack }: Props) {
  const queryClient = useQueryClient()
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [updatePathFileId, setUpdatePathFileId] = useState<string | null>(null)
  const [viewingFile, setViewingFile] = useState<FileRecord | null>(null)
  const [addError, setAddError] = useState('')
  const pollIntervalRef = useRef<number | null>(null)

  // ── Queries ───────────────────────────────────────────────────────────────
  const { data: kb, isLoading: kbLoading } = useQuery({
    queryKey: ['kb', kbId],
    queryFn: () => kbApi.get(kbId),
  })

  const { data: files = [], isLoading: filesLoading } = useQuery({
    queryKey: ['kb', kbId, 'files'],
    queryFn: () => kbApi.listFiles(kbId),
  })

  // Auto-refresh while any file is ingesting
  const hasActive = files.some(f => f.status === 'pending' || f.status === 'ingesting')
  useEffect(() => {
    if (hasActive) {
      pollIntervalRef.current = window.setInterval(() => {
        queryClient.invalidateQueries({ queryKey: ['kb', kbId, 'files'] })
        queryClient.invalidateQueries({ queryKey: ['kb', kbId] })
      }, 2000)
    } else if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current)
      pollIntervalRef.current = null
    }
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current)
    }
  }, [hasActive, kbId, queryClient])

  // ── Mutations ─────────────────────────────────────────────────────────────
  const addFileMutation = useMutation({
    mutationFn: (path: string) => kbApi.addFile(kbId, path),
    onSuccess: () => {
      setAddError('')
      queryClient.invalidateQueries({ queryKey: ['kb', kbId, 'files'] })
      queryClient.invalidateQueries({ queryKey: ['kbs'] })
    },
    onError: (err: Error) => setAddError(err.message),
  })

  const removeFileMutation = useMutation({
    mutationFn: (fileId: string) => kbApi.removeFile(kbId, fileId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kb', kbId, 'files'] })
      queryClient.invalidateQueries({ queryKey: ['kbs'] })
    },
  })

  const reindexFileMutation = useMutation({
    mutationFn: (fileId: string) => kbApi.reindexFile(kbId, fileId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['kb', kbId, 'files'] }),
  })

  const reindexKBMutation = useMutation({
    mutationFn: () => kbApi.reindex(kbId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['kb', kbId, 'files'] }),
  })

  const deleteKBMutation = useMutation({
    mutationFn: () => kbApi.delete(kbId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kbs'] })
      onBack()
    },
  })

  const updatePathMutation = useMutation({
    mutationFn: ({ fileId, path }: { fileId: string; path: string }) =>
      kbApi.updateFilePath(kbId, fileId, path),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['kb', kbId, 'files'] }),
  })

  // ── File picker ───────────────────────────────────────────────────────────
  const handleAddFiles = async () => {
    try {
      let paths: string[] = []
      if (window.knovex?.openFilePicker) {
        const result = await window.knovex.openFilePicker({
          filters: [
            { name: 'Supported files', extensions: ['pdf', 'docx', 'txt', 'md', 'csv', 'udf'] },
          ],
          properties: ['multiSelections'],
        })
        if (result && !result.canceled) paths = result.filePaths
      } else {
        // Dev fallback: prompt
        const path = window.prompt('Enter absolute file path:')
        if (path) paths = [path]
      }
      for (const p of paths) {
        await addFileMutation.mutateAsync(p)
      }
    } catch (e: unknown) {
      setAddError(e instanceof Error ? e.message : 'Failed to add file')
    }
  }

  // ── Loading state ─────────────────────────────────────────────────────────
  if (kbLoading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" height="100%">
        <CircularProgress />
      </Box>
    )
  }

  if (!kb) {
    return (
      <Box p={3}>
        <Alert severity="error">Knowledge base not found.</Alert>
        <Button onClick={onBack} sx={{ mt: 2 }}>Back</Button>
      </Box>
    )
  }

  const readyCount = files.filter(f => f.status === 'ready').length
  const ingestingCount = files.filter(f => f.status === 'pending' || f.status === 'ingesting').length

  // Show FileViewer when a ready file is clicked
  if (viewingFile) {
    return (
      <FileViewer
        kbId={kbId}
        fileId={viewingFile.id}
        fileName={viewingFile.name}
        format={viewingFile.format}
        onClose={() => setViewingFile(null)}
      />
    )
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <Stack
        direction="row"
        alignItems="center"
        spacing={1.5}
        sx={{ px: 3, py: 2, borderBottom: '1px solid', borderColor: 'divider', flexShrink: 0 }}
      >
        <IconButton size="small" onClick={onBack}>
          <ArrowBackIcon />
        </IconButton>

        {/* KB identity */}
        <Box
          sx={{
            width: 36,
            height: 36,
            borderRadius: 1.5,
            bgcolor: `${kb.color}22`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '1.2rem',
            flexShrink: 0,
          }}
        >
          {kb.icon}
        </Box>

        <Box flex={1}>
          <Typography variant="h6" fontWeight={700} sx={{ lineHeight: 1.2 }}>
            {kb.name}
          </Typography>
          <Stack direction="row" spacing={1} alignItems="center">
            <Typography variant="caption" color="text.secondary">
              {kb.stats.file_count} file{kb.stats.file_count !== 1 ? 's' : ''}
            </Typography>
            {kb.stats.total_chunks > 0 && (
              <>
                <Typography variant="caption" color="text.secondary">·</Typography>
                <Typography variant="caption" color="text.secondary">
                  {kb.stats.total_chunks} chunks indexed
                </Typography>
              </>
            )}
            {ingestingCount > 0 && (
              <>
                <Typography variant="caption" color="text.secondary">·</Typography>
                <Stack direction="row" alignItems="center" spacing={0.5}>
                  <CircularProgress size={10} thickness={5} />
                  <Typography variant="caption" color="info.main">
                    {ingestingCount} indexing
                  </Typography>
                </Stack>
              </>
            )}
          </Stack>
        </Box>

        {/* Actions */}
        <Stack direction="row" spacing={0.5}>
          <Tooltip title="Re-index all files">
            <IconButton
              size="small"
              onClick={() => reindexKBMutation.mutate()}
              disabled={reindexKBMutation.isPending || files.length === 0}
            >
              <RefreshIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Delete Knowledge Base">
            <IconButton
              size="small"
              color="error"
              onClick={() => setDeleteOpen(true)}
            >
              <DeleteOutlineIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Button
            variant="contained"
            size="small"
            startIcon={<AddIcon />}
            onClick={handleAddFiles}
            disabled={addFileMutation.isPending}
          >
            Add Files
          </Button>
        </Stack>
      </Stack>

      {/* ── Error banner ────────────────────────────────────────────────── */}
      {addError && (
        <Alert severity="error" onClose={() => setAddError('')} sx={{ mx: 2, mt: 1 }}>
          {addError}
        </Alert>
      )}

      {/* ── Files list ──────────────────────────────────────────────────── */}
      <Box flex={1} overflow="auto">
        {filesLoading ? (
          <Box display="flex" justifyContent="center" p={4}>
            <CircularProgress />
          </Box>
        ) : files.length === 0 ? (
          <EmptyFiles onAdd={handleAddFiles} />
        ) : (
          <Paper elevation={0} sx={{ m: 2, border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
            {/* Summary row */}
            <Stack
              direction="row"
              spacing={2}
              sx={{ px: 2, py: 1.5, borderBottom: '1px solid', borderColor: 'divider' }}
            >
              <Chip label={`${readyCount} ready`} size="small" color="success" variant="outlined" />
              {ingestingCount > 0 && (
                <Chip label={`${ingestingCount} indexing`} size="small" color="info" variant="outlined" />
              )}
              {files.filter(f => f.status === 'stale').length > 0 && (
                <Chip label={`${files.filter(f => f.status === 'stale').length} stale`} size="small" color="warning" variant="outlined" />
              )}
              {files.filter(f => f.status === 'missing').length > 0 && (
                <Chip label={`${files.filter(f => f.status === 'missing').length} missing`} size="small" color="error" variant="outlined" />
              )}
              {files.filter(f => f.status === 'error').length > 0 && (
                <Chip label={`${files.filter(f => f.status === 'error').length} error`} size="small" color="error" variant="outlined" />
              )}
            </Stack>

            {/* File rows */}
            {files.map((file: FileRecord) => (
              <FileRow
                key={file.id}
                file={file}
                onRemove={id => removeFileMutation.mutate(id)}
                onReindex={id => reindexFileMutation.mutate(id)}
                onUpdatePath={id => setUpdatePathFileId(id)}
                onView={file.status === 'ready' || file.status === 'stale'
                  ? () => setViewingFile(file)
                  : undefined}
              />
            ))}
          </Paper>
        )}
      </Box>

      {/* ── Dialogs ─────────────────────────────────────────────────────── */}
      <ConfirmDialog
        open={deleteOpen}
        title="Delete Knowledge Base"
        message={`Permanently delete "${kb.name}" and all ${kb.stats.file_count} file(s)? This cannot be undone.`}
        confirmLabel="Delete"
        confirmColor="error"
        onConfirm={() => { setDeleteOpen(false); deleteKBMutation.mutate() }}
        onCancel={() => setDeleteOpen(false)}
      />

      <UpdatePathDialog
        open={!!updatePathFileId}
        onClose={() => setUpdatePathFileId(null)}
        onUpdate={async (path) => {
          if (updatePathFileId) {
            await updatePathMutation.mutateAsync({ fileId: updatePathFileId, path })
            setUpdatePathFileId(null)
          }
        }}
      />
    </Box>
  )
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyFiles({ onAdd }: { onAdd: () => void }) {
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: 280,
        gap: 2,
        color: 'text.secondary',
      }}
    >
      <Typography variant="h2" sx={{ opacity: 0.25, lineHeight: 1 }}>📂</Typography>
      <Typography variant="body1" fontWeight={600} color="text.primary">
        No files yet
      </Typography>
      <Typography variant="body2" sx={{ maxWidth: 320, textAlign: 'center' }}>
        Add PDF, DOCX, TXT, Markdown, CSV, or UDF files to build your knowledge base.
      </Typography>
      <Button variant="contained" startIcon={<AddIcon />} onClick={onAdd}>
        Add Files
      </Button>
    </Box>
  )
}
