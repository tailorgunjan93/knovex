/**
 * CinematicPanel — the optional "Cinematic (HD)" Manim renderer for a lesson.
 *
 * Flow: if the Manim pack isn't installed → offer the one-time download (polls
 * progress). Once ready → render the topic to an MP4 (slow; shows a spinner) and
 * play it. Failures (LLM-written Manim can fail to render) surface an error with
 * a retry, never a crash.
 */

import { useState } from 'react'
import {
  Box, Button, Typography, Alert, LinearProgress, CircularProgress, alpha, useTheme,
} from '@mui/material'
import MovieFilterRoundedIcon from '@mui/icons-material/MovieFilterRounded'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { manimApi } from '@/api/manim.api'
import { BRAND } from '@/theme/tokens'

const MONO = '"IBM Plex Mono", "Geist Mono", monospace'
const KEY = ['manim-status']

export default function CinematicPanel({ topic, difficulty = 'intermediate', language = 'English' }: {
  topic: string
  difficulty?: string
  language?: string
}) {
  const theme = useTheme()
  const qc = useQueryClient()
  const [videoUrl, setVideoUrl] = useState<string | null>(null)

  const { data: status } = useQuery({
    queryKey: KEY,
    queryFn: manimApi.status,
    refetchInterval: (q) => (q.state.data?.state === 'installing' ? 1500 : false),
  })
  const state = status?.state ?? 'not_installed'

  const install = useMutation({
    mutationFn: manimApi.install,
    onSuccess: (s) => qc.setQueryData(KEY, s),
  })

  const render = useMutation({
    mutationFn: () => manimApi.render(topic, difficulty, language),
    onSuccess: (r) => {
      if (r.ok && r.video_url) setVideoUrl(manimApi.absoluteVideoUrl(r.video_url))
    },
  })

  const installing = state === 'installing'
  const lastLog = status?.log_tail?.[status.log_tail.length - 1]

  return (
    <Box sx={{ mt: 2, p: 2, borderRadius: 2.5, border: '1px solid', borderColor: 'divider', bgcolor: alpha(BRAND.copper, theme.palette.mode === 'dark' ? 0.06 : 0.04) }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
        <MovieFilterRoundedIcon sx={{ color: BRAND.copper, fontSize: 20 }} />
        <Typography sx={{ fontSize: 14.5, fontWeight: 700 }}>Cinematic (HD)</Typography>
      </Box>
      <Typography sx={{ fontSize: 12.5, color: 'text.secondary', lineHeight: 1.55, mb: 1.5 }}>
        Render this lesson as a true 3Blue1Brown-style animation with Manim. Best with a
        strong model; rendering takes ~30–90&nbsp;s.
      </Typography>

      {/* Video result */}
      {videoUrl && (
        <Box sx={{ mb: 1.5 }}>
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <video src={videoUrl} controls autoPlay style={{ width: '100%', borderRadius: 10, display: 'block' }} />
        </Box>
      )}

      {/* Pack not installed → offer download */}
      {(state === 'not_installed' || state === 'error' || state === 'unavailable') && !installing && (
        <>
          {state === 'unavailable' ? (
            <Alert severity="warning" sx={{ borderRadius: 2, fontSize: 12.5 }}>
              {status?.detail || 'Cinematic rendering is unavailable in this build.'}
            </Alert>
          ) : (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
              <Button
                disableElevation onClick={() => install.mutate()} disabled={install.isPending}
                sx={{ fontSize: 12.5, fontWeight: 700, textTransform: 'none', borderRadius: 99, px: 2,
                      background: BRAND.gradient, color: BRAND.onAccent,
                      '&:hover': { background: BRAND.gradient, filter: 'brightness(1.05)' } }}
              >
                {install.isPending ? <CircularProgress size={14} /> : 'Install Cinematic pack (~1 GB)'}
              </Button>
              <Typography sx={{ fontSize: 11.5, color: 'text.disabled' }}>one-time download</Typography>
            </Box>
          )}
          {state === 'error' && status?.detail && (
            <Alert severity="error" sx={{ mt: 1, borderRadius: 2, fontSize: 12 }}>{status.detail}</Alert>
          )}
        </>
      )}

      {/* Installing progress */}
      {installing && (
        <Box>
          <LinearProgress sx={{ borderRadius: 1, height: 5 }} />
          <Typography sx={{ fontSize: 12, color: 'text.secondary', mt: 1 }}>{status?.detail || 'Downloading…'}</Typography>
          {lastLog && <Typography noWrap sx={{ fontFamily: MONO, fontSize: 10.5, color: 'text.disabled', mt: 0.5 }}>{lastLog}</Typography>}
        </Box>
      )}

      {/* Ready → render */}
      {state === 'ready' && (
        <Box>
          <Button
            disableElevation onClick={() => { setVideoUrl(null); render.mutate() }} disabled={render.isPending}
            sx={{ fontSize: 12.5, fontWeight: 700, textTransform: 'none', borderRadius: 99, px: 2,
                  background: BRAND.gradient, color: BRAND.onAccent,
                  '&:hover': { background: BRAND.gradient, filter: 'brightness(1.05)' } }}
          >
            {render.isPending ? <><CircularProgress size={14} sx={{ mr: 1, color: BRAND.onAccent }} />Rendering…</> : (videoUrl ? 'Re-render' : 'Render Cinematic (HD)')}
          </Button>
          {render.isPending && (
            <Typography sx={{ fontSize: 11.5, color: 'text.disabled', mt: 1 }}>
              Generating + rendering the animation — this can take up to ~90&nbsp;s.
            </Typography>
          )}
          {render.isError && (
            <Alert severity="error" sx={{ mt: 1, borderRadius: 2, fontSize: 12 }}>
              Render failed. The model couldn’t produce a valid animation — try again.
            </Alert>
          )}
          {render.data && !render.data.ok && (
            <Alert severity="error" sx={{ mt: 1, borderRadius: 2, fontSize: 12 }}>
              Couldn’t render this topic (tried {render.data.attempts}×). Try again or a different topic.
            </Alert>
          )}
        </Box>
      )}
    </Box>
  )
}
