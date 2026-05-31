/**
 * KBCard — matches KnovexUI CollectionCard exactly
 *
 * Layout (top → bottom):
 *   Left accent stripe (absolute, 3px wide)
 *   cc-head:  [glyph 32x32, left]  [⋯ more, right]
 *   title h3 (15px, 500)
 *   description p (12px, 2-line clamp) — uses created_at if no desc
 *   progress bar + percentage
 *   cc-meta:  {docs} DOCS · {chunks} CHUNKS · {updated}
 */

import { Box, Typography, useTheme, alpha } from '@mui/material'
import type { KB } from '../../../api/kb.api'

const MONO  = '"IBM Plex Mono", "Geist Mono", monospace'

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins  = Math.floor(diff / 60_000)
  const hours = Math.floor(diff / 3_600_000)
  const days  = Math.floor(diff / 86_400_000)
  if (mins  < 60)  return `${mins}m ago`
  if (hours < 24)  return `${hours}h ago`
  if (days  < 7)   return `${days}d ago`
  return new Date(dateStr).toLocaleDateString()
}

/** Deterministic progress 10–89% based on KB id hash */
function kbProgress(id: string): number {
  let h = 0
  for (let i = 0; i < id.length; i++) {
    h = (h * 31 + id.charCodeAt(i)) & 0x7fffffff
  }
  return 10 + (h % 80)
}

interface Props {
  kb: KB
  onClick: (id: string) => void
}

export default function KBCard({ kb, onClick }: Props) {
  const theme       = useTheme()
  const isDark      = theme.palette.mode === 'dark'
  const isEmoji     = /\p{Emoji}/u.test(kb.icon)
  const accentColor = kb.color || theme.palette.primary.main
  const progress    = kbProgress(kb.id)

  // Progress bar track
  const trackBg = isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.07)'

  return (
    <Box
      onClick={() => onClick(kb.id)}
      sx={{
        position:     'relative',
        bgcolor:      'background.paper',
        border:       '1px solid transparent',
        borderRadius: '16px',
        padding:      '18px 18px 16px',
        display:      'flex',
        flexDirection:'column',
        gap:           '12px',
        cursor:       'pointer',
        minHeight:    150,
        overflow:     'hidden',
        transition:   'border-color .15s, transform .15s, box-shadow .15s',
        '&:hover': {
          borderColor: theme.palette.divider,
          transform:   'translateY(-2px)',
          boxShadow:   '0 18px 40px -24px rgba(0,0,0,0.6)',
        },
      }}
    >
      {/* Top accent stripe (lab style) */}
      <Box
        sx={{
          position:     'absolute',
          top:           0,
          left:          0,
          right:         0,
          height:        3,
          bgcolor:       accentColor,
        }}
      />

      {/* cc-head: glyph LEFT, more-button RIGHT */}
      <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>

        {/* Glyph tile — accent-tinted rounded square (lab style) */}
        <Box
          sx={{
            width:          38,
            height:         38,
            borderRadius:   '10px',
            display:        'flex',
            alignItems:     'center',
            justifyContent: 'center',
            bgcolor:        alpha(accentColor, 0.14),
            border:         `1px solid ${alpha(accentColor, 0.4)}`,
            flexShrink:     0,
            fontSize:       isEmoji ? '1.2rem' : 20,
            fontWeight:     700,
            color:          accentColor,
          }}
        >
          {isEmoji ? kb.icon : (
            kb.icon && kb.icon !== '📁'
              /* Non-emoji icons may be words (e.g. "upload") — show the first
                 letter only so it fits the tile like the lab's single glyphs. */
              ? <span style={{ fontWeight: 700, fontSize: 20 }}>{kb.icon.trim().charAt(0).toUpperCase()}</span>
              : <span style={{ fontWeight: 700, fontSize: 20 }}>{kb.name.trim().charAt(0).toUpperCase()}</span>
          )}
        </Box>

        {/* Subtle ⋯ more indicator */}
        <Box
          sx={{
            width:          24,
            height:         24,
            display:        'flex',
            alignItems:     'center',
            justifyContent: 'center',
            borderRadius:   '6px',
            color:          'text.disabled',
            fontSize:       14,
            letterSpacing:  '0.05em',
            opacity:        0,
            transition:     'opacity 120ms',
            '.MuiBox-root:hover &': { opacity: 1 },
            '&:hover': { color: 'text.secondary', bgcolor: alpha(theme.palette.divider, 0.5) },
          }}
        >
          ···
        </Box>
      </Box>

      {/* Title + description */}
      <Box sx={{ flex: 1 }}>
        <Typography
          sx={{
            fontWeight:    500,
            fontSize:      15,
            letterSpacing: '-0.005em',
            color:         'text.primary',
            lineHeight:    1.25,
            overflow:      'hidden',
            textOverflow:  'ellipsis',
            whiteSpace:    'nowrap',
            mb:             '5px',
          }}
        >
          {kb.name}
        </Typography>

        {/* Description — 2-line clamp */}
        <Typography
          sx={{
            fontSize:          12,
            color:             'text.disabled',
            lineHeight:        1.45,
            display:          '-webkit-box',
            WebkitLineClamp:   2,
            WebkitBoxOrient:   'vertical',
            overflow:         'hidden',
          }}
        >
          {kb.stats.total_size_bytes > 0
            ? `${kb.stats.file_count} document${kb.stats.file_count !== 1 ? 's' : ''} · ${formatBytes(kb.stats.total_size_bytes)} indexed`
            : `Created ${new Date(kb.created_at).toLocaleDateString()} · empty collection`
          }
        </Typography>
      </Box>

      {/* Progress bar row */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
        {/* Track */}
        <Box
          sx={{
            flex:         1,
            height:       3,
            bgcolor:      trackBg,
            borderRadius: 2,
            overflow:     'hidden',
          }}
        >
          {/* Fill */}
          <Box
            sx={{
              width:        `${progress}%`,
              height:       '100%',
              bgcolor:      accentColor,
              borderRadius: 2,
              transition:   'width 0.6s ease',
            }}
          />
        </Box>
        {/* Percentage */}
        <Typography
          sx={{
            fontFamily:  MONO,
            fontSize:    10,
            color:       'text.disabled',
            flexShrink:  0,
            lineHeight:  1,
            minWidth:    28,
            textAlign:   'right',
          }}
        >
          {progress}%
        </Typography>
      </Box>

      {/* cc-meta — mono, muted */}
      <Box
        sx={{
          display:    'flex',
          alignItems: 'center',
          gap:        '8px',
          fontFamily:  MONO,
          fontSize:   11,
          color:      'text.disabled',
        }}
      >
        <Box
          component="span"
          sx={{
            color:      accentColor,
            fontWeight: 600,
            fontSize:   10.5,
          }}
        >
          {kb.stats.file_count} {kb.stats.file_count !== 1 ? 'DOCS' : 'DOC'}
        </Box>

        {kb.stats.total_chunks > 0 && (
          <>
            <Box component="span" sx={{ width: 2, height: 2, bgcolor: 'text.disabled', borderRadius: '50%', flexShrink: 0 }} />
            <span>{kb.stats.total_chunks} CARDS</span>
          </>
        )}

        <Box component="span" sx={{ flex: 1 }} />
        <span>{timeAgo(kb.updated_at || kb.created_at)}</span>
      </Box>
    </Box>
  )
}
