/**
 * FileViewer — rich document reading experience
 *
 * Layout (4 rows):
 *
 *  ┌─────────────────────────────────────────────────────────────────┐
 *  │ BreadcrumbBar: [●KB] KB Name  ›  [FMT] File Name  [⬆][💬][···] │  Row 1
 *  ├─────────────────────────────────────────────────────────────────┤
 *  │ MetaBar:  Pg N / T    [Page tab] [Outline]  [Highlights]   [🔖] │  Row 2
 *  ├────────────────────────────────────────────────────────────┬────┤
 *  │                                                            │    │
 *  │         Centered reading column (max 720 px)               │ QA │  Body
 *  │                                                            │    │
 *  ├─────────────────────────────────────────────────────────────────┤
 *  │ BottomBar: [Focus][Split]  [CONCEPT][DEFN][QUESTION]  ← N/T → │  Row 4
 *  └─────────────────────────────────────────────────────────────────┘
 *
 * Props:
 *   kbId, fileId         — used to fetch content
 *   fileName, format     — displayed in breadcrumb
 *   kbName, kbColor      — KB label + dot in breadcrumb (optional)
 *   onClose              — called by "Change File" button
 *   showWebSearch        — toggle in InlineQA
 *   showOpenInReader     — show "Open in Reader" icon (KB page usage)
 *   onUpload             — if provided, Upload icon appears in breadcrumb bar
 *   uploadStatus         — shows upload progress strip below breadcrumb
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  IconButton,
  LinearProgress,
  Paper,
  Skeleton,
  Stack,
  Tooltip,
  Typography,
  useTheme,
  alpha,
} from '@mui/material'
import NavigateBeforeIcon     from '@mui/icons-material/NavigateBefore'
import NavigateNextIcon       from '@mui/icons-material/NavigateNext'
import QuestionAnswerIcon     from '@mui/icons-material/QuestionAnswer'
import OpenInNewIcon          from '@mui/icons-material/OpenInNew'
import UploadFileIcon         from '@mui/icons-material/UploadFile'
import BookmarkBorderIcon     from '@mui/icons-material/BookmarkBorder'
import MoreHorizIcon          from '@mui/icons-material/MoreHoriz'
import ChevronRightIcon       from '@mui/icons-material/ChevronRight'
import ArticleOutlinedIcon    from '@mui/icons-material/ArticleOutlined'
import TocIcon                from '@mui/icons-material/Toc'
import ChatBubbleOutlineIcon  from '@mui/icons-material/ChatBubbleOutline'
import AutoAwesomeIcon        from '@mui/icons-material/AutoAwesome'
import MenuBookIcon           from '@mui/icons-material/MenuBook'
import LanguageIcon           from '@mui/icons-material/Language'
import PushPinOutlinedIcon    from '@mui/icons-material/PushPinOutlined'
import TravelExploreIcon      from '@mui/icons-material/TravelExplore'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { readerApi, type ContentBlock } from '../../api/reader.api'
import InlineQA               from '../../pages/KnowledgeBase/components/InlineQA'

// ─── Constants ────────────────────────────────────────────────────────────────

const MONO  = '"IBM Plex Mono", "Geist Mono", monospace'
const SERIF = '"Instrument Serif", Georgia, serif'
const ACCENT = '#F59E0B'  // amber — chapter numbers, drop caps

/**
 * Compute the next page for a keyboard arrow press, clamped to [1, totalPages].
 * Returns `null` when the key is not an arrow or the move would be a no-op
 * (already at an edge). Pure + exported so page navigation is unit-tested
 * without rendering the whole viewer.
 */
export function pageStep(key: string, page: number, totalPages: number): number | null {
  const delta = key === 'ArrowRight' ? 1 : key === 'ArrowLeft' ? -1 : 0
  if (delta === 0) return null
  const next = Math.min(totalPages, Math.max(1, page + delta))
  return next === page ? null : next
}

// PDF/raster pages render on a fixed WHITE sheet (like Acrobat / Preview) so a
// dark slide — carousels, design decks, scans — is shown as a clearly-bounded
// page instead of melting into the dark reading surface. Colours here are
// theme-independent dark-ink-on-white; the embedded page colours render as-is.
const PAGE_INK  = '#1A1410'
const PAGE_RULE = 'rgba(0,0,0,0.10)'
const pdfSheetSx = {
  bgcolor: '#FFFFFF',
  borderRadius: 2,
  px: { xs: 2.5, md: 4 },
  py: { xs: 3, md: 3.5 },
  boxShadow: '0 6px 28px -10px rgba(0,0,0,0.5)',
} as const

const FORMAT_LABEL: Record<string, string> = {
  pdf: 'PDF', docx: 'DOCX', txt: 'TXT', md: 'MD', csv: 'CSV', udf: 'UDF',
}
const FORMAT_COLOR: Record<string, string> = {
  pdf: '#EF4444', docx: '#3B82F6', txt: '#6B7280',
  md: '#8B5CF6',  csv: '#10B981', udf: '#F59E0B',
}

const MUI_HEADING_VARIANTS: Record<number, 'h3' | 'h4' | 'h5' | 'h6'> = {
  1: 'h3', 2: 'h4', 3: 'h4', 4: 'h5', 5: 'h6', 6: 'h6',
}
const HEADING_SIZES: Record<number, number> = {
  1: 32, 2: 26, 3: 22, 4: 20, 5: 18, 6: 16,
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface UploadStatus {
  phase: 'idle' | 'uploading' | 'ingesting' | 'error'
  name?: string
  message?: string
}

interface Props {
  kbId: string
  fileId: string
  fileName: string
  format: string
  /** KB display name shown in breadcrumb (optional) */
  kbName?: string
  /** KB accent colour for the dot in breadcrumb (optional) */
  kbColor?: string
  /** Called by "Change File" button */
  onClose?: () => void
  /** When true, InlineQA shows a web-search toggle */
  showWebSearch?: boolean
  /** When false, hide the "Open in Reader" navigation icon (default true) */
  showOpenInReader?: boolean
  /** Provide to show Upload icon in breadcrumb bar */
  onUpload?: (file: File) => void
  /** Upload/ingestion progress to show below breadcrumb */
  uploadStatus?: UploadStatus
}

type ReaderTab    = 'page' | 'outline'
type ReadingMode  = 'normal' | 'focus' | 'split'

// ─── Block renderers ──────────────────────────────────────────────────────────

export function RenderBlock({
  block,
  dropCap,
  sectionNum,
}: {
  block: ContentBlock
  dropCap?: boolean
  /** Ordinal of this heading among all level-1/2 headings on the page (drives section label) */
  sectionNum?: number
}) {
  const theme  = useTheme()
  const isDark = theme.palette.mode === 'dark'

  switch (block.type) {

    case 'heading': {
      const level   = block.level ?? 2
      const variant = MUI_HEADING_VARIANTS[level] ?? 'h5'
      const fs      = HEADING_SIZES[level] ?? 18
      const isTop   = level <= 2
      const content = String(block.content)
      return (
        <Box sx={{ mt: level <= 2 ? 5 : level <= 3 ? 3.5 : 2.5, mb: 1.5 }}>
          {/* Amber section label — shown above major (h1/h2) headings */}
          {isTop && sectionNum !== undefined && (
            <Typography
              sx={{
                fontFamily: MONO,
                fontSize: 9.5,
                letterSpacing: '0.16em',
                color: ACCENT,
                textTransform: 'uppercase',
                fontWeight: 700,
                mb: 0.75,
              }}
            >
              {sectionNum} · {content.toUpperCase()}
            </Typography>
          )}
          <Typography
            variant={variant}
            sx={{
              fontFamily: SERIF,
              fontWeight: isTop ? 700 : 600,
              mt: 0,
              mb: 0,
              fontSize: fs,
              lineHeight: 1.15,
              letterSpacing: '-0.02em',
              color: isTop ? (isDark ? '#E8DCC8' : '#1A1410') : 'text.primary',
            }}
          >
            {content}
          </Typography>
        </Box>
      )
    }

    case 'paragraph':
      return (
        <Typography
          component="p"
          sx={{
            fontSize: '1.0625rem',
            lineHeight: 1.85,
            color: 'text.primary',
            mb: 2.25,
            letterSpacing: '0.01em',
            // Drop-cap on the first paragraph after a heading
            ...(dropCap && {
              '&::first-letter': {
                fontSize: '3.4em',
                float: 'left',
                lineHeight: 0.72,
                paddingRight: '0.07em',
                paddingTop: '0.05em',
                color: ACCENT,
                fontFamily: SERIF,
                fontWeight: 700,
              },
            }),
          }}
        >
          {String(block.content)}
        </Typography>
      )

    case 'table_row': {
      const cells   = Array.isArray(block.content) ? block.content : [String(block.content)]
      const headers = (block.metadata?.headers as string[] | undefined) ?? []
      return (
        <Paper
          variant="outlined"
          sx={{
            px: 2.5,
            py: 1.25,
            mb: 1,
            display: 'flex',
            flexWrap: 'wrap',
            gap: 1.5,
            borderRadius: 2,
          }}
        >
          {cells.map((cell, i) => (
            <Box key={i} sx={{ display: 'flex', alignItems: 'baseline', gap: 0.75 }}>
              {headers[i] && (
                <Typography
                  variant="caption"
                  sx={{ color: 'text.disabled', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', fontSize: 10 }}
                >
                  {headers[i]}
                </Typography>
              )}
              <Typography sx={{ fontSize: '0.9375rem', color: 'text.primary' }}>{cell}</Typography>
              {i < cells.length - 1 && (
                <Typography sx={{ color: 'text.disabled', ml: 0.5 }}>·</Typography>
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
            fontFamily: MONO,
            fontSize: '0.875rem',
            lineHeight: 1.65,
            bgcolor: 'action.hover',
            border: '1px solid',
            borderColor: 'divider',
            borderRadius: 2,
            p: 2.5,
            overflowX: 'auto',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            mb: 2.5,
            color: 'text.primary',
          }}
        >
          {String(block.content)}
        </Box>
      )

    case 'page': {
      const pageNum = (block.metadata?.page_num as number | undefined) ?? '?'
      const isHtml  = block.metadata?.is_html === true

      // ── Shared page-header strip ───────────────────────────────────────────
      const pageHeader = (
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'space-between',
            mb: 2.5,
            pb: 1,
            borderBottom: `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'}`,
          }}
        >
          <Typography
            sx={{ fontFamily: MONO, fontSize: 9.5, textTransform: 'uppercase', letterSpacing: '0.14em', color: 'text.disabled' }}
          >
            {`${pageNum} · Page`}
          </Typography>
          <Typography
            sx={{ fontFamily: MONO, fontSize: 9.5, textTransform: 'uppercase', letterSpacing: '0.14em', color: 'text.disabled' }}
          >
            KNOVEX READER
          </Typography>
        </Box>
      )

      if (isHtml) {
        // ── HTML rendering (PDF — dict-based, semantic markup) on white sheet ─
        return (
          <Box sx={{ mb: 5 }}>
            {pageHeader}
            <Box sx={pdfSheetSx}>
            <Box
              dangerouslySetInnerHTML={{ __html: String(block.content) }}
              sx={{
                // ── Base text — dark ink on the white sheet ───────────────────
                fontSize: '1.0625rem',
                lineHeight: 1.85,
                color: PAGE_INK,

                // Inherit font + sizes. Strip only inline backgrounds so spans
                // don't paint odd boxes on the sheet; the original PDF text
                // colours render as-is (legible now that the sheet is white).
                '& *': {
                  fontFamily: `${SERIF} !important`,
                  backgroundColor: 'transparent !important',
                  maxWidth: '100%',
                },

                // ── Paragraphs ────────────────────────────────────────────────
                '& p': { mb: 1.75, lineHeight: 1.85, color: PAGE_INK },

                // ── Semantic headings (generated by backend from font-size ratio) ──
                '& h1': {
                  fontSize: '1.8rem', fontWeight: 700, lineHeight: 1.15,
                  mt: 5, mb: 1.5, pb: 0.5,
                  borderBottom: `1px solid ${PAGE_RULE}`, color: PAGE_INK,
                },
                '& h2': { fontSize: '1.4rem', fontWeight: 700, lineHeight: 1.2, mt: 4, mb: 1.25, color: PAGE_INK },
                '& h3': { fontSize: '1.15rem', fontWeight: 600, lineHeight: 1.3, mt: 3, mb: 1, color: PAGE_INK },
                '& h4': { fontSize: '1.0rem', fontWeight: 600, lineHeight: 1.35, mt: 2.5, mb: 0.75, color: PAGE_INK },
                '& span': { lineHeight: 'inherit' },

                // ── Inline marks ──────────────────────────────────────────────
                '& strong, & b': { fontWeight: 700 },
                '& em, & i': { fontStyle: 'italic' },

                // ── Tables ───────────────────────────────────────────────────
                '& table': {
                  width: '100%', borderCollapse: 'collapse', mb: 2.5,
                  fontSize: '0.9rem', tableLayout: 'auto', display: 'block', overflowX: 'auto',
                },
                '& th': {
                  border: `1px solid ${PAGE_RULE}`, px: '10px', py: '6px',
                  textAlign: 'left', fontWeight: 700,
                  bgcolor: 'rgba(0,0,0,0.05)', color: PAGE_INK,
                  verticalAlign: 'top', wordBreak: 'break-word',
                },
                '& td': {
                  border: `1px solid ${PAGE_RULE}`, px: '10px', py: '6px',
                  verticalAlign: 'top', wordBreak: 'break-word', color: PAGE_INK,
                },
                '& tr:nth-of-type(even) td': { bgcolor: 'rgba(0,0,0,0.02)' },

                // ── Images & captions ─────────────────────────────────────────
                '& figure': { my: 3, mx: 0 },
                '& img': {
                  maxWidth: '100%', height: 'auto', display: 'block',
                  borderRadius: '6px', boxShadow: '0 2px 10px rgba(0,0,0,0.12)',
                },
                '& figcaption': { fontSize: '0.8rem', color: 'rgba(0,0,0,0.5)', mt: 0.75, fontStyle: 'italic' },

                // ── Lists ─────────────────────────────────────────────────────
                '& ul, & ol': { pl: 2.5, mb: 1.75 },
                '& li': { mb: 0.6, lineHeight: 1.8 },
                '& p + ul': { mt: 0.25 },
                '& ul + p': { mt: 2.5 },

                // ── Links ─────────────────────────────────────────────────────
                '& a': { color: '#B5803E', textDecoration: 'none', '&:hover': { textDecoration: 'underline' } },
              }}
            />
            </Box>
          </Box>
        )
      }

      // ── Plain-text rendering (fallback / non-HTML PDFs) on white sheet ────
      return (
        <Box sx={{ mb: 5 }}>
          {pageHeader}
          <Box sx={pdfSheetSx}>
            <Typography
              component="p"
              sx={{
                fontSize: '1.0625rem', lineHeight: 1.85, color: PAGE_INK,
                whiteSpace: 'pre-wrap', letterSpacing: '0.01em',
              }}
            >
              {String(block.content)}
            </Typography>
          </Box>
        </Box>
      )
    }

    default:
      return (
        <Typography
          component="p"
          sx={{ fontSize: '1.0625rem', lineHeight: 1.85, color: 'text.secondary', mb: 2 }}
        >
          {String(block.content)}
        </Typography>
      )
  }
}

// ─── Content skeleton ─────────────────────────────────────────────────────────

function ContentSkeleton() {
  return (
    <Box sx={{ pt: 1 }}>
      <Skeleton variant="text" width="55%" height={40} sx={{ mb: 3, borderRadius: 1 }} />
      {Array.from({ length: 6 }).map((_, i) => (
        <Skeleton key={i} variant="text" width={`${75 + (i % 3) * 8}%`} height={22}
          sx={{ mb: 1.25, borderRadius: 1 }} />
      ))}
      <Skeleton variant="text" width="40%" height={32} sx={{ mt: 4, mb: 2, borderRadius: 1 }} />
      {Array.from({ length: 4 }).map((_, i) => (
        <Skeleton key={i} variant="text" width={`${65 + (i % 4) * 9}%`} height={22}
          sx={{ mb: 1.25, borderRadius: 1 }} />
      ))}
    </Box>
  )
}

// ─── Ingest pipeline banner ───────────────────────────────────────────────────
// Replaces the simple spinner+progress bar to match the planned design:
//   ● filename  |  ✅ PARSING PAGES  |  ⟳ EXTRACTING CONCEPTS  |  LINKING SOURCES  |  67%  |  SKIP

const PIPELINE_STAGES = ['PARSING PAGES', 'EXTRACTING CONCEPTS', 'LINKING SOURCES'] as const

function IngestPipeline({
  status,
  onSkip,
}: {
  status: UploadStatus
  onSkip?: () => void
}) {
  const theme  = useTheme()
  const isDark = theme.palette.mode === 'dark'

  const [stageIdx, setStageIdx]   = useState(0)
  const [progress, setProgress]   = useState(0)

  useEffect(() => {
    if (status.phase !== 'ingesting') { setStageIdx(0); setProgress(0); return }
    const iv = setInterval(() => {
      setProgress(p => {
        const next = Math.min(p + Math.random() * 3.5 + 0.5, 99)
        setStageIdx(next < 33 ? 0 : next < 70 ? 1 : 2)
        return next
      })
    }, 900)
    return () => clearInterval(iv)
  }, [status.phase])

  if (status.phase === 'idle') return null
  const isUploading = status.phase === 'uploading'
  const name        = status.name ?? ''

  return (
    <Box
      sx={{
        px: 2,
        flexShrink: 0,
        bgcolor: isDark
          ? alpha('#F59E0B', 0.04)
          : alpha('#F59E0B', 0.03),
        display: 'flex',
        alignItems: 'center',
        gap: 1.5,
        minHeight: 34,
        overflow: 'hidden',
      }}
    >
      {/* Pulsing amber dot */}
      <Box
        sx={{
          width: 6, height: 6, borderRadius: '50%', bgcolor: ACCENT, flexShrink: 0,
          animation: 'fvPulse 1.4s ease-in-out infinite',
          '@keyframes fvPulse': {
            '0%, 100%': { opacity: 1, transform: 'scale(1)' },
            '50%':       { opacity: 0.35, transform: 'scale(0.8)' },
          },
        }}
      />

      {/* Filename */}
      <Typography
        sx={{
          fontFamily: MONO, fontSize: 9.5, letterSpacing: '0.06em',
          color: 'text.secondary', flexShrink: 0,
          maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}
      >
        {isUploading ? `Uploading ${name}` : name}
      </Typography>

      {/* Pipeline stages (only during ingesting) */}
      {!isUploading && (
        <>
          {/* Thin separator */}
          <Box sx={{ width: 1, height: 14, bgcolor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.12)', flexShrink: 0 }} />

          <Stack direction="row" alignItems="center" sx={{ flex: 1, overflow: 'hidden', gap: 1.5 }}>
            {PIPELINE_STAGES.map((label, i) => {
              const done   = i < stageIdx
              const active = i === stageIdx
              return (
                <Stack key={i} direction="row" alignItems="center" spacing={0.5} sx={{ flexShrink: 0 }}>
                  {done ? (
                    <Typography sx={{ fontSize: 9, lineHeight: 1 }}>✅</Typography>
                  ) : active ? (
                    <CircularProgress size={7} thickness={5} sx={{ color: ACCENT }} />
                  ) : (
                    <Box sx={{
                      width: 7, height: 7, borderRadius: '50%',
                      border: '1.5px solid', borderColor: 'text.disabled',
                    }} />
                  )}
                  <Typography
                    sx={{
                      fontFamily: MONO, fontSize: 9.5, letterSpacing: '0.1em', whiteSpace: 'nowrap',
                      color: done ? '#10B981' : active ? ACCENT : 'text.disabled',
                      fontWeight: active ? 700 : 400,
                    }}
                  >
                    {label}
                  </Typography>
                </Stack>
              )
            })}
          </Stack>

          {/* Progress % */}
          <Typography
            sx={{ fontFamily: MONO, fontSize: 10, color: ACCENT, fontWeight: 700, flexShrink: 0, minWidth: 30 }}
          >
            {Math.round(progress)}%
          </Typography>

          {/* Separator + SKIP */}
          <Box sx={{ width: 1, height: 14, bgcolor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.12)', flexShrink: 0 }} />
          <Box
            onClick={onSkip}
            sx={{
              fontFamily: MONO, fontSize: 9.5, letterSpacing: '0.1em', fontWeight: 700,
              color: 'text.disabled', cursor: onSkip ? 'pointer' : 'default', flexShrink: 0,
              '&:hover': { color: onSkip ? 'text.secondary' : 'text.disabled' },
              transition: 'color 0.15s',
            }}
          >
            SKIP
          </Box>
        </>
      )}
    </Box>
  )
}

// ─── Outline tab — headings only ──────────────────────────────────────────────

export function OutlineTab({ blocks }: { blocks: ContentBlock[] }) {
  const headings = blocks.filter(b => b.type === 'heading')
  if (headings.length === 0) {
    return (
      <Box sx={{ py: 6, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1.5 }}>
        <TocIcon sx={{ fontSize: 32, color: 'text.disabled' }} />
        <Typography variant="body2" color="text.disabled" sx={{ fontStyle: 'italic' }}>
          No headings on this page
        </Typography>
      </Box>
    )
  }
  return (
    <Box sx={{ py: 2 }}>
      {headings.map((h, i) => {
        const level = h.level ?? 2
        return (
          <Typography
            key={i}
            variant="body2"
            sx={{
              pl: (level - 1) * 2,
              py: 0.5,
              fontSize: level <= 2 ? '0.9375rem' : '0.875rem',
              fontWeight: level <= 2 ? 600 : 400,
              fontFamily: level <= 2 ? SERIF : undefined,
              color: level <= 2 ? 'text.primary' : 'text.secondary',
              cursor: 'default',
              borderLeft: level <= 2 ? `2px solid ${ACCENT}` : '2px solid transparent',
              '&:hover': { color: 'text.primary' },
              transition: 'color 0.1s',
            }}
          >
            {String(h.content)}
          </Typography>
        )
      })}
    </Box>
  )
}

// ─── Selection toolbar ───────────────────────────────────────────────────────
// Floating pill that appears above any selected text in the reading column.
// Actions: Ask · Simplify · Define · Web · Save · Find in KB

interface SelectionState {
  visible: boolean
  x: number     // viewport x (center of selection)
  y: number     // viewport y (top of selection)
  text: string
}

const SELECTION_ACTIONS = [
  { id: 'ask',       label: 'Ask',        color: '#A78BFA', Icon: ChatBubbleOutlineIcon },
  { id: 'simplify',  label: 'Simplify',   color: '#FCD34D', Icon: AutoAwesomeIcon       },
  { id: 'define',    label: 'Define',     color: '#60A5FA', Icon: MenuBookIcon          },
  { id: 'web',       label: 'Web',        color: '#34D399', Icon: LanguageIcon          },
  { id: 'save',      label: 'Save',       color: '#F87171', Icon: PushPinOutlinedIcon   },
  { id: 'findInKB',  label: 'Find in KB', color: '#94A3B8', Icon: TravelExploreIcon     },
] as const

type SelectionActionId = (typeof SELECTION_ACTIONS)[number]['id']

function SelectionToolbar({
  sel,
  onAction,
}: {
  sel: SelectionState
  onAction: (id: SelectionActionId, text: string) => void
}) {
  if (!sel.visible) return null

  // Clamp so toolbar doesn't go off-screen left/right
  const left  = Math.max(120, Math.min(sel.x, window.innerWidth - 120))
  // If close to top, show below instead
  const above = sel.y > 80
  const top   = above ? sel.y - 8 : sel.y + 24

  return (
    <Box
      sx={{
        position: 'fixed',
        top,
        left,
        transform: above ? 'translate(-50%, -100%)' : 'translate(-50%, 0)',
        zIndex: 9000,
        bgcolor: '#111114',
        borderRadius: '10px',
        boxShadow: '0 8px 40px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.1)',
        display: 'flex',
        alignItems: 'center',
        px: 0.5,
        py: 0.5,
        gap: 0,
        pointerEvents: 'auto',
        animation: 'selFadeIn 0.12s ease-out',
        '@keyframes selFadeIn': {
          from: { opacity: 0, transform: above ? 'translate(-50%, calc(-100% + 8px))' : 'translate(-50%, -6px)' },
          to:   { opacity: 1, transform: above ? 'translate(-50%, -100%)' : 'translate(-50%, 0)' },
        },
      }}
      onMouseDown={e => { e.preventDefault(); e.stopPropagation() }} // keep selection + prevent document mousedown from hiding toolbar
    >
      {SELECTION_ACTIONS.map(({ id, label, color, Icon }, i) => (
        <Box key={id} sx={{ display: 'flex', alignItems: 'center' }}>
          {i > 0 && (
            <Box
              sx={{
                width: 1, height: 18,
                bgcolor: 'rgba(255,255,255,0.08)',
                mx: 0.25, flexShrink: 0,
              }}
            />
          )}
          <Box
            component="button"
            onClick={() => onAction(id, sel.text)}
            sx={{
              display: 'inline-flex', alignItems: 'center', gap: 0.6,
              px: 1.1, py: 0.5,
              borderRadius: '7px',
              cursor: 'pointer',
              border: 'none',
              bgcolor: 'transparent',
              color: 'rgba(255,255,255,0.65)',
              fontSize: '0.69rem',
              fontWeight: 500,
              letterSpacing: '0.02em',
              fontFamily: 'inherit',
              transition: 'all 0.1s',
              whiteSpace: 'nowrap',
              '&:hover': {
                bgcolor: 'rgba(255,255,255,0.09)',
                color: '#fff',
                '& .sel-icon': { color: `${color} !important` },
              },
            }}
          >
            <Box className="sel-icon" component="span"
              sx={{ display: 'flex', color: 'rgba(255,255,255,0.4)', transition: 'color 0.1s' }}>
              <Icon sx={{ fontSize: 12 }} />
            </Box>
            {label}
          </Box>
        </Box>
      ))}
    </Box>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function FileViewer({
  kbId,
  fileId,
  fileName,
  format,
  kbName,
  kbColor,
  onClose,
  showWebSearch = false,
  showOpenInReader = true,
  onUpload,
  uploadStatus,
}: Props) {
  const theme    = useTheme()
  const isDark   = theme.palette.mode === 'dark'
  const navigate = useNavigate()

  const [page, setPage]               = useState(1)
  const [qaOpen, setQaOpen]           = useState(false)
  const [activeTab, setActiveTab]     = useState<ReaderTab>('page')
  const [readingMode, setReadingMode] = useState<ReadingMode>('normal')
  const [qaInitialQ, setQaInitialQ]   = useState('')
  const [selState, setSelState]       = useState<SelectionState>({ visible: false, x: 0, y: 0, text: '' })

  const uploadInputRef       = useRef<HTMLInputElement>(null)
  const readingContainerRef  = useRef<HTMLDivElement>(null)

  // ── Text selection → floating toolbar ───────────────────────────────────────
  useEffect(() => {
    const container = readingContainerRef.current
    if (!container) return

    const onMouseUp = () => {
      setTimeout(() => {
        const sel = window.getSelection()
        if (!sel || sel.isCollapsed) { setSelState(s => ({ ...s, visible: false })); return }
        const text = sel.toString().trim()
        if (text.length < 2) { setSelState(s => ({ ...s, visible: false })); return }
        const range = sel.getRangeAt(0)
        const rect  = range.getBoundingClientRect()
        setSelState({ visible: true, x: rect.left + rect.width / 2, y: rect.top, text })
      }, 10)
    }

    const onMouseDown = (e: MouseEvent) => {
      // Only hide if click is NOT inside the toolbar (handled by toolbar's onMouseDown)
      setSelState(s => ({ ...s, visible: false }))
    }

    container.addEventListener('mouseup', onMouseUp)
    document.addEventListener('mousedown', onMouseDown)
    return () => {
      container.removeEventListener('mouseup', onMouseUp)
      document.removeEventListener('mousedown', onMouseDown)
    }
  }, [])

  // ── Selection toolbar actions ────────────────────────────────────────────────
  const handleSelectionAction = useCallback((id: SelectionActionId, text: string) => {
    setSelState(s => ({ ...s, visible: false }))
    window.getSelection()?.removeAllRanges()

    switch (id) {
      case 'ask':
        setQaInitialQ(text)
        setQaOpen(true)
        break
      case 'simplify':
        setQaInitialQ(`Simplify this passage into plain language:\n\n"${text}"`)
        setQaOpen(true)
        break
      case 'define':
        setQaInitialQ(`Define the term or concept: "${text}"`)
        setQaOpen(true)
        break
      case 'web':
        window.open(`https://www.google.com/search?q=${encodeURIComponent(text)}`, '_blank', 'noopener')
        break
      case 'save':
        // Annotation storage — coming soon; show visual feedback for now
        break
      case 'findInKB':
        setQaInitialQ(`Search the knowledge base for everything related to: "${text}"`)
        setQaOpen(true)
        break
    }
  }, [])

  const qc = useQueryClient()
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['file-content', kbId, fileId, page],
    queryFn:  () => readerApi.getContent(kbId, fileId, page),
    staleTime: 60_000,
  })

  const totalPages = data?.total_pages ?? 1
  const blocks     = data?.content.blocks ?? []

  // ── Prefetch adjacent pages (±1) ───────────────────────────────────────────
  // Pairs with the backend page cache so a page turn is served from memory and
  // feels instant. Only runs once totalPages is known; bounds-checked.
  useEffect(() => {
    if (!data) return
    const neighbours = [page - 1, page + 1].filter(p => p >= 1 && p <= totalPages && p !== page)
    for (const p of neighbours) {
      qc.prefetchQuery({
        queryKey: ['file-content', kbId, fileId, p],
        queryFn:  () => readerApi.getContent(kbId, fileId, p),
        staleTime: 60_000,
      })
    }
  }, [data, page, totalPages, kbId, fileId, qc])

  // ── Keyboard page turns (← / →) ─────────────────────────────────────────────
  // Mirrors the design lab. Ignored while typing in a field so it never hijacks
  // the Q&A composer; paired with the ±1 prefetch above, turns feel instant.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (t && /^(INPUT|TEXTAREA)$/.test(t.tagName)) return
      if (t && t.isContentEditable) return
      const next = pageStep(e.key, page, totalPages)
      if (next !== null) { e.preventDefault(); setPage(next) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [page, totalPages])

  // Split mode: auto-open Q&A
  const effectiveQaOpen = qaOpen || readingMode === 'split'
  const focusMode       = readingMode === 'focus'

  // Paper colours — cream in light mode, slightly warm dark in dark mode
  const paperBg = isDark
    ? alpha(theme.palette.background.paper, 0.75)
    : '#FAFAF7'
  const deskBg = isDark
    ? alpha('#000', 0.3)
    : alpha(theme.palette.divider, 0.22)

  // Drop-cap: first paragraph that follows a heading (or first paragraph of the doc)
  const dropCapIndex = (() => {
    let firstParagraph = -1
    for (let i = 0; i < blocks.length; i++) {
      if (blocks[i].type === 'paragraph') {
        if (i === 0 || blocks[i - 1]?.type === 'heading') {
          return i
        }
        if (firstParagraph === -1) firstParagraph = i
      }
    }
    return firstParagraph
  })()

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
      {/* ── Row 1: Breadcrumb bar ─────────────────────────────────────────── */}
      {!focusMode && (
        <Stack
          direction="row"
          alignItems="center"
          spacing={0.5}
          sx={{
            px: 2,
            py: 0.75,
            flexShrink: 0,
            minHeight: 44,
            bgcolor: isDark
              ? alpha(theme.palette.background.paper, 0.6)
              : alpha(theme.palette.background.paper, 0.95),
          }}
        >
          {/* KB name + dot */}
          {kbName && (
            <>
              <Box
                sx={{
                  width: 8, height: 8, borderRadius: '3px',
                  bgcolor: kbColor || 'primary.main', flexShrink: 0,
                }}
              />
              <Typography
                variant="caption"
                sx={{ color: 'text.secondary', fontSize: '0.8125rem', fontWeight: 500, whiteSpace: 'nowrap' }}
              >
                {kbName}
              </Typography>
              <ChevronRightIcon sx={{ fontSize: 14, color: 'text.disabled', flexShrink: 0 }} />
            </>
          )}

          {/* Format badge + filename — wrapped in a subtle format-colored pill */}
          <Box
            sx={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 0.75,
              px: 1,
              py: 0.35,
              borderRadius: '6px',
              bgcolor: alpha(FORMAT_COLOR[format] ?? '#6B7280', isDark ? 0.14 : 0.09),
              border: `1px solid ${alpha(FORMAT_COLOR[format] ?? '#6B7280', isDark ? 0.25 : 0.18)}`,
              flex: 1,
              minWidth: 0,
              maxWidth: 460,
            }}
          >
            {/* Format badge */}
            <Box
              component="span"
              sx={{
                display: 'inline-flex', alignItems: 'center',
                bgcolor: FORMAT_COLOR[format] ?? '#6B7280',
                color: '#fff',
                borderRadius: '3px',
                px: 0.6,
                py: 0.1,
                fontSize: 9,
                fontFamily: MONO,
                fontWeight: 700,
                letterSpacing: '0.06em',
                flexShrink: 0,
              }}
            >
              {FORMAT_LABEL[format] ?? format.toUpperCase()}
            </Box>

            {/* Filename */}
            <Typography
              variant="subtitle2"
              noWrap
              sx={{
                fontSize: '0.8125rem',
                fontWeight: 500,
                color: 'text.primary',
                minWidth: 0,
              }}
            >
              {fileName}
            </Typography>
          </Box>

          {/* Actions */}
          <Stack direction="row" alignItems="center" spacing={0.25} sx={{ flexShrink: 0 }}>

            {/* Upload (only when parent provides handler) */}
            {onUpload && (
              <>
                <Tooltip title="Upload a new file">
                  <IconButton size="small" onClick={() => uploadInputRef.current?.click()}>
                    <UploadFileIcon sx={{ fontSize: 16 }} />
                  </IconButton>
                </Tooltip>
                <input
                  ref={uploadInputRef}
                  type="file"
                  accept=".pdf,.docx,.txt,.md,.csv,.udf"
                  style={{ display: 'none' }}
                  onChange={e => {
                    const f = e.target.files?.[0]
                    if (f) onUpload(f)
                    e.target.value = ''
                  }}
                />
              </>
            )}

            {/* Q&A toggle */}
            <Tooltip title={effectiveQaOpen ? 'Close Q&A' : 'Ask about this file'}>
              <IconButton
                size="small"
                color={effectiveQaOpen ? 'primary' : 'default'}
                onClick={() => setQaOpen(o => !o)}
              >
                <QuestionAnswerIcon sx={{ fontSize: 16 }} />
              </IconButton>
            </Tooltip>

            {/* Open in Reader (used from KB page) */}
            {showOpenInReader && (
              <Tooltip title="Open in Reader (full focus mode)">
                <IconButton size="small" onClick={() => navigate(`/reader?kb=${kbId}&file=${fileId}`)}>
                  <OpenInNewIcon sx={{ fontSize: 16 }} />
                </IconButton>
              </Tooltip>
            )}

            {/* Change file / close */}
            {onClose && (
              <Button
                size="small"
                variant="outlined"
                onClick={onClose}
                sx={{
                  ml: 0.5,
                  height: 26,
                  px: 1.25,
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  fontFamily: MONO,
                  letterSpacing: '0.04em',
                  textTransform: 'uppercase',
                  borderRadius: 1,
                  borderColor: alpha(theme.palette.divider, 0.8),
                  color: 'text.secondary',
                  '&:hover': { borderColor: 'primary.main', color: 'primary.main' },
                }}
              >
                Change File
              </Button>
            )}
          </Stack>
        </Stack>
      )}

      {/* Ingest pipeline banner */}
      {uploadStatus && uploadStatus.phase === 'error' && (
        <Box sx={{ px: 2, py: 0.75, borderBottom: '1px solid', borderColor: 'divider', flexShrink: 0 }}>
          <Alert severity="error" sx={{ py: 0 }}>
            <Typography variant="caption">{uploadStatus.message ?? 'Upload failed'}</Typography>
          </Alert>
        </Box>
      )}
      {uploadStatus && (uploadStatus.phase === 'uploading' || uploadStatus.phase === 'ingesting') && (
        <IngestPipeline status={uploadStatus} />
      )}

      {/* ── Row 2: Meta bar ───────────────────────────────────────────────── */}
      {!focusMode && (
        <Stack
          direction="row"
          alignItems="center"
          spacing={1}
          sx={{
            px: 2,
            py: 0.5,
            borderBottom: '1px solid',
            borderColor: 'divider',
            flexShrink: 0,
            minHeight: 36,
            bgcolor: isDark
              ? alpha(theme.palette.background.paper, 0.4)
              : alpha(theme.palette.background.paper, 0.7),
          }}
        >
          {/* Page indicator — "{N} pages · p. {M}" */}
          <Typography
            variant="caption"
            sx={{ fontFamily: MONO, fontSize: '0.6875rem', color: 'text.secondary', whiteSpace: 'nowrap' }}
          >
            {isLoading
              ? 'Loading…'
              : `${totalPages} page${totalPages !== 1 ? 's' : ''} · p. ${page}`}
          </Typography>

          <Divider orientation="vertical" flexItem sx={{ mx: 0.5, opacity: 0.5 }} />

          {/* Tabs: Page | Outline */}
          <Stack direction="row" spacing={0} sx={{ flex: 1 }}>
            {(['page', 'outline'] as ReaderTab[]).map(tab => (
              <Box
                key={tab}
                onClick={() => setActiveTab(tab)}
                sx={{
                  px: 1.5,
                  py: 0.5,
                  cursor: 'pointer',
                  borderBottom: activeTab === tab ? `2px solid ${theme.palette.primary.main}` : '2px solid transparent',
                  color: activeTab === tab ? 'primary.main' : 'text.disabled',
                  fontSize: '0.75rem',
                  fontWeight: activeTab === tab ? 700 : 400,
                  textTransform: 'capitalize',
                  letterSpacing: '0.02em',
                  transition: 'color 0.1s, border-color 0.1s',
                  '&:hover': { color: activeTab === tab ? 'primary.main' : 'text.secondary' },
                  userSelect: 'none',
                }}
              >
                {tab === 'page' ? 'Page' : 'Outline'}
              </Box>
            ))}
          </Stack>

          {/* Bookmark */}
          <Tooltip title="Bookmark (coming soon)">
            <IconButton size="small" sx={{ opacity: 0.5 }}>
              <BookmarkBorderIcon sx={{ fontSize: 15 }} />
            </IconButton>
          </Tooltip>

          <Tooltip title="More options — coming soon">
            <span>
              <IconButton size="small" disabled sx={{ opacity: 0.35 }}>
                <MoreHorizIcon sx={{ fontSize: 15 }} />
              </IconButton>
            </span>
          </Tooltip>
        </Stack>
      )}

      {/* ── Body ─────────────────────────────────────────────────────────── */}
      <Box sx={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

        {/* Reading column */}
        <Box ref={readingContainerRef} sx={{ flex: 1, overflow: 'auto', bgcolor: deskBg }}>
          <Box
            sx={{
              maxWidth: 720,
              mx: 'auto',
              bgcolor: paperBg,
              minHeight: '100%',
              px: { xs: 3, sm: 5, md: 7 },
              pt: focusMode ? 8 : 5,
              pb: 12,
              boxShadow: isDark
                ? '0 0 0 1px rgba(255,255,255,0.04), 0 2px 32px rgba(0,0,0,0.35)'
                : '0 0 0 1px rgba(0,0,0,0.06), 0 2px 32px rgba(0,0,0,0.07)',
            }}
          >
            {/* Focus mode: show filename as page header */}
            {focusMode && (
              <Box sx={{ mb: 5, pb: 2, borderBottom: `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'}` }}>
                <Typography
                  sx={{ fontFamily: MONO, fontSize: 9.5, textTransform: 'uppercase', letterSpacing: '0.14em', color: 'text.disabled', mb: 0.5 }}
                >
                  {FORMAT_LABEL[format] ?? format.toUpperCase()}
                </Typography>
                <Typography sx={{ fontFamily: SERIF, fontSize: 22, fontWeight: 700, color: isDark ? '#E8DCC8' : '#1A1410', lineHeight: 1.2 }}>
                  {fileName.replace(/\.[^/.]+$/, '')}
                </Typography>
              </Box>
            )}

            {activeTab === 'outline' ? (
              <OutlineTab blocks={blocks} />
            ) : isLoading ? (
              <ContentSkeleton />
            ) : isError ? (
              <Alert
                severity="error"
                action={<Button color="inherit" size="small" onClick={() => refetch()}>Retry</Button>}
                sx={{ mt: 2 }}
              >
                {(error as Error)?.message ?? 'Failed to load content'}
              </Alert>
            ) : blocks.length === 0 ? (
              <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 200, gap: 1.5 }}>
                <ArticleOutlinedIcon sx={{ fontSize: 32, color: 'text.disabled' }} />
                <Typography color="text.disabled" sx={{ fontStyle: 'italic' }}>
                  (No content to display)
                </Typography>
              </Box>
            ) : (
              // Track section number so major headings get the amber section label
              (() => {
                let headingCount = 0
                return blocks.map((block, i) => {
                  let sectionNum: number | undefined
                  if (block.type === 'heading' && (block.level ?? 2) <= 2) {
                    headingCount++
                    sectionNum = headingCount
                  }
                  return (
                    <RenderBlock
                      key={i}
                      block={block}
                      dropCap={i === dropCapIndex}
                      sectionNum={sectionNum}
                    />
                  )
                })
              })()
            )}
          </Box>
        </Box>

        {/* Q&A sidebar */}
        {effectiveQaOpen && (
          <InlineQA
            kbId={kbId}
            fileId={fileId}
            fileName={fileName}
            onClose={() => {
              setQaOpen(false)
              if (readingMode === 'split') setReadingMode('normal')
            }}
            showWebSearch={showWebSearch}
            initialQuestion={qaInitialQ}
          />
        )}
      </Box>

      {/* ── Selection toolbar (fixed, floats above selected text) ────────────── */}
      <SelectionToolbar sel={selState} onAction={handleSelectionAction} />

      {/* ── Row 4: Bottom bar ─────────────────────────────────────────────── */}
      <Stack
        direction="row"
        alignItems="center"
        sx={{
          px: 2,
          height: 40,
          flexShrink: 0,
          bgcolor: isDark
            ? alpha(theme.palette.background.paper, 0.6)
            : alpha(theme.palette.background.paper, 0.9),
        }}
      >
        {/* ── Reading modes ── */}
        <Stack direction="row" spacing={0.25}>
          {(
            [
              { id: 'focus' as ReadingMode,  label: 'Focus',  tip: 'Focus mode — hide toolbars' },
              { id: 'split' as ReadingMode,  label: 'Split',  tip: 'Split mode — reading + Q&A side by side' },
            ] as const
          ).map(({ id, label, tip }) => (
            <Tooltip key={id} title={tip}>
              <Box
                onClick={() => setReadingMode(m => m === id ? 'normal' : id)}
                sx={{
                  px: 1.25,
                  py: 0.3,
                  borderRadius: 1,
                  cursor: 'pointer',
                  fontSize: '0.6875rem',
                  fontFamily: MONO,
                  fontWeight: 600,
                  letterSpacing: '0.04em',
                  userSelect: 'none',
                  color: readingMode === id ? 'primary.main' : 'text.disabled',
                  bgcolor: readingMode === id ? alpha(theme.palette.primary.main, 0.1) : 'transparent',
                  '&:hover': { color: 'primary.main', bgcolor: alpha(theme.palette.primary.main, 0.08) },
                  transition: 'all 0.15s',
                }}
              >
                {label}
              </Box>
            </Tooltip>
          ))}
          {/* Speed — same visual weight as Focus/Split, tooltip signals it's upcoming */}
          <Tooltip title="Speed read mode — coming soon">
            <Box
              sx={{
                px: 1.25,
                py: 0.3,
                borderRadius: 1,
                cursor: 'pointer',
                fontSize: '0.6875rem',
                fontFamily: MONO,
                fontWeight: 600,
                letterSpacing: '0.04em',
                userSelect: 'none',
                color: 'text.disabled',
                bgcolor: 'transparent',
                '&:hover': { color: 'text.secondary', bgcolor: alpha(theme.palette.action.hover, 0.6) },
                transition: 'all 0.15s',
              }}
            >
              Speed
            </Box>
          </Tooltip>
        </Stack>

        <Box sx={{ flex: 1 }} />

        {/* ── Annotation tag buttons ── */}
        <Stack direction="row" spacing={0.5} sx={{ mr: 2 }}>
          {(
            [
              { label: 'CONCEPT',  color: '#F59E0B' },
              { label: 'DEFN',     color: '#10B981' },
              { label: 'QUESTION', color: '#EF4444' },
            ] as const
          ).map(({ label, color }) => (
            <Tooltip key={label} title={`Tag selection as ${label} (coming soon)`}>
              <Box
                sx={{
                  display: 'flex', alignItems: 'center', gap: 0.5,
                  px: 1, py: 0.3, borderRadius: 1, cursor: 'default',
                  opacity: 0.55,
                  '&:hover': { opacity: 0.8 },
                  transition: 'opacity 0.15s',
                }}
              >
                <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: color, flexShrink: 0 }} />
                <Typography sx={{ fontSize: '0.6rem', fontFamily: MONO, fontWeight: 700, letterSpacing: '0.06em', color: 'text.secondary' }}>
                  {label}
                </Typography>
              </Box>
            </Tooltip>
          ))}
        </Stack>

        <Divider orientation="vertical" flexItem sx={{ opacity: 0.5, mr: 1 }} />

        {/* ── Page navigation ── */}
        <Stack direction="row" alignItems="center" spacing={0.25}>
          <Tooltip title="Previous page">
            <span>
              <IconButton
                size="small"
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page <= 1 || isLoading || totalPages <= 1}
              >
                <NavigateBeforeIcon sx={{ fontSize: 16 }} />
              </IconButton>
            </span>
          </Tooltip>
          <Typography
            variant="caption"
            sx={{
              fontFamily: MONO,
              fontSize: '0.75rem',
              color: totalPages > 1 ? 'text.secondary' : 'text.disabled',
              minWidth: 48,
              textAlign: 'center',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {page} / {totalPages}
          </Typography>
          <Tooltip title="Next page">
            <span>
              <IconButton
                size="small"
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages || isLoading || totalPages <= 1}
              >
                <NavigateNextIcon sx={{ fontSize: 16 }} />
              </IconButton>
            </span>
          </Tooltip>
        </Stack>
      </Stack>
    </Box>
  )
}
