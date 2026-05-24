/**
 * KnowledgeBase Page — Sprint 2
 *
 * Two sub-views:
 *   1. KB List  — grid of KBCard components, create button
 *   2. KB Detail — file management for a selected KB
 *
 * Navigation between them is purely local state (no URL change needed for
 * a desktop app with a single-panel layout).
 */

import { useState } from 'react'
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Grid,
  InputAdornment,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import SearchIcon from '@mui/icons-material/Search'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { kbApi } from '../../api/kb.api'
import CreateKBDialog from './components/CreateKBDialog'
import KBCard from './components/KBCard'
import KBDetail from './components/KBDetail'

// ─── Component ────────────────────────────────────────────────────────────────

export default function KnowledgeBasePage() {
  const queryClient = useQueryClient()
  const [selectedKBId, setSelectedKBId] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [search, setSearch] = useState('')

  // ── Queries ──────────────────────────────────────────────────────────────
  const { data: kbs = [], isLoading, error } = useQuery({
    queryKey: ['kbs'],
    queryFn: kbApi.list,
    refetchInterval: 5000,  // keep stats fresh
  })

  // ── Mutations ─────────────────────────────────────────────────────────────
  const createMutation = useMutation({
    mutationFn: kbApi.create,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['kbs'] }),
  })

  // ── Detail view ───────────────────────────────────────────────────────────
  if (selectedKBId) {
    return (
      <KBDetail
        kbId={selectedKBId}
        onBack={() => setSelectedKBId(null)}
      />
    )
  }

  // ── Filter ────────────────────────────────────────────────────────────────
  const filtered = kbs.filter(kb =>
    kb.name.toLowerCase().includes(search.toLowerCase())
  )

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Header bar */}
      <Stack
        direction="row"
        alignItems="center"
        spacing={2}
        sx={{ px: 3, py: 2, borderBottom: '1px solid', borderColor: 'divider', flexShrink: 0 }}
      >
        <Box flex={1}>
          <Typography variant="h5" fontWeight={700}>Knowledge Bases</Typography>
          <Typography variant="caption" color="text.secondary">
            {kbs.length} KB{kbs.length !== 1 ? 's' : ''} total
          </Typography>
        </Box>

        <TextField
          size="small"
          placeholder="Search KBs…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon fontSize="small" />
              </InputAdornment>
            ),
          }}
          sx={{ width: 220 }}
        />

        <Tooltip title="Create a new Knowledge Base">
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => setCreateOpen(true)}
          >
            New KB
          </Button>
        </Tooltip>
      </Stack>

      {/* Content */}
      <Box flex={1} overflow="auto" sx={{ px: 3, py: 2 }}>
        {isLoading ? (
          <Box display="flex" justifyContent="center" alignItems="center" height={200}>
            <CircularProgress />
          </Box>
        ) : error ? (
          <Alert severity="error" sx={{ mb: 2 }}>
            Failed to load knowledge bases. Is the backend running?
          </Alert>
        ) : filtered.length === 0 ? (
          <EmptyState
            hasSearch={!!search}
            onCreateClick={() => setCreateOpen(true)}
          />
        ) : (
          <Grid container spacing={2}>
            {filtered.map(kb => (
              <Grid item xs={12} sm={6} md={4} lg={3} key={kb.id}>
                <KBCard kb={kb} onClick={setSelectedKBId} />
              </Grid>
            ))}
          </Grid>
        )}
      </Box>

      {/* Create dialog */}
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

function EmptyState({
  hasSearch,
  onCreateClick,
}: {
  hasSearch: boolean
  onCreateClick: () => void
}) {
  if (hasSearch) {
    return (
      <Box display="flex" flexDirection="column" alignItems="center" py={8} gap={1} color="text.secondary">
        <Typography variant="h3" sx={{ opacity: 0.2 }}>🔍</Typography>
        <Typography variant="body1" fontWeight={600}>No matching knowledge bases</Typography>
        <Typography variant="body2">Try a different search term</Typography>
      </Box>
    )
  }

  return (
    <Box
      display="flex"
      flexDirection="column"
      alignItems="center"
      justifyContent="center"
      height={360}
      gap={2}
      color="text.secondary"
    >
      <Typography variant="h2" sx={{ opacity: 0.25, lineHeight: 1 }}>📚</Typography>
      <Typography variant="h6" fontWeight={600} color="text.primary">
        No knowledge bases yet
      </Typography>
      <Typography variant="body2" sx={{ maxWidth: 380, textAlign: 'center' }}>
        Create your first knowledge base, add PDF/DOCX/Markdown files, and
        let Knovex index them for instant AI-powered retrieval.
      </Typography>
      <Button
        variant="contained"
        size="large"
        startIcon={<AddIcon />}
        onClick={onCreateClick}
      >
        Create Knowledge Base
      </Button>
    </Box>
  )
}
