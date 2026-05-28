/**
 * Progress page — real-time data from /api/learn/stats + /api/learn/sessions
 *
 * Stat cards:  streak · sessions done · XP earned · active days  (all live)
 * Heatmap:     session created_at dates → heat level per cell
 * Velocity:    sessions / week + active-days / week over last 12 weeks
 */

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Box, Button, Tooltip, Typography, useTheme, alpha } from '@mui/material'
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth'
import FileDownloadIcon   from '@mui/icons-material/FileDownload'
import TrendingUpIcon     from '@mui/icons-material/TrendingUp'
import TrendingDownIcon   from '@mui/icons-material/TrendingDown'
import ScreenHeader from '../../components/Layout/ScreenHeader'
import { learnApi } from '../../api/learn.api'

// ─── Design tokens ────────────────────────────────────────────────────────────

const MONO  = '"IBM Plex Mono", "Geist Mono", monospace'
const SERIF = '"Instrument Serif", Georgia, serif'

const AMBER = '#F59E0B'
const GREEN = '#10B981'
const RED   = '#EF4444'

const HEAT_WEEKS = 26
const HEAT_DAYS  = 7

// ─── Date helpers ─────────────────────────────────────────────────────────────

/** Local YYYY-MM-DD string from a Date object (avoids UTC shift) */
function localISO(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * Map (week, day) cell to a local date string.
 * week 0 = oldest week (25 weeks ago), week HEAT_WEEKS-1 = current week.
 * day 0 = Sunday … day 6 = Saturday.
 */
function dateForCell(week: number, day: number, weekSunday: Date): string {
  const d = new Date(weekSunday)
  d.setDate(weekSunday.getDate() - (HEAT_WEEKS - 1 - week) * 7 + day)
  return localISO(d)
}

/** Session count → heat level 0–4 */
function countToLevel(n: number): 0 | 1 | 2 | 3 | 4 {
  if (n === 0) return 0
  if (n === 1) return 1
  if (n === 2) return 2
  if (n === 3) return 3
  return 4
}

// ─── Sparkline SVG component ──────────────────────────────────────────────────

function Sparkline({ pts, color, uid }: { pts: number[]; color: string; uid: string }) {
  const H = 36
  const W = 100
  const gradId = `sg-${uid}`

  const coords = pts.map((v, i) => ({
    x: (i / (pts.length - 1)) * W,
    y: H - 2 - v * (H - 6),
  }))

  const line = coords.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ')
  const area = `M 0 ${H} ` + coords.map(p => `L ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ') + ` L ${W} ${H} Z`

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      style={{ width: '100%', height: H, display: 'block' }}
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor={color} stopOpacity="0.22" />
          <stop offset="100%" stopColor={color} stopOpacity="0.01" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gradId})`} />
      <path d={line}  fill="none" stroke={color} strokeWidth="1.6"
            strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// ─── Stat card ────────────────────────────────────────────────────────────────

interface CardDef {
  uid:        string
  label:      string
  value:      string
  suffix?:    string
  trend:      string
  trendUp:    boolean
  sparkColor: string
  sparkPts:   number[]    // 14 normalized 0-1 points
}

function StatCard({ uid, label, value, suffix, trend, trendUp, sparkColor, sparkPts }: CardDef) {
  const theme    = useTheme()
  const isDark   = theme.palette.mode === 'dark'
  const trendClr = trendUp ? GREEN : RED
  const TrendIcon = trendUp ? TrendingUpIcon : TrendingDownIcon

  return (
    <Box
      data-testid={`stat-card-${uid}`}
      sx={{
        display:       'flex',
        flexDirection: 'column',
        bgcolor:       isDark ? 'rgba(255,255,255,0.025)' : 'background.paper',
        border:        `1px solid ${theme.palette.divider}`,
        borderRadius:  2.5,
        overflow:      'hidden',
        transition:    'box-shadow 0.15s',
        '&:hover':     { boxShadow: isDark ? '0 0 0 1px rgba(255,255,255,0.08)' : '0 2px 12px rgba(0,0,0,0.08)' },
      }}
    >
      <Box sx={{ px: 2.25, pt: 2, pb: 1.25, flex: 1 }}>
        <Typography sx={{
          fontFamily: MONO, fontSize: 9, textTransform: 'uppercase',
          letterSpacing: '0.13em', color: 'text.disabled', mb: 1.25,
        }}>
          {label}
        </Typography>

        <Box sx={{ display: 'flex', alignItems: 'flex-end', gap: 0.75, mb: 0.75 }}>
          <Typography sx={{ fontFamily: SERIF, fontSize: 40, fontWeight: 400, lineHeight: 0.9, color: 'text.primary' }}>
            {value}
          </Typography>
          {suffix && (
            <Typography sx={{ fontSize: 13, color: 'text.secondary', mb: 0.45, lineHeight: 1 }}>
              {suffix}
            </Typography>
          )}
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.35 }}>
          <TrendIcon sx={{ fontSize: 12, color: trendClr }} />
          <Typography sx={{ fontSize: 11, color: trendClr, fontWeight: 500, lineHeight: 1 }}>
            {trend}
          </Typography>
        </Box>
      </Box>

      <Sparkline pts={sparkPts} color={sparkColor} uid={uid} />
    </Box>
  )
}

// ─── Activity heatmap ─────────────────────────────────────────────────────────

interface HeatmapProps {
  sessionsByDay: Record<string, number>
  activeDays:    number
}

function ActivityHeatmap({ sessionsByDay, activeDays }: HeatmapProps) {
  const theme  = useTheme()
  const isDark = theme.palette.mode === 'dark'

  const heatPalette: string[] = [
    isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)',  // 0 — empty
    isDark ? '#2C1A06' : '#FDE8C0',                           // 1
    '#6B4A1E',                                                 // 2
    '#A07228',                                                 // 3
    '#F4A824',                                                 // 4
  ]

  const cell = 11; const gap = 2.5; const step = cell + gap
  const padL = 28;  const padB = 20
  const svgW = padL + HEAT_WEEKS * step
  const svgH = HEAT_DAYS * step + padB
  const mutedFill = isDark ? 'rgba(255,255,255,0.28)' : 'rgba(0,0,0,0.28)'

  // Sunday of current week — anchor for all cell-date calculations
  const weekSunday = useMemo(() => {
    const d = new Date()
    d.setDate(d.getDate() - d.getDay())
    d.setHours(0, 0, 0, 0)
    return d
  }, [])

  // Dynamic month labels based on actual calendar dates
  const monthLabels = useMemo<{ week: number; label: string }[]>(() => {
    const labels: { week: number; label: string }[] = []
    let lastMonth = -1
    for (let w = 0; w < HEAT_WEEKS; w++) {
      const d = new Date(weekSunday)
      d.setDate(weekSunday.getDate() - (HEAT_WEEKS - 1 - w) * 7)
      const m = d.getMonth()
      if (m !== lastMonth) {
        lastMonth = m
        labels.push({ week: w, label: d.toLocaleString('default', { month: 'short' }) })
      }
    }
    return labels
  }, [weekSunday])

  return (
    <Box sx={{
      flex: 1, minWidth: 0,
      bgcolor:      isDark ? 'rgba(255,255,255,0.02)' : 'background.paper',
      border:       `1px solid ${theme.palette.divider}`,
      borderRadius: 2.5,
      px: 2.5, pt: 2, pb: 1.75,
    }}>
      {/* Title row */}
      <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1.25, mb: 1.75 }}>
        <Typography sx={{ fontSize: 14, fontWeight: 700 }}>Daily activity</Typography>
        <Typography sx={{ fontFamily: MONO, fontSize: 9.5, color: 'text.disabled', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
          last 26 weeks
        </Typography>
        <Box sx={{ ml: 'auto', display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <Box sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: AMBER }} />
          <Typography sx={{ fontFamily: MONO, fontSize: 9.5, color: AMBER }}>
            {activeDays} active {activeDays === 1 ? 'day' : 'days'}
          </Typography>
        </Box>
      </Box>

      <Box sx={{ overflowX: 'auto' }}>
        <svg width={svgW} height={svgH} style={{ display: 'block' }}>
          {/* Day-of-week labels — Mon / Wed / Fri */}
          {[{ d: 1, label: 'Mon' }, { d: 3, label: 'Wed' }, { d: 5, label: 'Fri' }].map(({ d, label }) => (
            <text
              key={label}
              x={padL - 4} y={d * step + cell * 0.72}
              fontSize={7.5} fill={mutedFill} textAnchor="end"
              fontFamily="IBM Plex Mono, monospace"
            >
              {label}
            </text>
          ))}

          {/* Grid cells */}
          {Array.from({ length: HEAT_WEEKS }, (_, w) =>
            Array.from({ length: HEAT_DAYS }, (_, d) => {
              const dateStr = dateForCell(w, d, weekSunday)
              const count   = sessionsByDay[dateStr] ?? 0
              const level   = countToLevel(count)
              return (
                <rect
                  key={`${w}-${d}`}
                  x={padL + w * step} y={d * step}
                  width={cell} height={cell} rx={2} ry={2}
                  fill={heatPalette[level]}
                />
              )
            })
          )}

          {/* Month labels */}
          {monthLabels.map(({ week, label }) => (
            <text
              key={label}
              x={padL + week * step} y={svgH - 4}
              fontSize={8} fill={mutedFill}
              fontFamily="IBM Plex Mono, monospace"
            >
              {label}
            </text>
          ))}
        </svg>
      </Box>

      {/* Color legend */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 1.25, justifyContent: 'flex-end' }}>
        <Typography sx={{ fontFamily: MONO, fontSize: 8.5, color: 'text.disabled', mr: 0.5 }}>Less</Typography>
        {heatPalette.map((c, i) => (
          <Box key={i} sx={{
            width: 9, height: 9, borderRadius: '2px',
            bgcolor: c, border: `1px solid ${alpha(theme.palette.divider, 0.5)}`,
          }} />
        ))}
        <Typography sx={{ fontFamily: MONO, fontSize: 8.5, color: 'text.disabled', ml: 0.5 }}>More</Typography>
      </Box>
    </Box>
  )
}

// ─── Learning velocity chart ──────────────────────────────────────────────────

interface VelocityProps {
  sessionsPerWeek:    number[]   // 12 weekly values
  activeDaysPerWeek:  number[]   // 12 weekly values
}

function VelocityChart({ sessionsPerWeek, activeDaysPerWeek }: VelocityProps) {
  const theme  = useTheme()
  const isDark = theme.palette.mode === 'dark'

  const n = sessionsPerWeek.length  // 12
  const W = 258; const H = 130
  const pL = 24; const pR = 8; const pT = 10; const pB = 22
  const plotW = W - pL - pR
  const plotH = H - pT - pB

  // Dynamic Y scale — round up to nearest 5, minimum 5
  const maxRaw = Math.max(...sessionsPerWeek, ...activeDaysPerWeek, 1)
  const maxY   = Math.max(Math.ceil(maxRaw / 5) * 5, 5)
  const yTicks = [0, Math.round(maxY / 2), maxY]

  function toCoords(data: number[]) {
    return data.map((v, i) => ({
      x: pL + (i / (n - 1)) * plotW,
      y: pT + plotH - (v / maxY) * plotH,
    }))
  }
  function linePath(pts: { x: number; y: number }[]) {
    return pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ')
  }
  function areaPath(pts: { x: number; y: number }[]) {
    const floor = pT + plotH
    return `M ${pL} ${floor} ` + pts.map(p => `L ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ') + ` L ${pL + plotW} ${floor} Z`
  }

  const sessionsPts   = toCoords(sessionsPerWeek)
  const activeDaysPts = toCoords(activeDaysPerWeek)

  const gridClr = isDark ? 'rgba(255,255,255,0.055)' : 'rgba(0,0,0,0.055)'
  const lblClr  = isDark ? 'rgba(255,255,255,0.3)'   : 'rgba(0,0,0,0.3)'

  return (
    <Box sx={{
      width: 300, flexShrink: 0,
      bgcolor:      isDark ? 'rgba(255,255,255,0.02)' : 'background.paper',
      border:       `1px solid ${theme.palette.divider}`,
      borderRadius: 2.5,
      px: 2.5, pt: 2, pb: 1.75,
    }}>
      {/* Title + legend */}
      <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', mb: 1.5 }}>
        <Typography sx={{ fontSize: 14, fontWeight: 700 }}>Learning velocity</Typography>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.4, alignItems: 'flex-end' }}>
          {[
            { c: AMBER, l: 'sessions / wk' },
            { c: GREEN, l: 'active days / wk' },
          ].map(s => (
            <Box key={s.l} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <Box sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: s.c }} />
              <Typography sx={{ fontFamily: MONO, fontSize: 8.5, color: 'text.disabled' }}>{s.l}</Typography>
            </Box>
          ))}
        </Box>
      </Box>

      <svg width={W} height={H} style={{ display: 'block', overflow: 'visible' }}>
        <defs>
          <linearGradient id="vc-a" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor={AMBER} stopOpacity="0.22" />
            <stop offset="100%" stopColor={AMBER} stopOpacity="0.02" />
          </linearGradient>
          <linearGradient id="vc-g" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor={GREEN} stopOpacity="0.18" />
            <stop offset="100%" stopColor={GREEN} stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {yTicks.map(tick => {
          const y = pT + plotH - (tick / maxY) * plotH
          return (
            <g key={tick}>
              <line x1={pL} y1={y} x2={pL + plotW} y2={y}
                stroke={gridClr} strokeDasharray="3,4" strokeWidth={0.8} />
              <text x={pL - 4} y={y + 3.5} fontSize={7.5}
                fill={lblClr} textAnchor="end" fontFamily="IBM Plex Mono, monospace">
                {tick}
              </text>
            </g>
          )
        })}

        <path d={areaPath(activeDaysPts)} fill="url(#vc-g)" />
        <path d={areaPath(sessionsPts)}   fill="url(#vc-a)" />
        <path d={linePath(activeDaysPts)} fill="none" stroke={GREEN} strokeWidth={1.6}
              strokeLinecap="round" strokeLinejoin="round" />
        <path d={linePath(sessionsPts)}   fill="none" stroke={AMBER} strokeWidth={1.6}
              strokeLinecap="round" strokeLinejoin="round" />

        {[
          { pt: sessionsPts[n - 1],   color: AMBER },
          { pt: activeDaysPts[n - 1], color: GREEN },
        ].map(({ pt, color }, i) => (
          <circle key={i} cx={pt.x} cy={pt.y} r={2.5} fill={color} />
        ))}
      </svg>

      <Box sx={{ display: 'flex', justifyContent: 'space-between', pl: `${pL}px`, pr: `${pR}px` }}>
        <Typography sx={{ fontFamily: MONO, fontSize: 8, color: 'text.disabled' }}>12w ago</Typography>
        <Typography sx={{ fontFamily: MONO, fontSize: 8, color: 'text.disabled' }}>now</Typography>
      </Box>
    </Box>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ProgressPage() {

  // ── Fetch live data ────────────────────────────────────────────────────
  const { data: stats } = useQuery({
    queryKey:  ['learn-stats'],
    queryFn:   () => learnApi.getUserStats(),
    staleTime: 30_000,
  })

  const { data: rawSessions = [] } = useQuery({
    queryKey:  ['learn-sessions-progress'],
    queryFn:   () => learnApi.listSessions(),
    staleTime: 30_000,
  })

  const sessions = rawSessions.filter(s => s.status === 'ready')

  // ── Sessions-by-day map (local date → count) ───────────────────────────
  const sessionsByDay = useMemo<Record<string, number>>(() => {
    const map: Record<string, number> = {}
    sessions.forEach(s => {
      const day = localISO(new Date(s.created_at))
      map[day] = (map[day] ?? 0) + 1
    })
    return map
  }, [sessions])

  // Active days within the heatmap window (last 26 weeks)
  const activeDays = useMemo(() => {
    const cutoff = localISO(new Date(Date.now() - HEAT_WEEKS * 7 * 24 * 3600_000))
    return Object.keys(sessionsByDay).filter(d => d >= cutoff).length
  }, [sessionsByDay])

  // ── Weekly aggregates for velocity chart (last 12 weeks) ──────────────
  const { sessionsPerWeek, activeDaysPerWeek } = useMemo(() => {
    const wkMs    = 7 * 24 * 3600_000
    const now     = Date.now()
    const sessArr = Array<number>(12).fill(0)
    const daysSets: Set<string>[] = Array.from({ length: 12 }, () => new Set<string>())

    sessions.forEach(s => {
      const age   = now - new Date(s.created_at).getTime()
      const wkAgo = Math.floor(age / wkMs)
      if (wkAgo >= 0 && wkAgo < 12) {
        const idx = 11 - wkAgo
        sessArr[idx]++
        daysSets[idx].add(localISO(new Date(s.created_at)))
      }
    })

    return {
      sessionsPerWeek:   sessArr,
      activeDaysPerWeek: daysSets.map(s => s.size),
    }
  }, [sessions])

  // ── 14-day daily sparkline (normalized 0-1) ────────────────────────────
  const dailySparkPts = useMemo<number[]>(() => {
    const now = Date.now()
    const raw = Array.from({ length: 14 }, (_, i) => {
      const d = localISO(new Date(now - (13 - i) * 24 * 3600_000))
      return sessionsByDay[d] ?? 0
    })
    const max = Math.max(...raw, 1)
    return raw.map(v => Math.max(v / max, 0.05))
  }, [sessionsByDay])

  // Gentle rising line for XP / active-days cards (no daily data available)
  const risingPts = useMemo(
    () => Array.from({ length: 14 }, (_, i) => 0.20 + (i / 13) * 0.65),
    [],
  )

  // ── Derived metrics ────────────────────────────────────────────────────
  const streak = stats?.streak ?? 0
  const xp     = stats?.xp     ?? 0
  const level  = stats?.level  ?? 1

  const wkMs       = 7 * 24 * 3600_000
  const now        = Date.now()
  const thisWeek   = sessions.filter(s => now - new Date(s.created_at).getTime() <      wkMs).length
  const lastWeek   = sessions.filter(s => {
    const age = now - new Date(s.created_at).getTime()
    return age >= wkMs && age < 2 * wkMs
  }).length
  const weekDelta  = thisWeek - lastWeek

  // ── Stat card definitions (live) ─────────────────────────────────────
  const CARDS: CardDef[] = [
    {
      uid:        'streak',
      label:      'Current Streak',
      value:      String(streak),
      suffix:     streak === 1 ? 'day' : 'days',
      trend:      streak >= 7  ? `${streak} day streak 🔥`
                : streak  > 0  ? 'keep it up'
                :                'start today',
      trendUp:    streak > 0,
      sparkColor: AMBER,
      sparkPts:   dailySparkPts,
    },
    {
      uid:        'sessions',
      label:      'Sessions Done',
      value:      String(sessions.length),
      suffix:     'total',
      trend:      weekDelta > 0  ? `${weekDelta} more than last week`
                : weekDelta < 0  ? `${Math.abs(weekDelta)} fewer than last week`
                : thisWeek > 0   ? `${thisWeek} this week`
                :                  'no sessions yet',
      trendUp:    weekDelta >= 0 && sessions.length > 0,
      sparkColor: AMBER,
      sparkPts:   dailySparkPts,
    },
    {
      uid:        'xp',
      label:      'XP Earned',
      value:      xp.toLocaleString(),
      suffix:     `lv ${level}`,
      trend:      `Level ${level}`,
      trendUp:    true,
      sparkColor: GREEN,
      sparkPts:   risingPts,
    },
    {
      uid:        'days',
      label:      'Active Days',
      value:      String(activeDays),
      suffix:     activeDays === 1 ? 'day' : 'days',
      trend:      'last 26 weeks',
      trendUp:    activeDays > 0,
      sparkColor: activeDays > 0 ? GREEN : RED,
      sparkPts:   risingPts,
    },
  ]

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      <ScreenHeader
        eyebrow="PROGRESS · LAST 6 MONTHS"
        title="The shape of your"
        emphasis="learning"
        sub="Where you are, where you've been, and what Knovex thinks you should review next."
        actions={
          <>
            <Tooltip title="Date range filter — coming soon" placement="bottom">
              <span>
                <Button
                  variant="outlined" size="small" disabled
                  startIcon={<CalendarMonthIcon sx={{ fontSize: 14 }} />}
                  sx={{ fontSize: 12, height: 32, textTransform: 'none' }}
                >
                  Last 6 months
                </Button>
              </span>
            </Tooltip>
            <Tooltip title="Export progress report — coming soon" placement="bottom">
              <span>
                <Button
                  variant="outlined" size="small" disabled
                  startIcon={<FileDownloadIcon sx={{ fontSize: 14 }} />}
                  sx={{ fontSize: 12, height: 32, textTransform: 'none' }}
                >
                  Export
                </Button>
              </span>
            </Tooltip>
          </>
        }
      />

      {/* ── Scrollable content ── */}
      <Box sx={{ flex: 1, overflowY: 'auto', px: 3, py: 2.5, display: 'flex', flexDirection: 'column', gap: 2.5 }}>

        {/* ── 4 stat cards ── */}
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 1.5 }}>
          {CARDS.map(c => <StatCard key={c.uid} {...c} />)}
        </Box>

        {/* ── Heatmap + velocity ── */}
        <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <ActivityHeatmap sessionsByDay={sessionsByDay} activeDays={activeDays} />
          <VelocityChart sessionsPerWeek={sessionsPerWeek} activeDaysPerWeek={activeDaysPerWeek} />
        </Box>

      </Box>
    </Box>
  )
}
