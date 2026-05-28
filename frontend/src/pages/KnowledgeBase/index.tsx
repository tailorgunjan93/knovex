/**
 * KnowledgeBase / Library Page — matches KnovexUI reference exactly
 */

import { useState, useEffect } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Grid,
  IconButton,
  Tooltip,
  Typography,
  useTheme,
  alpha,
} from '@mui/material'
import AddIcon          from '@mui/icons-material/Add'
import FileUploadIcon   from '@mui/icons-material/FileUpload'
import GridViewIcon     from '@mui/icons-material/GridView'
import CloseIcon        from '@mui/icons-material/Close'
import RefreshIcon      from '@mui/icons-material/Refresh'
import { useMutation, useQuery, useQueries, useQueryClient } from '@tanstack/react-query'
import { kbApi } from '../../api/kb.api'
import CreateKBDialog from './components/CreateKBDialog'
import KBCard         from './components/KBCard'
import KBDetail       from './components/KBDetail'
import ScreenHeader   from '@/components/Layout/ScreenHeader'

const MONO  = '"IBM Plex Mono", "Geist Mono", monospace'
const SERIF = '"Instrument Serif", Georgia, serif'

// ─── Daily Spark ──────────────────────────────────────────────────────────────

const SPARKS = [
  { q: 'An investment in knowledge pays the best interest.',            a: 'Benjamin Franklin' },
  { q: 'The more that you read, the more things you will know.',        a: 'Dr. Seuss' },
  { q: 'Curiosity is the wick in the candle of learning.',             a: 'William Arthur Ward' },
  { q: 'Live as if you were to die tomorrow. Learn as if you were to live forever.', a: 'Gandhi' },
  { q: 'The beautiful thing about learning is that nobody can take it away from you.', a: 'B.B. King' },
  { q: 'Knowledge is power.',                                           a: 'Francis Bacon' },
  { q: 'Tell me and I forget. Teach me and I remember. Involve me and I learn.', a: 'Benjamin Franklin' },
]

function DailySpark({ onDismiss }: { onDismiss: () => void }) {
  const theme   = useTheme()
  const isDark  = theme.palette.mode === 'dark'
  const spark   = SPARKS[new Date().getDay() % SPARKS.length]
  const accent  = theme.palette.primary.main

  return (
    <Box
      sx={{
        display:      'flex',
        alignItems:   'stretch',
        border:       `1px solid ${alpha(accent, 0.28)}`,
        borderRadius: '10px',
        overflow:     'hidden',
        position:     'relative',
        mt:           2,
      }}
    >
      {/* Left amber stripe */}
      <Box sx={{ width: 3, bgcolor: accent, flexShrink: 0 }} />

      {/* Left label section */}
      <Box
        sx={{
          display:        'flex',
          flexDirection:  'column',
          alignItems:     'center',
          justifyContent: 'center',
          gap:             0.5,
          px:             2,
          py:             1.5,
          bgcolor:        isDark ? 'rgba(255,255,255,0.025)' : 'rgba(0,0,0,0.025)',
          borderRight:    `1px solid ${alpha(accent, 0.15)}`,
          minWidth:       110,
        }}
      >
        <Typography sx={{ fontSize: 16, lineHeight: 1, color: accent }}>✦</Typography>
        <Typography
          sx={{
            fontFamily:    MONO,
            fontSize:       8.5,
            textTransform: 'uppercase',
            letterSpacing: '0.14em',
            color:         alpha(accent, 0.85),
            textAlign:     'center',
            lineHeight:    1.3,
          }}
        >
          Daily{'\n'}Spark
        </Typography>
      </Box>

      {/* Quote body */}
      <Box sx={{ flex: 1, px: 2.5, py: 1.5 }}>
        <Typography
          sx={{
            fontFamily: SERIF,
            fontSize:    15,
            fontStyle:  'italic',
            color:      'text.primary',
            lineHeight: 1.45,
            mb:         0.5,
          }}
        >
          {spark.q}
        </Typography>
        <Typography sx={{ fontSize: 11.5, color: 'text.disabled' }}>
          — {spark.a} · Day {new Date().getDay() + 1} of your streak 🔥
        </Typography>
      </Box>

      {/* Dismiss */}
      <IconButton
        size="small"
        onClick={onDismiss}
        sx={{
          position: 'absolute', top: 6, right: 6,
          width: 20, height: 20,
          opacity: 0.35, '&:hover': { opacity: 1 },
        }}
      >
        <CloseIcon sx={{ fontSize: 12 }} />
      </IconButton>
    </Box>
  )
}

// ─── Knovex Noticed band ──────────────────────────────────────────────────────

function KnovexNoticed({ onDismiss, onQueueReview }: { onDismiss: () => void; onQueueReview: () => void }) {
  const theme  = useTheme()
  const isDark = theme.palette.mode === 'dark'
  const accent = theme.palette.primary.main

  return (
    <Box
      sx={{
        display:      'flex',
        alignItems:   'center',
        gap:          2,
        mt:           1.5,
        px:           2,
        py:           1.5,
        bgcolor:      isDark ? '#1A1A1F' : alpha(theme.palette.divider, 0.5),
        border:       `1px solid ${isDark ? '#26252B' : theme.palette.divider}`,
        borderRadius: '10px',
      }}
    >
      {/* Sparkle icon */}
      <Box
        sx={{
          width:          34,
          height:         34,
          borderRadius:   '8px',
          bgcolor:        alpha(accent, 0.14),
          border:         `1px solid ${alpha(accent, 0.28)}`,
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'center',
          flexShrink:     0,
          fontSize:       17,
        }}
      >
        ✦
      </Box>

      <Box flex={1} minWidth={0}>
        <Typography
          sx={{
            fontFamily:    MONO,
            fontSize:       9.5,
            textTransform: 'uppercase',
            letterSpacing: '0.12em',
            color:         alpha(accent, 0.8),
            mb:             0.4,
          }}
        >
          Knovex Noticed
        </Typography>
        <Typography sx={{ fontSize: 13, color: 'text.secondary', lineHeight: 1.5 }}>
          Your knowledge base is growing. Keep adding files and Knovex will surface connections across your collections automatically.
        </Typography>
      </Box>

      <Box sx={{ display: 'flex', gap: 1, flexShrink: 0 }}>
        <Button size="small" variant="outlined" onClick={onDismiss}
          sx={{ fontSize: 11, height: 28, textTransform: 'none' }}>
          Not now
        </Button>
        <Button size="small" variant="contained"
          onClick={onQueueReview}
          sx={{ fontSize: 11, height: 28, textTransform: 'none' }}>
          Queue review →
        </Button>
      </Box>
    </Box>
  )
}

// ─── Recent Activity table ────────────────────────────────────────────────────

function RecentActivity({ kbs }: { kbs: any[] }) {
  const theme  = useTheme()
  const isDark = theme.palette.mode === 'dark'
  const accent = theme.palette.primary.main
  const qc     = useQueryClient()

  // Fetch files for the most-recent KBs (up to 4)
  const topKbs = kbs.slice(0, 4)
  const fileQueries = useQueries({
    queries: topKbs.map(kb => ({
      queryKey:  ['kb-files-recent', kb.id],
      queryFn:   () => kbApi.listFiles(kb.id),
      staleTime: 30_000,
    })),
  })

  // Build recent files list from all fetched KBs (flat, sorted by added_at desc)
  const recentFiles = fileQueries
    .flatMap((q, i) => (q.data || []).map((f: any) => ({ ...f, kbName: topKbs[i].name })))
    .sort((a, b) => new Date(b.added_at).getTime() - new Date(a.added_at).getTime())
    .slice(0, 6)

  if (recentFiles.length === 0) return null

  const statusColor: Record<string, string> = {
    ready:     '#10B981',
    pending:   '#F59E0B',
    ingesting: '#3B82F6',
    error:     '#EF4444',
  }

  const extLabel = (name: string) => {
    const ext = name.split('.').pop()?.toUpperCase() || 'FILE'
    return ext.length > 4 ? ext.slice(0, 4) : ext
  }

  return (
    <Box sx={{ mt: 3, pb: 3 }}>
      {/* Section header */}
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 1.5 }}>
        <Typography sx={{ fontFamily: MONO, fontSize: 11, fontWeight: 600, color: 'text.secondary', mr: 0.75 }}>
          Recent activity
        </Typography>
        <Typography sx={{ fontFamily: MONO, fontSize: 11, color: 'text.disabled', flex: 1 }}>
          {recentFiles.length}
        </Typography>
        <Button
          size="small"
          variant="text"
          startIcon={<RefreshIcon sx={{ fontSize: 12 }} />}
          onClick={() => qc.invalidateQueries({ queryKey: ['kb-files-recent'] })}
          sx={{ fontSize: 11, color: 'text.disabled', textTransform: 'none', minWidth: 0 }}
        >
          Refresh
        </Button>
      </Box>

      {/* Table */}
      <Box
        sx={{
          border:       `1px solid ${theme.palette.divider}`,
          borderRadius: '12px',
          overflow:     'hidden',
          bgcolor:      'background.paper',
        }}
      >
        {/* Header row */}
        <Box
          sx={{
            display:             'grid',
            gridTemplateColumns: '40px 1fr 140px 100px 90px 28px',
            gap:                 '14px',
            alignItems:          'center',
            px:                  2,
            py:                  1,
            bgcolor:             isDark ? alpha(theme.palette.background.paper, 0.6) : alpha(theme.palette.divider, 0.4),
            fontFamily:          MONO,
            fontSize:            9.5,
            color:               'text.disabled',
            textTransform:       'uppercase',
            letterSpacing:       '0.1em',
          }}
        >
          <Box />
          <Box>Document</Box>
          <Box>Collection</Box>
          <Box>Status</Box>
          <Box sx={{ textAlign: 'right' }}>Updated</Box>
          <Box />
        </Box>

        {/* Data rows */}
        {recentFiles.map((file, i) => (
          <Box
            key={i}
            sx={{
              display:             'grid',
              gridTemplateColumns: '40px 1fr 140px 100px 90px 28px',
              gap:                 '14px',
              alignItems:          'center',
              px:                  2,
              py:                  1.25,
              borderTop:           `1px solid ${theme.palette.divider}`,
              cursor:              'pointer',
              transition:          'background 80ms',
              '&:hover':           { bgcolor: isDark ? alpha(theme.palette.background.paper, 0.6) : alpha(theme.palette.divider, 0.4) },
            }}
          >
            {/* File type badge */}
            <Box
              sx={{
                width:          36,
                height:         28,
                bgcolor:        isDark ? alpha(theme.palette.background.paper, 0.5) : alpha(theme.palette.divider, 0.5),
                border:         `1px solid ${theme.palette.divider}`,
                borderRadius:   '6px',
                display:        'flex',
                alignItems:     'center',
                justifyContent: 'center',
                fontFamily:     MONO,
                fontSize:       8.5,
                fontWeight:     600,
                color:          'text.disabled',
                letterSpacing:  '0.04em',
              }}
            >
              {extLabel(file.name)}
            </Box>

            {/* Title + snippet */}
            <Box minWidth={0}>
              <Typography sx={{ fontSize: 13, fontWeight: 600, color: 'text.primary', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {file.name}
              </Typography>
              <Typography sx={{ fontSize: 11, color: 'text.disabled', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {file.path}
              </Typography>
            </Box>

            {/* Collection */}
            <Typography sx={{ fontSize: 12, color: 'text.secondary', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {file.kbName}
            </Typography>

            {/* Status chip */}
            <Box
              sx={{
                display:        'inline-flex',
                alignItems:     'center',
                gap:             0.5,
                px:             1,
                py:             0.2,
                borderRadius:   '20px',
                border:         `1px solid ${alpha(statusColor[file.status] || '#999', 0.4)}`,
                bgcolor:        alpha(statusColor[file.status] || '#999', 0.1),
                width:          'fit-content',
              }}
            >
              <Box sx={{ width: 5, height: 5, borderRadius: '50%', bgcolor: statusColor[file.status] || '#999', flexShrink: 0 }} />
              <Typography sx={{ fontFamily: MONO, fontSize: 10, color: statusColor[file.status] || '#999', fontWeight: 500 }}>
                {file.status}
              </Typography>
            </Box>

            {/* Updated */}
            <Typography sx={{ fontFamily: MONO, fontSize: 11, color: 'text.disabled', textAlign: 'right' }}>
              {new Date(file.created_at || Date.now()).toLocaleDateString()}
            </Typography>

            {/* placeholder to keep grid alignment */}
            <Box />
          </Box>
        ))}
      </Box>
    </Box>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function KnowledgeBasePage() {
  const theme        = useTheme()
  const isDark       = theme.palette.mode === 'dark'
  const queryClient  = useQueryClient()
  const navigate     = useNavigate()
  const accent       = theme.palette.primary.main

  const [selectedKBId, setSelectedKBId]     = useState<string | null>(null)
  const [deepFileId,   setDeepFileId]       = useState<string | null>(null)
  const [createOpen, setCreateOpen]         = useState(false)
  const [filter, setFilter]                 = useState<'all' | 'mastered' | 'review' | 'new'>('all')
  const [sparkDismissed, setSparkDismissed] = useState(false)
  const [noticeDismissed, setNoticeDismissed] = useState(false)

  // Deep-link from chat citation OR sidebar pinned KB: /kb?kb_id=xxx&file_id=yyy
  // Watch kb_id specifically so re-navigating to /kb?kb_id=yyy while already on /kb works.
  const [searchParams, setSearchParams] = useSearchParams()
  const paramKbId   = searchParams.get('kb_id')
  const paramFileId = searchParams.get('file_id')
  useEffect(() => {
    if (paramKbId) {
      setSelectedKBId(paramKbId)
      setDeepFileId(paramFileId)
      setSearchParams({}, { replace: true })   // clean URL after consuming params
    }
  }, [paramKbId])  // eslint-disable-line react-hooks/exhaustive-deps

  const { data: kbs = [], isLoading, error } = useQuery({
    queryKey:        ['kbs'],
    queryFn:          kbApi.list,
    refetchInterval: 5000,
  })

  const createMutation = useMutation({
    mutationFn: kbApi.create,
    onSuccess:  () => queryClient.invalidateQueries({ queryKey: ['kbs'] }),
  })

  if (selectedKBId) {
    return (
      <KBDetail
        kbId={selectedKBId}
        initialFileId={deepFileId ?? undefined}
        onBack={() => { setSelectedKBId(null); setDeepFileId(null) }}
      />
    )
  }

  // Deterministic progress per KB id (mirrors KBCard.tsx)
  const kbProg = (id: string) => {
    let h = 0
    for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) & 0x7fffffff
    return 10 + (h % 80)
  }

  const masteredKBs = kbs.filter(kb => kb.stats.file_count > 0 && kbProg(kb.id) >= 65)
  const reviewKBs   = kbs.filter(kb => kb.stats.file_count > 0 && kbProg(kb.id) < 65)
  const newKBs      = kbs.filter(kb => kb.stats.file_count === 0)
  const filtered    =
    filter === 'mastered' ? masteredKBs :
    filter === 'review'   ? reviewKBs   :
    filter === 'new'      ? newKBs      : kbs

  const filterPills = [
    { key: 'all',      label: 'All',      count: kbs.length },
    { key: 'mastered', label: 'Mastered', count: masteredKBs.length },
    { key: 'review',   label: 'Review',   count: reviewKBs.length },
    { key: 'new',      label: 'New',      count: newKBs.length },
  ] as const

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

      {/* Screen header */}
      <ScreenHeader
        eyebrow={`LIBRARY · ${kbs.length} COLLECTION${kbs.length !== 1 ? 'S' : ''}`}
        title="Your"
        emphasis="knowledge"
        titleSuffix="base"
        sub="Everything you've captured, organized into collections. Knovex links concepts across documents and surfaces what's ripe for review."
        actions={
          <>
            <Tooltip title="Bulk import — coming soon" placement="bottom">
              <span>
                <Button variant="outlined" startIcon={<FileUploadIcon sx={{ fontSize: 14 }} />} size="small"
                  disabled
                  sx={{ fontSize: 12, height: 32, textTransform: 'none' }}>
                  Import
                </Button>
              </span>
            </Tooltip>
            <Button variant="contained" startIcon={<AddIcon sx={{ fontSize: 14 }} />} size="small"
              onClick={() => setCreateOpen(true)}
              sx={{ fontSize: 12, height: 32, textTransform: 'none' }}>
              New collection
            </Button>
          </>
        }
      />

      {/* Scrollable body */}
      <Box flex={1} overflow="auto" sx={{ px: 3.5 }}>

        {/* Daily Spark */}
        {!sparkDismissed && <DailySpark onDismiss={() => setSparkDismissed(true)} />}

        {/* Knovex Noticed */}
        {!noticeDismissed && (
          <KnovexNoticed
            onDismiss={() => setNoticeDismissed(true)}
            onQueueReview={() => navigate('/learn')}
          />
        )}

        {/* Filter pills + view toggles */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mt: 2 }}>
          {filterPills.map(pill => {
            const active = filter === pill.key
            return (
              <Box
                key={pill.key}
                onClick={() => setFilter(pill.key)}
                sx={{
                  display:      'flex',
                  alignItems:   'center',
                  gap:          0.5,
                  px:           1.25,
                  py:           0.4,
                  borderRadius: '20px',
                  border:       `1px solid ${active ? alpha(accent, 0.6) : isDark ? '#26252B' : theme.palette.divider}`,
                  bgcolor:      active ? accent : 'transparent',
                  cursor:       'pointer',
                  transition:   'all 100ms',
                  '&:hover':    { borderColor: alpha(accent, 0.5), bgcolor: active ? accent : alpha(accent, 0.08) },
                }}
              >
                <Typography sx={{ fontSize: 12, fontWeight: active ? 600 : 450, color: active ? '#1A140C' : 'text.secondary' }}>
                  {pill.label}
                </Typography>
                <Typography sx={{ fontFamily: MONO, fontSize: 10.5, fontWeight: 600, color: active ? 'rgba(26,20,12,0.7)' : 'text.disabled' }}>
                  {pill.count}
                </Typography>
              </Box>
            )
          })}

          <Box flex={1} />

          {/* View toggles: Grid active | Graph/Timeline coming soon */}
          <Box sx={{ display: 'flex', alignItems: 'center', border: `1px solid ${isDark ? '#26252B' : theme.palette.divider}`, borderRadius: '8px', overflow: 'hidden' }}>
            {(['Grid', 'Graph', 'Timeline'] as const).map((v, i) => (
              <Tooltip key={v} title={v !== 'Grid' ? `${v} view — coming soon` : ''} placement="bottom">
                <Box
                  sx={{
                    display:      'flex',
                    alignItems:   'center',
                    gap:          0.5,
                    px:           1.25,
                    height:       28,
                    cursor:       v === 'Grid' ? 'default' : 'not-allowed',
                    bgcolor:      v === 'Grid' ? alpha(accent, 0.14) : 'transparent',
                    color:        v === 'Grid' ? accent : 'text.disabled',
                    fontSize:     12,
                    fontWeight:   v === 'Grid' ? 600 : 400,
                    opacity:      v !== 'Grid' ? 0.5 : 1,
                    borderRight:  i < 2 ? `1px solid ${isDark ? '#26252B' : theme.palette.divider}` : 'none',
                  }}
                >
                  {v === 'Grid' && <GridViewIcon sx={{ fontSize: 12 }} />}
                  <Typography sx={{ fontSize: 12, color: 'inherit', fontWeight: 'inherit' }}>{v}</Typography>
                </Box>
              </Tooltip>
            ))}
          </Box>

          {/* Recent sort — coming soon */}
          <Tooltip title="Sort options — coming soon" placement="bottom">
            <Box
              sx={{
                display:    'flex',
                alignItems: 'center',
                gap:        0.5,
                px:         1.25,
                height:     28,
                border:     `1px solid ${isDark ? '#26252B' : theme.palette.divider}`,
                borderRadius: '8px',
                cursor:     'not-allowed',
                opacity:    0.6,
              }}
            >
              <Typography sx={{ fontSize: 12, color: 'text.disabled' }}>↕</Typography>
              <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>Recent</Typography>
            </Box>
          </Tooltip>
        </Box>

        {/* Collections section label */}
        <Box sx={{ display: 'flex', alignItems: 'center', mt: 2.5, mb: 1.5 }}>
          <Typography sx={{ fontFamily: MONO, fontSize: 11, fontWeight: 600, color: 'text.secondary', mr: 0.75 }}>
            Collections
          </Typography>
          <Typography sx={{ fontFamily: MONO, fontSize: 11, color: 'text.disabled' }}>
            {String(filtered.length).padStart(2, '0')}
          </Typography>
        </Box>

        {/* Content */}
        {isLoading ? (
          <Box display="flex" justifyContent="center" alignItems="center" height={200}>
            <CircularProgress />
          </Box>
        ) : error ? (
          <Alert severity="error" sx={{ mb: 2 }}>Failed to load knowledge bases. Is the backend running?</Alert>
        ) : filtered.length === 0 ? (
          <EmptyState hasFilter={filter !== 'all'} onCreateClick={() => setCreateOpen(true)} onReset={() => setFilter('all')} />
        ) : (
          <Grid container spacing={1.75}>
            {filtered.map(kb => (
              <Grid item xs={12} sm={6} md={4} key={kb.id}>
                <KBCard kb={kb} onClick={setSelectedKBId} />
              </Grid>
            ))}
          </Grid>
        )}

        {/* Recent Activity */}
        {!isLoading && !error && <RecentActivity kbs={kbs} />}

      </Box>

      <CreateKBDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreate={async (data) => { await createMutation.mutateAsync(data) }}
        loading={createMutation.isPending}
      />
    </Box>
  )
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyState({ hasFilter, onCreateClick, onReset }: { hasFilter: boolean; onCreateClick: () => void; onReset: () => void }) {
  if (hasFilter) {
    return (
      <Box display="flex" flexDirection="column" alignItems="center" py={8} gap={1.5} color="text.secondary">
        <Typography sx={{ fontSize: 36, opacity: 0.2, lineHeight: 1 }}>🔍</Typography>
        <Typography variant="body1" fontWeight={600} color="text.primary">No matching collections</Typography>
        <Button size="small" variant="outlined" onClick={onReset} sx={{ mt: 0.5 }}>Show all</Button>
      </Box>
    )
  }
  return (
    <Box display="flex" flexDirection="column" alignItems="center" justifyContent="center" height={280} gap={2} color="text.secondary">
      <Typography sx={{ fontSize: 48, opacity: 0.2, lineHeight: 1 }}>📚</Typography>
      <Typography variant="h6" fontWeight={600} color="text.primary">No knowledge bases yet</Typography>
      <Typography variant="body2" sx={{ maxWidth: 360, textAlign: 'center' }}>
        Create your first collection, add PDF / DOCX / Markdown files, and let Knovex index them.
      </Typography>
      <Button variant="contained" size="large" startIcon={<AddIcon />} onClick={onCreateClick}>
        New collection
      </Button>
    </Box>
  )
}
