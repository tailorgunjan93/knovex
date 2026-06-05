/**
 * Reader Page — /reader
 *
 * Unbeatable reading experience with:
 *   1. Direct upload  — drag & drop or click to upload any supported file
 *   2. KB file picker — browse KBs, single-click to open (also navigable via
 *                       URL param /reader?kb=X&file=Y from KB page double-click)
 *   3. Document view  — paginated, all block types (paragraph, heading, table,
 *                       code, PDF page)
 *   4. Inline Q&A     — right-side sliding panel with streaming answers
 *   5. Web search     — toggle in Q&A panel for web-augmented answers
 *
 * Layout:
 *   ┌─────────────────────────────────────────────────────────┐
 *   │  ScreenHeader + Upload button + From KB button          │
 *   ├──────────────────────────┬──────────────────────────────┤
 *   │  Left picker (280px)     │  Main content  │  Q&A (360px)│
 *   │  ─────────────────────── │                │             │
 *   │  📁 UPLOAD               │  FileViewer    │  InlineQA   │
 *   │  ┌────────────────────┐  │  (or empty     │  (toggleable│
 *   │  │ Drop zone          │  │   state)       │   from      │
 *   │  └────────────────────┘  │                │   toolbar)  │
 *   │  📚 FROM KB              │                │             │
 *   │  KB1 ▸ file.pdf ready   │                │             │
 *   │  KB2 ▸ notes.txt ready  │                │             │
 *   └──────────────────────────┴────────────────┴─────────────┘
 *
 * URL deep linking:
 *   /reader?kb=KB_ID&file=FILE_ID  → auto-opens that file on mount
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  IconButton,
  LinearProgress,
  Stack,
  Tooltip,
  Typography,
  useTheme,
  alpha,
} from '@mui/material'
import UploadFileIcon    from '@mui/icons-material/UploadFile'
import FolderOpenIcon    from '@mui/icons-material/FolderOpen'
import ExpandMoreIcon    from '@mui/icons-material/ExpandMore'
import ArticleOutlinedIcon from '@mui/icons-material/ArticleOutlined'
import ChevronLeftIcon   from '@mui/icons-material/ChevronLeft'
import ChevronRightIcon  from '@mui/icons-material/ChevronRight'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { kbApi, type FileRecord, type KB } from '../../api/kb.api'
import { pollIngestionStatus } from '@/lib/ingestion/pollStatus'
import { readerApi } from '../../api/reader.api'
import FileViewer, { type UploadStatus } from '../../components/FileViewer'
import { getRecentDocs, recordRecentDoc, type RecentDoc } from '../../lib/recentDocs'

// ─── Constants ────────────────────────────────────────────────────────────────

const MONO  = '"IBM Plex Mono", "Geist Mono", monospace'
const ACCEPT = '.pdf,.docx,.txt,.md,.csv,.udf'

const FORMAT_COLOR: Record<string, string> = {
  pdf: '#EF4444', docx: '#3B82F6', txt: '#6B7280',
  md: '#8B5CF6', csv: '#10B981', udf: '#F59E0B',
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface OpenFile {
  kbId: string
  fileId: string
  fileName: string
  format: string
}

type UploadState =
  | { phase: 'idle' }
  | { phase: 'uploading'; name: string }
  | { phase: 'ingesting'; name: string; kbId: string; fileId: string }
  | { phase: 'error'; message: string }

// ─── Helper: format file size ─────────────────────────────────────────────────

function fmt(bytes: number): string {
  if (bytes === 0) return '0 B'
  const u = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${u[i]}`
}

// ─── KB file list (lazy-loaded per accordion) ─────────────────────────────────

function KBFileList({
  kb,
  onOpen,
  currentFileId,
}: {
  kb: KB
  onOpen: (f: FileRecord) => void
  currentFileId?: string
}) {
  const theme = useTheme()
  const { data: files = [], isLoading } = useQuery({
    queryKey: ['kb', kb.id, 'files'],
    queryFn: () => kbApi.listFiles(kb.id),
    staleTime: 30_000,
  })

  const readyFiles = files.filter(f => f.status === 'ready' || f.status === 'stale')

  if (isLoading) {
    return (
      <Box sx={{ px: 2, py: 1 }}>
        <CircularProgress size={14} />
      </Box>
    )
  }

  if (readyFiles.length === 0) {
    return (
      <Typography
        variant="caption"
        color="text.disabled"
        sx={{ px: 2, py: 1, display: 'block', fontStyle: 'italic' }}
      >
        No readable files
      </Typography>
    )
  }

  return (
    <Box>
      {readyFiles.map(f => {
        const isActive = f.id === currentFileId
        return (
          <Box
            key={f.id}
            onClick={() => onOpen(f)}
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              px: 2,
              py: 0.75,
              cursor: 'pointer',
              borderRadius: 1,
              mx: 0.5,
              bgcolor: isActive
                ? alpha(theme.palette.primary.main, 0.1)
                : 'transparent',
              borderLeft: isActive
                ? `2px solid ${theme.palette.primary.main}`
                : '2px solid transparent',
              '&:hover': {
                bgcolor: isActive
                  ? alpha(theme.palette.primary.main, 0.12)
                  : 'action.hover',
              },
              transition: 'background 80ms, border-color 80ms',
            }}
          >
            <Box
              sx={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                bgcolor: FORMAT_COLOR[f.format] ?? '#6B7280',
                flexShrink: 0,
              }}
            />
            <Typography
              variant="body2"
              noWrap
              sx={{
                flex: 1,
                fontSize: 12.5,
                fontWeight: isActive ? 600 : 400,
                color: isActive ? 'primary.main' : 'text.secondary',
              }}
            >
              {f.name}
            </Typography>
            <Typography
              variant="caption"
              sx={{
                fontFamily: MONO,
                fontSize: 9.5,
                color: 'text.disabled',
                flexShrink: 0,
              }}
            >
              {fmt(f.size_bytes)}
            </Typography>
          </Box>
        )
      })}
    </Box>
  )
}

// ─── Left picker panel ────────────────────────────────────────────────────────

function PickerPanel({
  kbs,
  recent,
  openFile,
  uploadState,
  onUploadFile,
  onOpenKBFile,
  onOpenRecent,
  onCollapse,
  isDragging,
  onDragEnter,
  onDragLeave,
  onDrop,
}: {
  kbs: KB[]
  recent: RecentDoc[]
  openFile?: OpenFile
  uploadState: UploadState
  onUploadFile: (file: File) => void
  onOpenKBFile: (f: FileRecord, kb: KB) => void
  onOpenRecent: (d: RecentDoc) => void
  onCollapse: () => void
  isDragging: boolean
  onDragEnter: (e: React.DragEvent) => void
  onDragLeave: (e: React.DragEvent) => void
  onDrop: (e: React.DragEvent) => void
}) {
  const theme = useTheme()
  const isDark = theme.palette.mode === 'dark'
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) onUploadFile(file)
    e.target.value = ''
  }

  return (
    <Box
      sx={{
        width: 280,
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        bgcolor: isDark ? 'rgba(255,255,255,0.015)' : 'rgba(0,0,0,0.015)',
        overflow: 'hidden',
      }}
    >
      {/* ── Panel header: DOCUMENTS label + collapse button ── */}
      <Stack
        direction="row"
        alignItems="center"
        sx={{
          px: 1.5,
          pt: 1,
          pb: 0.5,
          flexShrink: 0,
          minHeight: 32,
        }}
      >
        <Typography
          sx={{
            fontFamily: MONO,
            fontSize: 9.5,
            textTransform: 'uppercase',
            letterSpacing: '0.14em',
            color: 'text.disabled',
            flex: 1,
          }}
        >
          Documents
        </Typography>
        <Tooltip title="Collapse panel">
          <IconButton size="small" onClick={onCollapse} sx={{ color: 'text.disabled', '&:hover': { color: 'text.secondary' } }}>
            <ChevronLeftIcon sx={{ fontSize: 14 }} />
          </IconButton>
        </Tooltip>
      </Stack>

      {/* ── Upload zone ── */}
      <Box sx={{ px: 1.5, pt: 0.5, pb: 1, flexShrink: 0 }}>
        <Typography
          sx={{
            fontFamily: MONO,
            fontSize: 9.5,
            textTransform: 'uppercase',
            letterSpacing: '0.12em',
            color: 'text.disabled',
            px: 0.5,
            mb: 0.75,
          }}
        >
          Upload
        </Typography>

        {/* Drop zone */}
        <Box
          onDragEnter={onDragEnter}
          onDragOver={e => e.preventDefault()}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          onClick={() => inputRef.current?.click()}
          sx={{
            border: `1.5px dashed ${isDragging ? theme.palette.primary.main : alpha(theme.palette.divider, 0.8)}`,
            borderRadius: 2,
            p: 1.5,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 0.5,
            cursor: 'pointer',
            bgcolor: isDragging
              ? alpha(theme.palette.primary.main, 0.06)
              : 'transparent',
            transition: 'all 0.15s ease',
            '&:hover': {
              borderColor: theme.palette.primary.main,
              bgcolor: alpha(theme.palette.primary.main, 0.04),
            },
          }}
        >
          <UploadFileIcon
            sx={{
              fontSize: 22,
              color: isDragging ? 'primary.main' : 'text.disabled',
              transition: 'color 0.15s',
            }}
          />
          <Typography
            variant="caption"
            sx={{ color: isDragging ? 'primary.main' : 'text.secondary', textAlign: 'center', lineHeight: 1.4 }}
          >
            {isDragging ? 'Drop to open' : 'Drop file or click to browse'}
          </Typography>
          <Typography
            variant="caption"
            sx={{ fontFamily: MONO, fontSize: 9, color: 'text.disabled', letterSpacing: '0.06em' }}
          >
            PDF · DOCX · TXT · MD · CSV
          </Typography>
        </Box>

        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          style={{ display: 'none' }}
          onChange={handleFileInput}
        />
      </Box>

      {/* Upload progress */}
      {uploadState.phase === 'uploading' && (
        <Box sx={{ px: 2, pb: 1, flexShrink: 0 }}>
          <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.5 }}>
            <CircularProgress size={12} />
            <Typography variant="caption" color="text.secondary" noWrap>
              Uploading {uploadState.name}…
            </Typography>
          </Stack>
          <LinearProgress sx={{ borderRadius: 1, height: 3 }} />
        </Box>
      )}

      {uploadState.phase === 'ingesting' && (
        <Box sx={{ px: 2, pb: 1, flexShrink: 0 }}>
          <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.5 }}>
            <CircularProgress size={12} />
            <Typography variant="caption" color="text.secondary" noWrap>
              Indexing {uploadState.name}…
            </Typography>
          </Stack>
          <LinearProgress variant="indeterminate" sx={{ borderRadius: 1, height: 3 }} />
        </Box>
      )}

      {uploadState.phase === 'error' && (
        <Alert severity="error" sx={{ mx: 1.5, mb: 1, py: 0 }} onClose={() => {}}>
          <Typography variant="caption">{uploadState.message}</Typography>
        </Alert>
      )}

      <Divider sx={{ mx: 1.5, opacity: 0.6 }} />

      {/* ── Recent + KB file tree ── */}
      <Box sx={{ flex: 1, overflow: 'auto', pt: 0.5 }}>
        {/* Recently opened (reader history) */}
        {recent.length > 0 && (
          <>
            <Typography
              sx={{
                fontFamily: MONO, fontSize: 9.5, textTransform: 'uppercase',
                letterSpacing: '0.12em', color: 'text.disabled', px: 2, pt: 1, pb: 0.5,
              }}
            >
              Recent
            </Typography>
            {recent.map(d => {
              const isActive = d.fileId === openFile?.fileId
              return (
                <Box
                  key={d.fileId}
                  onClick={() => onOpenRecent(d)}
                  sx={{
                    display: 'flex', alignItems: 'center', gap: 1, px: 2, py: 0.75, mx: 0.5,
                    borderRadius: 1, cursor: 'pointer',
                    bgcolor: isActive ? alpha(theme.palette.primary.main, 0.1) : 'transparent',
                    borderLeft: isActive ? `2px solid ${theme.palette.primary.main}` : '2px solid transparent',
                    '&:hover': { bgcolor: isActive ? alpha(theme.palette.primary.main, 0.12) : 'action.hover' },
                    transition: 'background 80ms, border-color 80ms',
                  }}
                >
                  <Box sx={{ width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
                             bgcolor: FORMAT_COLOR[d.format] ?? '#6B7280' }} />
                  <Typography noWrap sx={{ flex: 1, fontSize: 12.5,
                    fontWeight: isActive ? 600 : 400, color: isActive ? 'primary.main' : 'text.secondary' }}>
                    {d.fileName}
                  </Typography>
                </Box>
              )
            })}
            <Divider sx={{ mx: 1.5, my: 0.75, opacity: 0.6 }} />
          </>
        )}

        <Typography
          sx={{
            fontFamily: MONO,
            fontSize: 9.5,
            textTransform: 'uppercase',
            letterSpacing: '0.12em',
            color: 'text.disabled',
            px: 2,
            pt: 1,
            pb: 0.5,
          }}
        >
          From Knowledge Base
        </Typography>

        {kbs.length === 0 ? (
          <Typography
            variant="caption"
            color="text.disabled"
            sx={{ px: 2, py: 1, display: 'block', fontStyle: 'italic' }}
          >
            No knowledge bases yet
          </Typography>
        ) : (
          kbs.map(kb => (
            <Accordion
              key={kb.id}
              disableGutters
              elevation={0}
              square
              sx={{
                bgcolor: 'transparent',
                '&:before': { display: 'none' },
                borderBottom: `1px solid ${alpha(theme.palette.divider, 0.5)}`,
              }}
            >
              <AccordionSummary
                expandIcon={<ExpandMoreIcon sx={{ fontSize: 14 }} />}
                sx={{
                  minHeight: 36,
                  px: 1.5,
                  '& .MuiAccordionSummary-content': { my: 0 },
                }}
              >
                <Stack direction="row" alignItems="center" spacing={0.75} flex={1} minWidth={0}>
                  <Box
                    sx={{
                      width: 8,
                      height: 8,
                      borderRadius: '3px',
                      bgcolor: kb.color || 'primary.main',
                      flexShrink: 0,
                    }}
                  />
                  <Typography
                    variant="body2"
                    noWrap
                    sx={{ flex: 1, fontSize: 12.5, fontWeight: 500, color: 'text.primary' }}
                  >
                    {kb.name}
                  </Typography>
                  <Typography
                    sx={{ fontFamily: MONO, fontSize: 9, color: 'text.disabled', flexShrink: 0 }}
                  >
                    {kb.stats.file_count}
                  </Typography>
                </Stack>
              </AccordionSummary>
              <AccordionDetails sx={{ p: 0, pb: 0.5 }}>
                <KBFileList
                  kb={kb}
                  onOpen={f => onOpenKBFile(f, kb)}
                  currentFileId={openFile?.fileId}
                />
              </AccordionDetails>
            </Accordion>
          ))
        )}
      </Box>
    </Box>
  )
}

// ─── Empty / landing state ────────────────────────────────────────────────────

function EmptyState({
  onUploadClick,
  isDragging,
  onDragEnter,
  onDragLeave,
  onDrop,
}: {
  onUploadClick: () => void
  isDragging: boolean
  onDragEnter: (e: React.DragEvent) => void
  onDragLeave: (e: React.DragEvent) => void
  onDrop: (e: React.DragEvent) => void
}) {
  const theme = useTheme()
  const isDark = theme.palette.mode === 'dark'

  return (
    <Box
      onDragEnter={onDragEnter}
      onDragOver={e => e.preventDefault()}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      sx={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 2,
        px: 4,
        transition: 'background 0.15s',
        bgcolor: isDragging
          ? alpha(theme.palette.primary.main, 0.04)
          : 'transparent',
      }}
    >
      {/* Document icon */}
      <Box
        sx={{
          width: 72,
          height: 72,
          borderRadius: '20px',
          bgcolor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)',
          border: `1.5px ${isDragging ? 'solid' : 'dashed'} ${isDragging ? theme.palette.primary.main : theme.palette.divider}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'all 0.2s',
        }}
      >
        {isDragging ? (
          <UploadFileIcon sx={{ fontSize: 32, color: 'primary.main' }} />
        ) : (
          <ArticleOutlinedIcon sx={{ fontSize: 32, color: 'text.disabled' }} />
        )}
      </Box>

      <Box sx={{ textAlign: 'center' }}>
        <Typography
          sx={{
            fontSize: 22,
            fontWeight: 700,
            letterSpacing: '-0.01em',
            color: isDragging ? 'primary.main' : 'text.secondary',
            lineHeight: 1.3,
            transition: 'color 0.15s',
          }}
        >
          {isDragging ? 'Drop to open' : 'No document open'}
        </Typography>
        {!isDragging && (
          <Typography
            variant="body2"
            color="text.disabled"
            sx={{ mt: 0.75, maxWidth: 340, lineHeight: 1.6 }}
          >
            Upload a file or pick one from your Knowledge Base using the panel on the left.
          </Typography>
        )}
      </Box>

      {!isDragging && (
        <Stack direction="row" spacing={1.5}>
          <Button
            variant="outlined"
            startIcon={<UploadFileIcon />}
            onClick={onUploadClick}
            size="small"
            sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 600 }}
          >
            Upload file
          </Button>
          <Button
            variant="outlined"
            startIcon={<FolderOpenIcon />}
            size="small"
            sx={{
              borderRadius: 2,
              textTransform: 'none',
              fontWeight: 600,
              color: 'text.secondary',
              borderColor: 'divider',
            }}
          >
            Open from KB ←
          </Button>
        </Stack>
      )}

      {!isDragging && (
        <Box
          sx={{
            px: 2,
            py: 0.75,
            borderRadius: 1.5,
            bgcolor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)',
            border: `1px solid ${theme.palette.divider}`,
          }}
        >
          <Typography sx={{ fontFamily: MONO, fontSize: 10.5, color: 'text.disabled', letterSpacing: '0.08em' }}>
            PDF · DOCX · TXT · MD · CSV · UDF supported
          </Typography>
        </Box>
      )}
    </Box>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function ReaderPage() {
  const theme   = useTheme()
  const isDark  = theme.palette.mode === 'dark'
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [searchParams] = useSearchParams()

  // ── State ───────────────────────────────────────────────────────────────────
  const [openFile, setOpenFile]     = useState<OpenFile | undefined>()
  const [uploadState, setUpload]    = useState<UploadState>({ phase: 'idle' })
  const [isDragging, setIsDragging] = useState(false)
  const [pickerVisible, setPicker]  = useState(true)
  const [recent, setRecent]         = useState<RecentDoc[]>(() => getRecentDocs())
  const mainInputRef = useRef<HTMLInputElement>(null)
  const dragCounter  = useRef(0)

  // Open a document and record it in the "Recent" history (reader history).
  const openDoc = useCallback((f: OpenFile) => {
    setOpenFile(f)
    setRecent(recordRecentDoc({ kbId: f.kbId, fileId: f.fileId, fileName: f.fileName, format: f.format }))
  }, [])

  // ── KBs list ────────────────────────────────────────────────────────────────
  const { data: kbs = [] } = useQuery({
    queryKey: ['kbs'],
    queryFn: kbApi.list,
    staleTime: 30_000,
  })

  // ── Auto-collapse picker when a file opens ───────────────────────────────────
  useEffect(() => {
    if (openFile) setPicker(false)
  }, [openFile?.fileId]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── URL deep link ────────────────────────────────────────────────────────────
  useEffect(() => {
    const kbParam   = searchParams.get('kb')
    const fileParam = searchParams.get('file')
    if (kbParam && fileParam && !openFile) {
      // Fetch file record from API
      kbApi.listFiles(kbParam).then(files => {
        const target = files.find(f => f.id === fileParam)
        if (target) {
          openDoc({ kbId: kbParam, fileId: fileParam, fileName: target.name, format: target.format })
        }
      }).catch(() => {})
    }
  }, [searchParams]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Upload + ingestion flow ──────────────────────────────────────────────────

  const doUpload = useCallback(async (file: File) => {
    setUpload({ phase: 'uploading', name: file.name })

    let resp: { kb_id: string; file_id: string; name: string; format: string; status: string }
    try {
      resp = await readerApi.upload(file)
    } catch (err: unknown) {
      setUpload({ phase: 'error', message: err instanceof Error ? err.message : 'Upload failed' })
      return
    }

    if (resp.status === 'ready') {
      // File was already indexed (duplicate) — open immediately
      setUpload({ phase: 'idle' })
      openDoc({ kbId: resp.kb_id, fileId: resp.file_id, fileName: resp.name, format: resp.format })
      return
    }

    setUpload({ phase: 'ingesting', name: resp.name, kbId: resp.kb_id, fileId: resp.file_id })

    // Poll status until ready. Keeps waiting while the backend reports progress —
    // OCR-backed ingestion (scanned/image PDFs) is legitimately slow, especially
    // the first run which downloads OCR models.
    const poll = async () => {
      const result = await pollIngestionStatus({
        getStatus: () => kbApi.getFileStatus(resp.kb_id, resp.file_id),
      })
      switch (result.outcome) {
        case 'ready':
          setUpload({ phase: 'idle' })
          openDoc({ kbId: resp.kb_id, fileId: resp.file_id, fileName: resp.name, format: resp.format })
          queryClient.invalidateQueries({ queryKey: ['kb', resp.kb_id, 'files'] })
          queryClient.invalidateQueries({ queryKey: ['kbs'] })
          return
        case 'error':
          setUpload({ phase: 'error', message: result.message })
          return
        case 'disconnected':
          setUpload({ phase: 'error', message: 'Lost connection to the backend during ingestion.' })
          return
        case 'timeout':
          setUpload({
            phase: 'error',
            message: 'Still indexing — this is taking a while. It may finish in the background; check Recent shortly.',
          })
          return
      }
    }
    poll()
  }, [queryClient, openDoc])

  // ── Drag & drop ──────────────────────────────────────────────────────────────

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    dragCounter.current++
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    dragCounter.current--
    if (dragCounter.current <= 0) {
      dragCounter.current = 0
      setIsDragging(false)
    }
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    dragCounter.current = 0
    setIsDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) doUpload(file)
  }, [doUpload])

  // ── KB file open ─────────────────────────────────────────────────────────────

  const openKBFile = useCallback((f: FileRecord, kb: KB) => {
    openDoc({ kbId: kb.id, fileId: f.id, fileName: f.name, format: f.format })
    // Update URL for shareable deep links (without triggering re-render loop)
    navigate(`/reader?kb=${kb.id}&file=${f.id}`, { replace: true })
  }, [navigate, openDoc])

  const openRecent = useCallback((d: RecentDoc) => {
    openDoc({ kbId: d.kbId, fileId: d.fileId, fileName: d.fileName, format: d.format })
    navigate(`/reader?kb=${d.kbId}&file=${d.fileId}`, { replace: true })
  }, [navigate, openDoc])

  const closeFile = useCallback(() => {
    setOpenFile(undefined)
    navigate('/reader', { replace: true })
  }, [navigate])

  return (
    <Box
      sx={{ height: '100%', display: 'flex', overflow: 'hidden' }}
      onDragEnter={handleDragEnter}
      onDragOver={e => e.preventDefault()}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Hidden global file input (used by EmptyState upload button) */}
      <input
        ref={mainInputRef}
        type="file"
        accept={ACCEPT}
        style={{ display: 'none' }}
        onChange={e => {
          const f = e.target.files?.[0]
          if (f) doUpload(f)
          e.target.value = ''
        }}
      />

      {/* Left picker panel — collapsible at any time */}
      {pickerVisible ? (
          <PickerPanel
            kbs={kbs}
            recent={recent}
            openFile={openFile}
            uploadState={uploadState}
            onUploadFile={doUpload}
            onOpenKBFile={openKBFile}
            onOpenRecent={openRecent}
            onCollapse={() => setPicker(false)}
            isDragging={isDragging}
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          />
        ) : (
          /* Slim collapsed rail — expand chevron + vertical "Documents" label */
          <Box
            sx={{
              width: 44,
              flexShrink: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              bgcolor: isDark ? 'rgba(255,255,255,0.015)' : 'rgba(0,0,0,0.015)',
              pt: 1.5,
              gap: 1.5,
            }}
          >
            <Tooltip title="Show documents" placement="right">
              <IconButton
                size="small"
                onClick={() => setPicker(true)}
                sx={{ color: 'text.secondary', '&:hover': { color: 'primary.main' }, transition: 'color 0.15s' }}
              >
                <ChevronRightIcon sx={{ fontSize: 18 }} />
              </IconButton>
            </Tooltip>
            <Box onClick={() => setPicker(true)}
                 sx={{ flex: 1, display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
              <Typography sx={{ writingMode: 'vertical-rl', fontFamily: MONO, fontSize: 10,
                                textTransform: 'uppercase', letterSpacing: '0.14em',
                                color: 'text.disabled', userSelect: 'none' }}>
                Documents
              </Typography>
            </Box>
          </Box>
        )}

      {/* Main content */}
      <Box sx={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {openFile ? (
          <FileViewer
            kbId={openFile.kbId}
            fileId={openFile.fileId}
            fileName={openFile.fileName}
            format={openFile.format}
            kbName={kbs.find(k => k.id === openFile.kbId)?.name}
            kbColor={kbs.find(k => k.id === openFile.kbId)?.color}
            onClose={closeFile}
            showWebSearch={true}
            showOpenInReader={false}
            onUpload={doUpload}
            uploadStatus={uploadState as UploadStatus}
          />
        ) : (
          <EmptyState
            onUploadClick={() => mainInputRef.current?.click()}
            isDragging={isDragging}
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          />
        )}
      </Box>
    </Box>
  )
}
