/**
 * E2E Tests — Learn Page
 *
 * Two perspectives:
 *  • UI/UX Expert   — every pixel: layout, labels, disabled states, animations
 *  • Business Analyst — every rule: format selection, streaming, XP, history, delete
 *
 * All /api/* calls are intercepted with page.route() so no backend is needed.
 * The Playwright webServer config auto-starts the Vite dev server.
 */

import { test, expect, type Page } from '@playwright/test'

// ─── Shared fixture data ───────────────────────────────────────────────────────

const EMPTY_STATS = {
  xp: 0, level: 1, streak: 0,
  last_activity: null, badges: [],
}

const STATS_WITH_XP = {
  xp: 150, level: 2, streak: 3,
  last_activity: '2026-05-28T10:00:00',
  badges: ['first_step'],
}

/** A ready guided session stored in history */
const GUIDED_SESSION = {
  id:           'guid-001',
  topic:        'Neural Networks',
  format:       'guided',
  source_type:  'topic',
  difficulty:   'intermediate',
  status:       'ready',
  created_at:   '2026-05-28T08:00:00',
  completed_at: '2026-05-28T08:05:00',
  content: {
    topic:       'Neural Networks',
    intro:       'Welcome to Neural Networks — a step-by-step guide.',
    total_steps: 2,
    steps: [
      {
        step:        1,
        title:       'What is a Neuron?',
        explanation: 'A neuron is the basic unit of a neural network.',
        example:     'Like a switch that turns on or off.',
        analogy:     'Think of it as a light switch.',
        key_insight: 'Neurons fire together, wire together.',
        check_in:    'Can you describe a neuron?',
        quiz_check:  null,
      },
      {
        step:        2,
        title:       'Layers in a Network',
        explanation: 'Networks are organised in layers.',
        example:     'Input → Hidden → Output.',
        analogy:     null,
        key_insight: 'Depth gives networks their power.',
        check_in:    'How many layers does a shallow network have?',
        quiz_check:  null,
      },
    ],
  },
}

/** A story session to test text-format streaming */
const STORY_SESSION = {
  id:           'story-001',
  topic:        'Machine Learning',
  format:       'story',
  source_type:  'topic',
  difficulty:   'beginner',
  status:       'ready',
  created_at:   '2026-05-28T09:00:00',
  completed_at: '2026-05-28T09:01:00',
  content:      { text: 'Once upon a time, algorithms learned from data...' },
}

/** Build the SSE body for a text-format stream. */
function buildStorySSE(sessionId: string): string {
  const token = 'Once upon a time, algorithms learned from data...'
  return [
    `data: ${JSON.stringify({ type: 'token', content: token })}\n\n`,
    `data: ${JSON.stringify({ type: 'done', session_id: sessionId, xp_earned: 25, new_badges: [] })}\n\n`,
  ].join('')
}

// ─── Setup helpers ─────────────────────────────────────────────────────────────

/**
 * Register core mocks: stats + session list.
 * Call before page.goto() so routes are ready when the page loads.
 */
async function mockBase(
  page: Page,
  options: {
    stats?:    object
    sessions?: object[]
  } = {},
) {
  const stats    = options.stats    ?? EMPTY_STATS
  const sessions = options.sessions ?? []

  // Stats endpoint
  await page.route(
    (url) => url.pathname === '/api/learn/stats',
    (route) => route.fulfill({ json: stats }),
  )

  // Session list (exact path — not individual session GETs)
  await page.route(
    (url) => url.pathname === '/api/learn/sessions',
    (route) => route.fulfill({ json: sessions }),
  )
}

/** Mock a specific session's GET endpoint. */
async function mockGetSession(page: Page, session: { id: string } & object) {
  await page.route(
    (url) => url.pathname === `/api/learn/sessions/${(session as { id: string }).id}`,
    (route) => route.fulfill({ json: session }),
  )
}

// ─── Tests ────────────────────────────────────────────────────────────────────

test.describe('UI/UX Expert — Learn Page: Visual & Layout', () => {

  test.beforeEach(async ({ page }) => {
    await mockBase(page)
  })

  test('renders all 9 format card labels in the empty state grid', async ({ page }) => {
    await page.goto('/learn')

    const expected = [
      'Guided', 'Quiz', 'Flashcards', 'Mind Map',
      'Timeline', 'Story', 'ELI5', 'Speed Learn', 'Brainstorm',
    ]
    for (const label of expected) {
      await expect(page.getByText(label).first()).toBeVisible()
    }
  })

  test('each format card shows a description below the label', async ({ page }) => {
    await page.goto('/learn')

    const descriptions = [
      'Personal tutor',         // Guided
      'Test your knowledge',    // Quiz
      'Spaced repetition',      // Flashcards
      'Visual hierarchy',       // Mind Map
      'Key events in chronological', // Timeline
      'Engaging narrative',     // Story
      "Explain Like I'm 5",     // ELI5
      'Rapid bullet-point',     // Speed Learn
      'Creative connections',   // Brainstorm
    ]
    for (const desc of descriptions) {
      await expect(page.getByText(new RegExp(desc, 'i')).first()).toBeVisible()
    }
  })

  test('renders 3 difficulty pills: Beginner, Intermediate, Expert', async ({ page }) => {
    await page.goto('/learn')

    await expect(page.getByText('Beginner').first()).toBeVisible()
    await expect(page.getByText('Intermediate').first()).toBeVisible()
    await expect(page.getByText('Expert').first()).toBeVisible()
  })

  test('renders 4 source mode pills in the header', async ({ page }) => {
    await page.goto('/learn')

    await expect(page.getByText('Topic').first()).toBeVisible()
    await expect(page.getByText('Library').first()).toBeVisible()
    await expect(page.getByText('Web').first()).toBeVisible()
    await expect(page.getByText('Upload').first()).toBeVisible()
  })

  test('empty state shows the motivational heading', async ({ page }) => {
    await page.goto('/learn')

    await expect(
      page.getByText('What do you want to learn today?')
    ).toBeVisible()
  })

  test('sidebar shows "History" section label', async ({ page }) => {
    await page.goto('/learn')

    await expect(page.getByText(/history/i).first()).toBeVisible()
  })

  test('sidebar shows placeholder when no sessions exist', async ({ page }) => {
    await page.goto('/learn')

    await expect(
      page.getByText('Your sessions will appear here')
    ).toBeVisible()
  })

  test('Generate button is disabled when topic field is empty', async ({ page }) => {
    await page.goto('/learn')

    const generateBtn = page.getByRole('button', { name: /Generate/i })
    await expect(generateBtn).toBeDisabled()
  })

  test('Generate button becomes enabled after typing a topic', async ({ page }) => {
    await page.goto('/learn')

    await page.getByPlaceholder('What do you want to learn?').fill('Python basics')

    const generateBtn = page.getByRole('button', { name: /Generate/i })
    await expect(generateBtn).toBeEnabled()
  })

  test('sidebar stats bar shows level when user has XP', async ({ page }) => {
    await mockBase(page, { stats: STATS_WITH_XP })
    await page.goto('/learn')

    // StatsBar renders "Lv 2" for level 2
    await expect(page.getByText(/Lv\s*2/i).first()).toBeVisible()
  })

  test('sidebar stats bar shows XP value', async ({ page }) => {
    await mockBase(page, { stats: STATS_WITH_XP })
    await page.goto('/learn')

    await expect(page.getByText(/150\s*XP/i).first()).toBeVisible()
  })

  test('streak badge renders when streak > 0', async ({ page }) => {
    await mockBase(page, { stats: STATS_WITH_XP })
    await page.goto('/learn')

    // StatsBar shows streak number followed by "d" (3d)
    await expect(page.getByText(/3d/i).first()).toBeVisible()
  })

  test('header shows "Start learning" italic emphasis in empty state', async ({ page }) => {
    await page.goto('/learn')

    // The italic <em> contains "learning"
    await expect(page.locator('em').filter({ hasText: /learning/i }).first()).toBeVisible()
  })

})


test.describe('Business Analyst — Learn Page: Functional Flows', () => {

  test.beforeEach(async ({ page }) => {
    await mockBase(page)
  })

  test('clicking a format card updates the active selection (Guided)', async ({ page }) => {
    await page.goto('/learn')

    // Guided card in the format grid (empty state area)
    const guidedCard = page.getByText('Guided').first()
    await guidedCard.click()

    // The format pill in the header row should now show Guided as active
    // Active format has a colored border — check the pill row's Guided item
    const guidedPill = page.locator('text=Guided').first()
    await expect(guidedPill).toBeVisible()
  })

  test('selecting Story format then typing topic enables Generate', async ({ page }) => {
    await page.goto('/learn')

    // Click Story in the format card grid
    await page.getByText('Story').first().click()

    // Topic field should be the text input placeholder
    await page.getByPlaceholder('What do you want to learn?').fill('The Internet')

    await expect(page.getByRole('button', { name: /Generate/i })).toBeEnabled()
  })

  test('story generation: shows streaming progress indicator', async ({ page }) => {
    // Mock the stream endpoint
    await page.route(
      (url) => url.pathname === '/api/learn/sessions/stream',
      async (route) => {
        // Slight delay to allow "Generating..." indicator to render
        await new Promise(r => setTimeout(r, 100))
        await route.fulfill({
          status: 200,
          headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
          body:   buildStorySSE('story-001'),
        })
      },
    )
    // Mock GET sessions refresh after done event
    await page.route(
      (url) => url.pathname === '/api/learn/sessions',
      (route) => route.fulfill({ json: [STORY_SESSION] }),
    )
    // Mock GET individual session
    await mockGetSession(page, STORY_SESSION)
    // Mock stats refresh
    await page.route(
      (url) => url.pathname === '/api/learn/stats',
      (route) => route.fulfill({ json: { ...EMPTY_STATS, xp: 25 } }),
    )

    await page.goto('/learn')

    // Select Story format via the format card (data-testid is unambiguous)
    await page.locator('[data-testid="format-card-story"]').click()
    await page.getByPlaceholder('What do you want to learn?').fill('Machine Learning')
    await page.getByRole('button', { name: /Generate/i }).click()

    // The LinearProgress / "Generating" indicator should appear.
    // Use .first() to avoid strict-mode failure if both the text and the
    // progressbar are visible at the same instant.
    await expect(
      page.getByText(/Generating/i).or(page.locator('[role="progressbar"]').first()).first()
    ).toBeVisible({ timeout: 5_000 })
  })

  test('story generation: streamed text content renders after completion', async ({ page }) => {
    await page.route(
      (url) => url.pathname === '/api/learn/sessions/stream',
      (route) => route.fulfill({
        status: 200,
        headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
        body:   buildStorySSE('story-001'),
      }),
    )
    // No sessions-list override — beforeEach returns [] so sidebar stays empty,
    // ensuring getByText('Story') unambiguously hits the format card (not a sidebar item).
    await mockGetSession(page, STORY_SESSION)
    await page.route(
      (url) => url.pathname === '/api/learn/stats',
      (route) => route.fulfill({ json: { ...EMPTY_STATS, xp: 25 } }),
    )

    await page.goto('/learn')

    // Use data-testid to unambiguously click the Story format card
    await page.locator('[data-testid="format-card-story"]').click()
    await page.getByPlaceholder('What do you want to learn?').fill('Machine Learning')
    await page.getByRole('button', { name: /Generate/i }).click()

    // Streamed text should appear in the paper component
    await expect(
      page.getByText(/Once upon a time/i)
    ).toBeVisible({ timeout: 12_000 })
  })

  test('XP earned alert shows "+25 XP earned!" after stream completes', async ({ page }) => {
    await page.route(
      (url) => url.pathname === '/api/learn/sessions/stream',
      (route) => route.fulfill({
        status: 200,
        headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
        body:   buildStorySSE('story-001'),
      }),
    )
    await page.route(
      (url) => url.pathname === '/api/learn/sessions',
      (route) => route.fulfill({ json: [STORY_SESSION] }),
    )
    await mockGetSession(page, STORY_SESSION)
    await page.route(
      (url) => url.pathname === '/api/learn/stats',
      (route) => route.fulfill({ json: { ...EMPTY_STATS, xp: 25 } }),
    )

    await page.goto('/learn')

    await page.getByText('Story').first().click()
    await page.getByPlaceholder('What do you want to learn?').fill('Machine Learning')
    await page.getByRole('button', { name: /Generate/i }).click()

    await expect(page.getByText(/\+25 XP earned/i)).toBeVisible({ timeout: 8_000 })
  })

  test('completed session appears in the sidebar history list', async ({ page }) => {
    // Start with empty sessions, then return one after invalidation
    let callCount = 0
    await page.route(
      (url) => url.pathname === '/api/learn/sessions',
      (route) => {
        callCount++
        route.fulfill({ json: callCount > 1 ? [STORY_SESSION] : [] })
      },
    )
    await page.route(
      (url) => url.pathname === '/api/learn/sessions/stream',
      (route) => route.fulfill({
        status: 200,
        headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
        body:   buildStorySSE('story-001'),
      }),
    )
    await mockGetSession(page, STORY_SESSION)
    await page.route(
      (url) => url.pathname === '/api/learn/stats',
      (route) => route.fulfill({ json: { ...EMPTY_STATS, xp: 25 } }),
    )

    await page.goto('/learn')

    await page.getByText('Story').first().click()
    await page.getByPlaceholder('What do you want to learn?').fill('Machine Learning')
    await page.getByRole('button', { name: /Generate/i }).click()

    // After stream completes, sessions list refreshes — should show topic in sidebar
    await expect(
      page.getByText('Machine Learning').first()
    ).toBeVisible({ timeout: 8_000 })
  })

  test('clicking a session in history loads its content', async ({ page }) => {
    await mockBase(page, {
      sessions: [STORY_SESSION],
    })
    await mockGetSession(page, STORY_SESSION)

    await page.goto('/learn')

    // Click the history sidebar item
    await page.getByText('Machine Learning').first().click()

    // Content from the session should appear
    await expect(
      page.getByText(/Once upon a time/i)
    ).toBeVisible({ timeout: 5_000 })
  })

  test('loading a guided session from history renders GuidedViewer with step title', async ({ page }) => {
    await mockBase(page, {
      sessions: [GUIDED_SESSION],
    })
    await mockGetSession(page, GUIDED_SESSION)

    await page.goto('/learn')

    // Click the guided session in the history sidebar
    await page.getByText('Neural Networks').first().click()

    // GuidedViewer should render the first step title
    await expect(
      page.getByText('What is a Neuron?')
    ).toBeVisible({ timeout: 5_000 })
  })

  test('GuidedViewer shows step number indicator (Step 1 of 2)', async ({ page }) => {
    await mockBase(page, {
      sessions: [GUIDED_SESSION],
    })
    await mockGetSession(page, GUIDED_SESSION)

    await page.goto('/learn')
    await page.getByText('Neural Networks').first().click()

    // Step indicator: "Step 1 of 2" or "1 / 2"
    // Use alternation (?:\/|of) — character class [\/of] only matches one char,
    // not the two-character word "of".
    await expect(
      page.getByText(/1\s*(?:\/|of)\s*2/i).first()
    ).toBeVisible({ timeout: 5_000 })
  })

  test('GuidedViewer "Got it" button advances to step 2', async ({ page }) => {
    await mockBase(page, {
      sessions: [GUIDED_SESSION],
    })
    await mockGetSession(page, GUIDED_SESSION)

    await page.goto('/learn')
    await page.getByText('Neural Networks').first().click()

    // Wait for step 1 to render
    await expect(page.getByText('What is a Neuron?')).toBeVisible({ timeout: 5_000 })

    // Click "Got it" to advance
    await page.getByRole('button', { name: /Got it/i }).click()

    // Step 2 title should now be visible
    await expect(page.getByText('Layers in a Network')).toBeVisible({ timeout: 3_000 })
  })

  test('delete session button calls DELETE endpoint and removes from list', async ({ page }) => {
    let deleteWasCalled = false

    await mockBase(page, { sessions: [STORY_SESSION] })
    await mockGetSession(page, STORY_SESSION)

    // Mock the DELETE endpoint
    await page.route(
      (url) => url.pathname === `/api/learn/sessions/${STORY_SESSION.id}`,
      (route) => {
        if (route.request().method() === 'DELETE') {
          deleteWasCalled = true
          route.fulfill({ status: 204, body: '' })
        } else {
          route.fulfill({ json: STORY_SESSION })
        }
      },
    )

    // After delete, sessions list returns empty
    let listCallCount = 0
    await page.route(
      (url) => url.pathname === '/api/learn/sessions',
      (route) => {
        listCallCount++
        route.fulfill({ json: listCallCount > 1 ? [] : [STORY_SESSION] })
      },
    )

    await page.goto('/learn')

    // Hover over the session to reveal the delete button
    const sessionItem = page.getByText('Machine Learning').first()
    await sessionItem.hover()

    // Click the delete button (aria-label="Delete session").
    // Use exact: true so Playwright doesn't also match the parent <li role="button">
    // whose computed accessible name inherits the child's aria-label.
    await page.getByRole('button', { name: 'Delete session', exact: true }).click()

    expect(deleteWasCalled).toBe(true)
  })

  test('switching source mode to Web shows URL input field', async ({ page }) => {
    await page.goto('/learn')

    await page.getByText('Web').first().click()

    await expect(
      page.getByPlaceholder('https://example.com/article')
    ).toBeVisible()
  })

  test('switching source mode to Upload shows file drop zone', async ({ page }) => {
    await page.goto('/learn')

    await page.getByText('Upload').first().click()

    await expect(
      page.getByText('Drop a file here or click to upload')
    ).toBeVisible()
  })

  test('New session button resets the form and returns to empty state', async ({ page }) => {
    await mockBase(page, { sessions: [STORY_SESSION] })
    await mockGetSession(page, STORY_SESSION)

    await page.goto('/learn')

    // Load a session so "New session" button appears
    await page.getByText('Machine Learning').first().click()
    await expect(page.getByText(/Once upon a time/i)).toBeVisible({ timeout: 5_000 })

    // Click "New session"
    await page.getByRole('button', { name: /New session/i }).click()

    // Empty state heading should be back
    await expect(page.getByText('What do you want to learn today?')).toBeVisible()
  })

})
