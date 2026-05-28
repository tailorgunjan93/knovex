/**
 * Progress Page — Comprehensive Test Suite
 *
 * ════════════════════════════════════════════════════════════════
 *  PERSPECTIVE 1 › UI/UX Expert
 *  Examines every visible element, label, and interactive detail:
 *  • Page header eyebrow / title / emphasis present
 *  • 4 stat cards exist with exact label text
 *  • Each card shows its value, suffix, and trend text
 *  • Streak card: correct singular/plural suffix ("day" vs "days")
 *  • Sessions Done card: suffix = "total"
 *  • XP card: suffix = "lv N"
 *  • Active Days card: correct singular/plural suffix
 *  • Trend "start today" shown when streak = 0
 *  • Trend "keep it up" shown when 0 < streak < 7
 *  • Trend fire-emoji message shown when streak ≥ 7
 *  • "Daily activity" heatmap section heading visible
 *  • Heatmap active-days count visible (e.g. "3 active days")
 *  • "Less" / "More" legend text in heatmap
 *  • "Learning velocity" chart heading visible
 *  • Legend labels "sessions / wk" and "active days / wk" visible
 *  • "12w ago" / "now" axis labels visible
 *  • Export button renders (icon button present)
 *
 *  PERSPECTIVE 2 › Business Analyst
 *  Verifies every functional computation and data contract:
 *  • Stat cards query /api/learn/stats endpoint
 *  • Stat cards query /api/learn/sessions endpoint
 *  • Sessions with status ≠ 'ready' are excluded from counts
 *  • Streak value comes from API, not hardcoded
 *  • XP value comes from API, not hardcoded
 *  • Level value comes from API stats
 *  • Sessions Done count matches filtered 'ready' sessions
 *  • Active Days counts unique days with sessions in 26-week window
 *  • Sessions created before the 26-week window don't count as active
 *  • "N more than last week" delta logic: thisWeek > lastWeek
 *  • "N fewer than last week" delta logic: thisWeek < lastWeek
 *  • "X this week" shown when delta = 0 but has sessions this week
 *  • "no sessions yet" shown when 0 sessions total
 *  • Velocity chart section always renders (even with no data)
 *  • Heatmap section always renders (even with no data)
 *  • Loading state: stats cards show placeholder values initially
 * ════════════════════════════════════════════════════════════════
 */

window.HTMLElement.prototype.scrollIntoView = vi.fn()

// SVG methods not in jsdom
;(window.SVGElement.prototype as unknown as Record<string, unknown>).getBBox =
  vi.fn().mockReturnValue({ x: 0, y: 0, width: 0, height: 0 })

import { render, screen, waitFor, within } from '@testing-library/react'
import { ThemeProvider, createTheme } from '@mui/material'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest'
import type { ReactNode } from 'react'
import ProgressPage from '../index'
import { learnApi } from '@/api/learn.api'
import type { LearnSession, UserStats } from '@/api/learn.api'

// ─── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('@/api/learn.api', () => ({
  learnApi: {
    getUserStats:  vi.fn(),
    listSessions:  vi.fn(),
  },
}))

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const STATS_ZERO: UserStats = {
  xp: 0, level: 1, streak: 0, last_activity: null, badges: [],
}

const STATS_STREAK_3: UserStats = {
  xp: 250, level: 2, streak: 3, last_activity: '2026-05-28T10:00:00', badges: [],
}

const STATS_STREAK_7: UserStats = {
  xp: 1200, level: 4, streak: 7, last_activity: '2026-05-28T10:00:00', badges: [],
}

const STATS_STREAK_1: UserStats = {
  xp: 50, level: 1, streak: 1, last_activity: '2026-05-28T10:00:00', badges: [],
}

/** Helper: create a ready session N days ago */
function session(id: string, daysAgo: number, status: LearnSession['status'] = 'ready'): LearnSession {
  const d = new Date(Date.now() - daysAgo * 24 * 3600_000)
  return {
    id,
    topic:        `Topic ${id}`,
    format:       'story',
    source_type:  'topic',
    difficulty:   'intermediate',
    status,
    content:      null,
    created_at:   d.toISOString(),
    completed_at: d.toISOString(),
  }
}

/** 0 ready sessions */
const NO_SESSIONS: LearnSession[] = []

/** 3 sessions all today */
const THREE_TODAY: LearnSession[] = [
  session('a', 0),
  session('b', 0),
  session('c', 0),
]

/** Sessions spread: 2 this week, 1 last week, 1 ancient (200 days ago) */
const SPREAD_SESSIONS: LearnSession[] = [
  session('w1a', 1),     // this week
  session('w1b', 3),     // this week
  session('w2a', 8),     // last week
  session('old', 200),   // 200 days ago — outside 26-week window
]

/** Error state session — should be excluded */
const WITH_ERROR_SESSION: LearnSession[] = [
  session('ready-1', 1, 'ready'),
  session('err-1',   2, 'error'),
  session('gen-1',   3, 'generating'),
]

// ─── Render helper ─────────────────────────────────────────────────────────────

function renderProgress() {
  const qc    = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const theme = createTheme()

  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>
      <ThemeProvider theme={theme}>{children}</ThemeProvider>
    </QueryClientProvider>
  )

  return render(<ProgressPage />, { wrapper: Wrapper })
}

// ─── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks()
  ;(learnApi.getUserStats as Mock).mockResolvedValue(STATS_ZERO)
  ;(learnApi.listSessions as Mock).mockResolvedValue(NO_SESSIONS)
})

// ══════════════════════════════════════════════════════════════════
//  PERSPECTIVE 1 — UI/UX EXPERT
// ══════════════════════════════════════════════════════════════════

describe('UI/UX Expert › Page header', () => {

  it('renders the eyebrow text "PROGRESS"', async () => {
    renderProgress()
    await waitFor(() =>
      expect(screen.getByText(/PROGRESS/i)).toBeInTheDocument()
    )
  })

  it('renders "The shape of your" in the title', async () => {
    renderProgress()
    await waitFor(() =>
      expect(screen.getByText(/The shape of your/i)).toBeInTheDocument()
    )
  })

  it('renders "learning" emphasis in the title', async () => {
    renderProgress()
    await waitFor(() =>
      expect(screen.getByText('learning')).toBeInTheDocument()
    )
  })

})

describe('UI/UX Expert › Stat card labels', () => {

  it('renders "Current Streak" card label', async () => {
    renderProgress()
    await waitFor(() =>
      expect(screen.getByText('Current Streak')).toBeInTheDocument()
    )
  })

  it('renders "Sessions Done" card label', async () => {
    renderProgress()
    await waitFor(() =>
      expect(screen.getByText('Sessions Done')).toBeInTheDocument()
    )
  })

  it('renders "XP Earned" card label', async () => {
    renderProgress()
    await waitFor(() =>
      expect(screen.getByText('XP Earned')).toBeInTheDocument()
    )
  })

  it('renders "Active Days" card label', async () => {
    renderProgress()
    await waitFor(() =>
      expect(screen.getByText('Active Days')).toBeInTheDocument()
    )
  })

})

describe('UI/UX Expert › Stat card suffixes and values', () => {

  it('shows "days" suffix for streak = 0', async () => {
    renderProgress()
    // streak = 0 renders suffix "days" (plural)
    await waitFor(() => {
      const suffixes = screen.getAllByText('days')
      expect(suffixes.length).toBeGreaterThanOrEqual(1)
    })
  })

  it('shows "day" (singular) suffix when streak = 1', async () => {
    ;(learnApi.getUserStats as Mock).mockResolvedValue(STATS_STREAK_1)
    renderProgress()
    await waitFor(() =>
      expect(screen.getAllByText('day').length).toBeGreaterThanOrEqual(1)
    )
  })

  it('shows "total" suffix on Sessions Done card', async () => {
    renderProgress()
    await waitFor(() =>
      expect(screen.getByText('total')).toBeInTheDocument()
    )
  })

  it('shows "lv 1" suffix on XP card when level = 1', async () => {
    renderProgress()
    await waitFor(() =>
      expect(screen.getByText('lv 1')).toBeInTheDocument()
    )
  })

  it('shows "lv 2" when level = 2', async () => {
    ;(learnApi.getUserStats as Mock).mockResolvedValue(STATS_STREAK_3)
    renderProgress()
    await waitFor(() =>
      expect(screen.getByText('lv 2')).toBeInTheDocument()
    )
  })

  it('XP value "250" displays when XP = 250', async () => {
    ;(learnApi.getUserStats as Mock).mockResolvedValue(STATS_STREAK_3)
    renderProgress()
    await waitFor(() =>
      expect(screen.getByText('250')).toBeInTheDocument()
    )
  })

})

describe('UI/UX Expert › Streak trend text', () => {

  it('shows "start today" when streak = 0', async () => {
    renderProgress()
    await waitFor(() =>
      expect(screen.getByText('start today')).toBeInTheDocument()
    )
  })

  it('shows "keep it up" when streak = 3 (0 < streak < 7)', async () => {
    ;(learnApi.getUserStats as Mock).mockResolvedValue(STATS_STREAK_3)
    renderProgress()
    await waitFor(() =>
      expect(screen.getByText('keep it up')).toBeInTheDocument()
    )
  })

  it('shows fire emoji in streak trend when streak ≥ 7', async () => {
    ;(learnApi.getUserStats as Mock).mockResolvedValue(STATS_STREAK_7)
    renderProgress()
    await waitFor(() =>
      expect(screen.getByText(/7 day streak 🔥/i)).toBeInTheDocument()
    )
  })

})

describe('UI/UX Expert › Heatmap section', () => {

  it('renders "Daily activity" section heading', async () => {
    renderProgress()
    await waitFor(() =>
      expect(screen.getByText('Daily activity')).toBeInTheDocument()
    )
  })

  it('renders "last 26 weeks" label near heatmap', async () => {
    renderProgress()
    // Active Days stat card AND heatmap both say "last 26 weeks" — at least one must exist
    await waitFor(() =>
      expect(screen.getAllByText(/last 26 weeks/i).length).toBeGreaterThanOrEqual(1)
    )
  })

  it('renders "Less" legend label', async () => {
    renderProgress()
    await waitFor(() =>
      expect(screen.getByText('Less')).toBeInTheDocument()
    )
  })

  it('renders "More" legend label', async () => {
    renderProgress()
    await waitFor(() =>
      expect(screen.getByText('More')).toBeInTheDocument()
    )
  })

  it('renders Mon/Wed/Fri day-of-week axis labels', async () => {
    renderProgress()
    await waitFor(() => {
      expect(screen.getByText('Mon')).toBeInTheDocument()
      expect(screen.getByText('Wed')).toBeInTheDocument()
      expect(screen.getByText('Fri')).toBeInTheDocument()
    })
  })

})

describe('UI/UX Expert › Velocity chart section', () => {

  it('renders "Learning velocity" section heading', async () => {
    renderProgress()
    await waitFor(() =>
      expect(screen.getByText('Learning velocity')).toBeInTheDocument()
    )
  })

  it('renders "sessions / wk" legend label', async () => {
    renderProgress()
    await waitFor(() =>
      expect(screen.getByText('sessions / wk')).toBeInTheDocument()
    )
  })

  it('renders "active days / wk" legend label', async () => {
    renderProgress()
    await waitFor(() =>
      expect(screen.getByText('active days / wk')).toBeInTheDocument()
    )
  })

  it('renders "12w ago" left axis label', async () => {
    renderProgress()
    await waitFor(() =>
      expect(screen.getByText('12w ago')).toBeInTheDocument()
    )
  })

  it('renders "now" right axis label', async () => {
    renderProgress()
    await waitFor(() =>
      expect(screen.getByText('now')).toBeInTheDocument()
    )
  })

})

// ══════════════════════════════════════════════════════════════════
//  PERSPECTIVE 2 — BUSINESS ANALYST
// ══════════════════════════════════════════════════════════════════

describe('Business Analyst › API integration', () => {

  it('calls learnApi.getUserStats on mount', async () => {
    renderProgress()
    await waitFor(() =>
      expect(learnApi.getUserStats).toHaveBeenCalledTimes(1)
    )
  })

  it('calls learnApi.listSessions on mount', async () => {
    renderProgress()
    await waitFor(() =>
      expect(learnApi.listSessions).toHaveBeenCalledTimes(1)
    )
  })

  it('displays XP from API, not hardcoded', async () => {
    ;(learnApi.getUserStats as Mock).mockResolvedValue({ ...STATS_ZERO, xp: 777 })
    renderProgress()
    await waitFor(() =>
      expect(screen.getByText('777')).toBeInTheDocument()
    )
  })

  it('displays level from API stats', async () => {
    ;(learnApi.getUserStats as Mock).mockResolvedValue({ ...STATS_ZERO, xp: 500, level: 3 })
    renderProgress()
    await waitFor(() =>
      expect(screen.getByText('lv 3')).toBeInTheDocument()
    )
  })

  it('displays streak value from API', async () => {
    ;(learnApi.getUserStats as Mock).mockResolvedValue(STATS_STREAK_3)
    renderProgress()
    // streak = 3 shows "3" as the stat value
    await waitFor(() =>
      expect(screen.getByText('3')).toBeInTheDocument()
    )
  })

})

describe('Business Analyst › Sessions Done count', () => {

  it('shows "0" sessions done when no sessions', async () => {
    renderProgress()
    await waitFor(() => {
      // Use Sessions Done card specifically via data-testid
      const card = screen.getByTestId('stat-card-sessions')
      expect(within(card).getByText('0')).toBeInTheDocument()
    })
  })

  it('shows correct count for 3 ready sessions', async () => {
    ;(learnApi.listSessions as Mock).mockResolvedValue(THREE_TODAY)
    renderProgress()
    await waitFor(() => {
      const card = screen.getByTestId('stat-card-sessions')
      expect(within(card).getByText('3')).toBeInTheDocument()
    })
  })

  it('excludes error-status sessions from the Sessions Done count', async () => {
    // WITH_ERROR_SESSION: 1 ready, 1 error, 1 generating → only 1 should count
    ;(learnApi.listSessions as Mock).mockResolvedValue(WITH_ERROR_SESSION)
    renderProgress()
    await waitFor(() => {
      const card = screen.getByTestId('stat-card-sessions')
      expect(within(card).getByText('1')).toBeInTheDocument()
      // "3" must not be the sessions count
      expect(within(card).queryByText('3')).not.toBeInTheDocument()
    })
  })

  it('excludes generating-status sessions from the count', async () => {
    ;(learnApi.listSessions as Mock).mockResolvedValue(WITH_ERROR_SESSION)
    renderProgress()
    await waitFor(() => {
      const card = screen.getByTestId('stat-card-sessions')
      expect(within(card).getByText('1')).toBeInTheDocument()
    })
  })

})

describe('Business Analyst › Week-delta trend text', () => {

  it('shows "no sessions yet" when total sessions = 0', async () => {
    renderProgress()
    await waitFor(() =>
      expect(screen.getByText('no sessions yet')).toBeInTheDocument()
    )
  })

  it('shows "2 more than last week" when this week=2 and last week=0', async () => {
    // thisWeek=2, lastWeek=0 → weekDelta=2 > 0 → "2 more than last week"
    ;(learnApi.listSessions as Mock).mockResolvedValue([
      session('a', 1), session('b', 2),   // this week (< 7 days ago)
    ])
    renderProgress()
    await waitFor(() =>
      expect(screen.getByText('2 more than last week')).toBeInTheDocument()
    )
  })

  it('shows "2 this week" when this week=2 and last week=2 (delta=0)', async () => {
    // thisWeek=2, lastWeek=2 → weekDelta=0, thisWeek>0 → "2 this week"
    ;(learnApi.listSessions as Mock).mockResolvedValue([
      session('w1a', 1), session('w1b', 3),   // this week
      session('w2a', 8), session('w2b', 9),   // last week
    ])
    renderProgress()
    await waitFor(() =>
      expect(screen.getByText('2 this week')).toBeInTheDocument()
    )
  })

  it('shows "1 more than last week" when this week has 2, last week had 1', async () => {
    ;(learnApi.listSessions as Mock).mockResolvedValue([
      session('w1a', 1), session('w1b', 2),   // this week
      session('w2a', 8),                       // last week
    ])
    renderProgress()
    await waitFor(() =>
      expect(screen.getByText('1 more than last week')).toBeInTheDocument()
    )
  })

  it('shows "2 fewer than last week" when this week has 0, last week had 2', async () => {
    ;(learnApi.listSessions as Mock).mockResolvedValue([
      session('w2a', 8), session('w2b', 9),    // last week only
    ])
    renderProgress()
    await waitFor(() =>
      expect(screen.getByText('2 fewer than last week')).toBeInTheDocument()
    )
  })

})

describe('Business Analyst › Active Days heatmap count', () => {

  it('shows "0 active days" when no sessions', async () => {
    renderProgress()
    await waitFor(() =>
      expect(screen.getByText(/0 active days/i)).toBeInTheDocument()
    )
  })

  it('shows "1 active day" (singular) when all sessions on one day', async () => {
    ;(learnApi.listSessions as Mock).mockResolvedValue(THREE_TODAY)
    // Three sessions but ALL today = 1 active day
    renderProgress()
    await waitFor(() =>
      expect(screen.getByText(/1 active day/i)).toBeInTheDocument()
    )
  })

  it('excludes sessions older than 26 weeks from active days count', async () => {
    ;(learnApi.listSessions as Mock).mockResolvedValue([
      session('recent',  1),     // within 26 weeks
      session('ancient', 200),   // 200 days = ~28.5 weeks — outside window
    ])
    renderProgress()
    // Should show only 1 active day (not 2)
    await waitFor(() =>
      expect(screen.getByText(/1 active day/i)).toBeInTheDocument()
    )
  })

  it('counts distinct days, not number of sessions', async () => {
    // THREE_TODAY = 3 sessions all on the same day
    ;(learnApi.listSessions as Mock).mockResolvedValue(THREE_TODAY)
    renderProgress()
    await waitFor(() => {
      // "1 active day" not "3 active days"
      expect(screen.getByText(/1 active day/i)).toBeInTheDocument()
      expect(screen.queryByText(/3 active days/i)).not.toBeInTheDocument()
    })
  })

  it('shows "2 active days" when sessions on 2 distinct days', async () => {
    ;(learnApi.listSessions as Mock).mockResolvedValue([
      session('d1', 1),   // yesterday
      session('d2', 3),   // 3 days ago
    ])
    renderProgress()
    await waitFor(() =>
      expect(screen.getByText(/2 active days/i)).toBeInTheDocument()
    )
  })

})

describe('Business Analyst › Chart sections always render', () => {

  it('velocity chart renders even when sessions list is empty', async () => {
    renderProgress()
    await waitFor(() =>
      expect(screen.getByText('Learning velocity')).toBeInTheDocument()
    )
  })

  it('heatmap renders even when sessions list is empty', async () => {
    renderProgress()
    await waitFor(() =>
      expect(screen.getByText('Daily activity')).toBeInTheDocument()
    )
  })

  it('heatmap renders even when stats API is slow (shows 0)', async () => {
    // Stats never resolves — page still renders with defaults
    ;(learnApi.getUserStats as Mock).mockImplementation(
      () => new Promise(() => {})  // never resolves
    )
    renderProgress()
    await waitFor(() =>
      expect(screen.getByText('Daily activity')).toBeInTheDocument()
    )
  })

})

describe('Business Analyst › XP level display', () => {

  it('shows "Level 1" in XP trend text at level 1', async () => {
    renderProgress()
    await waitFor(() =>
      expect(screen.getByText('Level 1')).toBeInTheDocument()
    )
  })

  it('shows "Level 4" in XP trend text when level = 4', async () => {
    ;(learnApi.getUserStats as Mock).mockResolvedValue(STATS_STREAK_7)
    renderProgress()
    await waitFor(() =>
      expect(screen.getByText('Level 4')).toBeInTheDocument()
    )
  })

  it('XP card value uses toLocaleString formatting for large numbers', async () => {
    ;(learnApi.getUserStats as Mock).mockResolvedValue({ ...STATS_ZERO, xp: 12000, level: 7 })
    renderProgress()
    // toLocaleString(12000) → "12,000" in en-US
    await waitFor(() =>
      expect(screen.getByText(/12[,.]?000/)).toBeInTheDocument()
    )
  })

})
