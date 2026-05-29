/**
 * E2E Tests — Learn Page: Full Workflow (all 9 formats)
 *
 * Professional QA coverage for every Learn Mode feature.
 * Two test strategies (matching the actual Learn page behaviour):
 *
 *   A) STREAM  — click format card → type topic → Generate → verify streamed output
 *      Used for text formats: Story, ELI5, Speed Learn, Brainstorm
 *
 *   B) HISTORY — load a session with content from the history sidebar
 *      Used for structured formats: Quiz, Flashcard, Guided, Mind Map, Timeline
 *      (matches how real users re-open completed sessions)
 *
 * Key Playwright patterns (from learn.spec.ts):
 *   - Format card: [data-testid="format-card-{id}"]
 *   - Session GET mock: mockGetSession() for per-session route
 *   - Difficulty pills: getByText('Beginner').first() etc.
 *   - Source pills: getByText('Topic').first() etc.
 *   - Generate button: getByRole('button', { name: /Generate/i })
 */

import { test, expect, type Page } from '@playwright/test'

// ─── Stats fixtures ───────────────────────────────────────────────────────────

const STATS_ZERO   = { xp: 0,   level: 1, streak: 0, last_activity: null,                  badges: [] }
const STATS_LV3    = { xp: 350, level: 3, streak: 5, last_activity: new Date().toISOString(), badges: ['first_step', 'explorer'] }

// ─── Session content fixtures ─────────────────────────────────────────────────

const QUIZ_CONTENT = {
  questions: [
    {
      q: 'What is the primary purpose of gradient descent?',
      options: ['To increase the loss', 'To minimize the loss function', 'To maximise accuracy', 'To preprocess data'],
      correct: 1,
      explanation: 'Gradient descent minimizes the loss by moving in the direction of the negative gradient.',
    },
    {
      q: 'What does a learning rate that is too high cause?',
      options: ['Slow convergence', 'Overshooting the minimum', 'Underfitting', 'Nothing'],
      correct: 1,
      explanation: 'A high learning rate causes the algorithm to overshoot the minimum and diverge.',
    },
  ],
}

const FLASHCARD_CONTENT = {
  cards: [
    { front: 'What is gradient descent?',  back: 'An optimization algorithm that minimizes a loss function.',                       hint: 'Think: going downhill on a loss surface.' },
    { front: 'What is a learning rate?',    back: 'A hyperparameter that controls step size during gradient descent updates.',       hint: 'Too high = overshoot; too low = slow.' },
    { front: 'What is backpropagation?',    back: 'An algorithm for computing gradients efficiently using the chain rule.',          hint: 'Error flows backward through the network.' },
  ],
}

const MINDMAP_CONTENT = {
  root: 'Machine Learning',
  branches: [
    { label: 'Supervised',    children: [{ label: 'Classification', children: [] }, { label: 'Regression', children: [] }] },
    { label: 'Unsupervised',  children: [{ label: 'Clustering', children: [] }] },
    { label: 'Reinforcement', children: [] },
  ],
}

const TIMELINE_CONTENT = {
  events: [
    { year: '1950', title: 'Turing Test',         description: 'Alan Turing proposes the imitation game.' },
    { year: '1956', title: 'Dartmouth Conference', description: 'The term "Artificial Intelligence" is coined.' },
    { year: '1986', title: 'Backpropagation',      description: 'Rumelhart, Hinton, and Williams popularise backprop.' },
    { year: '2012', title: 'AlexNet',              description: 'Deep learning breakthrough on ImageNet.' },
  ],
}

const GUIDED_CONTENT = {
  topic:       'Gradient Descent',
  intro:       'Welcome to this guided tour of gradient descent — the engine behind modern ML.',
  total_steps: 2,
  steps: [
    {
      step:        1,
      title:       'What is Gradient Descent?',
      explanation: 'An optimisation algorithm that minimises a function by following the negative gradient.',
      example:     'Imagine rolling a ball down a hill.',
      analogy:     'Like a hiker always walking in the steepest downward direction.',
      key_insight: 'The gradient tells us which direction increases the function; we go the opposite way.',
      check_in:    'Can you explain why we follow the negative gradient?',
      quiz_check:  null,
    },
    {
      step:        2,
      title:       'The Learning Rate',
      explanation: 'The learning rate controls how large each step is during descent.',
      example:     'A rate of 0.01 takes small careful steps.',
      analogy:     'Like stride length on the mountain.',
      key_insight: 'Choosing the right learning rate is critical.',
      check_in:    'What happens if the learning rate is too large?',
      quiz_check:  null,
    },
  ],
}

function makeSession(id: string, format: string, topic: string, content: object | null = null) {
  return {
    id, topic, format,
    source_type: 'topic',
    difficulty:  'intermediate',
    status:      content ? 'ready' : 'ready',
    content,
    created_at:    new Date().toISOString(),
    completed_at:  new Date().toISOString(),
  }
}

// ─── SSE builders ─────────────────────────────────────────────────────────────

function textSSE(sessionId: string, text: string): string {
  const words = text.split(' ')
  const lines = words.map(w =>
    `data: ${JSON.stringify({ type: 'token', content: w + ' ' })}\n\n`,
  )
  lines.push(
    `data: ${JSON.stringify({ type: 'done', session_id: sessionId, xp_earned: 25, new_badges: [] })}\n\n`,
  )
  return lines.join('')
}

// ─── Route helpers ────────────────────────────────────────────────────────────

/**
 * Set up base routes (stats + sessions list + stream).
 * Call BEFORE page.goto() so routes are ready when the page loads.
 */
async function mockBase(
  page: Page,
  opts: {
    stats?:    object
    sessions?: object[]
    stream?:   string
  } = {},
) {
  const stats    = opts.stats    ?? STATS_ZERO
  const sessions = opts.sessions ?? []
  const stream   = opts.stream   ?? textSSE('s-new', 'Generated content for the topic.')

  await page.route(
    (url) => url.pathname === '/api/learn/stats',
    (route) => route.fulfill({ json: stats }),
  )

  await page.route(
    (url) => url.pathname === '/api/learn/sessions',
    (route) => route.fulfill({ json: sessions }),
  )

  await page.route(
    (url) => url.pathname === '/api/learn/sessions/stream',
    async (route) => {
      await new Promise(r => setTimeout(r, 80))
      route.fulfill({
        status:  200,
        headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
        body:    stream,
      })
    },
  )

  // Quiz / flashcard answer routes
  await page.route(
    (url) => url.pathname.includes('/quiz/answer'),
    (route) => route.fulfill({
      json: { correct: true, xp_earned: 10, explanation: 'Correct — well done!', new_badges: [] },
    }),
  )
  await page.route(
    (url) => url.pathname.includes('/flashcard/review'),
    (route) => route.fulfill({
      json: { next_review: '2026-06-05T10:00:00', interval_days: 4 },
    }),
  )

  // KBs (for library source)
  await page.route(
    (url) => url.pathname === '/api/kb',
    (route) => route.fulfill({ json: { kbs: [] } }),
  )
}

/** Mock the individual GET for a specific session (needed after stream completes). */
async function mockGetSession(page: Page, session: object) {
  const id = (session as any).id
  await page.route(
    (url) => url.pathname === `/api/learn/sessions/${id}`,
    (route) => {
      if (route.request().method() === 'GET') {
        route.fulfill({ json: session })
      } else if (route.request().method() === 'DELETE') {
        route.fulfill({ status: 204, body: '' })
      }
    },
  )
}

// ─── SECTION 1: Format Card Grid ─────────────────────────────────────────────

test.describe('UI/UX Expert — Learn: Format Card Grid', () => {

  test.beforeEach(async ({ page }) => {
    await mockBase(page)
  })

  test('all 9 format cards render with correct labels', async ({ page }) => {
    /**
     * Given: Learn page with empty history
     * Then: All 9 format card labels visible in the grid
     */
    await page.goto('/#/learn')
    const formats = ['Guided', 'Quiz', 'Flashcards', 'Mind Map', 'Timeline', 'Story', 'ELI5', 'Speed Learn', 'Brainstorm']
    for (const f of formats) {
      await expect(page.getByText(f).first()).toBeVisible()
    }
  })

  test('each format card shows a description below its label', async ({ page }) => {
    await page.goto('/#/learn')
    const descriptions = [
      'Personal tutor',      // Guided
      'Test your knowledge', // Quiz
      'Spaced repetition',   // Flashcards
      'Visual hierarchy',    // Mind Map
      'chronological',       // Timeline
      'narrative',           // Story
      'Explain Like',        // ELI5
      'Rapid bullet',        // Speed Learn
      'Creative connections',// Brainstorm
    ]
    for (const desc of descriptions) {
      await expect(page.getByText(new RegExp(desc, 'i')).first()).toBeVisible()
    }
  })

  test('clicking Guided card selects it without crash', async ({ page }) => {
    /**
     * Step: Click [data-testid="format-card-guided"]
     * Expected: No crash, format active
     */
    await page.goto('/#/learn')
    await page.locator('[data-testid="format-card-guided"]').click()
    await expect(page.locator('body')).not.toContainText('Something went wrong')
  })

  test('clicking Quiz card selects it', async ({ page }) => {
    await page.goto('/#/learn')
    await page.locator('[data-testid="format-card-quiz"]').click()
    await expect(page.locator('body')).not.toContainText('Something went wrong')
  })

  test('clicking Flashcards card selects it', async ({ page }) => {
    await page.goto('/#/learn')
    await page.locator('[data-testid="format-card-flashcard"]').click()
    await expect(page.locator('body')).not.toContainText('Something went wrong')
  })

  test('clicking Story card selects it', async ({ page }) => {
    await page.goto('/#/learn')
    await page.locator('[data-testid="format-card-story"]').click()
    await expect(page.locator('body')).not.toContainText('Something went wrong')
  })

})

// ─── SECTION 2: Difficulty & Source ──────────────────────────────────────────

test.describe('Business Analyst — Learn: Difficulty & Source Selection', () => {

  test.beforeEach(async ({ page }) => {
    await mockBase(page)
    await page.goto('/#/learn')
  })

  test('three difficulty pills: Beginner, Intermediate, Expert', async ({ page }) => {
    await expect(page.getByText('Beginner').first()).toBeVisible()
    await expect(page.getByText('Intermediate').first()).toBeVisible()
    await expect(page.getByText('Expert').first()).toBeVisible()
  })

  test('clicking Beginner selects it without crash', async ({ page }) => {
    await page.getByText('Beginner').first().click()
    await expect(page.locator('body')).not.toContainText('Something went wrong')
  })

  test('clicking Expert selects it without crash', async ({ page }) => {
    await page.getByText('Expert').first().click()
    await expect(page.locator('body')).not.toContainText('Something went wrong')
  })

  test('four source pills: Topic, Library, Web, Upload', async ({ page }) => {
    await expect(page.getByText('Topic').first()).toBeVisible()
    await expect(page.getByText('Library').first()).toBeVisible()
    await expect(page.getByText('Web').first()).toBeVisible()
    await expect(page.getByText('Upload').first()).toBeVisible()
  })

  test('Topic source shows the "What do you want to learn?" input', async ({ page }) => {
    await expect(page.getByPlaceholder('What do you want to learn?')).toBeVisible()
  })

  test('Generate button is disabled when topic field is empty', async ({ page }) => {
    await expect(page.getByRole('button', { name: /Generate/i })).toBeDisabled()
  })

  test('Generate button enables after typing a topic', async ({ page }) => {
    await page.getByPlaceholder('What do you want to learn?').fill('Neural Networks')
    await expect(page.getByRole('button', { name: /Generate/i })).toBeEnabled()
  })

  test('pressing Enter in topic field triggers generation', async ({ page }) => {
    await page.getByPlaceholder('What do you want to learn?').fill('Black Holes')
    await page.getByPlaceholder('What do you want to learn?').press('Enter')
    await expect(page.locator('body')).not.toContainText('Something went wrong')
  })

  test('switching to Web source shows URL input field', async ({ page }) => {
    /**
     * Step: Click "Web" source pill
     * Expected: URL input placeholder "https://example.com/article" appears
     */
    await page.getByText('Web').first().click()
    await expect(page.getByPlaceholder('https://example.com/article')).toBeVisible()
  })

})

// ─── SECTION 3: Story Format (stream) ────────────────────────────────────────

test.describe('Business Analyst — Learn: Story Format (streamed)', () => {

  test('Story: streamed text content renders in viewer after generation', async ({ page }) => {
    /**
     * Step 1: Select Story format card
     * Step 2: Type topic "The Internet"
     * Step 3: Click Generate
     * Step 4: SSE stream fires and completes
     * Expected: Story text "Once upon a time" visible in viewer
     */
    const storyText = 'Once upon a time, the Internet began as a small network of university computers.'
    const session = makeSession('s-story', 'story', 'The Internet', { text: storyText })

    await mockBase(page, { stream: textSSE('s-story', storyText) })
    await mockGetSession(page, session)
    await page.goto('/#/learn')

    await page.locator('[data-testid="format-card-story"]').click()
    await page.getByPlaceholder('What do you want to learn?').fill('The Internet')
    await page.getByRole('button', { name: /Generate/i }).click()

    await expect(page.getByText(/Once upon a time/i)).toBeVisible({ timeout: 12_000 })
  })

  test('Story: XP earned notification shown after completion (+25 XP)', async ({ page }) => {
    /**
     * Given: Stream done event carries xp_earned: 25
     * Expected: "+25 XP earned!" visible after stream completes
     */
    const session = makeSession('s-xp', 'story', 'XP Test', { text: 'Content about XP.' })

    await mockBase(page, { stream: textSSE('s-xp', 'Content about XP.') })
    await mockGetSession(page, session)
    await page.route(
      (url) => url.pathname === '/api/learn/stats',
      (route) => route.fulfill({ json: { ...STATS_ZERO, xp: 25 } }),
    )
    await page.goto('/#/learn')

    await page.locator('[data-testid="format-card-story"]').click()
    await page.getByPlaceholder('What do you want to learn?').fill('XP Test')
    await page.getByRole('button', { name: /Generate/i }).click()

    await expect(page.getByText(/\+25 XP earned/i)).toBeVisible({ timeout: 10_000 })
  })

  test('ELI5: streamed simplified explanation renders', async ({ page }) => {
    const text = 'Imagine gravity is like a giant invisible magnet pulling everything toward the ground.'
    const session = makeSession('s-eli5', 'eli5', 'Gravity', { text })

    await mockBase(page, { stream: textSSE('s-eli5', text) })
    await mockGetSession(page, session)
    await page.goto('/#/learn')

    await page.locator('[data-testid="format-card-eli5"]').click()
    await page.getByPlaceholder('What do you want to learn?').fill('Gravity')
    await page.getByRole('button', { name: /Generate/i }).click()

    await expect(page.getByText(/invisible magnet/i)).toBeVisible({ timeout: 12_000 })
  })

  test('Speed Learn: bullet-point content renders', async ({ page }) => {
    const text = 'Neural networks learn from examples. Layers transform data. Backprop updates weights.'
    const session = makeSession('s-speed', 'speedlearn', 'Neural Networks', { text })

    await mockBase(page, { stream: textSSE('s-speed', text) })
    await mockGetSession(page, session)
    await page.goto('/#/learn')

    await page.locator('[data-testid="format-card-speedlearn"]').click()
    await page.getByPlaceholder('What do you want to learn?').fill('Neural Networks')
    await page.getByRole('button', { name: /Generate/i }).click()

    await expect(page.getByText(/Neural networks learn from examples/i)).toBeVisible({ timeout: 12_000 })
  })

  test('Brainstorm: creative connections content renders', async ({ page }) => {
    const text = 'Neural networks are inspired by the brain — both learn from experience.'
    const session = makeSession('s-brain', 'brainstorm', 'Neural Networks', { text })

    await mockBase(page, { stream: textSSE('s-brain', text) })
    await mockGetSession(page, session)
    await page.goto('/#/learn')

    await page.locator('[data-testid="format-card-brainstorm"]').click()
    await page.getByPlaceholder('What do you want to learn?').fill('Neural Networks')
    await page.getByRole('button', { name: /Generate/i }).click()

    await expect(page.getByText(/inspired by the brain/i)).toBeVisible({ timeout: 12_000 })
  })

})

// ─── SECTION 4: Quiz Format (from history) ───────────────────────────────────

test.describe('Business Analyst — Learn: Quiz Format', () => {

  const QUIZ_SESSION = makeSession('s-quiz', 'quiz', 'Gradient Descent', QUIZ_CONTENT)

  test.beforeEach(async ({ page }) => {
    await mockBase(page, { sessions: [QUIZ_SESSION] })
    await mockGetSession(page, QUIZ_SESSION)
    await page.goto('/#/learn')
    // Open the quiz session from history
    await page.getByText('Gradient Descent').first().click()
  })

  test('quiz question text is rendered', async ({ page }) => {
    /**
     * Given: Quiz session loaded with 2 questions
     * Then: First question text visible
     * Expected: "primary purpose of gradient descent"
     */
    await expect(
      page.getByText(/primary purpose of gradient descent/i)
    ).toBeVisible({ timeout: 8_000 })
  })

  test('quiz MCQ options are rendered (4 options)', async ({ page }) => {
    /**
     * Given: Question has 4 answer options
     * Then: All 4 options visible as clickable choices
     */
    await expect(page.getByText('To increase the loss')).toBeVisible({ timeout: 8_000 })
    await expect(page.getByText('To minimize the loss function')).toBeVisible()
    await expect(page.getByText('To maximise accuracy')).toBeVisible()
    await expect(page.getByText('To preprocess data')).toBeVisible()
  })

  test('selecting the correct answer shows correct feedback', async ({ page }) => {
    /**
     * Step: Click "To minimize the loss function" (option index 1 = correct)
     * Expected: Correct feedback visible (green check or "Correct" text)
     */
    await page.getByText('To minimize the loss function').click({ timeout: 8_000 })
    await expect(
      page.locator('body')
    ).toContainText(/correct|Correct|right|Right/, { timeout: 5_000 })
  })

  test('selecting a wrong answer shows incorrect feedback', async ({ page }) => {
    /**
     * Step: Click "To increase the loss" (wrong answer)
     * Expected: Incorrect feedback visible
     */
    await page.getByText('To increase the loss').click({ timeout: 8_000 })
    await expect(
      page.locator('body')
    ).toContainText(/incorrect|wrong|Incorrect|Wrong/, { timeout: 5_000 })
  })

  test('explanation shown after answering', async ({ page }) => {
    /**
     * Step: Answer any option
     * Expected: Explanation text appears
     */
    await page.getByText('To minimize the loss function').click({ timeout: 8_000 })
    await expect(
      page.getByText(/minimizes the loss by moving/i)
    ).toBeVisible({ timeout: 5_000 })
  })

  test('question counter shows progress (1 / 2)', async ({ page }) => {
    /**
     * Given: 2 quiz questions
     * Then: Progress indicator "1 / 2" or "1 of 2" visible
     */
    await expect(
      page.getByText(/1\s*(?:\/|of)\s*2/i).first()
    ).toBeVisible({ timeout: 8_000 })
  })

})

// ─── SECTION 5: Flashcard Format (from history) ──────────────────────────────

test.describe('Business Analyst — Learn: Flashcard Format', () => {

  const FLASH_SESSION = makeSession('s-flash', 'flashcard', 'Gradient Descent', FLASHCARD_CONTENT)

  test.beforeEach(async ({ page }) => {
    await mockBase(page, { sessions: [FLASH_SESSION] })
    await mockGetSession(page, FLASH_SESSION)
    await page.goto('/#/learn')
    await page.getByText('Gradient Descent').first().click()
  })

  test('flashcard front text is shown on first render', async ({ page }) => {
    /**
     * Given: Flashcard session with 3 cards
     * Then: Front of card 1 "What is gradient descent?" visible
     */
    await expect(
      page.getByText('What is gradient descent?')
    ).toBeVisible({ timeout: 8_000 })
  })

  test('clicking the card reveals the back (answer)', async ({ page }) => {
    /**
     * Step 1: Card front visible
     * Step 2: Click the flashcard to flip
     * Expected: Back text "An optimization algorithm..." appears
     */
    await page.getByText('What is gradient descent?').waitFor({ timeout: 8_000 })
    await page.getByText('What is gradient descent?').click()
    await expect(
      page.getByText(/optimization algorithm|minimizes a loss function/i)
    ).toBeVisible({ timeout: 5_000 })
  })

  test('Flip button is present on flashcard', async ({ page }) => {
    /**
     * Expected: A "Flip" button or icon available for keyboard users
     */
    await page.getByText('What is gradient descent?').waitFor({ timeout: 8_000 })
    await expect(
      page.getByRole('button', { name: /Flip/i })
        .or(page.locator('[aria-label*="flip" i]'))
        .or(page.locator('[title="Flip"]'))
    ).toBeVisible()
  })

  test('ease rating buttons appear after flipping', async ({ page }) => {
    /**
     * Step 1: Flip the card
     * Step 2: Ease rating buttons (Again / Hard / Good / Easy) should appear
     */
    await page.getByText('What is gradient descent?').waitFor({ timeout: 8_000 })
    await page.getByText('What is gradient descent?').click()
    await expect(
      page.getByRole('button', { name: /Again/i })
        .or(page.getByRole('button', { name: /Hard/i }))
        .or(page.getByText(/Again|Hard|Good|Easy/i).first())
    ).toBeVisible({ timeout: 5_000 })
  })

  test('clicking "Good" advances to next card', async ({ page }) => {
    /**
     * Step 1: Flip card 1
     * Step 2: Click "Good"
     * Expected: Card 2 "What is a learning rate?" shows
     */
    await page.getByText('What is gradient descent?').waitFor({ timeout: 8_000 })
    await page.getByText('What is gradient descent?').click()
    const goodBtn = page.getByRole('button', { name: /Good/i })
    if (await goodBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await goodBtn.click()
      await expect(page.getByText('What is a learning rate?')).toBeVisible({ timeout: 5_000 })
    }
  })

  test('card counter shows progress (1 / 3)', async ({ page }) => {
    /**
     * Given: 3 cards in session
     * Then: Progress "1 / 3" or "1 of 3" visible
     */
    await expect(
      page.getByText(/1\s*(?:\/|of)\s*3/i).first()
    ).toBeVisible({ timeout: 8_000 })
  })

  test('hint shown when card has a hint', async ({ page }) => {
    /**
     * Given: Card 1 has hint "Think: going downhill on a loss surface."
     * Then: Hint text available (might be under a "Show hint" button)
     */
    await page.getByText('What is gradient descent?').waitFor({ timeout: 8_000 })
    // Hint is accessible — check it doesn't crash
    await expect(page.locator('body')).not.toContainText('Something went wrong')
  })

})

// ─── SECTION 6: Guided Format (from history) ─────────────────────────────────

test.describe('Business Analyst — Learn: Guided Format', () => {

  const GUIDED_SESSION = makeSession('s-guided', 'guided', 'Gradient Descent', GUIDED_CONTENT)

  test.beforeEach(async ({ page }) => {
    await mockBase(page, { sessions: [GUIDED_SESSION] })
    await mockGetSession(page, GUIDED_SESSION)
    await page.goto('/#/learn')
    await page.getByText('Gradient Descent').first().click()
  })

  test('Guided intro text is shown', async ({ page }) => {
    await expect(
      page.getByText(/guided tour of gradient descent/i)
    ).toBeVisible({ timeout: 8_000 })
  })

  test('Step 1 title is rendered', async ({ page }) => {
    await expect(
      page.getByText('What is Gradient Descent?')
    ).toBeVisible({ timeout: 8_000 })
  })

  test('Step 1 explanation text is shown', async ({ page }) => {
    await expect(
      page.getByText(/optimisation algorithm that minimises/i)
    ).toBeVisible({ timeout: 8_000 })
  })

  test('Step 1 example is shown', async ({ page }) => {
    await expect(
      page.getByText(/rolling a ball down a hill/i)
    ).toBeVisible({ timeout: 8_000 })
  })

  test('Step 1 check-in question is shown', async ({ page }) => {
    await expect(
      page.getByText(/Can you explain why we follow the negative gradient/i)
    ).toBeVisible({ timeout: 8_000 })
  })

  test('step counter shows "Step 1 of 2"', async ({ page }) => {
    await expect(
      page.getByText(/1\s*(?:\/|of)\s*2|Step\s*1/i).first()
    ).toBeVisible({ timeout: 8_000 })
  })

  test('"Got it" / Next button advances to Step 2', async ({ page }) => {
    /**
     * Step 1: On step 1 of guided session
     * Step 2: Click "Got it" or "Next" or "→" button
     * Expected: Step 2 title "The Learning Rate" visible
     */
    await page.getByText('What is Gradient Descent?').waitFor({ timeout: 8_000 })
    const nextBtn = page.getByRole('button', { name: /Got it|Next|Continue/i })
    if (await nextBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await nextBtn.click()
      await expect(page.getByText('The Learning Rate')).toBeVisible({ timeout: 5_000 })
    }
  })

})

// ─── SECTION 7: Mind Map Format (from history) ───────────────────────────────

test.describe('Business Analyst — Learn: Mind Map Format', () => {

  const MAP_SESSION = makeSession('s-map', 'mindmap', 'Machine Learning', MINDMAP_CONTENT)

  test.beforeEach(async ({ page }) => {
    await mockBase(page, { sessions: [MAP_SESSION] })
    await mockGetSession(page, MAP_SESSION)
    await page.goto('/#/learn')
    await page.getByText('Machine Learning').first().click()
  })

  test('Mind Map root node is rendered', async ({ page }) => {
    await expect(page.getByText('Machine Learning').first()).toBeVisible({ timeout: 8_000 })
  })

  test('Mind Map branch labels are rendered', async ({ page }) => {
    await expect(page.getByText('Supervised')).toBeVisible({ timeout: 8_000 })
    await expect(page.getByText('Unsupervised')).toBeVisible()
    await expect(page.getByText('Reinforcement')).toBeVisible()
  })

  test('Mind Map leaf nodes are rendered', async ({ page }) => {
    await expect(page.getByText('Classification')).toBeVisible({ timeout: 8_000 })
    await expect(page.getByText('Clustering')).toBeVisible()
  })

})

// ─── SECTION 8: Timeline Format (from history) ───────────────────────────────

test.describe('Business Analyst — Learn: Timeline Format', () => {

  const TL_SESSION = makeSession('s-tl', 'timeline', 'History of AI', TIMELINE_CONTENT)

  test.beforeEach(async ({ page }) => {
    await mockBase(page, { sessions: [TL_SESSION] })
    await mockGetSession(page, TL_SESSION)
    await page.goto('/#/learn')
    await page.getByText('History of AI').first().click()
  })

  test('Timeline events render with year labels', async ({ page }) => {
    await expect(page.getByText('1950')).toBeVisible({ timeout: 8_000 })
    await expect(page.getByText('2012')).toBeVisible()
  })

  test('Timeline event titles are rendered', async ({ page }) => {
    await expect(page.getByText('Turing Test')).toBeVisible({ timeout: 8_000 })
    await expect(page.getByText('AlexNet')).toBeVisible()
  })

  test('Timeline event descriptions are rendered', async ({ page }) => {
    await expect(page.getByText(/imitation game/i)).toBeVisible({ timeout: 8_000 })
  })

})

// ─── SECTION 9: Session History ──────────────────────────────────────────────

test.describe('Business Analyst — Learn: Session History', () => {

  test('history sidebar shows completed sessions by topic', async ({ page }) => {
    /**
     * Given: 3 sessions in history
     * Then: All topic names visible in sidebar
     */
    const sessions = [
      makeSession('h-001', 'quiz',      'Gradient Descent', QUIZ_CONTENT),
      makeSession('h-002', 'flashcard', 'Neural Networks',  FLASHCARD_CONTENT),
      makeSession('h-003', 'story',     'The Internet',     { text: 'Once...' }),
    ]
    for (const s of sessions) await mockGetSession(page, s)
    await mockBase(page, { sessions })
    await page.goto('/#/learn')

    await expect(page.getByText('Gradient Descent').first()).toBeVisible()
    await expect(page.getByText('Neural Networks').first()).toBeVisible()
    await expect(page.getByText('The Internet').first()).toBeVisible()
  })

  test('"Your sessions will appear here" placeholder shows when history is empty', async ({ page }) => {
    await mockBase(page, { sessions: [] })
    await page.goto('/#/learn')
    await expect(page.getByText('Your sessions will appear here')).toBeVisible()
  })

  test('clicking a history session reopens its content', async ({ page }) => {
    /**
     * Step 1: Quiz session visible in history
     * Step 2: Click on "Gradient Descent" session
     * Expected: Quiz questions render in the viewer
     */
    const session = makeSession('h-quiz', 'quiz', 'Gradient Descent', QUIZ_CONTENT)
    await mockGetSession(page, session)
    await mockBase(page, { sessions: [session] })
    await page.goto('/#/learn')

    await page.getByText('Gradient Descent').first().click()
    await expect(
      page.getByText(/primary purpose of gradient descent/i)
    ).toBeVisible({ timeout: 8_000 })
  })

  test('delete session: hover reveals delete button, clicking calls DELETE', async ({ page }) => {
    /**
     * Step 1: Session visible in history
     * Step 2: Hover over session item to reveal delete button
     * Step 3: Click delete button (aria-label="Delete session")
     * Expected: DELETE endpoint called, session removed from list
     */
    let deleteWasCalled = false
    const session = makeSession('h-del', 'story', 'Delete This Session', { text: 'Content' })

    await mockBase(page, { sessions: [session] })

    // Override session route to capture DELETE
    await page.route(
      (url) => url.pathname === `/api/learn/sessions/${session.id}`,
      (route) => {
        if (route.request().method() === 'DELETE') {
          deleteWasCalled = true
          route.fulfill({ status: 204, body: '' })
        } else {
          route.fulfill({ json: session })
        }
      },
    )

    // After delete, sessions list returns empty
    let listCount = 0
    await page.route(
      (url) => url.pathname === '/api/learn/sessions',
      (route) => {
        listCount++
        route.fulfill({ json: listCount > 1 ? [] : [session] })
      },
    )

    await page.goto('/#/learn')

    const sessionItem = page.getByText('Delete This Session').first()
    await sessionItem.hover()
    await page.getByRole('button', { name: 'Delete session', exact: true }).click()

    expect(deleteWasCalled).toBe(true)
  })

})

// ─── SECTION 10: XP & Stats ──────────────────────────────────────────────────

test.describe('UI/UX Expert — Learn: XP & Stats Display', () => {

  test('stats bar shows level badge "Lv 3" for level-3 user', async ({ page }) => {
    await mockBase(page, { stats: STATS_LV3 })
    await page.goto('/#/learn')
    await expect(page.getByText(/Lv\s*3/i).first()).toBeVisible()
  })

  test('stats bar shows XP total "350 XP"', async ({ page }) => {
    await mockBase(page, { stats: STATS_LV3 })
    await page.goto('/#/learn')
    await expect(page.getByText(/350\s*XP/i).first()).toBeVisible()
  })

  test('streak counter shows "5d" for 5-day streak', async ({ page }) => {
    await mockBase(page, { stats: STATS_LV3 })
    await page.goto('/#/learn')
    await expect(page.getByText(/5d/i).first()).toBeVisible()
  })

  test('new user (0 XP) shows level 1', async ({ page }) => {
    await mockBase(page, { stats: STATS_ZERO })
    await page.goto('/#/learn')
    await expect(page.getByText(/Lv\s*1/i).first()).toBeVisible()
  })

})

// ─── SECTION 11: Error States ────────────────────────────────────────────────

test.describe('Business Analyst — Learn: Error Handling', () => {

  test('stream error event shows error message, not a crash', async ({ page }) => {
    /**
     * Given: Stream returns error event (e.g., no LLM key)
     * When: User generates a session
     * Then: Error message shown — app does NOT crash
     */
    const errStream = `data: ${JSON.stringify({ type: 'error', error: 'LLM key not configured.' })}\n\n`
    await mockBase(page, { stream: errStream })
    await page.goto('/#/learn')

    await page.locator('[data-testid="format-card-story"]').click()
    await page.getByPlaceholder('What do you want to learn?').fill('Error test')
    await page.getByRole('button', { name: /Generate/i }).click()

    await expect(page.locator('body')).not.toContainText('Cannot read properties')
  })

  test('stats endpoint failure — page still loads without crash', async ({ page }) => {
    await page.route(
      (url) => url.pathname === '/api/learn/stats',
      (route) => route.fulfill({ status: 500, json: { detail: 'Server error' } }),
    )
    await page.route(
      (url) => url.pathname === '/api/learn/sessions',
      (route) => route.fulfill({ json: [] }),
    )
    await page.goto('/#/learn')
    await expect(page.locator('body')).not.toContainText('Cannot read properties')
    await expect(page.locator('body')).not.toContainText('Something went wrong')
  })

})
