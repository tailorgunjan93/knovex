/**
 * Design Lab — THROWAWAY visual exploration surface.
 *
 * Route: /#/design-lab  (rendered OUTSIDE AppShell — no TopBar/Sidebar chrome)
 *
 * Goal: prove "rough-build LAYOUT + amber/copper identity = premium" on the
 * flagship Library screen, across all three themes, BEFORE touching real pages.
 * Layout/structure ported from the user's rough build (library.jsx + styles.css);
 * palette is the locked amber/copper from theme/index.ts.
 *
 * Pure MUI + CSS keyframes — zero new dependencies, fully reversible.
 * Delete this folder + its route once the real redesign lands.
 */

import { useState, useMemo, useEffect } from 'react'
import {
  Box, ThemeProvider, CssBaseline, Typography, Stack, Tooltip, IconButton,
} from '@mui/material'
import { keyframes } from '@mui/system'
import { getTheme, type ThemeMode } from '@/theme'

import LibraryBooksRoundedIcon  from '@mui/icons-material/LibraryBooksRounded'
import ChatRoundedIcon          from '@mui/icons-material/ChatBubbleOutlineRounded'
import MenuBookRoundedIcon      from '@mui/icons-material/MenuBookRounded'
import SchoolRoundedIcon        from '@mui/icons-material/SchoolRounded'
import InsightsRoundedIcon      from '@mui/icons-material/InsightsRounded'
import SettingsRoundedIcon      from '@mui/icons-material/SettingsRounded'
import DarkModeRoundedIcon      from '@mui/icons-material/DarkModeRounded'
import LightModeRoundedIcon     from '@mui/icons-material/LightModeRounded'
import Brightness4RoundedIcon   from '@mui/icons-material/Brightness4Rounded'
import AutoAwesomeRoundedIcon   from '@mui/icons-material/AutoAwesomeRounded'
import AddRoundedIcon           from '@mui/icons-material/AddRounded'
import AttachFileRoundedIcon    from '@mui/icons-material/AttachFileRounded'
import ArrowForwardRoundedIcon  from '@mui/icons-material/ArrowForwardRounded'
import MoreHorizRoundedIcon     from '@mui/icons-material/MoreHorizRounded'
import GridViewRoundedIcon      from '@mui/icons-material/GridViewRounded'
import CloseRoundedIcon         from '@mui/icons-material/CloseRounded'
import UploadFileRoundedIcon    from '@mui/icons-material/UploadFileRounded'
import CheckRoundedIcon         from '@mui/icons-material/CheckRounded'
import LocalFireDepartmentRoundedIcon from '@mui/icons-material/LocalFireDepartmentRounded'
import VisibilityRoundedIcon    from '@mui/icons-material/VisibilityRounded'
import BoltRoundedIcon          from '@mui/icons-material/BoltRounded'
import RefreshRoundedIcon       from '@mui/icons-material/RefreshRounded'
import ArrowBackRoundedIcon     from '@mui/icons-material/ArrowBackRounded'
import AutoStoriesRoundedIcon   from '@mui/icons-material/AutoStoriesRounded'
import AnimationRoundedIcon     from '@mui/icons-material/AnimationRounded'
import StyleRoundedIcon         from '@mui/icons-material/StyleRounded'
import QuizRoundedIcon          from '@mui/icons-material/QuizRounded'
import TimelineRoundedIcon      from '@mui/icons-material/TimelineRounded'
import AccountTreeRoundedIcon   from '@mui/icons-material/AccountTreeRounded'
import ChevronLeftRoundedIcon   from '@mui/icons-material/ChevronLeftRounded'
import ChevronRightRoundedIcon  from '@mui/icons-material/ChevronRightRounded'
import TranslateRoundedIcon     from '@mui/icons-material/TranslateRounded'
import PlayArrowRoundedIcon     from '@mui/icons-material/PlayArrowRounded'
import ContentCopyRoundedIcon   from '@mui/icons-material/ContentCopyRounded'
import ThumbUpOffAltRoundedIcon from '@mui/icons-material/ThumbUpOffAltRounded'
import ThumbDownOffAltRoundedIcon from '@mui/icons-material/ThumbDownOffAltRounded'
import PublicRoundedIcon        from '@mui/icons-material/PublicRounded'
import BookmarkBorderRoundedIcon from '@mui/icons-material/BookmarkBorderRounded'
import SendRoundedIcon          from '@mui/icons-material/SendRounded'
import FolderRoundedIcon        from '@mui/icons-material/FolderRounded'
import EmojiEventsRoundedIcon   from '@mui/icons-material/EmojiEventsRounded'
import PsychologyRoundedIcon    from '@mui/icons-material/PsychologyRounded'
import CalendarMonthRoundedIcon from '@mui/icons-material/CalendarMonthRounded'
import FileDownloadRoundedIcon  from '@mui/icons-material/FileDownloadRounded'
import NorthRoundedIcon         from '@mui/icons-material/NorthRounded'
import SouthRoundedIcon         from '@mui/icons-material/SouthRounded'
import PersonRoundedIcon        from '@mui/icons-material/PersonRounded'
import VisibilityOffRoundedIcon from '@mui/icons-material/VisibilityOffRounded'
import MemoryRoundedIcon        from '@mui/icons-material/MemoryRounded'
import TravelExploreRoundedIcon from '@mui/icons-material/TravelExploreRounded'
import TuneRoundedIcon          from '@mui/icons-material/TuneRounded'
import FolderOpenRoundedIcon    from '@mui/icons-material/FolderOpenRounded'

// ─── Brand tokens (mirror theme/index.ts) ────────────────────────────────────
const COPPER       = '#DDA76A'
const COPPER_DARK  = '#B5803E'
const COPPER_LIGHT = '#EABC8A'
const GRAD = `linear-gradient(135deg, ${COPPER_LIGHT}, ${COPPER_DARK})`

const riseIn = keyframes`
  from { opacity: 0; transform: translateY(10px); }
  to   { opacity: 1; transform: translateY(0); }
`
const pulse = keyframes`
  0%   { box-shadow: 0 0 0 0 ${COPPER}aa; }
  70%  { box-shadow: 0 0 0 6px ${COPPER}00; }
  100% { box-shadow: 0 0 0 0 ${COPPER}00; }
`
const blink = keyframes`
  0%,100% { opacity: 1; }
  50%     { opacity: 0.35; }
`
const slideInRight = keyframes`
  from { opacity: 0; transform: translateX(26px); }
  to   { opacity: 1; transform: translateX(0); }
`
const slideInLeft = keyframes`
  from { opacity: 0; transform: translateX(-26px); }
  to   { opacity: 1; transform: translateX(0); }
`

// ─── Knovex logo mark — a "K" built from a knowledge graph ───────────────────
// nodes (concepts) connected by edges that form the letter K → ties to Knovex's
// concept-linking story; ownable + legible at small sizes.
function KnovexMark({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <defs>
        <linearGradient id="knx-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={COPPER_LIGHT} />
          <stop offset="100%" stopColor={COPPER_DARK} />
        </linearGradient>
      </defs>
      {/* edges = the strokes of the K */}
      <g stroke="url(#knx-grad)" strokeWidth="2" strokeLinecap="round">
        <line x1="6.5" y1="4.5" x2="6.5" y2="19.5" />
        <line x1="6.5" y1="12" x2="16.5" y2="5" />
        <line x1="6.5" y1="12" x2="16.5" y2="19" />
      </g>
      {/* nodes = concepts at the vertices */}
      <g fill="url(#knx-grad)">
        <circle cx="6.5"  cy="4.5"  r="2.3" />
        <circle cx="6.5"  cy="19.5" r="2.3" />
        <circle cx="16.5" cy="5"    r="2.3" />
        <circle cx="16.5" cy="19"   r="2.3" />
      </g>
      {/* central hub node — the "spark", brighter */}
      <circle cx="6.5" cy="12" r="2.9" fill={COPPER_LIGHT} />
    </svg>
  )
}

// ─── Data (from the rough build's library.jsx) ───────────────────────────────
const COLLECTIONS = [
  { title: 'ML Foundations',         glyph: 'ƒ', color: '#DDA76A', desc: 'Core concepts: linear models, loss functions, optimization, and the inductive biases that make learning possible.', docs: 14, cards: 86,  progress: 78, updated: '2h ago' },
  { title: 'Neural Networks',        glyph: 'η', color: '#3A8D7A', desc: 'From perceptrons to transformers. Backprop derivations, activation functions, and the geometry of deep representation.', docs: 22, cards: 154, progress: 64, updated: 'Yesterday' },
  { title: 'Probability & Statistics', glyph: 'Σ', color: '#C0905C', desc: "Bayes, MLE, expectation, variance. The probabilistic lens for why models generalize — and when they don't.", docs: 18, cards: 112, progress: 41, updated: '3d ago' },
  { title: 'Linear Algebra',         glyph: 'M', color: '#9AA56A', desc: 'Vectors, projections, eigendecomposition, SVD. The substrate every ML operation actually runs on.', docs: 11, cards: 72,  progress: 88, updated: '5d ago' },
  { title: 'Optimization',           glyph: '∇', color: '#B86D76', desc: 'Gradient descent and its descendants — momentum, Adam, second-order methods, and the landscape of non-convex loss.', docs: 9,  cards: 54,  progress: 32, updated: '1w ago' },
  { title: 'Information Theory',     glyph: 'H', color: '#8E857A', desc: "Entropy, KL divergence, mutual information. How much your model could possibly know, given what it's seen.", docs: 7,  cards: 38,  progress: 18, updated: '2w ago' },
]

const RECENT = [
  { ext: 'PDF', title: 'Backpropagation — a graph-based derivation', snippet: 'Treats the network as a computation graph and walks the chain rule node-by-node.', coll: 'Neural Networks', chip: 'mastered', updated: '12 min ago' },
  { ext: 'MD',  title: 'Why does Adam work? — annotated paper notes', snippet: 'First- and second-moment estimates of gradients with bias-correction; per-parameter rates.', coll: 'Optimization', chip: 'review', updated: '1h ago' },
  { ext: 'WEB', title: 'Distill: Feature Visualization', snippet: 'Maximize activation of a target neuron via gradient ascent in input space.', coll: 'Neural Networks', chip: 'new', updated: 'Yesterday' },
  { ext: 'NB',  title: 'Hand-derived softmax + cross-entropy gradient', snippet: 'The gradient ∂L/∂z reduces to (ŷ − y) — the result that justifies pairing them.', coll: 'ML Foundations', chip: 'mastered', updated: 'Yesterday' },
]

const CHIP_TONE: Record<string, string> = {
  mastered: '#3A8D7A', review: COPPER, new: '#7E8FB0',
}

// ─── Slim icon rail (icon-only, Gemini-style; tooltips on hover) ─────────────
type ScreenId = 'library' | 'chat' | 'reader' | 'learn' | 'progress' | 'settings'

// Initials for the avatar from a display name ("Ada Lovelace" → "AL", "" → "Y")
function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return 'Y'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}
const RAIL_ITEMS: { id: ScreenId; icon: React.ReactNode; label: string }[] = [
  { id: 'library',  icon: <LibraryBooksRoundedIcon fontSize="small" />, label: 'Library' },
  { id: 'chat',     icon: <ChatRoundedIcon fontSize="small" />,         label: 'Ask Knovex' },
  { id: 'reader',   icon: <MenuBookRoundedIcon fontSize="small" />,     label: 'Reader' },
  { id: 'learn',    icon: <SchoolRoundedIcon fontSize="small" />,       label: 'Learn' },
  { id: 'progress', icon: <InsightsRoundedIcon fontSize="small" />,     label: 'Progress' },
]

function NavRail({ mode, setMode, screen, onSelect, displayName }: {
  mode: ThemeMode; setMode: (m: ThemeMode) => void
  screen: ScreenId; onSelect: (s: ScreenId) => void
  displayName: string
}) {
  const nextMode: Record<ThemeMode, ThemeMode> = { dark: 'medium', medium: 'light', light: 'dark' }
  const modeIcon = { dark: <DarkModeRoundedIcon fontSize="small" />, medium: <Brightness4RoundedIcon fontSize="small" />, light: <LightModeRoundedIcon fontSize="small" /> }[mode]
  return (
    <Box sx={{
      width: 68, flexShrink: 0, bgcolor: 'background.default',
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      py: 1.5, gap: 0.5,
    }}>
      {/* brand — K-as-knowledge-graph mark on an elevated tile */}
      <Tooltip title="Knovex" placement="right" arrow>
        <Box sx={{
          width: 36, height: 36, borderRadius: 2.5, mb: 1.5,
          bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider',
          display: 'grid', placeItems: 'center',
          boxShadow: `0 4px 16px -6px ${COPPER}66`,
          transition: 'transform .15s, box-shadow .15s',
          '&:hover': { transform: 'translateY(-1px)', boxShadow: `0 8px 22px -6px ${COPPER}99` },
        }}>
          <KnovexMark size={22} />
        </Box>
      </Tooltip>

      {RAIL_ITEMS.map((it) => {
        const active = screen === it.id
        return (
          <Tooltip key={it.id} title={it.label} placement="right" arrow>
            <IconButton onClick={() => onSelect(it.id)} sx={{
              width: 44, height: 44, borderRadius: 3,
              color: active ? 'primary.main' : 'text.secondary',
              bgcolor: active ? 'action.selected' : 'transparent',
              '&:hover': { bgcolor: 'action.hover', color: 'text.primary' },
            }}>
              {it.icon}
            </IconButton>
          </Tooltip>
        )
      })}

      <Box sx={{ flex: 1 }} />

      <Tooltip title={`Theme: ${mode}`} placement="right" arrow>
        <IconButton onClick={() => setMode(nextMode[mode])}
          sx={{ width: 44, height: 44, borderRadius: 3, color: 'text.secondary',
            '&:hover': { bgcolor: 'action.hover', color: 'primary.main' } }}>
          {modeIcon}
        </IconButton>
      </Tooltip>
      <Tooltip title="Settings" placement="right" arrow>
        <IconButton onClick={() => onSelect('settings')} sx={{ width: 44, height: 44, borderRadius: 3,
          color: screen === 'settings' ? 'primary.main' : 'text.secondary',
          bgcolor: screen === 'settings' ? 'action.selected' : 'transparent',
          '&:hover': { bgcolor: 'action.hover', color: 'text.primary' } }}>
          <SettingsRoundedIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      <Tooltip title={displayName || 'You'} placement="right" arrow>
        <Box onClick={() => onSelect('settings')} sx={{
          width: 30, height: 30, borderRadius: 2.5, mt: 0.5, cursor: 'pointer',
          background: 'linear-gradient(135deg, rgba(255,255,255,0.14), rgba(255,255,255,0.04))',
          display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 700, color: 'text.primary',
        }}>
          {initialsOf(displayName)}
        </Box>
      </Tooltip>
    </Box>
  )
}

// ─── Buttons (pill, matching rough build) ────────────────────────────────────
function PillBtn({ variant = 'surface', children, onClick }: {
  variant?: 'primary' | 'outline' | 'surface' | 'ghost'; children: React.ReactNode; onClick?: () => void
}) {
  const styles = {
    primary: { background: GRAD, color: '#1A140C', border: '1px solid transparent' },
    outline: { background: 'transparent', color: 'text.secondary', border: '1px solid', borderColor: 'divider' },
    surface: { bgcolor: 'action.hover', color: 'text.primary', border: '1px solid transparent' },
    ghost:   { background: 'transparent', color: 'text.secondary', border: '1px solid transparent' },
  }[variant]
  return (
    <Box component="button" onClick={onClick} sx={{
      display: 'inline-flex', alignItems: 'center', gap: 0.7, height: 32, px: 1.75,
      borderRadius: 99, fontSize: 13, fontWeight: 600, cursor: 'pointer',
      fontFamily: 'inherit', letterSpacing: '-0.005em',
      transition: 'filter .12s, background .12s',
      '&:hover': { filter: 'brightness(1.08)' }, ...styles,
    }}>
      {children}
    </Box>
  )
}

// ─── Collection card ──────────────────────────────────────────────────────────
function CollectionCard({ c, i, onOpen }: { c: typeof COLLECTIONS[number]; i: number; onOpen: () => void }) {
  return (
    <Box onClick={onOpen} sx={{
      position: 'relative', bgcolor: 'background.paper', borderRadius: 4, cursor: 'pointer',
      border: '1px solid transparent', overflow: 'hidden', p: 2.25,
      display: 'flex', flexDirection: 'column', gap: 1.5,
      animation: `${riseIn} .45s cubic-bezier(0.22,1,0.36,1) both`,
      animationDelay: `${i * 45}ms`,
      transition: 'border-color .15s, transform .15s, box-shadow .15s',
      '&:hover': { borderColor: 'divider', transform: 'translateY(-2px)',
        boxShadow: '0 18px 40px -24px rgba(0,0,0,0.6)' },
    }}>
      <Box sx={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: c.color }} />
      <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
        <Box sx={{
          width: 38, height: 38, borderRadius: 2.5, display: 'grid', placeItems: 'center',
          fontSize: 20, fontWeight: 700, color: c.color,
          border: '1px solid', borderColor: `${c.color}55`, bgcolor: `${c.color}14`,
        }}>{c.glyph}</Box>
        <IconButton size="small" sx={{ color: 'text.disabled' }}><MoreHorizRoundedIcon fontSize="small" /></IconButton>
      </Stack>
      <Box>
        <Typography sx={{ fontWeight: 600, fontSize: 15, mb: 0.5 }}>{c.title}</Typography>
        <Typography variant="body2" color="text.secondary" sx={{
          lineHeight: 1.55, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
        }}>{c.desc}</Typography>
      </Box>
      <Box sx={{ mt: 'auto' }}>
        <Stack direction="row" alignItems="center" spacing={1.25} sx={{ mb: 1 }}>
          <Box sx={{ flex: 1, height: 5, borderRadius: 3, bgcolor: 'action.hover', overflow: 'hidden' }}>
            <Box sx={{ width: `${c.progress}%`, height: '100%', borderRadius: 3, background: c.color }} />
          </Box>
          <Typography variant="caption" sx={{ fontFamily: 'monospace', color: 'text.secondary' }}>{c.progress}%</Typography>
        </Stack>
        <Stack direction="row" spacing={1} sx={{ fontFamily: 'monospace', fontSize: 11, color: 'text.disabled', letterSpacing: '0.04em' }}>
          <span>{c.docs} DOCS</span><span>·</span><span>{c.cards} CARDS</span><span>·</span><span>{c.updated}</span>
        </Stack>
      </Box>
    </Box>
  )
}

// ─── Filter pill ──────────────────────────────────────────────────────────────
function FilterPill({ label, ct, on, onClick }: { label: string; ct: string; on: boolean; onClick: () => void }) {
  return (
    <Box component="button" onClick={onClick} sx={{
      display: 'inline-flex', alignItems: 'center', gap: 0.6, height: 30, px: 1.4,
      borderRadius: 99, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600,
      border: '1px solid', transition: 'all .12s',
      borderColor: on ? 'transparent' : 'divider',
      background: on ? GRAD : 'transparent',
      color: on ? '#1A140C' : 'text.secondary',
      '&:hover': { borderColor: on ? 'transparent' : 'text.disabled' },
    }}>
      {label}
      <Box component="span" sx={{ fontFamily: 'monospace', fontSize: 11, opacity: 0.7 }}>{ct}</Box>
    </Box>
  )
}

// ─── Section head ─────────────────────────────────────────────────────────────
function SectionHead({ title, count, action }: { title: string; count: string; action?: React.ReactNode }) {
  return (
    <Stack direction="row" alignItems="center" sx={{ mt: 3.5, mb: 1.5 }}>
      <Typography sx={{ fontWeight: 600, fontSize: 16 }}>{title}</Typography>
      <Typography component="span" sx={{ ml: 1, fontFamily: 'monospace', fontSize: 12, color: 'text.disabled' }}>{count}</Typography>
      <Box sx={{ flex: 1 }} />
      {action}
    </Stack>
  )
}

// ─── Library screen ───────────────────────────────────────────────────────────
function LibraryScreen() {
  const [filter, setFilter] = useState('all')
  const filters = [
    { id: 'all', label: 'All', ct: '81' }, { id: 'mastered', label: 'Mastered', ct: '34' },
    { id: 'review', label: 'Review', ct: '29' }, { id: 'new', label: 'New', ct: '18' },
  ]
  const [bandOpen, setBandOpen] = useState(true)
  const [openColl, setOpenColl] = useState<typeof COLLECTIONS[number] | null>(null)
  const [createOpen, setCreateOpen] = useState(false)

  if (openColl) return (
    <>
      <CollectionDetail c={openColl} onBack={() => setOpenColl(null)} onNew={() => setCreateOpen(true)} />
      {createOpen && <CreateCollectionModal onClose={() => setCreateOpen(false)} />}
    </>
  )

  return (
    <>
    <Box sx={{ flex: 1, overflow: 'auto' }}>
      <Box sx={{ px: { xs: 3, md: 5 }, py: 3.5, maxWidth: 1180, mx: 'auto' }}>
        {/* Header */}
        <Stack direction="row" alignItems="flex-end" gap={2} flexWrap="wrap" sx={{ mb: 3 }}>
          <Box sx={{ flex: 1, minWidth: 280 }}>
            <Typography sx={{ fontFamily: 'monospace', fontSize: 11, letterSpacing: '0.12em',
              color: 'text.disabled', mb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
              <Box component="span" sx={{ width: 14, height: 1, bgcolor: 'text.disabled' }} /> LIBRARY · 6 COLLECTIONS
            </Typography>
            <Typography variant="h4" sx={{ fontWeight: 700, letterSpacing: '-0.02em' }}>
              Your <Box component="em" sx={{ fontStyle: 'normal', color: 'primary.main' }}>knowledge</Box> base
            </Typography>
          </Box>
          <Stack direction="row" spacing={1}>
            <PillBtn variant="outline"><AttachFileRoundedIcon sx={{ fontSize: 15 }} /> Import</PillBtn>
            <PillBtn variant="primary" onClick={() => setCreateOpen(true)}><AddRoundedIcon sx={{ fontSize: 16 }} /> New collection</PillBtn>
          </Stack>
        </Stack>

        {/* AI band — "Knovex noticed" */}
        {bandOpen && (
          <Box sx={{
            position: 'relative', display: 'flex', alignItems: 'center', gap: 2,
            p: 2, borderRadius: 4, mb: 3, bgcolor: 'background.paper',
            border: '1px solid', borderColor: `${COPPER}33`,
            background: `linear-gradient(120deg, ${COPPER}14, transparent 60%)`,
            animation: `${riseIn} .5s ease both`,
          }}>
            <Box sx={{ width: 40, height: 40, borderRadius: 2.5, flexShrink: 0, display: 'grid', placeItems: 'center',
              background: `${COPPER}1f`, color: COPPER }}>
              <AutoAwesomeRoundedIcon />
            </Box>
            <Box sx={{ flex: 1 }}>
              <Typography sx={{ fontFamily: 'monospace', fontSize: 11, letterSpacing: '0.08em',
                color: COPPER_DARK, fontWeight: 700, mb: 0.4 }}>KNOVEX NOTICED</Typography>
              <Typography variant="body2" sx={{ lineHeight: 1.55, color: 'text.primary' }}>
                You've been reading about <em>backpropagation</em> for 3 days but haven't reviewed the
                {' '}<em>chain rule</em> derivation since April. Want me to queue 4 flashcards and a 6-minute refresher?
              </Typography>
            </Box>
            <Stack direction="row" spacing={1} sx={{ flexShrink: 0 }}>
              <PillBtn variant="outline">Not now</PillBtn>
              <PillBtn variant="primary">Queue review <ArrowForwardRoundedIcon sx={{ fontSize: 14 }} /></PillBtn>
            </Stack>
            <IconButton size="small" onClick={() => setBandOpen(false)}
              sx={{ position: 'absolute', top: 6, right: 6, color: 'text.disabled' }}>
              <CloseRoundedIcon sx={{ fontSize: 15 }} />
            </IconButton>
          </Box>
        )}

        {/* Filters + view tabs */}
        <Stack direction="row" alignItems="center" gap={1} flexWrap="wrap">
          <Stack direction="row" spacing={0.75}>
            {filters.map((f) => (
              <FilterPill key={f.id} label={f.label} ct={f.ct} on={filter === f.id} onClick={() => setFilter(f.id)} />
            ))}
          </Stack>
          <Box sx={{ flex: 1 }} />
          <Box sx={{ display: 'flex', gap: 0.25, p: 0.4, borderRadius: 2.5, bgcolor: 'action.hover' }}>
            {['Grid', 'Graph', 'Timeline'].map((t, i) => (
              <Box key={t} component="button" sx={{
                height: 26, px: 1.25, borderRadius: 1.5, fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600,
                cursor: 'pointer', border: 0, display: 'inline-flex', alignItems: 'center', gap: 0.5,
                bgcolor: i === 0 ? 'background.paper' : 'transparent',
                color: i === 0 ? 'text.primary' : 'text.secondary',
              }}>
                {i === 0 && <GridViewRoundedIcon sx={{ fontSize: 13 }} />}{t}
              </Box>
            ))}
          </Box>
        </Stack>

        {/* Collections */}
        <SectionHead title="Collections" count="06"
          action={<PillBtn variant="ghost">See all <ArrowForwardRoundedIcon sx={{ fontSize: 13 }} /></PillBtn>} />
        <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', lg: '1fr 1fr 1fr' } }}>
          {COLLECTIONS.map((c, i) => <CollectionCard key={c.title} c={c} i={i} onOpen={() => setOpenColl(c)} />)}
        </Box>

        {/* Recent activity */}
        <SectionHead title="Recent activity" count={String(RECENT.length)} />
        <Box sx={{ bgcolor: 'background.paper', borderRadius: 4, overflow: 'hidden', border: '1px solid transparent' }}>
          {RECENT.map((d, i) => (
            <Stack key={i} direction="row" alignItems="center" gap={2} sx={{
              px: 2, py: 1.5,
              borderTop: i === 0 ? 'none' : '1px solid', borderColor: 'divider',
              '&:hover': { bgcolor: 'action.hover' }, transition: 'background .1s', cursor: 'pointer',
            }}>
              <Box sx={{ width: 34, height: 34, borderRadius: 2, flexShrink: 0, display: 'grid', placeItems: 'center',
                fontFamily: 'monospace', fontSize: 10, fontWeight: 700, color: 'text.secondary',
                bgcolor: 'action.hover', border: '1px solid', borderColor: 'divider' }}>{d.ext}</Box>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography sx={{ fontWeight: 600, fontSize: 13.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.title}</Typography>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.snippet}</Typography>
              </Box>
              <Typography variant="caption" color="text.secondary" sx={{ width: 130, flexShrink: 0, display: { xs: 'none', md: 'block' } }}>{d.coll}</Typography>
              <Box sx={{ width: 90, flexShrink: 0, display: { xs: 'none', sm: 'block' } }}>
                <Box component="span" sx={{
                  display: 'inline-flex', alignItems: 'center', gap: 0.5, px: 0.9, height: 21, borderRadius: 1.5,
                  fontFamily: 'monospace', fontSize: 10.5, fontWeight: 600,
                  color: CHIP_TONE[d.chip], bgcolor: `${CHIP_TONE[d.chip]}1c`,
                  border: '1px solid', borderColor: `${CHIP_TONE[d.chip]}44`,
                }}>
                  <Box component="span" sx={{ width: 5, height: 5, borderRadius: '50%', bgcolor: CHIP_TONE[d.chip] }} />
                  {d.chip}
                </Box>
              </Box>
              <Typography variant="caption" color="text.disabled" sx={{ width: 84, flexShrink: 0, textAlign: 'right', display: { xs: 'none', sm: 'block' } }}>{d.updated}</Typography>
            </Stack>
          ))}
        </Box>

        <Box sx={{ height: 40 }} />
      </Box>
    </Box>
    {createOpen && <CreateCollectionModal onClose={() => setCreateOpen(false)} />}
    </>
  )
}

// ─── Collection detail (opens when a collection card is clicked) ─────────────
const EXT_COLOR: Record<string, string> = { PDF: '#CF3A3A', MD: '#B5803E', DOCX: '#1C6DD6', NB: '#7C5BD6', WEB: '#3A8D7A', TXT: '#7A7D85' }
const COLLECTION_DOCS = [
  { title: 'Backpropagation — a graph-based derivation', ext: 'PDF',  status: 'ready',    meta: '14 pages · 12 cards', updated: '2h ago' },
  { title: 'Goodfellow et al. — Ch. 6: Feedforward Networks', ext: 'PDF', status: 'ready', meta: '31 pages · 24 cards', updated: 'Yesterday' },
  { title: 'Hand-derived softmax + cross-entropy gradient', ext: 'NB',  status: 'ready',    meta: 'cell 12 · 8 cards',  updated: 'Yesterday' },
  { title: 'Why does the chain rule even work? — annotated', ext: 'MD', status: 'ready',    meta: '1 note · 5 cards',   updated: '3d ago' },
  { title: 'Lecture notes — backprop', ext: 'DOCX', status: 'ready',    meta: '6 pages · 9 cards',   updated: '5d ago' },
  { title: 'Chain rule reference — fresh import', ext: 'MD', status: 'indexing', meta: 'extracting…',   updated: 'just now' },
]

function CollectionDetail({ c, onBack, onNew }: { c: typeof COLLECTIONS[number]; onBack: () => void; onNew: () => void }) {
  const [filter, setFilter] = useState('all')
  return (
    <Box sx={{ flex: 1, overflow: 'auto' }}>
      <Box sx={{ px: { xs: 3, md: 5 }, py: 3.5, maxWidth: 1100, mx: 'auto' }}>
        {/* back */}
        <Box component="button" onClick={onBack} sx={{
          display: 'inline-flex', alignItems: 'center', gap: 0.6, mb: 2.5, p: 0, border: 0, background: 'none',
          fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600, color: 'text.secondary', cursor: 'pointer',
          '&:hover': { color: 'text.primary' } }}>
          <ArrowBackRoundedIcon sx={{ fontSize: 15 }} /> Library
        </Box>

        {/* header */}
        <Stack direction="row" alignItems="flex-start" gap={2.5} flexWrap="wrap" sx={{ mb: 3 }}>
          <Box sx={{ width: 56, height: 56, borderRadius: 3, flexShrink: 0, display: 'grid', placeItems: 'center',
            fontSize: 28, fontWeight: 700, color: c.color, bgcolor: `${c.color}16`, border: `1px solid ${c.color}55` }}>{c.glyph}</Box>
          <Box sx={{ flex: 1, minWidth: 260 }}>
            <Typography sx={{ fontFamily: 'monospace', fontSize: 10.5, color: 'text.disabled', letterSpacing: '0.12em', mb: 0.5 }}>COLLECTION</Typography>
            <Typography variant="h4" sx={{ fontWeight: 700, letterSpacing: '-0.02em', mb: 0.75 }}>{c.title}</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 560, lineHeight: 1.55, mb: 1.5 }}>{c.desc}</Typography>
            <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap">
              <Stack direction="row" spacing={1.25} alignItems="center" sx={{ minWidth: 200 }}>
                <Box sx={{ width: 120, height: 6, borderRadius: 3, bgcolor: 'action.hover', overflow: 'hidden' }}>
                  <Box sx={{ width: `${c.progress}%`, height: '100%', borderRadius: 3, bgcolor: c.color }} />
                </Box>
                <Typography sx={{ fontFamily: 'monospace', fontSize: 12, color: 'text.secondary' }}>{c.progress}% mastered</Typography>
              </Stack>
              <Typography sx={{ fontFamily: 'monospace', fontSize: 11, color: 'text.disabled', letterSpacing: '0.04em' }}>{c.docs} DOCS · {c.cards} CARDS · updated {c.updated}</Typography>
            </Stack>
          </Box>
          <Stack direction="row" spacing={1}>
            <PillBtn variant="outline"><MenuBookRoundedIcon sx={{ fontSize: 15 }} /> Open in Reader</PillBtn>
            <PillBtn variant="primary"><UploadFileRoundedIcon sx={{ fontSize: 15 }} /> Add document</PillBtn>
          </Stack>
        </Stack>

        {/* filters */}
        <Stack direction="row" alignItems="center" gap={1} sx={{ mb: 1.5 }}>
          <Stack direction="row" spacing={0.75}>
            {[{ id: 'all', label: 'All docs', ct: String(COLLECTION_DOCS.length) }, { id: 'ready', label: 'Ready', ct: '5' }, { id: 'indexing', label: 'Indexing', ct: '1' }].map(f => (
              <FilterPill key={f.id} label={f.label} ct={f.ct} on={filter === f.id} onClick={() => setFilter(f.id)} />
            ))}
          </Stack>
          <Box sx={{ flex: 1 }} />
          <PillBtn variant="ghost">Sort: recent</PillBtn>
        </Stack>

        {/* document list */}
        <Box sx={{ bgcolor: 'background.paper', borderRadius: 4, overflow: 'hidden' }}>
          {COLLECTION_DOCS.map((d, i) => {
            const indexing = d.status === 'indexing'
            const tone = indexing ? COPPER : '#3A8D7A'
            return (
              <Stack key={i} direction="row" alignItems="center" gap={2} sx={{
                px: 2, py: 1.5, borderTop: i === 0 ? 'none' : '1px solid', borderColor: 'divider',
                '&:hover': { bgcolor: 'action.hover' }, transition: 'background .1s', cursor: 'pointer' }}>
                <Box sx={{ width: 34, height: 34, borderRadius: 2, flexShrink: 0, display: 'grid', placeItems: 'center',
                  fontFamily: 'monospace', fontSize: 9.5, fontWeight: 700, color: '#fff', bgcolor: EXT_COLOR[d.ext] ?? '#7A7D85' }}>{d.ext}</Box>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography sx={{ fontWeight: 600, fontSize: 13.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.title}</Typography>
                  <Typography variant="caption" color="text.disabled" sx={{ fontFamily: 'monospace' }}>{d.meta}</Typography>
                </Box>
                <Box component="span" sx={{
                  display: 'inline-flex', alignItems: 'center', gap: 0.5, px: 0.9, height: 21, borderRadius: 1.5, flexShrink: 0,
                  fontFamily: 'monospace', fontSize: 10.5, fontWeight: 600, color: tone, bgcolor: `${tone}1c`, border: `1px solid ${tone}44` }}>
                  <Box component="span" sx={{ width: 5, height: 5, borderRadius: '50%', bgcolor: tone,
                    ...(indexing && { animation: `${blink} 1.2s ease-in-out infinite` }) }} />
                  {d.status}
                </Box>
                <Typography variant="caption" color="text.disabled" sx={{ width: 84, flexShrink: 0, textAlign: 'right', display: { xs: 'none', sm: 'block' } }}>{d.updated}</Typography>
                <IconButton size="small" sx={{ color: 'text.disabled' }}><MoreHorizRoundedIcon fontSize="small" /></IconButton>
              </Stack>
            )
          })}
        </Box>

        {/* empty-add hint */}
        <Box onClick={onNew} sx={{ mt: 2, p: 2, borderRadius: 3, border: '1px dashed', borderColor: 'divider',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1, cursor: 'pointer', color: 'text.disabled',
          '&:hover': { borderColor: COPPER, color: COPPER } }}>
          <AddRoundedIcon sx={{ fontSize: 16 }} /> Drop a file here or create another collection
        </Box>
        <Box sx={{ height: 40 }} />
      </Box>
    </Box>
  )
}

// ─── New-collection modal ────────────────────────────────────────────────────
const NEW_COLORS = ['#DDA76A', '#3A8D7A', '#C0905C', '#9AA56A', '#B86D76', '#7E8FB0', '#8E857A', '#B07CF2']
const NEW_GLYPHS = ['ƒ', 'η', 'Σ', 'M', '∇', 'H', 'λ', 'π', '∂']
function CreateCollectionModal({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState('')
  const [color, setColor] = useState(NEW_COLORS[0])
  const [glyph, setGlyph] = useState(NEW_GLYPHS[0])
  return (
    <Box onClick={onClose} sx={{ position: 'fixed', inset: 0, zIndex: 1300, display: 'grid', placeItems: 'center',
      bgcolor: 'rgba(0,0,0,0.55)', animation: `${riseIn} .2s ease both` }}>
      <Box onClick={(e) => e.stopPropagation()} sx={{ width: 460, maxWidth: '92vw', bgcolor: 'background.paper',
        borderRadius: 4, p: 3, border: '1px solid', borderColor: 'divider', boxShadow: '0 40px 90px -30px rgba(0,0,0,0.7)' }}>
        <Stack direction="row" alignItems="center" sx={{ mb: 2.5 }}>
          <Box sx={{ width: 42, height: 42, borderRadius: 2.5, display: 'grid', placeItems: 'center', mr: 1.5,
            fontSize: 22, fontWeight: 700, color, bgcolor: `${color}16`, border: `1px solid ${color}55`, transition: 'all .15s' }}>{glyph}</Box>
          <Box sx={{ flex: 1 }}>
            <Typography variant="h6" sx={{ fontWeight: 700 }}>New collection</Typography>
            <Typography variant="caption" color="text.secondary">Group related documents so Knovex can link their concepts.</Typography>
          </Box>
          <IconButton size="small" onClick={onClose} sx={{ color: 'text.disabled' }}><CloseRoundedIcon fontSize="small" /></IconButton>
        </Stack>

        <Typography sx={{ fontFamily: 'monospace', fontSize: 10.5, color: 'text.disabled', letterSpacing: '0.1em', mb: 0.75 }}>NAME</Typography>
        <Box component="input" autoFocus value={name} onChange={(e) => setName((e.target as HTMLInputElement).value)}
          placeholder="e.g. Reinforcement Learning"
          sx={{ width: '100%', height: 40, px: 1.5, mb: 2.5, borderRadius: 2, border: '1px solid', borderColor: 'divider',
            bgcolor: 'background.default', color: 'text.primary', fontFamily: 'inherit', fontSize: 14, outline: 'none',
            '&:focus': { borderColor: COPPER } }} />

        <Typography sx={{ fontFamily: 'monospace', fontSize: 10.5, color: 'text.disabled', letterSpacing: '0.1em', mb: 0.75 }}>COLOR</Typography>
        <Stack direction="row" spacing={1} sx={{ mb: 2.5 }}>
          {NEW_COLORS.map(cc => (
            <Box key={cc} onClick={() => setColor(cc)} sx={{ width: 26, height: 26, borderRadius: '50%', bgcolor: cc, cursor: 'pointer',
              outline: color === cc ? `2px solid ${cc}` : '2px solid transparent', outlineOffset: 2, transition: 'outline-color .15s' }} />
          ))}
        </Stack>

        <Typography sx={{ fontFamily: 'monospace', fontSize: 10.5, color: 'text.disabled', letterSpacing: '0.1em', mb: 0.75 }}>SYMBOL</Typography>
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mb: 3 }}>
          {NEW_GLYPHS.map(g => (
            <Box key={g} component="button" onClick={() => setGlyph(g)} sx={{
              width: 36, height: 36, borderRadius: 2, cursor: 'pointer', fontFamily: 'inherit', fontSize: 18, fontWeight: 700,
              border: '1px solid', borderColor: glyph === g ? COPPER : 'divider',
              bgcolor: glyph === g ? `${COPPER}14` : 'transparent', color: glyph === g ? COPPER : 'text.secondary' }}>{g}</Box>
          ))}
        </Stack>

        <Stack direction="row" spacing={1} justifyContent="flex-end">
          <PillBtn variant="ghost" onClick={onClose}>Cancel</PillBtn>
          <PillBtn variant="primary" onClick={onClose}><CheckRoundedIcon sx={{ fontSize: 15 }} /> Create collection</PillBtn>
        </Stack>
      </Box>
    </Box>
  )
}

// ─── Reader screen ────────────────────────────────────────────────────────────
const HL = { concept: COPPER, definition: '#3A8D7A', question: '#B86D76' }

// inline highlight run
function Hl({ tone, children }: { tone: keyof typeof HL; children: React.ReactNode }) {
  return (
    <Box component="span" sx={{
      borderBottom: `2px solid ${HL[tone]}`, bgcolor: `${HL[tone]}1f`,
      borderRadius: '2px', px: 0.3, cursor: 'pointer',
    }}>{children}</Box>
  )
}

const GHOST_NOTES = [
  { top: 70,  text: 'Chain rule',          tag: 'concept' },
  { top: 150, text: 'Local Jacobian',      tag: 'definition' },
  { top: 286, text: 'Adjoint = transpose', tag: 'concept' },
  { top: 410, text: 'Cheap gradient',      tag: 'Baur–Strassen' },
]

const READING_MODES = [
  { id: 'page',  label: 'Page',  glyph: '▭' },
  { id: 'focus', label: 'Focus', glyph: '◉' },
  { id: 'split', label: 'Split', glyph: '▤' },
  { id: 'speed', label: 'Speed', glyph: '≫' },
]

function ReaderScreen() {
  const [page, setPage] = useState(5)
  const [dir, setDir] = useState<1 | -1>(1)
  const [mode, setMode] = useState('page')
  const [tab, setTab] = useState('Page')
  const [assistantOpen, setAssistantOpen] = useState(false)
  const total = 14
  const progress = 67

  // change page with direction (drives the slide animation)
  const goPage = (delta: 1 | -1) => {
    setPage((p) => {
      const next = Math.min(total, Math.max(1, p + delta))
      if (next !== p) setDir(delta)
      return next
    })
  }

  // keyboard ←/→ flips pages too (ignored while typing in a field)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (t && /^(INPUT|TEXTAREA)$/.test(t.tagName)) return
      if (e.key === 'ArrowRight') goPage(1)
      else if (e.key === 'ArrowLeft') goPage(-1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  const stages = [
    { label: 'Parsing pages', st: 'done' },
    { label: 'Extracting concepts', st: 'active' },
    { label: 'Linking sources', st: 'pending' },
  ]

  return (
    <Box sx={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
      {/* PDF pane */}
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Indexing banner */}
        <Box sx={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 1,
          px: 2, py: 0.9, fontSize: 12, color: 'text.secondary', flexShrink: 0 }}>
          <Box sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: COPPER,
            boxShadow: `0 0 0 0 ${COPPER}`, animation: `${pulse} 1.6s ease-out infinite` }} />
          <Box component="span" sx={{ color: 'text.primary', fontWeight: 600 }}>Indexing</Box>
          <Box component="span" sx={{ fontFamily: 'monospace', fontSize: 11, color: 'text.disabled' }}>backprop-graph-derivation.pdf</Box>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ ml: 1, fontFamily: 'monospace', fontSize: 10.5, letterSpacing: '0.06em' }}>
            {stages.map((s, i) => (
              <Stack key={i} direction="row" spacing={0.6} alignItems="center" sx={{
                color: s.st === 'done' ? HL.definition : s.st === 'active' ? COPPER : 'text.disabled' }}>
                <Box sx={{ width: 6, height: 6, borderRadius: '50%',
                  bgcolor: s.st === 'pending' ? 'transparent' : 'currentColor',
                  border: s.st === 'pending' ? '1px solid currentColor' : 'none',
                  ...(s.st === 'active' && { animation: `${blink} 1.2s ease-in-out infinite` }) }} />
                <span>{s.label.toUpperCase()}</span>
              </Stack>
            ))}
          </Stack>
          <Box sx={{ flex: 1 }} />
          <Box component="span" sx={{ fontFamily: 'monospace', color: COPPER, fontWeight: 700 }}>{progress}%</Box>
          <Box component="button" sx={{ fontFamily: 'inherit', fontSize: 12, color: 'text.disabled', cursor: 'pointer', border: 0, background: 'none' }}>Skip</Box>
          <Box sx={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 2, bgcolor: 'action.hover' }}>
            <Box sx={{ width: `${progress}%`, height: '100%', background: GRAD }} />
          </Box>
        </Box>

        {/* File source bar */}
        <Stack direction="row" alignItems="center" gap={1} sx={{ px: 2, py: 1, flexShrink: 0 }}>
          <SourceChip><Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: COPPER }} /> ML Foundations ▾</SourceChip>
          <Box component="span" sx={{ color: 'text.disabled' }}>›</Box>
          <SourceChip>
            <Box component="span" sx={{ px: 0.5, py: 0.1, borderRadius: 0.5, bgcolor: '#CF3A3A', color: '#fff', fontFamily: 'monospace', fontSize: 8.5, fontWeight: 700 }}>PDF</Box>
            Backpropagation — a graph-based derivation ▾
          </SourceChip>
          <Box sx={{ flex: 1 }} />
          <PillBtn variant="outline"><AttachFileRoundedIcon sx={{ fontSize: 14 }} /> Change file…</PillBtn>
          <PillBtn variant="primary"><UploadFileRoundedIcon sx={{ fontSize: 15 }} /> Upload</PillBtn>
        </Stack>

        {/* Top toolbar */}
        <Stack direction="row" alignItems="center" gap={1} sx={{ px: 2, pb: 1, flexShrink: 0 }}>
          <IconButton size="small" onClick={() => setAssistantOpen(o => !o)} sx={{ color: 'text.secondary' }}>
            <MenuBookRoundedIcon fontSize="small" />
          </IconButton>
          <MiniChip>14 pages · p. {page}</MiniChip>
          <MiniChip tone={HL.definition}><Box component="span" sx={{ width: 5, height: 5, borderRadius: '50%', bgcolor: HL.definition }} /> 4 highlights · 12 cards</MiniChip>
          <Box sx={{ flex: 1 }} />
          <Box sx={{ display: 'flex', gap: 0.25, p: 0.4, borderRadius: 2.5, bgcolor: 'action.hover' }}>
            {['Page', 'Outline', 'Highlights · 4'].map((t) => (
              <Box key={t} component="button" onClick={() => setTab(t)} sx={{
                height: 26, px: 1.25, borderRadius: 1.5, fontFamily: 'inherit', fontSize: 12, fontWeight: 600,
                cursor: 'pointer', border: 0,
                bgcolor: tab === t ? 'background.paper' : 'transparent',
                color: tab === t ? 'text.primary' : 'text.secondary' }}>{t}</Box>
            ))}
          </Box>
          <Tooltip title="Open Page Assistant" arrow>
            <IconButton size="small" onClick={() => setAssistantOpen(o => !o)}
              sx={{ color: assistantOpen ? 'primary.main' : 'text.secondary' }}>
              <AutoAwesomeRoundedIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Stack>

        {/* Paper (distraction-free reading column) */}
        <Box sx={{ flex: 1, overflow: 'auto', px: 2, py: 1 }}>
          <Box key={page} sx={{
            position: 'relative', maxWidth: 720, mx: 'auto', mb: 4,
            bgcolor: 'background.paper', borderRadius: 3, px: { xs: 3, md: 6 }, py: 5,
            boxShadow: '0 24px 60px -34px rgba(0,0,0,0.6)',
            animation: `${dir === 1 ? slideInRight : slideInLeft} .34s cubic-bezier(0.22,1,0.36,1) both`,
          }}>
            <Stack direction="row" justifyContent="space-between" sx={{ fontFamily: 'monospace', fontSize: 10.5, color: 'text.disabled', mb: 3, letterSpacing: '0.06em' }}>
              <span>4 · THE BACKWARD PASS</span><span>KNOVEX NOTES · MAR '26</span>
            </Stack>
            <Typography variant="h4" sx={{ fontWeight: 700, mb: 1, display: 'flex', gap: 1.5, alignItems: 'baseline' }}>
              <Box component="span" sx={{ color: 'primary.main' }}>4</Box> The Backward Pass
            </Typography>
            <Typography sx={{ fontStyle: 'italic', color: 'text.secondary', mb: 3, fontSize: 16 }}>
              Why differentiating a network is no more expensive than running it forward.
            </Typography>
            <Typography sx={{ lineHeight: 1.9, mb: 2.5, fontSize: 15.5 }}>
              Once activations have been cached on the forward pass, the backward pass becomes a
              mechanical traversal of the computation graph. Each node carries a{' '}
              <Hl tone="definition">local Jacobian</Hl>; the <Hl tone="concept">chain rule</Hl>{' '}
              glues these locals into a single global gradient.
            </Typography>
            <Typography variant="overline" sx={{ color: 'text.disabled', fontWeight: 700 }}>4.1 Local gradients</Typography>
            <Typography sx={{ lineHeight: 1.9, my: 2, fontSize: 15.5 }}>
              Because the layer is <Hl tone="concept">linear in its parameters</Hl>, the local
              Jacobian collapses to a rank-one outer product. The same matrix appears in both
              directions, transposed — the adjoint of a linear map <em>is</em> its transpose{' '}
              <Hl tone="question">this symmetry in §6</Hl>.
            </Typography>
            <Box sx={{ my: 3, py: 2, textAlign: 'center', fontFamily: 'monospace', fontSize: 15,
              bgcolor: 'action.hover', borderRadius: 2, position: 'relative' }}>
              ∂L / ∂W⁽ˡ⁾ = δ⁽ˡ⁾ · (a⁽ˡ⁻¹⁾)ᵀ
              <Box component="span" sx={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: 'text.disabled', fontSize: 12 }}>(4.1)</Box>
            </Box>

            {/* Right-margin ghost notes (AI concept labels) */}
            <Box sx={{ position: 'absolute', top: 90, right: -8, width: 140, display: { xs: 'none', lg: 'block' } }}>
              {GHOST_NOTES.map((g, i) => (
                <Box key={i} sx={{ position: 'absolute', top: g.top, left: 0, right: 0,
                  fontSize: 11, color: 'text.secondary', pl: 1.25,
                  borderLeft: `2px solid ${COPPER}66`, animation: `${riseIn} .5s ease both`, animationDelay: `${i * 90 + 200}ms` }}>
                  {g.text}
                  <Box sx={{ fontFamily: 'monospace', fontSize: 9.5, color: 'text.disabled', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{g.tag}</Box>
                </Box>
              ))}
            </Box>
          </Box>
        </Box>

        {/* Bottom: reading modes + legend + pager */}
        <Stack direction="row" alignItems="center" gap={1.5} flexWrap="wrap" sx={{ px: 2, py: 1.25, flexShrink: 0 }}>
          <Box sx={{ display: 'flex', gap: 0.25, p: 0.4, borderRadius: 2.5, bgcolor: 'action.hover' }}>
            {READING_MODES.map((m) => (
              <Box key={m.id} component="button" onClick={() => setMode(m.id)} sx={{
                height: 26, px: 1.1, borderRadius: 1.5, fontFamily: 'inherit', fontSize: 12, fontWeight: 600,
                cursor: 'pointer', border: 0, display: 'inline-flex', alignItems: 'center', gap: 0.5,
                bgcolor: mode === m.id ? 'background.paper' : 'transparent',
                color: mode === m.id ? 'primary.main' : 'text.secondary' }}>
                <Box component="span" sx={{ fontSize: 11 }}>{m.glyph}</Box>{m.label}
              </Box>
            ))}
          </Box>
          <Stack direction="row" spacing={1.25} sx={{ fontSize: 11, color: 'text.secondary' }}>
            {(['concept', 'definition', 'question'] as const).map((k) => (
              <Stack key={k} direction="row" spacing={0.5} alignItems="center">
                <Box sx={{ width: 9, height: 9, borderRadius: '2px', bgcolor: HL[k] }} />
                <span style={{ textTransform: 'capitalize' }}>{k === 'definition' ? 'Defn' : k}</span>
              </Stack>
            ))}
          </Stack>
          <Box sx={{ flex: 1 }} />
          <Stack direction="row" spacing={0.5} alignItems="center">
            <IconButton size="small" disabled={page <= 1} onClick={() => goPage(-1)} sx={{ color: 'text.secondary' }}>
              <ArrowForwardRoundedIcon sx={{ fontSize: 16, transform: 'rotate(180deg)' }} />
            </IconButton>
            <Box sx={{ fontFamily: 'monospace', fontSize: 13, px: 1, py: 0.4, borderRadius: 1.5, bgcolor: 'action.hover' }}>
              {page} <Box component="span" sx={{ color: 'text.disabled' }}>/ {total}</Box>
            </Box>
            <IconButton size="small" disabled={page >= total} onClick={() => goPage(1)} sx={{ color: 'text.secondary' }}>
              <ArrowForwardRoundedIcon sx={{ fontSize: 16 }} />
            </IconButton>
          </Stack>
        </Stack>
      </Box>

      {/* Page Assistant (slide-over) */}
      <Box sx={{
        width: assistantOpen ? 360 : 0, flexShrink: 0, overflow: 'hidden',
        transition: 'width .32s cubic-bezier(0.22,1,0.36,1)',
        bgcolor: 'background.paper',
      }}>
        <Box sx={{ width: 360, height: '100%', display: 'flex', flexDirection: 'column', p: 2 }}>
          <Typography sx={{ fontFamily: 'monospace', fontSize: 10.5, color: 'text.disabled', letterSpacing: '0.12em', mb: 0.5 }}>PAGE ASSISTANT</Typography>
          <Typography variant="h6" sx={{ fontWeight: 700, mb: 0.5 }}>Ask about this page</Typography>
          <Typography variant="caption" color="text.secondary" sx={{ mb: 2 }}>Anchored to <b>p. {page}</b> · haiku-4.5</Typography>

          <Box sx={{ flex: 1, overflow: 'auto' }}>
            <Box sx={{ p: 1.5, borderRadius: 2, bgcolor: 'action.hover', mb: 1.5 }}>
              <Typography variant="body2">Why does backprop have the same cost as the forward pass?</Typography>
            </Box>
            <Box sx={{ borderLeft: `3px solid ${COPPER}`, pl: 1.5, mb: 1.5 }}>
              <Typography variant="body2" sx={{ fontStyle: 'italic', color: 'text.secondary', lineHeight: 1.5 }}>
                "The backward pass executes one matrix-vector product per layer to propagate δ…"
              </Typography>
              <Typography variant="caption" sx={{ fontFamily: 'monospace', color: 'text.disabled' }}>§4.2 · p. 5 · sentence 2</Typography>
            </Box>
            <Typography variant="body2" sx={{ lineHeight: 1.7, mb: 2 }}>
              Because every backward gradient is a single matrix multiply against a value you
              already cached. Same matrices, transposed, opposite directions.
            </Typography>
            <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
              <PillBtn variant="primary">Go deeper ↓</PillBtn>
              <PillBtn variant="surface">Simplify ↓</PillBtn>
              <PillBtn variant="surface">Example →</PillBtn>
            </Stack>
          </Box>

          <Box sx={{ mt: 1.5, p: 1.25, borderRadius: 2.5, bgcolor: 'action.hover' }}>
            <Typography variant="caption" color="text.disabled">Ask anything about this page…</Typography>
            <Stack direction="row" justifyContent="flex-end" sx={{ mt: 1 }}>
              <Box sx={{ width: 30, height: 30, borderRadius: 2, background: GRAD, display: 'grid', placeItems: 'center' }}>
                <ArrowForwardRoundedIcon sx={{ fontSize: 16, color: '#1A140C' }} />
              </Box>
            </Stack>
          </Box>
        </Box>
      </Box>
    </Box>
  )
}

// small helpers for Reader
function SourceChip({ children }: { children: React.ReactNode }) {
  return (
    <Box component="button" sx={{
      display: 'inline-flex', alignItems: 'center', gap: 0.6, height: 30, px: 1.25,
      borderRadius: 2, fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
      border: '1px solid', borderColor: 'divider', bgcolor: 'background.paper', color: 'text.primary',
      maxWidth: 320, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
      '&:hover': { borderColor: 'text.disabled' },
    }}>{children}</Box>
  )
}
function MiniChip({ children, tone }: { children: React.ReactNode; tone?: string }) {
  return (
    <Box component="span" sx={{
      display: 'inline-flex', alignItems: 'center', gap: 0.5, height: 22, px: 0.9, borderRadius: 1.5,
      fontFamily: 'monospace', fontSize: 11, fontWeight: 600,
      color: tone ?? 'text.secondary', bgcolor: tone ? `${tone}1c` : 'action.hover',
      border: '1px solid', borderColor: tone ? `${tone}44` : 'divider',
    }}>{children}</Box>
  )
}

// ─── Learn screen (3-column spaced-repetition flashcard) ─────────────────────
const LESSON_STEPS = [
  { title: 'What is gradient descent?',        time: '2 min', state: 'done' },
  { title: 'Why we need the chain rule',       time: '3 min', state: 'done' },
  { title: 'Forward pass — activations',       time: '4 min', state: 'done' },
  { title: 'Backward pass — local gradients',  time: '5 min', state: 'active' },
  { title: 'Softmax + cross-entropy: ŷ − y',   time: '4 min', state: 'queued' },
  { title: "Why ReLU saturates (or doesn't)",  time: '3 min', state: 'queued' },
  { title: 'Vanishing gradients in depth',     time: '6 min', state: 'locked' },
  { title: 'Practice: derive a 2-layer net',   time: '8 min', state: 'locked' },
]
const RELATED = [
  { color: '#7E8FB0', title: 'Chain rule',                    meta: 'Foundations · mastered' },
  { color: '#3A8D7A', title: 'Jacobians',                     meta: 'Linear Algebra · 88%' },
  { color: '#C0905C', title: 'Vanishing gradients',           meta: 'Neural Networks · review' },
  { color: '#9AA56A', title: 'Autograd & computation graphs', meta: 'Tooling · new' },
]
const RECALL = [
  { date: 'Tomorrow', count: '3 cards' }, { date: 'In 3 days', count: '2 cards' }, { date: 'Next week', count: '5 cards' },
]
const RATINGS = [
  { id: 'again', label: 'Again', sub: '1 · <10 min', tone: '#B86D76' },
  { id: 'hard',  label: 'Hard',  sub: '2 · 1 day',   tone: '#C0905C' },
  { id: 'good',  label: 'Good',  sub: '3 · 4 days',   tone: '#3A8D7A' },
  { id: 'easy',  label: 'Easy',  sub: '4 · 11 days',  tone: COPPER },
]

// learning formats offered on the setup screen + as in-lesson tabs
const LEARN_FORMATS = [
  { id: 'guided',     label: 'Guided Learning', icon: <AutoStoriesRoundedIcon />, desc: 'A conversational tutor walks you through, one beat at a time.' },
  { id: 'animated',   label: 'Animated',        icon: <AnimationRoundedIcon />,   desc: 'Watch the concept build itself — visually, step by step.' },
  { id: 'flashcards', label: 'Flashcards',      icon: <StyleRoundedIcon />,       desc: 'Spaced-repetition cards that adapt to your recall.' },
  { id: 'quiz',       label: 'Quiz',            icon: <QuizRoundedIcon />,        desc: 'Check understanding with adaptive questions.' },
  { id: 'timeline',   label: 'Timeline',        icon: <TimelineRoundedIcon />,    desc: 'See how the ideas developed in sequence.' },
  { id: 'mindmap',    label: 'Mind map',        icon: <AccountTreeRoundedIcon />, desc: 'Explore concepts as a connected graph.' },
]
const STAGE_TABS = ['guided', 'animated', 'flashcards', 'quiz']
const LEARN_SOURCES = [
  { id: 'topic', label: 'Topic' }, { id: 'library', label: 'From Library' },
  { id: 'web', label: 'Web' }, { id: 'wikipedia', label: 'Wikipedia' }, { id: 'upload', label: 'Upload' },
]
const LANGUAGES = ['English', 'हिन्दी', 'Español', 'Français', 'Deutsch', '日本語', '中文']
const DIFFICULTIES = ['Beginner', 'Intermediate', 'Expert']
const FORMAT_LABEL: Record<string, string> = Object.fromEntries(LEARN_FORMATS.map(f => [f.id, f.label]))

// ─── Guided stage — conversational beats revealed one at a time ──────────────
const GUIDED_BEATS = [
  { kind: 'Explanation', text: 'On the backward pass each layer multiplies the incoming gradient by its local Jacobian — for a linear layer that Jacobian is just the weight matrix, transposed.' },
  { kind: 'Example',     text: 'For z = Wx + b, the gradient ∂L/∂W is the outer product δ·xᵀ, where x is the activation you already cached on the way forward.' },
  { kind: 'Analogy',     text: 'Think of echoes returning down the same hallways the sound first travelled — same paths, reversed direction.' },
  { kind: 'Key insight', text: 'Because every backward step reuses a cached value, the whole backward pass costs the same as the forward pass — the cheap-gradient principle.' },
]
function GuidedStage() {
  const [shown, setShown] = useState(1)
  const done = shown >= GUIDED_BEATS.length
  return (
    <Box sx={{ width: '100%', maxWidth: 640 }}>
      <Stack spacing={1.5}>
        {GUIDED_BEATS.slice(0, shown).map((b, i) => (
          <Box key={i} sx={{ p: 2.25, borderRadius: 3, bgcolor: 'background.paper',
            boxShadow: i === shown - 1 ? '0 18px 44px -30px rgba(0,0,0,0.6)' : 'none',
            animation: `${riseIn} .45s cubic-bezier(0.22,1,0.36,1) both` }}>
            <MiniChip tone={COPPER}>{b.kind}</MiniChip>
            <Typography sx={{ mt: 1, lineHeight: 1.7 }}>{b.text}</Typography>
          </Box>
        ))}
      </Stack>
      <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mt: 2.5 }}>
        <PillBtn variant="ghost" onClick={() => setShown(s => Math.max(1, s - 1))}><ArrowBackRoundedIcon sx={{ fontSize: 15 }} /> Back</PillBtn>
        <PillBtn variant="primary" onClick={() => setShown(s => Math.min(GUIDED_BEATS.length, s + 1))}>
          {done ? 'Lesson complete' : 'Continue'}{!done && <ArrowForwardRoundedIcon sx={{ fontSize: 14 }} />}
        </PillBtn>
        <Box sx={{ flex: 1 }} />
        <Stack direction="row" spacing={0.75}>
          {GUIDED_BEATS.map((_, i) => (
            <Box key={i} sx={{ width: i < shown ? 22 : 8, height: 8, borderRadius: 4,
              background: i < shown ? GRAD : 'transparent', border: i < shown ? 'none' : '1px solid',
              borderColor: 'divider', transition: 'all .35s cubic-bezier(0.22,1,0.36,1)' }} />
          ))}
        </Stack>
      </Stack>
    </Box>
  )
}

// ─── Animated stage — forward/backward signal flow (pure CSS) ────────────────
const travelF = keyframes`
  0% { left: 0%; opacity: 0; } 12% { opacity: 1; } 88% { opacity: 1; } 100% { left: 100%; opacity: 0; }
`
const travelB = keyframes`
  0% { left: 100%; opacity: 0; } 12% { opacity: 1; } 88% { opacity: 1; } 100% { left: 0%; opacity: 0; }
`
function AnimatedStage() {
  const [playing, setPlaying] = useState(true)
  const nodes = [{ l: 'x', at: '0%' }, { l: 'h', at: '50%' }, { l: 'ŷ', at: '100%' }]
  return (
    <Box sx={{ width: '100%', maxWidth: 640 }}>
      <Box sx={{ bgcolor: 'background.paper', borderRadius: 4, p: 4, boxShadow: '0 24px 60px -36px rgba(0,0,0,0.6)' }}>
        <Typography sx={{ fontWeight: 700, mb: 0.5 }}>Forward &amp; backward pass</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 4 }}>
          Activations flow right; gradients flow back along the same edges.
        </Typography>
        <Box sx={{ position: 'relative', height: 56, mx: 'auto', maxWidth: 420 }}>
          {/* edge */}
          <Box sx={{ position: 'absolute', top: '50%', left: 0, right: 0, height: 2, bgcolor: 'divider' }} />
          {/* travelling signals */}
          <Box sx={{ position: 'absolute', top: '50%', width: 11, height: 11, borderRadius: '50%',
            bgcolor: COPPER, boxShadow: `0 0 12px ${COPPER}`, transform: 'translate(-50%,-50%)',
            animation: playing ? `${travelF} 2.4s linear infinite` : 'none', opacity: playing ? 1 : 0 }} />
          <Box sx={{ position: 'absolute', top: '50%', width: 11, height: 11, borderRadius: '50%',
            bgcolor: '#3A8D7A', boxShadow: '0 0 12px #3A8D7A', transform: 'translate(-50%,-50%)',
            animation: playing ? `${travelB} 2.4s linear infinite 1.2s` : 'none', opacity: playing ? 1 : 0 }} />
          {/* nodes */}
          {nodes.map(n => (
            <Box key={n.l} sx={{ position: 'absolute', top: '50%', left: n.at, transform: 'translate(-50%,-50%)',
              width: 44, height: 44, borderRadius: '50%', display: 'grid', placeItems: 'center',
              bgcolor: 'background.default', border: `2px solid ${COPPER}`, fontFamily: 'monospace', fontWeight: 700 }}>
              {n.l}
            </Box>
          ))}
        </Box>
        <Stack direction="row" spacing={2} alignItems="center" sx={{ mt: 4 }}>
          <PillBtn variant="primary" onClick={() => setPlaying(p => !p)}>
            {playing ? 'Pause' : 'Play'} <PlayArrowRoundedIcon sx={{ fontSize: 15 }} />
          </PillBtn>
          <Stack direction="row" spacing={1.5} sx={{ fontSize: 12, color: 'text.secondary' }}>
            <Stack direction="row" spacing={0.5} alignItems="center"><Box sx={{ width: 9, height: 9, borderRadius: '50%', bgcolor: COPPER }} /> forward</Stack>
            <Stack direction="row" spacing={0.5} alignItems="center"><Box sx={{ width: 9, height: 9, borderRadius: '50%', bgcolor: '#3A8D7A' }} /> backward</Stack>
          </Stack>
        </Stack>
      </Box>
      <Typography variant="caption" color="text.disabled" sx={{ display: 'block', mt: 1.5, textAlign: 'center' }}>
        In the real build this becomes a soft-3D Lottie scene.
      </Typography>
    </Box>
  )
}

// ─── Quiz stage — single MCQ with feedback ───────────────────────────────────
const QUIZ = {
  q: 'For a linear layer z = Wx + b, the weight gradient ∂L/∂W equals…',
  options: ['δ · xᵀ  (outer product)', 'Wᵀ · δ', 'δ ⊙ x', 'xᵀ · W'],
  correct: 0,
}
function QuizStage() {
  const [picked, setPicked] = useState<number | null>(null)
  return (
    <Box sx={{ width: '100%', maxWidth: 640, bgcolor: 'background.paper', borderRadius: 4, p: 3.5,
      boxShadow: '0 26px 60px -36px rgba(0,0,0,0.6)', animation: `${riseIn} .4s ease both` }}>
      <MiniChip tone={COPPER}>Question 4 / 8</MiniChip>
      <Typography sx={{ fontSize: 18, fontWeight: 600, my: 2, lineHeight: 1.5 }}>{QUIZ.q}</Typography>
      <Stack spacing={1}>
        {QUIZ.options.map((o, i) => {
          const show = picked !== null
          const isCorrect = i === QUIZ.correct
          const tone = show && isCorrect ? '#3A8D7A' : show && picked === i ? '#B86D76' : null
          return (
            <Box key={i} component="button" onClick={() => picked === null && setPicked(i)} sx={{
              textAlign: 'left', p: 1.5, borderRadius: 2.5, cursor: picked === null ? 'pointer' : 'default',
              fontFamily: 'inherit', fontSize: 14, display: 'flex', alignItems: 'center', gap: 1.5,
              border: '1px solid', borderColor: tone ?? 'divider', bgcolor: tone ? `${tone}1c` : 'transparent',
              color: tone ?? 'text.primary', transition: 'all .15s',
              '&:hover': picked === null ? { borderColor: 'text.disabled' } : {} }}>
              <Box sx={{ width: 24, height: 24, borderRadius: '50%', flexShrink: 0, display: 'grid', placeItems: 'center',
                border: '1px solid', borderColor: tone ?? 'divider', fontFamily: 'monospace', fontSize: 11, color: tone ?? 'text.secondary' }}>
                {show && isCorrect ? <CheckRoundedIcon sx={{ fontSize: 14 }} /> : String.fromCharCode(65 + i)}
              </Box>
              {o}
            </Box>
          )
        })}
      </Stack>
      {picked !== null && (
        <Box sx={{ mt: 2, animation: `${riseIn} .35s ease both` }}>
          <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.6, mb: 1.5 }}>
            {picked === QUIZ.correct
              ? 'Correct — the local Jacobian of a linear layer is the outer product δ·xᵀ.'
              : 'Not quite. The weight gradient is the outer product δ·xᵀ of the upstream gradient and the cached input.'}
          </Typography>
          <PillBtn variant="primary" onClick={() => setPicked(null)}>Next question <ArrowForwardRoundedIcon sx={{ fontSize: 14 }} /></PillBtn>
        </Box>
      )}
    </Box>
  )
}

// ─── Simple stage (timeline / mindmap placeholders) ──────────────────────────
function SimpleStage({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <Box sx={{ width: '100%', maxWidth: 640, py: 8, display: 'grid', placeItems: 'center', color: 'text.disabled' }}>
      <Stack alignItems="center" spacing={1}>
        <Box sx={{ '& svg': { fontSize: 40, opacity: 0.6 } }}>{icon}</Box>
        <Typography>{label} — same lesson, a different lens</Typography>
      </Stack>
    </Box>
  )
}

// ─── Collapsed rail strip (shown when a side panel is collapsed) ─────────────
function CollapsedRail({ label, side, onOpen }: { label: string; side: 'left' | 'right'; onOpen: () => void }) {
  return (
    <Box sx={{ width: 44, flexShrink: 0, display: { xs: 'none', md: 'flex' }, flexDirection: 'column',
      alignItems: 'center', py: 1.5, gap: 1.5 }}>
      <Tooltip title="Expand panel" placement={side === 'left' ? 'right' : 'left'} arrow>
        <IconButton size="small" onClick={onOpen} sx={{ color: 'text.secondary' }}>
          {side === 'left' ? <ChevronRightRoundedIcon fontSize="small" /> : <ChevronLeftRoundedIcon fontSize="small" />}
        </IconButton>
      </Tooltip>
      <Typography sx={{ writingMode: 'vertical-rl', transform: side === 'right' ? 'rotate(180deg)' : 'none',
        fontFamily: 'monospace', fontSize: 10, color: 'text.disabled', letterSpacing: '0.14em', textTransform: 'uppercase' }}>
        {label}
      </Typography>
    </Box>
  )
}

// ─── Learn setup — topic chooser ─────────────────────────────────────────────
function LearnSetup({ onStart }: { onStart: (fmt: string) => void }) {
  const [topic, setTopic] = useState('How backprop actually works')
  const [source, setSource] = useState('topic')
  const [fmt, setFmt] = useState('guided')
  const [diff, setDiff] = useState('Intermediate')
  const [lang, setLang] = useState('English')
  return (
    <Box sx={{ flex: 1, overflow: 'auto' }}>
      <Box sx={{ maxWidth: 860, mx: 'auto', px: { xs: 3, md: 5 }, py: 5 }}>
        <Typography sx={{ fontFamily: 'monospace', fontSize: 11, letterSpacing: '0.12em', color: 'text.disabled', mb: 1 }}>— LEARN</Typography>
        <Typography variant="h4" sx={{ fontWeight: 700, letterSpacing: '-0.02em', mb: 3 }}>
          What do you want to <Box component="em" sx={{ fontStyle: 'normal', color: 'primary.main' }}>learn</Box>?
        </Typography>

        {/* topic input */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, p: 1, pl: 2, borderRadius: 3,
          bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider', mb: 1.5 }}>
          <SchoolRoundedIcon sx={{ color: 'text.disabled' }} />
          <Box component="input" value={topic} onChange={(e) => setTopic((e.target as HTMLInputElement).value)}
            placeholder="Type a topic, paste a URL, or pick a source…"
            sx={{ flex: 1, border: 0, outline: 0, bgcolor: 'transparent', color: 'text.primary', fontFamily: 'inherit', fontSize: 15 }} />
          <PillBtn variant="primary" onClick={() => onStart(fmt)}>Generate <ArrowForwardRoundedIcon sx={{ fontSize: 15 }} /></PillBtn>
        </Box>
        <Stack direction="row" spacing={0.75} sx={{ mb: 4 }}>
          {LEARN_SOURCES.map(s => <FilterPill key={s.id} label={s.label} ct="" on={source === s.id} onClick={() => setSource(s.id)} />)}
        </Stack>

        {/* format grid */}
        <Typography sx={{ fontFamily: 'monospace', fontSize: 10.5, color: 'text.disabled', letterSpacing: '0.12em', mb: 1.5 }}>FORMAT</Typography>
        <Box sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: '1fr 1fr 1fr' }, mb: 4 }}>
          {LEARN_FORMATS.map(f => {
            const on = fmt === f.id
            return (
              <Box key={f.id} component="button" onClick={() => setFmt(f.id)} sx={{
                textAlign: 'left', p: 2, borderRadius: 3, cursor: 'pointer', fontFamily: 'inherit',
                border: '1px solid', borderColor: on ? COPPER : 'divider', bgcolor: on ? `${COPPER}14` : 'background.paper',
                transition: 'all .15s', '&:hover': { borderColor: on ? COPPER : 'text.disabled', transform: 'translateY(-2px)' } }}>
                <Box sx={{ color: on ? COPPER : 'text.secondary', mb: 1, '& svg': { fontSize: 24 } }}>{f.icon}</Box>
                <Typography sx={{ fontWeight: 600, fontSize: 14, mb: 0.5 }}>{f.label}</Typography>
                <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.5 }}>{f.desc}</Typography>
              </Box>
            )
          })}
        </Box>

        {/* difficulty + language (multilingual = generate-in-language) */}
        <Stack direction="row" spacing={4} flexWrap="wrap" useFlexGap>
          <Box>
            <Typography sx={{ fontFamily: 'monospace', fontSize: 10.5, color: 'text.disabled', letterSpacing: '0.12em', mb: 1 }}>DIFFICULTY</Typography>
            <Box sx={{ display: 'flex', gap: 0.25, p: 0.4, borderRadius: 2.5, bgcolor: 'action.hover' }}>
              {DIFFICULTIES.map(d => (
                <Box key={d} component="button" onClick={() => setDiff(d)} sx={{
                  height: 30, px: 1.5, borderRadius: 1.5, fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', border: 0,
                  bgcolor: diff === d ? 'background.paper' : 'transparent', color: diff === d ? 'text.primary' : 'text.secondary' }}>{d}</Box>
              ))}
            </Box>
          </Box>
          <Box>
            <Typography sx={{ fontFamily: 'monospace', fontSize: 10.5, color: 'text.disabled', letterSpacing: '0.12em', mb: 1 }}>LANGUAGE</Typography>
            <Stack direction="row" spacing={1} alignItems="center">
              <TranslateRoundedIcon sx={{ fontSize: 16, color: 'text.disabled' }} />
              <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                {LANGUAGES.map(l => <FilterPill key={l} label={l} ct="" on={lang === l} onClick={() => setLang(l)} />)}
              </Box>
            </Stack>
          </Box>
        </Stack>
      </Box>
    </Box>
  )
}

// ─── Learn lesson — 3-column, collapsible panels, format-aware stage ─────────
function LearnLesson({ initialFormat, onNew }: { initialFormat: string; onNew: () => void }) {
  const [fmt, setFmt] = useState(initialFormat)
  const [leftOpen, setLeftOpen] = useState(true)
  const [rightOpen, setRightOpen] = useState(true)
  const [card, setCard] = useState(4)
  const [revealed, setRevealed] = useState(true)
  const totalCards = 12
  const doneSteps = LESSON_STEPS.filter(s => s.state === 'done').length
  const pct = Math.round(((doneSteps + 0.5) / LESSON_STEPS.length) * 100)

  const nextCard = () => { setCard(c => Math.min(totalCards, c + 1)); setRevealed(false) }
  const prevCard = () => { setCard(c => Math.max(1, c - 1)); setRevealed(false) }

  return (
    <Box sx={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
      {/* LEFT — outline (collapsible) */}
      {leftOpen ? (
      <Box sx={{ width: 270, flexShrink: 0, overflow: 'auto', p: 2.5, position: 'relative', display: { xs: 'none', md: 'block' } }}>
        <Stack direction="row" alignItems="center" sx={{ mb: 1 }}>
          <Typography sx={{ flex: 1, fontFamily: 'monospace', fontSize: 10.5, color: 'text.disabled', letterSpacing: '0.1em' }}>LESSON · 32 MIN · 8 STEPS</Typography>
          <Tooltip title="Collapse" arrow><IconButton size="small" onClick={() => setLeftOpen(false)} sx={{ color: 'text.disabled' }}><ChevronLeftRoundedIcon fontSize="small" /></IconButton></Tooltip>
        </Stack>
        <Typography variant="h6" sx={{ fontWeight: 700, lineHeight: 1.2, mb: 0.5 }}>How backprop actually works</Typography>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>A walk through the chain rule on a real 2-layer network.</Typography>

        <Stack direction="row" alignItems="center" sx={{ mb: 1 }}>
          <Typography sx={{ fontFamily: 'monospace', fontSize: 10.5, color: 'text.disabled', letterSpacing: '0.13em' }}>OUTLINE</Typography>
          <Box sx={{ flex: 1 }} />
          <MiniChip>{doneSteps}/{LESSON_STEPS.length}</MiniChip>
        </Stack>

        <Stack spacing={0.25}>
          {LESSON_STEPS.map((s, i) => {
            const active = s.state === 'active'
            return (
              <Stack key={i} direction="row" spacing={1.25} alignItems="flex-start" sx={{
                p: 1, borderRadius: 2, cursor: s.state === 'locked' ? 'default' : 'pointer',
                bgcolor: active ? 'action.selected' : 'transparent',
                opacity: s.state === 'locked' ? 0.45 : 1,
                '&:hover': { bgcolor: active ? 'action.selected' : 'action.hover' },
              }}>
                <Box sx={{
                  width: 22, height: 22, borderRadius: '50%', flexShrink: 0, display: 'grid', placeItems: 'center',
                  fontFamily: 'monospace', fontSize: 10, fontWeight: 700,
                  bgcolor: s.state === 'done' ? '#3A8D7A' : active ? `${COPPER}22` : 'action.hover',
                  color: s.state === 'done' ? '#06201A' : active ? COPPER : 'text.secondary',
                  border: active ? `1px solid ${COPPER}` : 'none',
                }}>
                  {s.state === 'done' ? <CheckRoundedIcon sx={{ fontSize: 13 }} /> : String(i + 1).padStart(2, '0')}
                </Box>
                <Box>
                  <Typography sx={{ fontSize: 13, fontWeight: active ? 600 : 500, color: active ? 'text.primary' : 'text.secondary', lineHeight: 1.3 }}>{s.title}</Typography>
                  <Typography sx={{ fontFamily: 'monospace', fontSize: 10.5, color: 'text.disabled' }}>{s.time}</Typography>
                </Box>
              </Stack>
            )
          })}
        </Stack>

        <Stack direction="row" alignItems="center" spacing={1.25} sx={{ mt: 2.5, p: 1.25, borderRadius: 2.5, bgcolor: 'action.hover' }}>
          <BoltRoundedIcon sx={{ fontSize: 16, color: COPPER }} />
          <Typography variant="caption" color="text.secondary" sx={{ flex: 1 }}>12 cards due in your daily queue</Typography>
          <ArrowForwardRoundedIcon sx={{ fontSize: 14, color: 'text.disabled' }} />
        </Stack>
      </Box>
      ) : <CollapsedRail label="Outline · 8 steps" side="left" onOpen={() => setLeftOpen(true)} />}

      {/* MAIN — flashcard stage */}
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'auto' }}>
        {/* top bar */}
        <Stack direction="row" alignItems="center" gap={2} sx={{ px: 3, py: 2, flexShrink: 0 }}>
          <Box sx={{ flex: 1 }}>
            <Typography sx={{ fontFamily: 'monospace', fontSize: 10.5, color: 'text.disabled', letterSpacing: '0.1em' }}>STEP 04 · BACKWARD PASS · {FORMAT_LABEL[fmt]?.toUpperCase()}</Typography>
            <Typography variant="h6" sx={{ fontWeight: 700 }}>Backward pass — local gradients</Typography>
          </Box>
          <PillBtn variant="ghost" onClick={onNew}><AddRoundedIcon sx={{ fontSize: 15 }} /> New lesson</PillBtn>
          <Stack direction="row" spacing={1} alignItems="center">
            <Box sx={{ width: 140, height: 6, borderRadius: 3, bgcolor: 'action.hover', overflow: 'hidden' }}>
              <Box sx={{ width: `${pct}%`, height: '100%', background: GRAD, transition: 'width .4s' }} />
            </Box>
            <Typography variant="caption" sx={{ fontFamily: 'monospace', color: 'text.secondary' }}>{pct}%</Typography>
          </Stack>
          <Stack direction="row" spacing={0.5} alignItems="center" sx={{
            px: 1.1, height: 28, borderRadius: 99, bgcolor: `${COPPER}1c`, border: `1px solid ${COPPER}44` }}>
            <LocalFireDepartmentRoundedIcon sx={{ fontSize: 15, color: COPPER }} />
            <Typography sx={{ fontFamily: 'monospace', fontSize: 13, fontWeight: 700, color: COPPER }}>24</Typography>
          </Stack>
        </Stack>

        {/* stage */}
        <Box sx={{ flex: 1, px: 3, pb: 3, display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'center' }}>
          {/* format tabs — switch the learning mode in place */}
          <Box sx={{ display: 'flex', gap: 0.25, p: 0.4, borderRadius: 2.5, bgcolor: 'action.hover' }}>
            {STAGE_TABS.map((t) => (
              <Box key={t} component="button" onClick={() => setFmt(t)} sx={{
                height: 28, px: 1.4, borderRadius: 1.5, fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600,
                cursor: 'pointer', border: 0,
                bgcolor: fmt === t ? 'background.paper' : 'transparent',
                color: fmt === t ? 'text.primary' : 'text.secondary' }}>{FORMAT_LABEL[t]}</Box>
            ))}
          </Box>

          {/* GUIDED / ANIMATED / QUIZ / TIMELINE / MINDMAP stages */}
          {fmt === 'guided'   && <GuidedStage />}
          {fmt === 'animated' && <AnimatedStage />}
          {fmt === 'quiz'     && <QuizStage />}
          {fmt === 'timeline' && <SimpleStage icon={<TimelineRoundedIcon />} label="Timeline" />}
          {fmt === 'mindmap'  && <SimpleStage icon={<AccountTreeRoundedIcon />} label="Mind map" />}

          {/* FLASHCARD stage */}
          {fmt === 'flashcards' && (<>
          <Box key={card} sx={{
            width: '100%', maxWidth: 640, bgcolor: 'background.paper', borderRadius: 4, p: 3.5,
            boxShadow: '0 26px 60px -36px rgba(0,0,0,0.6)',
            animation: `${riseIn} .4s cubic-bezier(0.22,1,0.36,1) both`,
          }}>
            <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2, fontFamily: 'monospace', fontSize: 11, color: 'text.disabled' }}>
              <span>Card {String(card).padStart(2, '0')} / {totalCards}</span>
              <Box sx={{ width: 2, height: 2, borderRadius: '50%', bgcolor: 'text.disabled' }} />
              <span>Derivation</span>
              <Box sx={{ flex: 1 }} />
              <MiniChip tone={COPPER}><Box component="span" sx={{ width: 5, height: 5, borderRadius: '50%', bgcolor: COPPER }} /> due</MiniChip>
            </Stack>

            <Typography sx={{ fontSize: 19, fontWeight: 600, lineHeight: 1.45, mb: 2.5 }}>
              For a layer <Box component="em" sx={{ fontStyle: 'italic', color: 'primary.main' }}>z = Wx + b</Box>, what is{' '}
              <Box component="em" sx={{ fontStyle: 'italic', color: 'primary.main' }}>∂L/∂W</Box> given the gradient signal{' '}
              <Box component="em" sx={{ fontStyle: 'italic', color: 'primary.main' }}>δ = ∂L/∂z</Box> arriving from above?
            </Typography>

            {!revealed ? (
              <PillBtn variant="outline" onClick={() => setRevealed(true)}>
                <VisibilityRoundedIcon sx={{ fontSize: 15 }} /> Reveal answer
                <Box component="span" sx={{ ml: 0.5, fontFamily: 'monospace', fontSize: 10.5, px: 0.5, borderRadius: 0.5, bgcolor: 'action.hover' }}>Space</Box>
              </PillBtn>
            ) : (
              <Box sx={{ animation: `${riseIn} .35s cubic-bezier(0.22,1,0.36,1) both` }}>
                <Stack direction="row" spacing={0.5} alignItems="center" sx={{ color: '#3A8D7A', fontSize: 11, fontWeight: 700, fontFamily: 'monospace', letterSpacing: '0.08em', mb: 1 }}>
                  <CheckRoundedIcon sx={{ fontSize: 13 }} /> ANSWER
                </Stack>
                <Typography sx={{ fontWeight: 700, fontSize: 16, mb: 1 }}>It's just an outer product.</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.7, mb: 2 }}>
                  Because the layer is linear in <Box component="code" sx={{ fontFamily: 'monospace', bgcolor: 'action.hover', px: 0.6, borderRadius: 0.5 }}>W</Box>, the local Jacobian collapses cleanly:
                </Typography>
                <Box sx={{ py: 2, textAlign: 'center', fontFamily: 'monospace', fontSize: 16, bgcolor: 'action.hover', borderRadius: 2, position: 'relative', mb: 2 }}>
                  ∂L / ∂W = δ · xᵀ
                  <Box component="span" sx={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: 'text.disabled', fontSize: 11 }}>outer product</Box>
                </Box>
                <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.7 }}>
                  δ is the gradient flowing in from the next layer; x is the activation you cached on the
                  forward pass — every gradient is a single matrix multiply against a value you already have.
                </Typography>
              </Box>
            )}
          </Box>

          {/* rate row (reversible) */}
          {revealed && (
            <Box sx={{ width: '100%', maxWidth: 640, animation: `${riseIn} .4s ease both` }}>
              <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 1 }}>
                <Typography sx={{ fontFamily: 'monospace', fontSize: 10.5, color: 'text.disabled', letterSpacing: '0.1em' }}>HOW WELL DID YOU RECALL THIS?</Typography>
                <Box sx={{ flex: 1, height: 1, bgcolor: 'divider' }} />
                <Typography sx={{ fontFamily: 'monospace', fontSize: 10.5, color: 'text.disabled' }}>next interval shown</Typography>
              </Stack>
              <Stack direction="row" spacing={1}>
                {RATINGS.map((r) => (
                  <Box key={r.id} component="button" onClick={nextCard} sx={{
                    flex: 1, py: 1, borderRadius: 2.5, cursor: 'pointer', fontFamily: 'inherit',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.4,
                    border: '1px solid', borderColor: `${r.tone}55`, bgcolor: `${r.tone}14`, color: r.tone,
                    transition: 'transform .1s, background .12s',
                    '&:hover': { bgcolor: `${r.tone}26`, transform: 'translateY(-2px)' },
                  }}>
                    <Stack direction="row" spacing={0.5} alignItems="center" sx={{ fontWeight: 700, fontSize: 13.5 }}>
                      {r.id === 'again' && <RefreshRoundedIcon sx={{ fontSize: 14 }} />}{r.label}
                      {r.id === 'easy' && <ArrowForwardRoundedIcon sx={{ fontSize: 14 }} />}
                    </Stack>
                    <Typography sx={{ fontFamily: 'monospace', fontSize: 10, opacity: 0.85 }}>{r.sub}</Typography>
                  </Box>
                ))}
              </Stack>

              {/* reversible nav — fixes the "no go back" complaint */}
              <Stack direction="row" spacing={1} sx={{ mt: 2, justifyContent: 'center' }}>
                <PillBtn variant="ghost" onClick={prevCard}><ArrowBackRoundedIcon sx={{ fontSize: 15 }} /> Back</PillBtn>
                <PillBtn variant="surface" onClick={() => setRevealed(false)}>Hide answer</PillBtn>
                <PillBtn variant="ghost" onClick={nextCard}>Skip <ArrowForwardRoundedIcon sx={{ fontSize: 15 }} /></PillBtn>
              </Stack>
            </Box>
          )}
          </>)}
        </Box>
      </Box>

      {/* RIGHT — connected concepts (collapsible) */}
      {rightOpen ? (
      <Box sx={{ width: 270, flexShrink: 0, overflow: 'auto', p: 2.5, display: { xs: 'none', lg: 'block' } }}>
        <Stack direction="row" alignItems="center" sx={{ mb: 1 }}>
          <Typography sx={{ flex: 1, fontFamily: 'monospace', fontSize: 10.5, color: 'text.disabled', letterSpacing: '0.1em' }}>CONNECTED CONCEPTS</Typography>
          <Tooltip title="Collapse" arrow><IconButton size="small" onClick={() => setRightOpen(false)} sx={{ color: 'text.disabled' }}><ChevronRightRoundedIcon fontSize="small" /></IconButton></Tooltip>
        </Stack>
        <Typography variant="h6" sx={{ fontWeight: 700, mb: 0.5 }}>What this links to</Typography>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>Knovex traces this idea backwards and forwards through your library.</Typography>

        <Stack spacing={0.25} sx={{ mb: 3 }}>
          {RELATED.map((r) => (
            <Stack key={r.title} direction="row" spacing={1.25} alignItems="center" sx={{
              p: 1, borderRadius: 2, cursor: 'pointer', '&:hover': { bgcolor: 'action.hover' } }}>
              <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: r.color, flexShrink: 0 }} />
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography sx={{ fontSize: 13 }}>{r.title}</Typography>
                <Typography sx={{ fontFamily: 'monospace', fontSize: 10, color: 'text.disabled' }}>{r.meta}</Typography>
              </Box>
              <ArrowForwardRoundedIcon sx={{ fontSize: 13, color: 'text.disabled' }} />
            </Stack>
          ))}
        </Stack>

        <Typography sx={{ fontWeight: 700, fontSize: 13, mb: 1 }}>Next review</Typography>
        <Box sx={{ mb: 3 }}>
          {RECALL.map((r, i) => (
            <Stack key={i} direction="row" justifyContent="space-between" sx={{ py: 0.75,
              borderBottom: i < RECALL.length - 1 ? '1px solid' : 'none', borderColor: 'divider' }}>
              <Typography variant="body2" color="text.secondary">{r.date}</Typography>
              <Typography sx={{ fontFamily: 'monospace', fontSize: 11, color: 'text.disabled' }}>{r.count}</Typography>
            </Stack>
          ))}
        </Box>

        <Typography sx={{ fontWeight: 700, fontSize: 13, mb: 1 }}>Source for this card</Typography>
        <Stack direction="row" spacing={1.25} sx={{ p: 1.25, borderRadius: 2, bgcolor: 'action.hover', cursor: 'pointer' }}>
          <Box sx={{ width: 24, height: 28, borderRadius: 1, flexShrink: 0, display: 'grid', placeItems: 'center',
            fontFamily: 'monospace', fontSize: 8, fontWeight: 700, color: 'text.secondary', bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider' }}>PDF</Box>
          <Box sx={{ minWidth: 0 }}>
            <Typography sx={{ fontSize: 12.5, fontWeight: 500 }}>Backprop — graph-based derivation</Typography>
            <Typography sx={{ fontFamily: 'monospace', fontSize: 10, color: 'text.disabled' }}>p. 5 · highlighted</Typography>
          </Box>
        </Stack>
      </Box>
      ) : <CollapsedRail label="Connected concepts" side="right" onOpen={() => setRightOpen(true)} />}
    </Box>
  )
}

// ─── Learn wrapper — setup (choose topic + format) → lesson ──────────────────
function LearnScreen() {
  const [view, setView] = useState<'setup' | 'lesson'>('setup')
  const [format, setFormat] = useState('guided')
  if (view === 'setup') return <LearnSetup onStart={(f) => { setFormat(f); setView('lesson') }} />
  return <LearnLesson initialFormat={format} onNew={() => setView('setup')} />
}

// ─── Chat screen (Ask Knovex) ────────────────────────────────────────────────
const CHAT_SOURCES = [
  { num: 1, title: 'Backpropagation — a graph-based derivation', coll: 'Neural Networks · PDF', page: 'p. 4–7', excerpt: 'The chain rule applied to a computation graph yields a sequence of local gradient updates, each requiring only the cached activation and the incoming gradient.' },
  { num: 2, title: 'Goodfellow et al. — Ch. 6: Feedforward Networks', coll: 'Neural Networks · PDF', page: '§6.5.4', excerpt: 'Treating the network as a directed acyclic graph of differentiable operations clarifies why the backward pass costs the same as the forward pass.' },
  { num: 3, title: 'Hand-derived softmax + cross-entropy gradient', coll: 'ML Foundations · Notebook', page: 'cell 12', excerpt: 'When softmax and cross-entropy are composed, the gradient of the loss w.r.t. the pre-softmax logits collapses to (ŷ − y).' },
  { num: 4, title: 'Why does the chain rule even work? — annotated', coll: 'ML Foundations · Markdown', page: '¶3', excerpt: 'Differentiation distributes across composition; locally each layer is a linear approximation, so gradients factorize cleanly.' },
]
const CHAT_FOLLOWUPS = [
  { icon: <AutoAwesomeRoundedIcon sx={{ fontSize: 13 }} />, label: 'Show me the matrix form' },
  { icon: <StyleRoundedIcon sx={{ fontSize: 13 }} />,       label: 'Generate 5 flashcards from this' },
  { icon: <AccountTreeRoundedIcon sx={{ fontSize: 13 }} />, label: 'How does this connect to autograd?' },
  { icon: <MenuBookRoundedIcon sx={{ fontSize: 13 }} />,    label: 'Where did the (ŷ−y) trick come from?' },
]
const QUICK_PROMPTS = [
  { icon: <AutoAwesomeRoundedIcon sx={{ fontSize: 14 }} />, label: 'Explain a concept' },
  { icon: <SchoolRoundedIcon sx={{ fontSize: 14 }} />,      label: 'Quiz me' },
  { icon: <MenuBookRoundedIcon sx={{ fontSize: 14 }} />,    label: 'Summarize a doc' },
  { icon: <StyleRoundedIcon sx={{ fontSize: 14 }} />,       label: 'Make flashcards' },
  { icon: <AccountTreeRoundedIcon sx={{ fontSize: 14 }} />, label: 'Connect ideas' },
]
const SCOPE_KBS = [
  { id: 'ml', name: 'ML Foundations', color: '#DDA76A' },
  { id: 'nn', name: 'Neural Networks', color: '#3A8D7A' },
]

function Cite({ n }: { n: number }) {
  return (
    <Box component="sup" sx={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      minWidth: 15, height: 15, px: 0.4, ml: 0.3, borderRadius: 0.75, cursor: 'pointer',
      fontFamily: 'monospace', fontSize: 9.5, fontWeight: 700, verticalAlign: 'super',
      color: COPPER_DARK, bgcolor: `${COPPER}22`, border: `1px solid ${COPPER}44`,
      '&:hover': { bgcolor: `${COPPER}33` },
    }}>{n}</Box>
  )
}

function ChatScreen() {
  const [sourcesOpen, setSourcesOpen] = useState(true)
  const [scope] = useState(SCOPE_KBS)

  return (
    <Box sx={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
      {/* MAIN */}
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* header */}
        <Stack direction="row" alignItems="center" gap={1.5} sx={{ px: 3, py: 2, flexShrink: 0 }}>
          <Typography variant="h5" sx={{ fontWeight: 700 }}>Ask Knovex</Typography>
          <Box component="span" sx={{
            display: 'inline-flex', alignItems: 'center', gap: 0.6, px: 1, height: 24, borderRadius: 99,
            fontSize: 11.5, fontWeight: 600, color: COPPER_DARK, bgcolor: `${COPPER}1c`, border: `1px solid ${COPPER}44` }}>
            <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: COPPER }} /> grounded · {scope.length} KBs
          </Box>
          <Box sx={{ flex: 1 }} />
          <PillBtn variant="outline"><BookmarkBorderRoundedIcon sx={{ fontSize: 14 }} /> Save</PillBtn>
          <PillBtn variant="outline"><AddRoundedIcon sx={{ fontSize: 15 }} /> New thread</PillBtn>
          {!sourcesOpen && (
            <Tooltip title="Show sources" arrow>
              <IconButton size="small" onClick={() => setSourcesOpen(true)} sx={{ color: 'text.secondary' }}><FolderRoundedIcon fontSize="small" /></IconButton>
            </Tooltip>
          )}
        </Stack>

        {/* thread */}
        <Box sx={{ flex: 1, overflow: 'auto', px: 3, py: 1 }}>
          <Box sx={{ maxWidth: 760, mx: 'auto' }}>
            {/* user */}
            <Stack direction="row" spacing={1.5} sx={{ mb: 3 }}>
              <Box sx={{ width: 30, height: 30, borderRadius: 2, flexShrink: 0, display: 'grid', placeItems: 'center',
                fontSize: 11, fontWeight: 700, bgcolor: 'action.hover', color: 'text.secondary' }}>GT</Box>
              <Box sx={{ flex: 1 }}>
                <Stack direction="row" spacing={1} alignItems="baseline" sx={{ mb: 0.5 }}>
                  <Typography sx={{ fontWeight: 700, fontSize: 13 }}>You</Typography>
                  <Typography sx={{ fontSize: 11, color: 'text.disabled' }}>11:42 AM</Typography>
                </Stack>
                <Typography sx={{ lineHeight: 1.7 }}>
                  Walk me through backpropagation as if I just learned what a neural network is. Use the
                  derivation from my notes — and connect it to why softmax + cross-entropy has that
                  suspiciously clean gradient.
                </Typography>
              </Box>
            </Stack>

            {/* AI */}
            <Stack direction="row" spacing={1.5} sx={{ mb: 2 }}>
              <Box sx={{ width: 30, height: 30, borderRadius: 2, flexShrink: 0, display: 'grid', placeItems: 'center',
                bgcolor: 'background.default', border: '1px solid', borderColor: 'divider' }}>
                <KnovexMark size={18} />
              </Box>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Stack direction="row" spacing={1} alignItems="baseline" sx={{ mb: 0.75 }}>
                  <Typography sx={{ fontWeight: 700, fontSize: 13 }}>Knovex</Typography>
                  <Typography sx={{ fontSize: 11, color: 'text.disabled' }}>just now · 4 sources</Typography>
                  <Box sx={{ flex: 1 }} />
                  <MiniChip>haiku-4.5 · grounded</MiniChip>
                </Stack>
                <Typography sx={{ lineHeight: 1.75, mb: 1.5 }}>
                  Think of a neural network as a stack of small functions chained together. Each layer
                  transforms the input a little, and at the end you get a prediction. <em>Backpropagation</em> is
                  just the chain rule from calculus, applied to that chain — efficiently.<Cite n={1} />
                </Typography>
                <Typography sx={{ fontWeight: 700, fontSize: 14, mb: 0.5 }}>The forward pass caches; the backward pass reuses</Typography>
                <Typography sx={{ lineHeight: 1.75, mb: 1.5 }}>
                  On the forward pass you save each layer's activation. On the backward pass you walk the
                  network in reverse, multiplying the gradient from the next layer by this layer's local
                  gradient.<Cite n={2} /> Because every operation is local, the whole thing costs the same as the forward pass.
                </Typography>
                <Typography sx={{ fontWeight: 700, fontSize: 14, mb: 0.5 }}>Why softmax + cross-entropy collapses so cleanly</Typography>
                <Typography sx={{ lineHeight: 1.75, mb: 1.5 }}>
                  This is the part your notes make especially clear.<Cite n={3} /> If <Box component="code" sx={{ fontFamily: 'monospace', bgcolor: 'action.hover', px: 0.6, borderRadius: 0.5 }}>z</Box> are the
                  pre-softmax logits and <Box component="code" sx={{ fontFamily: 'monospace', bgcolor: 'action.hover', px: 0.6, borderRadius: 0.5 }}>y</Box> the one-hot label, the gradient is just:
                </Typography>
                <Box sx={{ py: 1.75, textAlign: 'center', fontFamily: 'monospace', fontSize: 15, bgcolor: 'action.hover', borderRadius: 2, position: 'relative', mb: 1.5 }}>
                  ∂L / ∂z = ŷ − y
                  <Box component="span" sx={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: 'text.disabled', fontSize: 11 }}>closed form</Box>
                </Box>
                <Typography sx={{ lineHeight: 1.75, mb: 1.5 }}>
                  The exponentials and logs <em>cancel</em>. That isn't a coincidence — it's why the two are
                  paired in practice, and why your network trains in finite time.<Cite n={4} />
                </Typography>

                {/* action row */}
                <Stack direction="row" spacing={0.5} alignItems="center" sx={{ color: 'text.secondary' }}>
                  <PillBtn variant="ghost"><ContentCopyRoundedIcon sx={{ fontSize: 13 }} /> Copy</PillBtn>
                  <PillBtn variant="ghost"><FolderRoundedIcon sx={{ fontSize: 13 }} /> Citations</PillBtn>
                  <PillBtn variant="ghost"><SchoolRoundedIcon sx={{ fontSize: 13 }} /> Turn into lesson</PillBtn>
                  <Box sx={{ flex: 1 }} />
                  <IconButton size="small" sx={{ color: 'text.disabled' }}><ThumbUpOffAltRoundedIcon sx={{ fontSize: 15 }} /></IconButton>
                  <IconButton size="small" sx={{ color: 'text.disabled' }}><ThumbDownOffAltRoundedIcon sx={{ fontSize: 15 }} /></IconButton>
                  <IconButton size="small" sx={{ color: 'text.disabled' }}><RefreshRoundedIcon sx={{ fontSize: 15 }} /></IconButton>
                </Stack>
              </Box>
            </Stack>

            {/* follow-ups */}
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ pl: 5.5, mb: 2 }}>
              {CHAT_FOLLOWUPS.map((f, i) => (
                <Box key={i} component="button" sx={{
                  display: 'inline-flex', alignItems: 'center', gap: 0.6, height: 30, px: 1.25, borderRadius: 99,
                  fontFamily: 'inherit', fontSize: 12.5, cursor: 'pointer', color: 'text.secondary',
                  border: '1px solid', borderColor: 'divider', bgcolor: 'transparent',
                  '&:hover': { borderColor: COPPER, color: 'text.primary', bgcolor: `${COPPER}10` } }}>
                  {f.icon}{f.label}
                </Box>
              ))}
            </Stack>
          </Box>
        </Box>

        {/* composer */}
        <Box sx={{ px: 3, py: 2, flexShrink: 0 }}>
          <Box sx={{ maxWidth: 760, mx: 'auto' }}>
            {/* scope selector */}
            <Stack direction="row" spacing={0.75} alignItems="center" sx={{ mb: 1 }}>
              <Typography sx={{ fontFamily: 'monospace', fontSize: 10.5, color: 'text.disabled', letterSpacing: '0.1em' }}>SCOPE</Typography>
              {scope.map((k) => (
                <Box key={k.id} sx={{
                  display: 'inline-flex', alignItems: 'center', gap: 0.6, height: 26, px: 1, borderRadius: 99,
                  fontSize: 12, fontWeight: 600, bgcolor: 'action.hover', border: '1px solid', borderColor: 'divider' }}>
                  <Box sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: k.color }} /> {k.name}
                  <CloseRoundedIcon sx={{ fontSize: 12, color: 'text.disabled' }} />
                </Box>
              ))}
              <Box component="button" sx={{
                display: 'inline-flex', alignItems: 'center', gap: 0.4, height: 26, px: 1, borderRadius: 99,
                fontFamily: 'inherit', fontSize: 12, fontWeight: 600, cursor: 'pointer', color: 'text.secondary',
                border: '1px dashed', borderColor: 'divider', bgcolor: 'transparent', '&:hover': { borderColor: COPPER, color: COPPER } }}>
                <AddRoundedIcon sx={{ fontSize: 13 }} /> Add KB
              </Box>
            </Stack>

            {/* composer box */}
            <Box sx={{ borderRadius: 3, bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider', p: 1.5,
              boxShadow: '0 8px 30px -18px rgba(0,0,0,0.5)' }}>
              <Typography sx={{ color: 'text.primary', minHeight: 40, lineHeight: 1.6 }}>
                Now derive the gradient for a ReLU layer and tell me when it breaks.
              </Typography>
              <Stack direction="row" alignItems="center" spacing={1} sx={{ mt: 1 }}>
                <PillBtn variant="ghost"><AttachFileRoundedIcon sx={{ fontSize: 14 }} /> Attach</PillBtn>
                <PillBtn variant="ghost"><PublicRoundedIcon sx={{ fontSize: 14 }} /> Web</PillBtn>
                <PillBtn variant="ghost"><Box component="span" sx={{ fontFamily: 'serif', fontWeight: 700, fontSize: 14, lineHeight: 1 }}>W</Box> Wikipedia</PillBtn>
                <Box sx={{ flex: 1 }} />
                <Typography sx={{ fontFamily: 'monospace', fontSize: 11, color: 'text.disabled' }}>142 / 8000</Typography>
                <Box component="button" sx={{
                  display: 'inline-flex', alignItems: 'center', gap: 0.5, height: 32, px: 1.75, borderRadius: 99,
                  fontFamily: 'inherit', fontSize: 13, fontWeight: 600, cursor: 'pointer', border: 0,
                  background: GRAD, color: '#1A140C', '&:hover': { filter: 'brightness(1.08)' } }}>
                  Send <SendRoundedIcon sx={{ fontSize: 14 }} />
                </Box>
              </Stack>
            </Box>

            {/* quick prompts */}
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mt: 1.25 }}>
              {QUICK_PROMPTS.map((q) => (
                <Box key={q.label} component="button" sx={{
                  display: 'inline-flex', alignItems: 'center', gap: 0.6, height: 28, px: 1.1, borderRadius: 99,
                  fontFamily: 'inherit', fontSize: 12, cursor: 'pointer', color: 'text.secondary',
                  border: '1px solid', borderColor: 'divider', bgcolor: 'transparent',
                  '&:hover': { borderColor: 'text.disabled', color: 'text.primary' } }}>
                  {q.icon}{q.label}
                </Box>
              ))}
            </Stack>
          </Box>
        </Box>
      </Box>

      {/* SOURCES panel (collapsible) */}
      {sourcesOpen ? (
        <Box sx={{ width: 340, flexShrink: 0, display: { xs: 'none', md: 'flex' }, flexDirection: 'column', bgcolor: 'background.paper' }}>
          <Stack direction="row" alignItems="flex-start" sx={{ p: 2.5, pb: 1 }}>
            <Box sx={{ flex: 1 }}>
              <Typography sx={{ fontFamily: 'monospace', fontSize: 10.5, color: 'text.disabled', letterSpacing: '0.1em', mb: 0.5 }}>SOURCES USED · 4</Typography>
              <Typography variant="h6" sx={{ fontWeight: 700 }}>Where this came from</Typography>
            </Box>
            <Tooltip title="Collapse" arrow><IconButton size="small" onClick={() => setSourcesOpen(false)} sx={{ color: 'text.disabled' }}><ChevronRightRoundedIcon fontSize="small" /></IconButton></Tooltip>
          </Stack>
          <Box sx={{ flex: 1, overflow: 'auto', px: 2.5, py: 1 }}>
            <Stack spacing={1.25}>
              {CHAT_SOURCES.map((s) => (
                <Box key={s.num} sx={{ p: 1.5, borderRadius: 2.5, bgcolor: 'action.hover', cursor: 'pointer',
                  border: '1px solid transparent', transition: 'border-color .15s', '&:hover': { borderColor: 'divider' } }}>
                  <Stack direction="row" spacing={0.75} alignItems="center" sx={{ mb: 0.75 }}>
                    <Box sx={{ width: 18, height: 18, borderRadius: 0.75, display: 'grid', placeItems: 'center',
                      fontFamily: 'monospace', fontSize: 10, fontWeight: 700, color: '#1A140C', background: GRAD }}>{s.num}</Box>
                    <Box sx={{ flex: 1 }} />
                    <Typography sx={{ fontFamily: 'monospace', fontSize: 10, color: 'text.disabled' }}>{s.page}</Typography>
                  </Stack>
                  <Typography sx={{ fontSize: 13, fontWeight: 600, mb: 0.5, lineHeight: 1.35 }}>{s.title}</Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ fontStyle: 'italic', display: 'block', lineHeight: 1.5, mb: 0.75 }}>"{s.excerpt}"</Typography>
                  <Stack direction="row" spacing={0.5} alignItems="center" sx={{ color: 'text.disabled' }}>
                    <FolderRoundedIcon sx={{ fontSize: 12 }} />
                    <Typography sx={{ fontFamily: 'monospace', fontSize: 10 }}>{s.coll}</Typography>
                  </Stack>
                </Box>
              ))}
            </Stack>
          </Box>
          <Box sx={{ p: 2 }}>
            <Box component="button" sx={{ width: '100%', height: 34, borderRadius: 99, fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600,
              cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 0.6,
              border: '1px solid', borderColor: 'divider', bgcolor: 'transparent', color: 'text.secondary',
              '&:hover': { borderColor: COPPER, color: COPPER } }}>
              <AccountTreeRoundedIcon sx={{ fontSize: 14 }} /> Visualize source graph
            </Box>
          </Box>
        </Box>
      ) : <CollapsedRail label="Sources · 4" side="right" onOpen={() => setSourcesOpen(true)} />}
    </Box>
  )
}

// ─── Progress screen ──────────────────────────────────────────────────────────
function CountUp({ to, duration = 1100 }: { to: number; duration?: number }) {
  const [n, setN] = useState(0)
  useEffect(() => {
    let raf = 0, start: number | null = null
    const ease = (t: number) => 1 - Math.pow(1 - t, 3)
    const tick = (ts: number) => {
      if (start == null) start = ts
      const p = Math.min(1, (ts - start) / duration)
      setN(Math.round(to * ease(p)))
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [to, duration])
  return <>{n.toLocaleString()}</>
}

function Sparkline({ values, color }: { values: number[]; color: string }) {
  const w = 84, h = 28
  const max = Math.max(...values), min = Math.min(...values), range = max - min || 1
  const d = values.map((v, i) => `${i ? 'L' : 'M'}${(i / (values.length - 1)) * w},${h - ((v - min) / range) * (h - 4) - 2}`).join(' ')
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ display: 'block' }}>
      <path d={d} fill="none" stroke={color} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function heatLevel(week: number, day: number) {
  const r = Math.sin(week * 31 + day * 7 + 1) * 10000
  const v = r - Math.floor(r)
  if (week < 6)  return v > 0.65 ? 1 : 0
  if (week < 12) return v > 0.55 ? Math.floor(v * 3) + 1 : (v > 0.3 ? 1 : 0)
  if (week < 18) return v > 0.4 ? Math.floor(v * 4) + 1 : (v > 0.2 ? 1 : 0)
  return Math.min(4, Math.floor(v * 5) + 1)
}
const HEAT_FILL = ['', `${COPPER}26`, `${COPPER}4d`, `${COPPER}80`, COPPER]

function VelocityChart() {
  const cards = [4, 7, 6, 10, 9, 13, 12, 18, 16, 22, 19, 28]
  const mins  = [22, 38, 30, 51, 45, 62, 58, 80, 70, 95, 82, 120]
  const width = 440, height = 170, PAD = { t: 12, r: 8, b: 22, l: 28 }
  const w = width - PAD.l - PAD.r, h = height - PAD.t - PAD.b
  const max1 = Math.max(...cards) * 1.15, max2 = Math.max(...mins) * 1.15, n = cards.length
  const x = (i: number) => PAD.l + (i / (n - 1)) * w
  const yA = (v: number) => PAD.t + h - (v / max1) * h
  const yB = (v: number) => PAD.t + h - (v / max2) * h
  const pathA = cards.map((v, i) => `${i ? 'L' : 'M'}${x(i)},${yA(v)}`).join(' ')
  const pathB = mins.map((v, i) => `${i ? 'L' : 'M'}${x(i)},${yB(v)}`).join(' ')
  const areaA = `${pathA} L${x(n - 1)},${PAD.t + h} L${x(0)},${PAD.t + h} Z`
  const xLabels = ['12w', '10w', '8w', '6w', '4w', '2w', 'now']
  return (
    <Box sx={{ color: 'text.disabled' }}>
      <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" style={{ display: 'block', maxWidth: '100%' }}>
        <defs>
          <linearGradient id="area-accent" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={COPPER} stopOpacity="0.32" />
            <stop offset="100%" stopColor={COPPER} stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0, 0.5, 1].map((t, i) => {
          const y = PAD.t + h - t * h
          return (
            <g key={i}>
              <line x1={PAD.l} x2={width - PAD.r} y1={y} y2={y} stroke="currentColor" strokeOpacity="0.25" strokeDasharray={i === 0 ? '0' : '2 3'} />
              <text x={PAD.l - 8} y={y + 3} fontSize="9.5" fontFamily="monospace" fill="currentColor" textAnchor="end">{Math.round(t * max1)}</text>
            </g>
          )
        })}
        {xLabels.map((l, i) => (
          <text key={i} x={PAD.l + (i / (xLabels.length - 1)) * w} y={height - 6} fontSize="9.5" fontFamily="monospace" fill="currentColor" textAnchor="middle">{l}</text>
        ))}
        <path d={areaA} fill="url(#area-accent)" />
        <path d={pathA} fill="none" stroke={COPPER} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <path d={pathB} fill="none" stroke="#3A8D7A" strokeWidth="1.5" strokeDasharray="3 3" strokeLinecap="round" />
        <circle cx={x(n - 1)} cy={yA(cards[n - 1])} r="3.5" fill={COPPER} />
        <circle cx={x(n - 1)} cy={yB(mins[n - 1])} r="3" fill="#3A8D7A" />
      </svg>
    </Box>
  )
}

const PROG_STATS = [
  { label: 'Current streak', value: 24, unit: 'days',   delta: '6 over last month',  up: true,  spark: [2,3,1,4,5,3,7,9,8,11,14,18,24], color: COPPER },
  { label: 'Cards mastered', value: 347, unit: 'of 516', delta: '41 this week',       up: true,  spark: [120,140,165,180,210,232,260,285,310,332,347], color: '#3A8D7A' },
  { label: 'Recall rate',    value: 82, unit: '%',       delta: '4 pp vs. last month', up: true,  spark: [68,71,69,74,75,72,76,78,77,80,82], color: COPPER },
  { label: 'Focused mins',   value: 14, unit: 'h 22m',   delta: '1h 10m vs. last week', up: false, spark: [90,120,140,160,150,130,180,200,170,160,140], color: '#7E8FB0' },
]
const MASTERY = [
  { topic: 'Linear Algebra',      color: '#7E8FB0', pct: 88 },
  { topic: 'ML Foundations',      color: '#DDA76A', pct: 78 },
  { topic: 'Neural Networks',     color: '#3A8D7A', pct: 64 },
  { topic: 'Probability & Stats', color: '#C0905C', pct: 41 },
  { topic: 'Optimization',        color: '#B86D76', pct: 32 },
  { topic: 'Information Theory',  color: '#8E857A', pct: 18 },
]
const UP_NEXT = [
  { num: '1', title: 'Review: Adam optimizer', sub: '5 cards · due today' },
  { num: '2', title: 'New lesson: ReLU & vanishing gradients', sub: '18 min · queued' },
  { num: '3', title: 'Re-read: Goodfellow Ch. 6.5', sub: 'Knovex suggests · low recall' },
  { num: '4', title: 'Quiz: cross-entropy gradient', sub: '8 questions · ready' },
]
const BADGES = [
  { icon: <LocalFireDepartmentRoundedIcon sx={{ fontSize: 16 }} />, title: '24-day streak', sub: 'Personal best', tone: COPPER },
  { icon: <EmojiEventsRoundedIcon sx={{ fontSize: 16 }} />, title: 'First chapter mastered', sub: 'Linear Algebra · 88%', tone: '#3A8D7A' },
  { icon: <PsychologyRoundedIcon sx={{ fontSize: 16 }} />, title: '200 cards reviewed', sub: 'in the last 30 days', tone: '#7E8FB0' },
  { icon: <BoltRoundedIcon sx={{ fontSize: 16 }} />, title: 'Deep work day', sub: '92 min · zero breaks', tone: '#3A8D7A' },
]

function ProgressScreen() {
  const cells: number[] = []
  for (let week = 0; week < 26; week++) for (let day = 0; day < 7; day++) cells.push(heatLevel(week, day))

  return (
    <Box sx={{ flex: 1, overflow: 'auto' }}>
      <Box sx={{ maxWidth: 1180, mx: 'auto', px: { xs: 3, md: 5 }, py: 3.5 }}>
        {/* header */}
        <Stack direction="row" alignItems="flex-end" gap={2} flexWrap="wrap" sx={{ mb: 3 }}>
          <Box sx={{ flex: 1, minWidth: 280 }}>
            <Typography sx={{ fontFamily: 'monospace', fontSize: 11, letterSpacing: '0.12em', color: 'text.disabled', mb: 1 }}>— PROGRESS · LAST 6 MONTHS</Typography>
            <Typography variant="h4" sx={{ fontWeight: 700, letterSpacing: '-0.02em' }}>
              The shape of your <Box component="em" sx={{ fontStyle: 'normal', color: 'primary.main' }}>learning</Box>
            </Typography>
          </Box>
          <Stack direction="row" spacing={1}>
            <PillBtn variant="outline"><CalendarMonthRoundedIcon sx={{ fontSize: 14 }} /> Last 6 months</PillBtn>
            <PillBtn variant="outline"><FileDownloadRoundedIcon sx={{ fontSize: 14 }} /> Export</PillBtn>
          </Stack>
        </Stack>

        {/* stat cards */}
        <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' }, mb: 2.5 }}>
          {PROG_STATS.map((s, i) => (
            <Box key={s.label} sx={{ p: 2.25, borderRadius: 4, bgcolor: 'background.paper',
              animation: `${riseIn} .45s ease both`, animationDelay: `${i * 60}ms` }}>
              <Typography sx={{ fontFamily: 'monospace', fontSize: 10.5, color: 'text.disabled', letterSpacing: '0.1em', textTransform: 'uppercase', mb: 1 }}>{s.label}</Typography>
              <Stack direction="row" alignItems="baseline" spacing={0.75} sx={{ mb: 0.75 }}>
                <Typography sx={{ fontSize: 30, fontWeight: 800, lineHeight: 1 }}><CountUp to={s.value} /></Typography>
                <Typography variant="caption" color="text.secondary">{s.unit}</Typography>
              </Stack>
              <Stack direction="row" spacing={0.5} alignItems="center" sx={{ mb: 1, color: s.up ? '#3A8D7A' : '#B86D76' }}>
                {s.up ? <NorthRoundedIcon sx={{ fontSize: 11 }} /> : <SouthRoundedIcon sx={{ fontSize: 11 }} />}
                <Typography variant="caption">{s.delta}</Typography>
              </Stack>
              <Sparkline values={s.spark} color={s.color} />
            </Box>
          ))}
        </Box>

        {/* heatmap + velocity */}
        <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', lg: '1.4fr 1fr' }, mb: 2.5 }}>
          <Box sx={{ p: 2.5, borderRadius: 4, bgcolor: 'background.paper' }}>
            <Stack direction="row" alignItems="baseline" sx={{ mb: 2 }}>
              <Typography sx={{ fontWeight: 700, fontSize: 15 }}>Daily activity</Typography>
              <Typography component="span" sx={{ ml: 1, fontFamily: 'monospace', fontSize: 11, color: 'text.disabled' }}>last 26 weeks</Typography>
              <Box sx={{ flex: 1 }} />
              <Typography sx={{ fontFamily: 'monospace', fontSize: 11, color: 'text.secondary' }}>146 active days</Typography>
            </Stack>
            <Box sx={{ display: 'grid', gridTemplateRows: 'repeat(7, 1fr)', gridAutoFlow: 'column', gridAutoColumns: '1fr', gap: '3px' }}>
              {cells.map((lvl, i) => (
                <Box key={i} sx={{ aspectRatio: '1', borderRadius: '2px', bgcolor: lvl ? HEAT_FILL[lvl] : 'action.hover' }} />
              ))}
            </Box>
            <Stack direction="row" alignItems="center" sx={{ mt: 1.5, fontFamily: 'monospace', fontSize: 10, color: 'text.disabled' }}>
              <span>Jun</span><span style={{ marginLeft: 30 }}>Aug</span><span style={{ marginLeft: 34 }}>Oct</span><span style={{ marginLeft: 34 }}>Dec</span><span style={{ marginLeft: 34 }}>Feb</span>
              <Box sx={{ flex: 1 }} />
              <Stack direction="row" spacing={0.5} alignItems="center">
                Less
                {[0, 1, 2, 3, 4].map(l => <Box key={l} sx={{ width: 9, height: 9, borderRadius: '2px', bgcolor: l ? HEAT_FILL[l] : 'action.hover' }} />)}
                More
              </Stack>
            </Stack>
          </Box>

          <Box sx={{ p: 2.5, borderRadius: 4, bgcolor: 'background.paper' }}>
            <Stack direction="row" alignItems="center" sx={{ mb: 1 }}>
              <Typography sx={{ fontWeight: 700, fontSize: 15 }}>Learning velocity</Typography>
              <Box sx={{ flex: 1 }} />
              <Stack direction="row" spacing={1.25} sx={{ fontSize: 11, color: 'text.secondary' }}>
                <Stack direction="row" spacing={0.5} alignItems="center"><Box sx={{ width: 9, height: 9, borderRadius: '50%', bgcolor: COPPER }} /> cards/wk</Stack>
                <Stack direction="row" spacing={0.5} alignItems="center"><Box sx={{ width: 9, height: 9, borderRadius: '50%', bgcolor: '#3A8D7A' }} /> minutes</Stack>
              </Stack>
            </Stack>
            <VelocityChart />
            <Stack direction="row" spacing={0.75} sx={{ mt: 1.5, pt: 1.5, borderTop: '1px solid', borderColor: 'divider' }}>
              <AutoAwesomeRoundedIcon sx={{ fontSize: 13, color: COPPER, mt: 0.2 }} />
              <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.55 }}>
                Mastery rate up <b style={{ color: 'inherit' }}>2.4×</b> since you started spaced repetition — minutes only 1.6×. You're learning <Box component="em" sx={{ color: 'primary.main' }}>more per minute</Box>.
              </Typography>
            </Stack>
          </Box>
        </Box>

        {/* mastery + up next + milestones */}
        <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' } }}>
          <Box sx={{ p: 2.5, borderRadius: 4, bgcolor: 'background.paper' }}>
            <Typography sx={{ fontWeight: 700, fontSize: 14, mb: 1.5 }}>Mastery by topic</Typography>
            <Stack spacing={1.25}>
              {MASTERY.map((m) => (
                <Stack key={m.topic} direction="row" alignItems="center" spacing={1.25}>
                  <Box sx={{ width: 8, height: 8, borderRadius: '2px', bgcolor: m.color, flexShrink: 0 }} />
                  <Typography sx={{ fontSize: 12.5, width: 120, flexShrink: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.topic}</Typography>
                  <Box sx={{ flex: 1, height: 6, borderRadius: 3, bgcolor: 'action.hover', overflow: 'hidden' }}>
                    <Box sx={{ width: `${m.pct}%`, height: '100%', borderRadius: 3, bgcolor: m.color }} />
                  </Box>
                  <Typography sx={{ fontFamily: 'monospace', fontSize: 11, color: 'text.secondary', width: 30, textAlign: 'right' }}>{m.pct}%</Typography>
                </Stack>
              ))}
            </Stack>
          </Box>

          <Box sx={{ p: 2.5, borderRadius: 4, bgcolor: 'background.paper' }}>
            <Stack direction="row" alignItems="center" sx={{ mb: 1.5 }}>
              <Typography sx={{ fontWeight: 700, fontSize: 14 }}>Up next</Typography>
              <Typography component="span" sx={{ ml: 1, fontFamily: 'monospace', fontSize: 11, color: 'text.disabled' }}>today</Typography>
            </Stack>
            <Stack spacing={0.5}>
              {UP_NEXT.map((u) => (
                <Stack key={u.num} direction="row" spacing={1.25} alignItems="center" sx={{ p: 1, borderRadius: 2, cursor: 'pointer', '&:hover': { bgcolor: 'action.hover' } }}>
                  <Box sx={{ width: 22, height: 22, borderRadius: '50%', flexShrink: 0, display: 'grid', placeItems: 'center', fontFamily: 'monospace', fontSize: 11, fontWeight: 700, bgcolor: 'action.hover', color: 'text.secondary' }}>{u.num}</Box>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography sx={{ fontSize: 12.5, fontWeight: 600 }}>{u.title}</Typography>
                    <Typography sx={{ fontFamily: 'monospace', fontSize: 10, color: 'text.disabled' }}>{u.sub}</Typography>
                  </Box>
                  <ArrowForwardRoundedIcon sx={{ fontSize: 13, color: 'text.disabled' }} />
                </Stack>
              ))}
            </Stack>
          </Box>

          <Box sx={{ p: 2.5, borderRadius: 4, bgcolor: 'background.paper' }}>
            <Typography sx={{ fontWeight: 700, fontSize: 14, mb: 1.5 }}>Recent milestones</Typography>
            <Stack spacing={1}>
              {BADGES.map((b, i) => (
                <Stack key={i} direction="row" spacing={1.25} alignItems="center" sx={{ p: 1, borderRadius: 2.5, bgcolor: `${b.tone}12`, border: `1px solid ${b.tone}33` }}>
                  <Box sx={{ width: 30, height: 30, borderRadius: 2, flexShrink: 0, display: 'grid', placeItems: 'center', color: b.tone, bgcolor: `${b.tone}1f` }}>{b.icon}</Box>
                  <Box>
                    <Typography sx={{ fontSize: 12.5, fontWeight: 600 }}>{b.title}</Typography>
                    <Typography sx={{ fontFamily: 'monospace', fontSize: 10, color: 'text.disabled' }}>{b.sub}</Typography>
                  </Box>
                </Stack>
              ))}
            </Stack>
          </Box>
        </Box>
        <Box sx={{ height: 40 }} />
      </Box>
    </Box>
  )
}

// ─── Masked key field ─────────────────────────────────────────────────────────
function MaskedKeyField({ defaultValue = '', placeholder }: { defaultValue?: string; placeholder: string }) {
  const [reveal, setReveal] = useState(false)
  const [val, setVal] = useState(defaultValue)
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, height: 38, px: 1.5, borderRadius: 2,
      bgcolor: 'background.default', border: '1px solid', borderColor: 'divider', '&:focus-within': { borderColor: COPPER } }}>
      <Box component="input" type={reveal ? 'text' : 'password'} value={val} placeholder={placeholder}
        onChange={(e) => setVal((e.target as HTMLInputElement).value)} spellCheck={false}
        sx={{ flex: 1, border: 0, outline: 0, bgcolor: 'transparent', color: 'text.primary', fontFamily: 'monospace', fontSize: 12.5 }} />
      <IconButton size="small" onClick={() => setReveal(r => !r)} sx={{ color: 'text.disabled' }}>
        {reveal ? <VisibilityOffRoundedIcon sx={{ fontSize: 15 }} /> : <VisibilityRoundedIcon sx={{ fontSize: 15 }} />}
      </IconButton>
    </Box>
  )
}

// ─── Settings block wrapper ────────────────────────────────────────────────────
function SettingsBlock({ eyebrow, title, sub, action, children }: {
  eyebrow: string; title: string; sub?: string; action?: React.ReactNode; children: React.ReactNode
}) {
  return (
    <Box sx={{ mb: 4 }}>
      <Stack direction="row" alignItems="flex-start" sx={{ mb: 2 }}>
        <Box sx={{ flex: 1 }}>
          <Typography sx={{ fontFamily: 'monospace', fontSize: 10.5, color: COPPER_DARK, letterSpacing: '0.12em', mb: 0.5 }}>{eyebrow}</Typography>
          <Typography variant="h6" sx={{ fontWeight: 700 }}>{title}</Typography>
          {sub && <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, maxWidth: 560, lineHeight: 1.5 }}>{sub}</Typography>}
        </Box>
        {action}
      </Stack>
      {children}
    </Box>
  )
}

// ─── Settings screen ────────────────────────────────────────────────────────────
const SETTINGS_PROVIDERS = [
  { id: 'openai', name: 'OpenAI', glyph: 'O', bg: 'linear-gradient(135deg,#10a37f,#0e7c5f)', model: 'gpt-4o', active: true, hasKey: true },
  { id: 'anthropic', name: 'Anthropic', glyph: 'A', bg: 'linear-gradient(135deg,#d97757,#b85a3d)', model: 'claude-haiku-4.5', active: true, hasKey: true },
  { id: 'gemini', name: 'Google Gemini', glyph: 'Ge', bg: 'linear-gradient(135deg,#4d9fff,#2c7be5)', model: 'gemini-2.0-flash', active: false, hasKey: true },
  { id: 'ollama', name: 'Ollama', glyph: 'Ol', bg: 'linear-gradient(135deg,#6c7480,#4a525d)', model: 'llama3.2:3b', active: true, hasKey: true, local: true },
]
const SETTINGS_SECTIONS = [
  { id: 'profile', label: 'Profile', icon: <PersonRoundedIcon fontSize="small" />, eyebrow: '00 · IDENTITY' },
  { id: 'llm', label: 'LLM', icon: <MemoryRoundedIcon fontSize="small" />, eyebrow: '01 · INFERENCE' },
  { id: 'search', label: 'Search', icon: <TravelExploreRoundedIcon fontSize="small" />, eyebrow: '02 · GROUNDING' },
  { id: 'app', label: 'App', icon: <TuneRoundedIcon fontSize="small" />, eyebrow: '03 · APPEARANCE' },
]

function SettingsScreen({ mode, setMode, displayName, setDisplayName }: {
  mode: ThemeMode; setMode: (m: ThemeMode) => void; displayName: string; setDisplayName: (s: string) => void
}) {
  const [section, setSection] = useState('profile')
  const [nameDraft, setNameDraft] = useState(displayName)
  const [saved, setSaved] = useState(false)

  const saveName = () => { setDisplayName(nameDraft.trim()); setSaved(true); setTimeout(() => setSaved(false), 1800) }
  const themeBtns: { id: ThemeMode; label: string }[] = [{ id: 'dark', label: 'Dark' }, { id: 'medium', label: 'Charcoal' }, { id: 'light', label: 'Parchment' }]

  return (
    <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* header */}
      <Stack direction="row" alignItems="flex-end" gap={2} sx={{ px: { xs: 3, md: 5 }, pt: 3.5, pb: 2 }}>
        <Box sx={{ flex: 1 }}>
          <Typography sx={{ fontFamily: 'monospace', fontSize: 11, letterSpacing: '0.12em', color: 'text.disabled', mb: 1 }}>— SETTINGS</Typography>
          <Typography variant="h4" sx={{ fontWeight: 700, letterSpacing: '-0.02em' }}>
            Make Knovex <Box component="em" sx={{ fontStyle: 'normal', color: 'primary.main' }}>yours</Box>
          </Typography>
        </Box>
        <Stack direction="row" spacing={1}>
          <PillBtn variant="outline"><RefreshRoundedIcon sx={{ fontSize: 14 }} /> Reset</PillBtn>
          <PillBtn variant="primary"><CheckRoundedIcon sx={{ fontSize: 15 }} /> All saved</PillBtn>
        </Stack>
      </Stack>

      <Box sx={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* section rail */}
        <Box sx={{ width: 168, flexShrink: 0, pt: 2, px: 1, display: { xs: 'none', md: 'block' } }}>
          {SETTINGS_SECTIONS.map(s => {
            const on = section === s.id
            return (
              <Stack key={s.id} direction="row" alignItems="center" spacing={1.25} onClick={() => setSection(s.id)} sx={{
                height: 36, px: 1.5, mb: 0.25, borderRadius: 2, cursor: 'pointer',
                color: on ? 'text.primary' : 'text.secondary', bgcolor: on ? 'action.selected' : 'transparent',
                '&:hover': { bgcolor: on ? 'action.selected' : 'action.hover' } }}>
                <Box sx={{ color: on ? 'primary.main' : 'inherit', display: 'flex' }}>{s.icon}</Box>
                <Typography sx={{ fontSize: 13, fontWeight: on ? 600 : 500 }}>{s.label}</Typography>
              </Stack>
            )
          })}
        </Box>

        {/* section content */}
        <Box sx={{ flex: 1, overflow: 'auto', px: { xs: 3, md: 4 }, py: 2.5, maxWidth: 760 }}>
          {/* PROFILE — the "what should I call you" name lives here too */}
          {section === 'profile' && (
            <SettingsBlock eyebrow="00 · IDENTITY" title="Your profile" sub="What should Knovex call you? This shows in the sidebar and in chat. Stays on this machine.">
              <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 2 }}>
                <Box sx={{ width: 52, height: 52, borderRadius: 2.5, flexShrink: 0, display: 'grid', placeItems: 'center',
                  fontSize: 18, fontWeight: 700, color: '#1A140C', background: GRAD }}>{initialsOf(nameDraft)}</Box>
                <Box sx={{ flex: 1, maxWidth: 360 }}>
                  <Typography sx={{ fontFamily: 'monospace', fontSize: 10.5, color: 'text.disabled', letterSpacing: '0.1em', mb: 0.75 }}>DISPLAY NAME</Typography>
                  <Box sx={{ display: 'flex', gap: 1 }}>
                    <Box component="input" value={nameDraft} placeholder="You"
                      onChange={(e) => setNameDraft((e.target as HTMLInputElement).value)}
                      sx={{ flex: 1, height: 38, px: 1.5, borderRadius: 2, border: '1px solid', borderColor: 'divider',
                        bgcolor: 'background.default', color: 'text.primary', fontFamily: 'inherit', fontSize: 14, outline: 'none',
                        '&:focus': { borderColor: COPPER } }} />
                    <PillBtn variant="primary" onClick={saveName}>{saved ? 'Saved ✓' : 'Save'}</PillBtn>
                  </Box>
                  <Typography variant="caption" color="text.disabled" sx={{ mt: 0.75, display: 'block' }}>Leave blank to just be called “You”.</Typography>
                </Box>
              </Stack>
            </SettingsBlock>
          )}

          {/* LLM */}
          {section === 'llm' && (
            <SettingsBlock eyebrow="01 · INFERENCE" title="LLM providers"
              sub="Connect any combination. The active provider answers chat & page Q&A; the rest stand by for fallback."
              action={<MiniChip>3 active · 7 supported</MiniChip>}>
              <Box sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' } }}>
                {SETTINGS_PROVIDERS.map(p => (
                  <Box key={p.id} sx={{ p: 2, borderRadius: 3, bgcolor: 'background.paper',
                    border: '1px solid', borderColor: p.active ? `${COPPER}55` : 'divider' }}>
                    <Stack direction="row" alignItems="center" spacing={1.25} sx={{ mb: 1.5 }}>
                      <Box sx={{ width: 30, height: 30, borderRadius: 2, display: 'grid', placeItems: 'center',
                        fontSize: 12, fontWeight: 700, color: '#fff', background: p.bg }}>{p.glyph}</Box>
                      <Box sx={{ flex: 1 }}>
                        <Typography sx={{ fontWeight: 600, fontSize: 13.5 }}>{p.name}</Typography>
                        <Stack direction="row" spacing={0.5} alignItems="center">
                          <Box sx={{ width: 5, height: 5, borderRadius: '50%', bgcolor: p.active ? '#3A8D7A' : 'text.disabled' }} />
                          <Typography sx={{ fontFamily: 'monospace', fontSize: 10, color: 'text.disabled' }}>{p.active ? 'Active' : 'Configured · paused'}</Typography>
                        </Stack>
                      </Box>
                      <Box sx={{ width: 34, height: 19, borderRadius: 99, p: '2px', bgcolor: p.active ? COPPER : 'action.hover', display: 'flex', justifyContent: p.active ? 'flex-end' : 'flex-start' }}>
                        <Box sx={{ width: 15, height: 15, borderRadius: '50%', bgcolor: '#fff' }} />
                      </Box>
                    </Stack>
                    {p.local ? (
                      <Stack direction="row" spacing={0.75} alignItems="center" sx={{ px: 1, py: 0.75, borderRadius: 1.5, bgcolor: 'action.hover', mb: 1.25 }}>
                        <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: '#3A8D7A' }} />
                        <Typography variant="caption" color="text.secondary">Auto-detected on <Box component="code" sx={{ fontFamily: 'monospace' }}>localhost:11434</Box></Typography>
                      </Stack>
                    ) : (
                      <Box sx={{ mb: 1.25 }}><MaskedKeyField defaultValue={p.hasKey ? 'sk-xxxxxxxxxxxxxxxx' : ''} placeholder={`Paste ${p.name} key…`} /></Box>
                    )}
                    <Stack direction="row" alignItems="center" justifyContent="space-between">
                      <Typography sx={{ fontFamily: 'monospace', fontSize: 11, color: 'text.secondary' }}>{p.model}</Typography>
                      <PillBtn variant="ghost"><Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: '#3A8D7A' }} /> Test connection</PillBtn>
                    </Stack>
                  </Box>
                ))}
              </Box>
            </SettingsBlock>
          )}

          {/* SEARCH */}
          {section === 'search' && (
            <SettingsBlock eyebrow="02 · GROUNDING" title="Web search engines"
              sub="Enable as many as you like — Knovex blends the top results from every active engine.">
              <Stack spacing={1}>
                {[{ n: 'DuckDuckGo', d: 'Free · No key required', free: true }, { n: 'Wikipedia', d: 'Free · Encyclopedic grounding', free: true }, { n: 'Serper', d: 'High-quality SERP results', free: false }, { n: 'Brave Search', d: 'Privacy-focused', free: false }].map(e => (
                  <Stack key={e.n} direction="row" alignItems="center" spacing={1.5} sx={{ p: 1.5, borderRadius: 2.5, bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider' }}>
                    <Box sx={{ width: 18, height: 18, borderRadius: 0.75, display: 'grid', placeItems: 'center', bgcolor: COPPER, color: '#1A140C' }}><CheckRoundedIcon sx={{ fontSize: 13 }} /></Box>
                    <Box sx={{ flex: 1 }}>
                      <Typography sx={{ fontWeight: 600, fontSize: 13.5 }}>{e.n}</Typography>
                      <Typography variant="caption" color="text.disabled">{e.d}</Typography>
                    </Box>
                    {e.free ? <MiniChip tone="#3A8D7A">Free</MiniChip> : <Box sx={{ width: 200 }}><MaskedKeyField placeholder={`${e.n} API key`} /></Box>}
                  </Stack>
                ))}
              </Stack>
            </SettingsBlock>
          )}

          {/* APP / appearance */}
          {section === 'app' && (
            <SettingsBlock eyebrow="03 · APPEARANCE" title="Look & feel" sub="Set it once — every screen and reader inherits it.">
              <Typography sx={{ fontFamily: 'monospace', fontSize: 10.5, color: 'text.disabled', letterSpacing: '0.1em', mb: 0.75 }}>THEME</Typography>
              <Box sx={{ display: 'inline-flex', gap: 0.25, p: 0.4, borderRadius: 2.5, bgcolor: 'action.hover', mb: 3 }}>
                {themeBtns.map(t => (
                  <Box key={t.id} component="button" onClick={() => setMode(t.id)} sx={{
                    height: 30, px: 1.75, borderRadius: 1.5, fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', border: 0,
                    bgcolor: mode === t.id ? 'background.paper' : 'transparent', color: mode === t.id ? 'primary.main' : 'text.secondary' }}>{t.label}</Box>
                ))}
              </Box>
              <Typography sx={{ fontFamily: 'monospace', fontSize: 10.5, color: 'text.disabled', letterSpacing: '0.1em', mb: 0.75 }}>STORAGE</Typography>
              <Stack direction="row" alignItems="center" spacing={1} sx={{ p: 1.25, borderRadius: 2, bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider', maxWidth: 480 }}>
                <FolderOpenRoundedIcon sx={{ fontSize: 17, color: COPPER }} />
                <Typography sx={{ flex: 1, fontFamily: 'monospace', fontSize: 12, color: 'text.secondary' }}>…/AppData/Local/Knovex</Typography>
                <PillBtn variant="ghost">Browse…</PillBtn>
              </Stack>
            </SettingsBlock>
          )}
        </Box>
      </Box>
    </Box>
  )
}

// ─── Welcome / first-run screen ────────────────────────────────────────────────
function WelcomeScreen({ onDone }: { onDone: (name: string) => void }) {
  const [name, setName] = useState('')
  return (
    <Box sx={{ position: 'fixed', inset: 0, zIndex: 1400, display: 'grid', placeItems: 'center',
      bgcolor: 'background.default', overflow: 'hidden' }}>
      {/* ambient copper glow */}
      <Box sx={{ position: 'absolute', inset: 0, opacity: 0.5, pointerEvents: 'none',
        background: `radial-gradient(600px 320px at 50% 12%, ${COPPER}26, transparent), radial-gradient(500px 280px at 80% 90%, ${COPPER_DARK}1f, transparent)` }} />
      <Box sx={{ position: 'relative', width: 420, maxWidth: '90vw', textAlign: 'center',
        animation: `${riseIn} .6s cubic-bezier(0.22,1,0.36,1) both` }}>
        <Box sx={{ width: 64, height: 64, borderRadius: 4, mx: 'auto', mb: 3, display: 'grid', placeItems: 'center',
          bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider', boxShadow: `0 12px 36px -10px ${COPPER}88` }}>
          <KnovexMark size={38} />
        </Box>
        <Typography sx={{ fontFamily: 'monospace', fontSize: 11, letterSpacing: '0.14em', color: COPPER_DARK, mb: 1 }}>WELCOME TO KNOVEX</Typography>
        <Typography variant="h4" sx={{ fontWeight: 700, letterSpacing: '-0.02em', mb: 1 }}>
          What should I <Box component="em" sx={{ fontStyle: 'normal', color: 'primary.main' }}>call you</Box>?
        </Typography>
        <Typography color="text.secondary" sx={{ mb: 3.5, lineHeight: 1.6 }}>
          So Knovex can greet you properly. You can change this anytime in Settings — and it never leaves this machine.
        </Typography>
        <Box component="input" autoFocus value={name} placeholder="Your name"
          onChange={(e) => setName((e.target as HTMLInputElement).value)}
          onKeyDown={(e) => { if ((e as React.KeyboardEvent).key === 'Enter') onDone(name.trim()) }}
          sx={{ width: '100%', height: 48, px: 2, mb: 1.5, borderRadius: 3, textAlign: 'center',
            border: '1px solid', borderColor: 'divider', bgcolor: 'background.paper', color: 'text.primary',
            fontFamily: 'inherit', fontSize: 17, outline: 'none', '&:focus': { borderColor: COPPER } }} />
        <Box component="button" onClick={() => onDone(name.trim())} sx={{
          width: '100%', height: 46, borderRadius: 3, border: 0, cursor: 'pointer',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 0.75,
          fontFamily: 'inherit', fontSize: 15, fontWeight: 700, background: GRAD, color: '#1A140C',
          '&:hover': { filter: 'brightness(1.08)' } }}>
          Get started <ArrowForwardRoundedIcon sx={{ fontSize: 18 }} />
        </Box>
        <Box component="button" onClick={() => onDone('')} sx={{ mt: 1.5, p: 0, border: 0, background: 'none',
          fontFamily: 'inherit', fontSize: 13, color: 'text.disabled', cursor: 'pointer', '&:hover': { color: 'text.secondary' } }}>
          Skip for now
        </Box>
      </Box>
    </Box>
  )
}

// ─── Root ─────────────────────────────────────────────────────────────────────
export default function DesignLab() {
  const [mode, setMode] = useState<ThemeMode>('dark')
  const [screen, setScreen] = useState<ScreenId>('library')
  const [displayName, setDisplayName] = useState('')
  const [showWelcome, setShowWelcome] = useState(true)  // lab: always show first; real app gates on `onboarded`
  const theme = useMemo(() => getTheme(mode), [mode])

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      {showWelcome && (
        <WelcomeScreen onDone={(name) => { setDisplayName(name); setShowWelcome(false) }} />
      )}
      <Box sx={{ display: 'flex', height: '100vh', overflow: 'hidden', bgcolor: 'background.default' }}>
        <NavRail mode={mode} setMode={setMode} screen={screen} onSelect={setScreen} displayName={displayName} />
        {screen === 'library' && <LibraryScreen />}
        {screen === 'reader'  && <ReaderScreen />}
        {screen === 'chat'     && <ChatScreen />}
        {screen === 'learn'    && <LearnScreen />}
        {screen === 'progress' && <ProgressScreen />}
        {screen === 'settings' && <SettingsScreen mode={mode} setMode={setMode} displayName={displayName} setDisplayName={setDisplayName} />}
      </Box>
      {/* tiny helper to re-trigger the welcome screen in the lab for review */}
      {!showWelcome && (
        <Box component="button" onClick={() => setShowWelcome(true)} sx={{
          position: 'fixed', bottom: 12, right: 12, zIndex: 1200, height: 30, px: 1.5, borderRadius: 99,
          border: '1px solid', borderColor: 'divider', bgcolor: 'background.paper', color: 'text.disabled',
          fontFamily: 'monospace', fontSize: 11, cursor: 'pointer', '&:hover': { color: COPPER, borderColor: COPPER } }}>
          ↻ replay welcome
        </Box>
      )}
    </ThemeProvider>
  )
}
