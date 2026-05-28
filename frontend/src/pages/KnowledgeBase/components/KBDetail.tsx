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
  useTheme,
  alpha,
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
import ScreenHeader from '@/components/Layout/ScreenHeader'

const MONO = '"IBM Plex Mono", "Geist Mono", monospace'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Props {
  kbId: string
  onBack: () => void
  initialFileId?: string   // deep-link from citation click: auto-open this file
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function KBDetail({ kbId, onBack, initialFileId }: Props) {
  const queryClient = useQueryClient()
  const theme = useTheme()
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [updatePathFileId, setUpdatePathFileId] = useState<string | null>(null)
  const [viewingFile, setViewingFile] = useState<FileRecord | null>(null)
  const [addError, setAddError] = useState('')
  const pollIntervalRef = useRef<number | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // ── Queries ───────────────────────────────────────────────────────────────
  const { data: kb, isLoading: kbLoading } = useQuery({
    queryKey: ['kb', kbId],
    queryFn: () => kbApi.get(kbId),
  })

  const { data: files = [], isLoading: filesLoading } = useQuery({
    queryKey: ['kb', kbId, 'files'],
    queryFn: () => kbApi.listFiles(kbId),
  })

  // Auto-open file when deep-linked from a chat citation
  useEffect(() => {
    if (initialFileId && files.length > 0 && !viewingFile) {
      const target = files.find(f => f.id === initialFileId)
      if (target) setViewingFile(target)
    }
  }, [initialFileId, files])  // eslint-disable-line react-hooks/exhaustive-deps

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

  const uploadFileMutation = useMutation({
    mutationFn: (file: File) => kbApi.uploadFile(kbId, file),
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
    if (window.knovex?.openFilePicker) {
      // Electron desktop app — use native file picker, add by path
      try {
        const result = await window.knovex.openFilePicker({
          filters: [
            { name: 'Supported files', extensions: ['pdf', 'docx', 'txt', 'md', 'csv', 'udf'] },
          ],
          properties: ['multiSelections'],
        })
        if (result && !result.canceled) {
          for (const p of result.filePaths) {
            await addFileMutation.mutateAsync(p)
          }
        }
      } catch (e: unknown) {
        setAddError(e instanceof Error ? e.message : 'Failed to add file')
      }
    } else {
      // Browser — trigger hidden <input type="file"> picker
      fileInputRef.current?.click()
    }
  }

  const handleFileInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files ?? [])
    // Reset input so the same file can be re-selected after a removal
    e.target.value = ''
    if (selected.length === 0) return
    for (const file of selected) {
      try {
        await uploadFileMutation.mutateAsync(file)
      } catch {
        // error already captured in mutation onError
      }
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

  const accentColor = kb.color || theme.palette.primary.main

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* ── KnovexUI ScreenHeader ────────────────────────────────────────── */}
      <ScreenHeader
        eyebrow={`LIBRARY · ${kb.stats.file_count} FILE${kb.stats.file_count !== 1 ? 'S' : ''}`}
        title={kb.name}
        sub={
          kb.stats.total_chunks > 0
            ? `${kb.stats.total_chunks} chunks indexed${ingestingCount > 0 ? ` · ${ingestingCount} indexing…` : ''}`
            : ingestingCount > 0
              ? `${ingestingCount} file${ingestingCount !== 1 ? 's' : ''} indexing…`
              : 'No files indexed yet — add files to get started'
        }
        actions={
          <>
            {/* Back */}
            <Tooltip title="Back to all knowledge bases">
              <IconButton
                size="small"
                onClick={onBack}
                sx={{ width: 28, height: 28, border: `1px solid ${alpha(theme.palette.divider, 0.8)}`, borderRadius: 1 }}
              >
                <ArrowBackIcon sx={{ fontSize: 14 }} />
              </IconButton>
            </Tooltip>

            {/* KB glyph */}
            <Box
              sx={{
                width: 28, height: 28,
                borderRadius: 1,
                bgcolor: alpha(accentColor, 0.15),
                border: `1px solid ${alpha(accentColor, 0.3)}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '1rem',
                color: accentColor,
              }}
            >
              {kb.icon}
            </Box>

            <Tooltip title="Re-index all files">
              <span>
                <IconButton
                  size="small"
                  onClick={() => reindexKBMutation.mutate()}
                  disabled={reindexKBMutation.isPending || files.length === 0}
                  sx={{ width: 28, height: 28, border: `1px solid ${alpha(theme.palette.divider, 0.8)}`, borderRadius: 1 }}
                >
                  <RefreshIcon sx={{ fontSize: 14 }} />
                </IconButton>
              </span>
            </Tooltip>
            <Tooltip title="Delete Knowledge Base">
              <IconButton
                size="small"
                color="error"
                onClick={() => setDeleteOpen(true)}
                sx={{ width: 28, height: 28, border: `1px solid ${alpha(theme.palette.error.main, 0.3)}`, borderRadius: 1 }}
              >
                <DeleteOutlineIcon sx={{ fontSize: 14 }} />
              </IconButton>
            </Tooltip>
            <Button
              variant="contained"
              size="small"
              startIcon={<AddIcon sx={{ fontSize: 14 }} />}
              onClick={handleAddFiles}
              disabled={addFileMutation.isPending || uploadFileMutation.isPending}
              sx={{ height: 32, fontSize: 12 }}
            >
              {uploadFileMutation.isPending ? 'Uploading…' : 'Add Files'}
            </Button>
          </>
        }
      />

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

      {/* Hidden browser file picker — triggered by handleAddFiles in non-Electron env */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept=".pdf,.docx,.txt,.md,.csv,.udf"
        style={{ display: 'none' }}
        onChange={handleFileInputChange}
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
