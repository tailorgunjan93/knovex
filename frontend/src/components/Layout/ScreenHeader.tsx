/**
 * ScreenHeader — KnovexUI screen-header pattern
 *
 * Renders the standard content-area page header:
 *
 *   — EYEBROW · DETAIL
 *   Big serif Title with italic emphasis
 *   Subtitle description text
 *   [actions on the right]
 *
 * Usage:
 *   <ScreenHeader
 *     eyebrow="LIBRARY · 6 COLLECTIONS"
 *     title="Your knowledge"
 *     emphasis="base"
 *     sub="Everything you've captured, organized and searchable."
 *     actions={<Button>+ New KB</Button>}
 *   />
 */

import { Box, Typography, useTheme } from '@mui/material'

const MONO = '"IBM Plex Mono", "Geist Mono", monospace'
const SERIF = '"Instrument Serif", Georgia, serif'

interface ScreenHeaderProps {
  eyebrow?:      string           // "LIBRARY · 6 COLLECTIONS" (mono, all-caps, em-dash prepended)
  title:         string           // plain part BEFORE the italic emphasis
  emphasis?:     string           // italic amber word (inserted after title)
  titleSuffix?:  string           // plain text AFTER the italic emphasis (e.g. " base")
  sub?:          string           // subtitle / description
  actions?:      React.ReactNode  // right-side buttons
  border?:       boolean          // show bottom border (default true)
}

export default function ScreenHeader({
  eyebrow,
  title,
  emphasis,
  titleSuffix,
  sub,
  actions,
  border = false,   // lab design: no header bottom-border (flat, edge-to-edge)
}: ScreenHeaderProps) {
  const theme = useTheme()

  return (
    <Box
      sx={{
        flexShrink: 0,
        px: 3.5,
        pt: 2.75,
        pb: 2,
        display: 'flex',
        alignItems: 'flex-end',
        gap: 2.5,
        borderBottom: border ? `1px solid ${theme.palette.divider}` : 'none',
      }}
    >
      {/* Title block */}
      <Box flex={1} minWidth={0}>
        {/* Eyebrow */}
        {eyebrow && (
          <Box
            sx={{
              display:       'flex',
              alignItems:    'center',
              gap:            1,
              mb:             0.75,
              fontFamily:    MONO,
              fontSize:      10.5,
              color:         'text.disabled',
              textTransform: 'uppercase',
              letterSpacing: '0.13em',
              userSelect:    'none',
            }}
          >
            <Box component="span" sx={{ color: 'text.disabled' }}>—</Box>
            {eyebrow}
          </Box>
        )}

        {/* Main title — Instrument Serif with optional italic amber emphasis */}
        <Typography
          component="h1"
          sx={{
            fontFamily:    SERIF,
            fontWeight:    400,
            fontSize:      32,
            letterSpacing: '-0.01em',
            lineHeight:    1.05,
            color:         'text.primary',
            m:              0,
          }}
        >
          {title}
          {emphasis && (
            <>
              {' '}
              <Box
                component="em"
                sx={{
                  fontStyle: 'italic',
                  color:      theme.palette.primary.main,
                }}
              >
                {emphasis}
              </Box>
            </>
          )}
          {titleSuffix && <>{' '}{titleSuffix}</>}
        </Typography>

        {/* Subtitle — intentionally not rendered.
           Header-trim (matches rough build's `.screen-header .sub { display:none }`):
           the descriptive paragraph took vertical space without earning it. The `sub`
           prop is kept so callers don't break; it just isn't shown. */}
        {void sub}
      </Box>

      {/* Actions */}
      {actions && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexShrink: 0 }}>
          {actions}
        </Box>
      )}
    </Box>
  )
}
