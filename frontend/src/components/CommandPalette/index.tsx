/**
 * CommandPalette — Ctrl/Cmd+K overlay to jump anywhere or switch theme.
 *
 * SRP: this component owns only presentation + keyboard interaction; the command
 * set and filtering live in ./commands (pure, tested). New command sources plug
 * in by extending the `commands` array passed in — no change here (OCP).
 *
 * Controlled by AppShell (open/onClose) so the global hotkey lives in one place.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { Box, Modal, Typography, useTheme, alpha } from '@mui/material'
import SearchIcon from '@mui/icons-material/Search'
import { filterCommands, type Command } from './commands'

const MONO = '"IBM Plex Mono", "Geist Mono", monospace'

export interface CommandPaletteProps {
  open: boolean
  onClose: () => void
  commands: Command[]
}

export default function CommandPalette({ open, onClose, commands }: CommandPaletteProps) {
  const theme = useTheme()
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const results = useMemo(() => filterCommands(commands, query), [commands, query])

  // Reset + focus on open.
  useEffect(() => {
    if (open) {
      setQuery('')
      setActive(0)
      // focus after the modal mounts
      const t = setTimeout(() => inputRef.current?.focus(), 0)
      return () => clearTimeout(t)
    }
  }, [open])

  // Clamp the active index whenever the result set shrinks.
  useEffect(() => { setActive((a) => Math.min(a, Math.max(0, results.length - 1))) }, [results.length])

  const runActive = () => {
    const cmd = results[active]
    if (cmd) { onClose(); cmd.run() }
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, results.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)) }
    else if (e.key === 'Enter') { e.preventDefault(); runActive() }
    // Escape handled by Modal's onClose
  }

  return (
    <Modal open={open} onClose={onClose} aria-label="Command palette"
      sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'center', pt: '12vh' }}>
      <Box
        onKeyDown={onKeyDown}
        sx={{
          width: 560, maxWidth: '92vw', maxHeight: '60vh', outline: 'none',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
          bgcolor: 'background.paper', borderRadius: 3,
          border: `1px solid ${theme.palette.divider}`,
          boxShadow: '0 40px 90px -30px rgba(0,0,0,0.7)',
        }}
      >
        {/* search row */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, px: 2, height: 52, borderBottom: `1px solid ${theme.palette.divider}` }}>
          <SearchIcon sx={{ fontSize: 18, color: 'text.disabled' }} />
          <Box component="input" ref={inputRef} value={query} placeholder="Jump to… or type a command"
            onChange={(e) => { setQuery((e.target as HTMLInputElement).value); setActive(0) }}
            sx={{ flex: 1, border: 0, outline: 0, bgcolor: 'transparent', color: 'text.primary', fontFamily: 'inherit', fontSize: 15 }} />
          <Box sx={{ fontFamily: MONO, fontSize: 10.5, color: 'text.disabled', border: `1px solid ${theme.palette.divider}`, borderRadius: 0.75, px: 0.75, py: 0.2 }}>ESC</Box>
        </Box>

        {/* results */}
        <Box ref={listRef} sx={{ overflow: 'auto', py: 0.75 }}>
          {results.length === 0 ? (
            <Typography sx={{ px: 2, py: 2, color: 'text.disabled', fontSize: 13.5 }}>No matching commands.</Typography>
          ) : results.map((cmd, i) => {
            const on = i === active
            return (
              <Box key={cmd.id}
                onMouseEnter={() => setActive(i)}
                onClick={() => { onClose(); cmd.run() }}
                sx={{
                  display: 'flex', alignItems: 'center', gap: 1.5, mx: 1, px: 1.5, height: 40, borderRadius: 2,
                  cursor: 'pointer', bgcolor: on ? alpha(theme.palette.primary.main, 0.14) : 'transparent',
                  color: on ? 'text.primary' : 'text.secondary',
                }}>
                <Typography sx={{ flex: 1, fontSize: 14, fontWeight: on ? 600 : 500 }}>{cmd.title}</Typography>
                {cmd.hint && <Typography sx={{ fontFamily: MONO, fontSize: 10.5, color: 'text.disabled' }}>{cmd.hint}</Typography>}
              </Box>
            )
          })}
        </Box>
      </Box>
    </Modal>
  )
}
