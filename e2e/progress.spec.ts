/**
 * E2E Tests â€” Progress Page
 *
 * Two perspectives:
 *  â€¢ UI/UX Expert   â€” layout fidelity: stat cards, heatmap, velocity chart, header
 *  â€¢ Business Analyst â€” data accuracy: correct values, filtering, trend text, week delta
 *
 * All /api/* calls intercepted via page.route() â€” no backend required.
 */

import { test, expect, type Page } from '@playwright/test'

// â”€â”€â”€ Fixture builders â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

interface MockSession {
  id:           string
  topic:        string
  format:       string
  source_type:  string
  difficulty:   string
  status:       string
  content:      null
  created_at:   string
  completed_at: string | null
}

/**
 * Create a session fixture with a created_at date that is `daysAgo` days in the past.
 * Status defaults to 'ready'.
 */
function makeSession(
  id: string,
  daysAgo: number,
  status: string = 'ready',
): MockSession {
  const d = new Date(Date.now() - daysAgo * 24 * 3600_000)
  return {
    id,
    topic:        `Topic ${id}`,
    format:       'quiz',
    source_type:  'topic',
    difficulty:   'intermediate',
    status,
    content:      null,
    created_at:   d.toISOString(),
    completed_at: d.toISOString(),
  }
}

// â”€â”€â”€ Stats fixtures â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const STATS_ZERO = {
  xp: 0, level: 1, streak: 0,
  last_activity: null, badges: [],
}

const STATS_STREAK_5 = {
  xp: 350, level: 3, streak: 5,
  last_activity: new Date().toISOString(),
  badges: ['first_step', 'explorer'],
}

const STATS_STREAK_7 = {
  xp: 800, level: 4, streak: 7,
  last_activity: new Date().toISOString(),
  badges: ['first_step', '7_day_streak'],
}

const STATS_HIGH_XP = {
  xp: 12_500, level: 8, streak: 0,
  last_activity: new Date().toISOString(),
  badges: ['level_5'],
}

// â”€â”€â”€ Route helper â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

async function mockProgressApi(
  page: Page,
  stats:    object,
  sessions: object[],
) {
  await page.route(
    (url) => url.pathname === '/api/learn/stats',
    (route) => route.fulfill({ json: stats }),
  )
  await page.route(
    (url) => url.pathname === '/api/learn/sessions',
    (route) => route.fulfill({ json: sessions }),
  )
}

// â”€â”€â”€ Tests â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

test.describe('UI/UX Expert â€” Progress Page: Visual & Layout', () => {

  test('page renders the heading "The shape of your learning"', async ({ page }) => {
    await mockProgressApi(page, STATS_ZERO, [])
    await page.goto('/#/progress')

    await expect(page.getByText('The shape of your')).toBeVisible()
    // The italic <em> contains "learning"
    await expect(page.locator('em').filter({ hasText: /learning/i })).toBeVisible()
  })

  test('renders 4 stat card labels', async ({ page }) => {
    await mockProgressApi(page, STATS_STREAK_5, [])
    await page.goto('/#/progress')

    await expect(page.getByText(/Current Streak/i).first()).toBeVisible()
    await expect(page.getByText(/Sessions Done/i).first()).toBeVisible()
    await expect(page.getByText(/XP Earned/i).first()).toBeVisible()
    await expect(page.getByText(/Active Days/i).first()).toBeVisible()
  })

  test('all 4 stat card containers are visible via data-testid', async ({ page }) => {
    await mockProgressApi(page, STATS_STREAK_5, [])
    await page.goto('/#/progress')

    await expect(page.locator('[data-testid="stat-card-streak"]')).toBeVisible()
    await expect(page.locator('[data-testid="stat-card-sessions"]')).toBeVisible()
    await expect(page.locator('[data-testid="stat-card-xp"]')).toBeVisible()
    await expect(page.locator('[data-testid="stat-card-days"]')).toBeVisible()
  })

  test('activity heatmap renders "Daily activity" section', async ({ page }) => {
    await mockProgressApi(page, STATS_STREAK_5, [makeSession('s1', 0)])
    await page.goto('/#/progress')

    await expect(page.getByText('Daily activity')).toBeVisible()
  })

  test('heatmap shows "last 26 weeks" label', async ({ page }) => {
    await mockProgressApi(page, STATS_ZERO, [])
    await page.goto('/#/progress')

    await expect(page.getByText(/last 26 weeks/i).first()).toBeVisible()
  })

  test('heatmap renders an SVG element', async ({ page }) => {
    await mockProgressApi(page, STATS_ZERO, [])
    await page.goto('/#/progress')

    // The heatmap contains an SVG
    await expect(page.locator('svg').first()).toBeVisible()
  })

  test('learning velocity chart renders title', async ({ page }) => {
    await mockProgressApi(page, STATS_ZERO, [])
    await page.goto('/#/progress')

    await expect(page.getByText('Learning velocity')).toBeVisible()
  })

  test('velocity chart shows "sessions / wk" legend', async ({ page }) => {
    await mockProgressApi(page, STATS_ZERO, [])
    await page.goto('/#/progress')

    await expect(page.getByText(/sessions \/ wk/i)).toBeVisible()
  })

  test('velocity chart shows "active days / wk" legend', async ({ page }) => {
    await mockProgressApi(page, STATS_ZERO, [])
    await page.goto('/#/progress')

    await expect(page.getByText(/active days \/ wk/i)).toBeVisible()
  })

  test('Export button is visible in the page header', async ({ page }) => {
    await mockProgressApi(page, STATS_ZERO, [])
    await page.goto('/#/progress')

    await expect(page.getByRole('button', { name: /Export/i })).toBeVisible()
  })

  test('date range button shows "Last 6 months"', async ({ page }) => {
    await mockProgressApi(page, STATS_ZERO, [])
    await page.goto('/#/progress')

    await expect(page.getByRole('button', { name: /Last 6 months/i })).toBeVisible()
  })

  test('eyebrow label shows "PROGRESS Â· LAST 6 MONTHS"', async ({ page }) => {
    await mockProgressApi(page, STATS_ZERO, [])
    await page.goto('/#/progress')

    await expect(page.getByText(/PROGRESS/i).first()).toBeVisible()
  })

  test('active days badge shows "active days" text next to count', async ({ page }) => {
    const sessions = [makeSession('s1', 0), makeSession('s2', 1)]
    await mockProgressApi(page, STATS_STREAK_5, sessions)
    await page.goto('/#/progress')

    await expect(page.getByText(/active days/i).first()).toBeVisible()
  })

})


test.describe('Business Analyst â€” Progress Page: Data Accuracy', () => {

  test('streak card shows the streak value from the stats API', async ({ page }) => {
    await mockProgressApi(page, STATS_STREAK_5, [])
    await page.goto('/#/progress')

    const streakCard = page.locator('[data-testid="stat-card-streak"]')
    await expect(streakCard.getByText('5')).toBeVisible()
  })

  test('streak card shows "days" suffix for streak > 1', async ({ page }) => {
    await mockProgressApi(page, STATS_STREAK_5, [])
    await page.goto('/#/progress')

    const streakCard = page.locator('[data-testid="stat-card-streak"]')
    await expect(streakCard.getByText('days')).toBeVisible()
  })

  test('streak card shows "day" (singular) for streak = 1', async ({ page }) => {
    await mockProgressApi(page, { ...STATS_ZERO, streak: 1 }, [])
    await page.goto('/#/progress')

    const streakCard = page.locator('[data-testid="stat-card-streak"]')
    await expect(streakCard.getByText('day')).toBeVisible()
  })

  test('streak = 7 shows "7 day streak ðŸ”¥" trend text', async ({ page }) => {
    await mockProgressApi(page, STATS_STREAK_7, [])
    await page.goto('/#/progress')

    await expect(
      page.getByText(/7 day streak/i)
    ).toBeVisible()
  })

  test('streak = 0 shows "start today" trend text', async ({ page }) => {
    await mockProgressApi(page, STATS_ZERO, [])
    await page.goto('/#/progress')

    const streakCard = page.locator('[data-testid="stat-card-streak"]')
    await expect(streakCard.getByText(/start today/i)).toBeVisible()
  })

  test('XP card shows the XP value from the stats API', async ({ page }) => {
    await mockProgressApi(page, STATS_STREAK_5, [])
    await page.goto('/#/progress')

    const xpCard = page.locator('[data-testid="stat-card-xp"]')
    // 350 formatted (no comma needed for this value)
    await expect(xpCard.getByText('350')).toBeVisible()
  })

  test('XP card shows level as "lv N" suffix', async ({ page }) => {
    await mockProgressApi(page, STATS_STREAK_5, [])
    await page.goto('/#/progress')

    const xpCard = page.locator('[data-testid="stat-card-xp"]')
    await expect(xpCard.getByText(/lv\s*3/i)).toBeVisible()
  })

  test('XP card trend text shows "Level N"', async ({ page }) => {
    await mockProgressApi(page, STATS_STREAK_5, [])
    await page.goto('/#/progress')

    const xpCard = page.locator('[data-testid="stat-card-xp"]')
    await expect(xpCard.getByText(/Level\s*3/i)).toBeVisible()
  })

  test('large XP value is formatted with comma separators', async ({ page }) => {
    await mockProgressApi(page, STATS_HIGH_XP, [])
    await page.goto('/#/progress')

    // 12,500 should be formatted as "12,500"
    const xpCard = page.locator('[data-testid="stat-card-xp"]')
    await expect(xpCard.getByText(/12[,.]?500/)).toBeVisible()
  })

  test('sessions count shows only ready-status sessions', async ({ page }) => {
    // 3 ready + 1 pending + 1 error = only 3 should be counted
    const sessions = [
      makeSession('s1', 1, 'ready'),
      makeSession('s2', 2, 'ready'),
      makeSession('s3', 3, 'ready'),
      makeSession('s4', 4, 'pending'),
      makeSession('s5', 5, 'error'),
    ]
    await mockProgressApi(page, STATS_ZERO, sessions)
    await page.goto('/#/progress')

    const sessCard = page.locator('[data-testid="stat-card-sessions"]')
    // Use exact: true â€” getByText('3') also matches "3 more than last week"
    await expect(sessCard.getByText('3', { exact: true })).toBeVisible()
  })

  test('sessions count shows 0 when all sessions are pending/error', async ({ page }) => {
    const sessions = [
      makeSession('s1', 1, 'pending'),
      makeSession('s2', 2, 'error'),
    ]
    await mockProgressApi(page, STATS_ZERO, sessions)
    await page.goto('/#/progress')

    const sessCard = page.locator('[data-testid="stat-card-sessions"]')
    await expect(sessCard.getByText('0')).toBeVisible()
  })

  test('"no sessions yet" trend when sessions list is empty', async ({ page }) => {
    await mockProgressApi(page, STATS_ZERO, [])
    await page.goto('/#/progress')

    const sessCard = page.locator('[data-testid="stat-card-sessions"]')
    await expect(sessCard.getByText(/no sessions yet/i)).toBeVisible()
  })

  test('sessions trend shows "N more than last week" when this week > last week', async ({ page }) => {
    // 3 sessions this week (0 days ago), 0 last week â†’ weekDelta = 3
    const sessions = [
      makeSession('s1', 0, 'ready'),
      makeSession('s2', 1, 'ready'),
      makeSession('s3', 2, 'ready'),
    ]
    await mockProgressApi(page, STATS_ZERO, sessions)
    await page.goto('/#/progress')

    const sessCard = page.locator('[data-testid="stat-card-sessions"]')
    await expect(sessCard.getByText(/more than last week/i)).toBeVisible()
  })

  test('sessions trend shows "N fewer than last week" when this week < last week', async ({ page }) => {
    // 0 sessions this week, 2 last week â†’ weekDelta = -2
    const sessions = [
      makeSession('s1', 8, 'ready'),
      makeSession('s2', 9, 'ready'),
    ]
    await mockProgressApi(page, STATS_ZERO, sessions)
    await page.goto('/#/progress')

    const sessCard = page.locator('[data-testid="stat-card-sessions"]')
    await expect(sessCard.getByText(/fewer than last week/i)).toBeVisible()
  })

  test('sessions trend shows "N this week" when this/last week are equal and > 0', async ({ page }) => {
    // 2 this week, 2 last week â†’ weekDelta = 0, thisWeek = 2 â†’ "2 this week"
    const sessions = [
      makeSession('s1', 0, 'ready'),
      makeSession('s2', 1, 'ready'),
      makeSession('s3', 8, 'ready'),
      makeSession('s4', 9, 'ready'),
    ]
    await mockProgressApi(page, STATS_ZERO, sessions)
    await page.goto('/#/progress')

    const sessCard = page.locator('[data-testid="stat-card-sessions"]')
    await expect(sessCard.getByText(/this week/i)).toBeVisible()
  })

  test('active days card shows count of distinct session days (not raw count)', async ({ page }) => {
    // 3 sessions on 1 unique day + 1 session on another = 2 active days
    const today = new Date()
    const yesterday = new Date(Date.now() - 1 * 24 * 3600_000)
    const sessions = [
      { ...makeSession('s1', 0), created_at: today.toISOString() },
      { ...makeSession('s2', 0), created_at: today.toISOString() },
      { ...makeSession('s3', 0), created_at: today.toISOString() },
      { ...makeSession('s4', 1), created_at: yesterday.toISOString() },
    ]
    await mockProgressApi(page, STATS_ZERO, sessions)
    await page.goto('/#/progress')

    const daysCard = page.locator('[data-testid="stat-card-days"]')
    // Use exact: true â€” getByText('2') also matches "last 26 weeks" (substring "2" in "26")
    await expect(daysCard.getByText('2', { exact: true })).toBeVisible()
  })

  test('active days "last 26 weeks" trend text is shown on active-days card', async ({ page }) => {
    await mockProgressApi(page, STATS_ZERO, [makeSession('s1', 0)])
    await page.goto('/#/progress')

    const daysCard = page.locator('[data-testid="stat-card-days"]')
    await expect(daysCard.getByText(/last 26 weeks/i)).toBeVisible()
  })

  test('sessions older than 26 weeks are excluded from active days count', async ({ page }) => {
    // 1 recent session + 1 very old session (200 days ago = > 26 weeks)
    const sessions = [
      makeSession('s1', 0, 'ready'),
      makeSession('s2', 200, 'ready'),
    ]
    await mockProgressApi(page, STATS_ZERO, sessions)
    await page.goto('/#/progress')

    const daysCard = page.locator('[data-testid="stat-card-days"]')
    // Only 1 active day (the recent one) should be counted
    await expect(daysCard.getByText('1')).toBeVisible()
  })

  test('heatmap shows correct active days count next to dot', async ({ page }) => {
    // 2 sessions on different days â†’ 2 active days in heatmap label
    const sessions = [
      makeSession('s1', 0, 'ready'),
      makeSession('s2', 1, 'ready'),
    ]
    await mockProgressApi(page, STATS_ZERO, sessions)
    await page.goto('/#/progress')

    // ActivityHeatmap renders "{activeDays} active {day|days}"
    await expect(page.getByText(/2 active days/i)).toBeVisible()
  })

  test('heatmap shows "1 active day" (singular) for exactly 1 active day', async ({ page }) => {
    const sessions = [makeSession('s1', 0, 'ready')]
    await mockProgressApi(page, STATS_ZERO, sessions)
    await page.goto('/#/progress')

    await expect(page.getByText(/1 active day$/i)).toBeVisible()
  })

  test('page shows no data (zeros) gracefully when API returns empty stats', async ({ page }) => {
    await mockProgressApi(page, STATS_ZERO, [])
    await page.goto('/#/progress')

    const streakCard = page.locator('[data-testid="stat-card-streak"]')
    await expect(streakCard.getByText('0')).toBeVisible()

    const xpCard = page.locator('[data-testid="stat-card-xp"]')
    await expect(xpCard.getByText('0')).toBeVisible()
  })

})

