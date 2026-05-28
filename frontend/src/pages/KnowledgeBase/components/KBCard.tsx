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
import FolderIcon from '@mui/icons-material/Folder'
import type { KB } from '../../../api/kb.api'

const MONO  = '"IBM Plex Mono", "Geist Mono", monospace'
const SERIF = '"Instrument Serif", Georgia, serif'

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

  // surface-2 = slightly elevated above paper: use elevation2 tint or alpha blend
  // dark/mid: paper + slight white tint | light: paper - slight white tint
  const glyphBg     = isDark
    ? alpha(theme.palette.background.paper, 1)   // paper itself is surface; tint up
    : theme.palette.background.default            // default is slightly darker in light
  // Accent-tinted border on glyph
  const glyphBorder = `color-mix(in oklab, ${accentColor} 40%, ${theme.palette.divider})`

  // Hover border
  const borderStrong = isDark ? alpha('#fff', 0.14) : alpha('#000', 0.18)

  // Progress bar track
  const trackBg = isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.07)'

  return (
    <Box
      onClick={() => onClick(kb.id)}
      sx={{
        position:     'relative',
        bgcolor:      'background.paper',
        border:       `1px solid ${theme.palette.divider}`,
        borderRadius: '12px',
        padding:      '16px 16px 14px',
        display:      'flex',
        flexDirection:'column',
        gap:           '10px',
        cursor:       'pointer',
        minHeight:    174,
        overflow:     'hidden',
        transition:   'border-color 100ms, transform 120ms',
        '&:hover': {
          borderColor: borderStrong,
          transform:   'translateY(-1px)',
        },
      }}
    >
      {/* Left accent stripe */}
      <Box
        sx={{
          position:     'absolute',
          top:           0,
          left:          0,
          width:         3,
          height:        '100%',
          bgcolor:       accentColor,
          borderRadius: '2px 0 0 2px',
        }}
      />

      {/* cc-head: glyph LEFT, more-button RIGHT */}
      <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>

        {/* Glyph — serif italic, neutral bg, accent border+text */}
        <Box
          sx={{
            width:          32,
            height:         32,
            borderRadius:   '8px',
            display:        'flex',
            alignItems:     'center',
            justifyContent: 'center',
            bgcolor:        glyphBg,
            border:         `1px solid`,
            borderColor:    glyphBorder,
            flexShrink:     0,
            fontSize:       isEmoji ? '1.1rem' : 17,
            fontFamily:     SERIF,
            fontStyle:      'italic',
            color:          accentColor,
          }}
        >
          {isEmoji ? kb.icon : (
            kb.icon && kb.icon !== '📁'
              ? <span style={{ fontFamily: SERIF, fontStyle: 'italic', fontSize: 17 }}>{kb.icon}</span>
              : <FolderIcon sx={{ fontSize: 16, color: accentColor }} />
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
