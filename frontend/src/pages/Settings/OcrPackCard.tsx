/**
 * OCR pack card (App settings → "ADVANCED").
 *
 * OCR / advanced ingestion lives in docnest, which is too large to bundle, so
 * it's downloaded on demand. This card shows provisioning state and drives
 * install / uninstall, polling /api/ocr/status while a download is in flight.
 */

import {
  Box, Typography, Button, Alert, CircularProgress, LinearProgress,
} from '@mui/material'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ocrApi } from '@/api/ocr.api'
import { BRAND } from '@/theme/tokens'

const MONO = '"IBM Plex Mono", "Geist Mono", monospace'
const KEY = ['ocr-status']

export default function OcrPackCard() {
  const qc = useQueryClient()

  const { data: status } = useQuery({
    queryKey: KEY,
    queryFn: ocrApi.status,
    // While provisioning, poll so the progress + final state update live.
    refetchInterval: (q) => (q.state.data?.state === 'installing' ? 1500 : false),
  })

  const install = useMutation({
    mutationFn: ocrApi.install,
    onSuccess: (s) => qc.setQueryData(KEY, s),
  })
  const uninstall = useMutation({
    mutationFn: ocrApi.uninstall,
    onSuccess: (s) => qc.setQueryData(KEY, s),
  })

  const state = status?.state ?? 'not_installed'
  const installing = state === 'installing'
  const lastLog = status?.log_tail?.[status.log_tail.length - 1]

  return (
    <Box
      data-testid="ocr-pack-card"
      sx={{
        p: 2.25, borderRadius: 2.5, border: '1px solid', borderColor: 'divider',
        bgcolor: 'background.paper',
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
        <AutoAwesomeIcon sx={{ color: BRAND.copper, fontSize: 22, mt: 0.25, flexShrink: 0 }} />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography sx={{ fontSize: 14.5, fontWeight: 700 }}>OCR &amp; advanced ingestion</Typography>
            {state === 'ready' && (
              <CheckCircleIcon sx={{ color: 'success.main', fontSize: 18 }} />
            )}
          </Box>
          <Typography sx={{ fontSize: 12.5, color: 'text.secondary', lineHeight: 1.6, mt: 0.25 }}>
            Reads scanned &amp; image-only PDFs by running text recognition (OCR) through the
            docnest engine. Downloaded on demand — it's a large one-time install (~1–2&nbsp;GB)
            and stays out of the app bundle.
          </Typography>
        </Box>

        {/* Action */}
        {state === 'ready' ? (
          <Button
            onClick={() => uninstall.mutate()}
            disabled={uninstall.isPending}
            sx={{ flexShrink: 0, fontSize: 12.5, textTransform: 'none', borderRadius: 99,
                  color: 'text.secondary', '&:hover': { bgcolor: 'action.hover' } }}
          >
            {uninstall.isPending ? <CircularProgress size={14} /> : 'Remove'}
          </Button>
        ) : (
          <Button
            disableElevation
            onClick={() => install.mutate()}
            disabled={installing || install.isPending || state === 'unavailable'}
            sx={{ flexShrink: 0, fontSize: 12.5, fontWeight: 700, textTransform: 'none',
                  borderRadius: 99, px: 2, background: BRAND.gradient, color: BRAND.onAccent,
                  '&:hover': { background: BRAND.gradient, filter: 'brightness(1.05)' },
                  '&.Mui-disabled': { background: 'action.disabledBackground', color: 'text.disabled' } }}
          >
            {installing ? 'Installing…' : 'Install OCR pack'}
          </Button>
        )}
      </Box>

      {/* Progress */}
      {installing && (
        <Box sx={{ mt: 2 }}>
          <LinearProgress sx={{ borderRadius: 1, height: 5 }} />
          <Typography sx={{ fontSize: 12, color: 'text.secondary', mt: 1 }}>
            {status?.detail || 'Downloading…'}
          </Typography>
          {lastLog && (
            <Typography noWrap sx={{ fontFamily: MONO, fontSize: 10.5, color: 'text.disabled', mt: 0.5 }}>
              {lastLog}
            </Typography>
          )}
        </Box>
      )}

      {state === 'unavailable' && (
        <Alert severity="warning" sx={{ mt: 1.5, borderRadius: 2, fontSize: 12.5 }}>
          {status?.detail || 'OCR installer is unavailable in this build.'}
        </Alert>
      )}
      {state === 'error' && (
        <Alert severity="error" sx={{ mt: 1.5, borderRadius: 2, fontSize: 12.5 }}>
          {status?.detail || 'OCR install failed.'} You can try again.
        </Alert>
      )}
    </Box>
  )
}
